import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ActionIntent, NarrationEnvelope } from "./ai-contracts.js";

export const gameActionSchema = z.enum(["observe", "listen", "enter", "roll", "continue"]);
export type GameAction = z.infer<typeof gameActionSchema>;
export type Ability = Extract<ActionIntent, { kind: "ability_check" }>["ability"];

export interface PlayerCharacter {
  name: string;
  abilities: Record<Ability, number>;
}

export interface AbilityCheckOutcome {
  ability: Ability;
  skill: string | null;
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
}

export interface GameMessage {
  id: string;
  kind: "narration" | "roll" | "system";
  text: string;
  createdAt: string;
}

export interface GameSession {
  id: string;
  userId: string;
  version: number;
  sceneId: "opening" | "waypoint";
  sceneTitle: string;
  sceneDescription: string;
  log: GameMessage[];
  availableActions: GameAction[];
  lastRoll: number | null;
  character: PlayerCharacter;
  updatedAt: string;
}

export interface AuthoritativeGameEvent {
  id: string;
  kind: "player_action";
  sessionId: string;
  clientCommandId: string;
  action: GameAction | null;
  intent: ActionIntent | null;
  playerText: string | null;
  previousVersion: number;
  version: number;
  roll: number | null;
  check: AbilityCheckOutcome | null;
  createdAt: string;
}

export interface GameCommandResolution {
  session: GameSession;
  event: AuthoritativeGameEvent;
  narration: NarrationEnvelope;
  narrationSource: "rules" | "llm";
}

export interface GameCommandResult extends GameCommandResolution {
  clientCommandId: string;
  replayed: boolean;
}

function message(kind: GameMessage["kind"], text: string): GameMessage {
  return {
    id: randomUUID(),
    kind,
    text,
    createdAt: new Date().toISOString(),
  };
}

export function createDefaultCharacter(): PlayerCharacter {
  return {
    name: "Unnamed Adventurer",
    abilities: {
      str: 10,
      dex: 12,
      con: 10,
      int: 10,
      wis: 12,
      cha: 10,
    },
  };
}

export function createInitialSession(userId: string): GameSession {
  return {
    id: randomUUID(),
    userId,
    version: 0,
    sceneId: "opening",
    sceneTitle: "The Opening",
    sceneDescription:
      "Your campaign begins at the edge of its first decision. The world will take shape around what your character notices, asks, and attempts.",
    log: [
      message(
        "narration",
        "The first moment is yours to define. The world is waiting for a question."
      ),
    ],
    availableActions: ["observe", "listen", "enter", "roll"],
    lastRoll: null,
    character: createDefaultCharacter(),
    updatedAt: new Date().toISOString(),
  };
}

export function applyAction(session: GameSession, action: GameAction): GameSession {
  return resolveAction(session, action, randomUUID()).session;
}

export function resolveAction(
  session: GameSession,
  action: GameAction,
  clientCommandId: string
): GameCommandResolution {
  let roll: number | null = null;
  const nextMessage: GameMessage = (() => {
    switch (action) {
      case "observe":
        return message(
          "narration",
          "Details gather around your attention: a route, a voice, and a choice that was not there a moment ago."
        );
      case "listen":
        return message(
          "narration",
          "You catch a fragment of sound and movement beyond your immediate view. Something in the world has noticed you too."
        );
      case "enter":
        return message(
          "narration",
          "You follow the first lead. The world opens into a place with more than one possible direction."
        );
      case "continue":
        return message("narration", "The table makes room for the next chapter.");
      case "roll": {
        roll = randomInt(1, 21);
        return message("roll", `You roll a d20: ${roll}. The unseen table takes note.`);
      }
    }
  })();

  const sceneId = action === "enter" ? "waypoint" : session.sceneId;
  const sceneTitle = sceneId === "waypoint" ? "The First Waypoint" : session.sceneTitle;
  const sceneDescription =
    sceneId === "waypoint"
      ? "The world opens around the lead you chose. People, paths, and unfinished business wait for your decision."
      : session.sceneDescription;

  return commitResolution(session, clientCommandId, nextMessage, {
    action,
    sceneId,
    sceneTitle,
    sceneDescription,
    eventRoll: roll,
    lastRoll: roll === null ? undefined : roll,
  });
}

export function resolveIntent(
  session: GameSession,
  intent: ActionIntent,
  playerText: string,
  clientCommandId: string
): GameCommandResolution {
  switch (intent.kind) {
    case "ability_check": {
      const roll = randomInt(1, 21);
      const score = session.character.abilities[intent.ability];
      const modifier = Math.floor((score - 10) / 2);
      const dc = 12;
      const total = roll + modifier;
      const success = total >= dc;
      const skillText = intent.skill ? ` (${intent.skill})` : "";
      const outcome: AbilityCheckOutcome = {
        ability: intent.ability,
        skill: intent.skill ?? null,
        dc,
        roll,
        modifier,
        total,
        success,
      };
      const nextMessage = message(
        "roll",
        `You make a ${intent.ability.toUpperCase()}${skillText} check: d20 ${roll} ${formatModifier(modifier)} = ${total} against DC ${dc}. ${success ? "Success." : "Failure."}`
      );

      return commitResolution(session, clientCommandId, nextMessage, {
        action: null,
        intent,
        playerText,
        eventRoll: roll,
        lastRoll: roll,
        check: outcome,
      });
    }
    case "nonmechanical":
      return commitResolution(
        session,
        clientCommandId,
        message("narration", `You declare: ${intent.goal} The table marks the attempt and waits for your next choice.`),
        { action: null, intent, playerText }
      );
    case "clarification_required":
      return commitResolution(
        session,
        clientCommandId,
        message("system", `The DM asks: ${intent.question}`),
        { action: null, intent, playerText }
      );
    case "attack":
    case "cast_spell":
      return commitResolution(
        session,
        clientCommandId,
        message(
          "system",
          "The first rules slice only resolves exploration checks. Describe how you search, study, move, or interact with the scene."
        ),
        { action: null, intent, playerText }
      );
  }
}

interface CommitResolutionOptions {
  action: GameAction | null;
  intent?: ActionIntent | null;
  playerText?: string | null;
  sceneId?: GameSession["sceneId"];
  sceneTitle?: string;
  sceneDescription?: string;
  eventRoll?: number | null;
  lastRoll?: number;
  check?: AbilityCheckOutcome | null;
}

function commitResolution(
  session: GameSession,
  clientCommandId: string,
  nextMessage: GameMessage,
  options: CommitResolutionOptions
): GameCommandResolution {
  const updatedAt = new Date().toISOString();
  const nextSession: GameSession = {
    ...session,
    version: session.version + 1,
    sceneId: options.sceneId ?? session.sceneId,
    sceneTitle: options.sceneTitle ?? session.sceneTitle,
    sceneDescription: options.sceneDescription ?? session.sceneDescription,
    log: [...session.log, nextMessage].slice(-30),
    lastRoll: options.lastRoll === undefined ? session.lastRoll : options.lastRoll,
    updatedAt,
  };

  return {
    session: nextSession,
    event: {
      id: randomUUID(),
      kind: "player_action",
      sessionId: session.id,
      clientCommandId,
      action: options.action,
      intent: options.intent ?? null,
      playerText: options.playerText ?? null,
      previousVersion: session.version,
      version: nextSession.version,
      roll: options.eventRoll ?? null,
      check: options.check ?? null,
      createdAt: updatedAt,
    },
    narration: {
      text: nextMessage.text,
      proposedFacts: [],
      suggestedActions: [],
    },
    narrationSource: "rules",
  };
}

function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`;
}
