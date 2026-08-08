import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(128);
const shortTextSchema = z.string().trim().min(1).max(500);
const playerGoalSchema = z.string().trim().min(1).max(2_000);

export const abilitySchema = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

/**
 * The only shape an LLM may use to ask the rules engine to do work.
 * The model proposes an intent; the server remains responsible for resolving it.
 */
export const actionIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ability_check"),
    ability: abilitySchema,
    skill: identifierSchema.optional(),
    goal: playerGoalSchema,
  }),
  z.object({
    kind: z.literal("attack"),
    targetId: identifierSchema,
    mode: z.enum(["melee", "ranged", "spell"]),
    goal: playerGoalSchema,
  }),
  z.object({
    kind: z.literal("cast_spell"),
    spellId: identifierSchema,
    targetId: identifierSchema.optional(),
    goal: playerGoalSchema,
  }),
  z.object({
    kind: z.literal("nonmechanical"),
    goal: playerGoalSchema,
  }),
  z.object({
    kind: z.literal("clarification_required"),
    question: playerGoalSchema,
  }),
]);

export type ActionIntent = z.infer<typeof actionIntentSchema>;

/**
 * Facts the narrator may suggest for the server to validate and persist.
 * Narration text is never treated as state by itself.
 */
export const narrativeFactProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("record_fact"),
    subjectId: identifierSchema,
    predicate: identifierSchema,
    value: shortTextSchema,
  }),
  z.object({
    kind: z.literal("introduce_npc"),
    npcId: identifierSchema,
    name: shortTextSchema,
    disposition: z.enum(["friendly", "neutral", "wary", "hostile", "unknown"]),
  }),
  z.object({
    kind: z.literal("discover_location"),
    locationId: identifierSchema,
    name: shortTextSchema,
  }),
  z.object({
    kind: z.literal("advance_quest"),
    questId: identifierSchema,
    status: z.enum(["started", "advanced", "completed", "failed"]),
  }),
  z.object({
    kind: z.literal("set_scene"),
    sceneId: identifierSchema,
  }),
]);

export type NarrativeFactProposal = z.infer<typeof narrativeFactProposalSchema>;

export const suggestedActionSchema = z.object({
  id: identifierSchema,
  label: z.string().trim().min(1).max(96),
  prompt: z.string().trim().min(1).max(500).optional(),
});

export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

export const narrationEnvelopeSchema = z.object({
  text: z.string().trim().min(1).max(6_000),
  proposedFacts: z.array(narrativeFactProposalSchema).max(8),
  suggestedActions: z.array(suggestedActionSchema).max(6),
});

export type NarrationEnvelope = z.infer<typeof narrationEnvelopeSchema>;
