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
  }).strict(),
  z.object({
    kind: z.literal("introduce_npc"),
    npcId: identifierSchema,
    name: shortTextSchema,
    disposition: z.enum(["friendly", "neutral", "wary", "hostile", "unknown"]),
  }).strict(),
  z.object({
    kind: z.literal("discover_location"),
    locationId: identifierSchema,
    name: shortTextSchema,
  }).strict(),
  z.object({
    kind: z.literal("advance_quest"),
    questId: identifierSchema,
    status: z.enum(["started", "advanced", "completed", "failed"]),
  }).strict(),
  z.object({
    kind: z.literal("set_scene"),
    sceneId: identifierSchema,
  }).strict(),
]);

export type NarrativeFactProposal = z.infer<typeof narrativeFactProposalSchema>;

export const suggestedActionSchema = z.object({
  id: identifierSchema,
  label: z.string().trim().min(1).max(96),
  prompt: z.string().trim().min(1).max(500),
}).strict();

export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

export const narrationEnvelopeSchema = z.object({
  text: z.string().trim().min(1).max(6_000),
  proposedFacts: z.array(narrativeFactProposalSchema).max(8),
  suggestedActions: z.array(suggestedActionSchema).max(5),
}).strict();

/** Provider-facing schema generated from the runtime contract, not a duplicate. */
export const narrationEnvelopeJsonSchema = providerJsonSchema(
  z.toJSONSchema(narrationEnvelopeSchema)
);

function providerJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerJsonSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (key === "$schema") return [];
      return [[key === "oneOf" ? "anyOf" : key, providerJsonSchema(child)]];
    })
  );
}

export type NarrationEnvelope = z.infer<typeof narrationEnvelopeSchema>;
