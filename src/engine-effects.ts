import { randomUUID } from "node:crypto";
import type {
  EngineEffectCategory,
  EngineEffectDuration,
  EngineEffectInstance,
  EngineEffectOperation,
} from "./engine-contracts.js";

export type EffectApplyInput = Omit<EngineEffectInstance, "id" | "status"> & { id?: string };

export interface EffectApplyResult {
  effects: EngineEffectInstance[];
  effect: EngineEffectInstance;
  decision: "applied" | "ignored" | "replaced";
}

export interface ModifierQuery {
  advantage: number;
  disadvantage: number;
  mode: "normal" | "advantage" | "disadvantage" | "cancelled";
  effectIds: string[];
  advantageEffectIds: string[];
  disadvantageEffectIds: string[];
}

/**
 * The executable vocabulary is deliberately small. New operations must ship
 * with a resolver and a live producer in the same slice.
 */
export function isAdmittedEffectOperation(operation: EngineEffectOperation): boolean {
  if (!operation || typeof operation !== "object") return false;
  if (operation.kind === "advantage" || operation.kind === "disadvantage") {
    return operation.category === "attack-roll"
      || operation.category === "ability-check"
      || operation.category === "saving-throw";
  }
  if (operation.kind === "stat-modifier") {
    return operation.stat === "armor-class"
      && Number.isInteger(operation.value)
      && operation.stackingKey.trim().length > 0;
  }
  return operation.kind === "condition"
    && (operation.action === "apply" || operation.action === "remove")
    && typeof operation.condition === "string"
    && operation.condition.trim().length > 0;
}

export function applyEffect(effects: EngineEffectInstance[], input: EffectApplyInput): EffectApplyResult {
  const existing = effects.filter((effect) =>
    effect.status === "active"
    && effect.stackingKey === input.stackingKey
    && effect.sourceRef === input.sourceRef
    && sameRefs(effect.targetRefs, input.targetRefs)
  );
  if (input.stackingRule === "ignore" && existing.length > 0) {
    return { effects: [...effects], effect: existing[0]!, decision: "ignored" };
  }

  const next = effects.map((effect) =>
    input.stackingRule === "replace"
      && existing.some((candidate) => candidate.id === effect.id)
      ? { ...effect, status: "removed" as const }
      : effect
  );
  const effect: EngineEffectInstance = {
    id: input.id ?? randomUUID(),
    definitionKey: input.definitionKey,
    sourceRef: input.sourceRef,
    targetRefs: [...input.targetRefs],
    operations: input.operations.map((operation) => ({ ...operation })),
    startAnchor: { ...input.startAnchor },
    duration: { ...input.duration } as EngineEffectDuration,
    stackingKey: input.stackingKey,
    stackingRule: input.stackingRule,
    clearedBy: [...input.clearedBy],
    status: "active",
    provenance: { ...input.provenance },
  };
  next.push(effect);
  return {
    effects: next,
    effect,
    decision: input.stackingRule === "replace" && existing.length > 0 ? "replaced" : "applied",
  };
}

export function expireEffect(effects: EngineEffectInstance[], effectId: string): EngineEffectInstance[] {
  return effects.map((effect) => effect.id === effectId && effect.status === "active"
    ? { ...effect, status: "expired" }
    : effect);
}

export function removeEffectsBySource(effects: EngineEffectInstance[], sourceRef: string): EngineEffectInstance[] {
  return effects.map((effect) => effect.status === "active" && effect.sourceRef === sourceRef
    ? { ...effect, status: "removed" }
    : effect);
}

export function removeConditionEffects(
  effects: EngineEffectInstance[],
  targetRef: string,
  condition: string
): EngineEffectInstance[] {
  const normalized = normalizeCondition(condition);
  return effects.map((effect) => {
    if (effect.status !== "active" || !effectTargets(effect, targetRef)) return effect;
    const ownsCondition = effect.operations.some((operation) =>
      operation.kind === "condition"
      && operation.action === "apply"
      && normalizeCondition(operation.condition) === normalized
    );
    return ownsCondition ? { ...effect, status: "removed" as const } : effect;
  });
}

export function clearEffectsByPolicy(
  effects: EngineEffectInstance[],
  policy: "short-rest" | "long-rest"
): EngineEffectInstance[] {
  return effects.map((effect) => effect.status === "active" && effect.clearedBy.includes(policy)
    ? { ...effect, status: "removed" }
    : effect);
}

export function queryModifiers(
  effects: EngineEffectInstance[],
  actorId: string,
  category: EngineEffectCategory
): ModifierQuery {
  const relevant = effects.filter((effect) =>
    effect.status === "active"
    && effectTargets(effect, actorId)
    && effect.operations.some((operation) =>
      (operation.kind === "advantage" || operation.kind === "disadvantage")
      && operation.category === category
    )
  );
  let advantage = 0;
  let disadvantage = 0;
  for (const effect of relevant) {
    for (const operation of effect.operations) {
      if (operation.kind === "advantage" && operation.category === category) advantage += 1;
      if (operation.kind === "disadvantage" && operation.category === category) disadvantage += 1;
    }
  }
  return {
    advantage,
    disadvantage,
    mode: advantage > 0 && disadvantage > 0
      ? "cancelled"
      : advantage > 0
        ? "advantage"
        : disadvantage > 0
          ? "disadvantage"
          : "normal",
    effectIds: relevant.map((effect) => effect.id),
    advantageEffectIds: relevant
      .filter((effect) => effect.operations.some((operation) => operation.kind === "advantage" && operation.category === category))
      .map((effect) => effect.id),
    disadvantageEffectIds: relevant
      .filter((effect) => effect.operations.some((operation) => operation.kind === "disadvantage" && operation.category === category))
      .map((effect) => effect.id),
  };
}

export function queryStatModifier(
  effects: EngineEffectInstance[],
  actorId: string,
  stat: "armor-class",
): { total: number; effectIds: string[]; components: Array<{ effectId: string; value: number; stackingKey: string }> } {
  const components: Array<{ effectId: string; value: number; stackingKey: string }> = [];
  for (const effect of effects) {
    if (effect.status !== "active" || !effectTargets(effect, actorId)) continue;
    for (const operation of effect.operations) {
      if (operation.kind === "stat-modifier" && operation.stat === stat) {
        components.push({ effectId: effect.id, value: operation.value, stackingKey: operation.stackingKey });
      }
    }
  }
  const byStackingKey = new Map<string, { effectId: string; value: number; stackingKey: string }>();
  for (const component of components) {
    const existing = byStackingKey.get(component.stackingKey);
    if (!existing || component.value > existing.value) byStackingKey.set(component.stackingKey, component);
  }
  const selected = [...byStackingKey.values()];
  return {
    total: selected.reduce((sum, component) => sum + component.value, 0),
    effectIds: selected.map((component) => component.effectId),
    components: selected,
  };
}

export function activeConditionNames(effects: EngineEffectInstance[], actorId: string): string[] {
  const names = new Set<string>();
  for (const effect of effects) {
    if (effect.status !== "active" || !effectTargets(effect, actorId)) continue;
    for (const operation of effect.operations) {
      if (operation.kind === "condition" && operation.action === "apply") names.add(normalizeCondition(operation.condition));
    }
  }
  return [...names].sort();
}

export function hasActiveCondition(effects: EngineEffectInstance[], actorId: string, condition: string): boolean {
  return activeConditionNames(effects, actorId).includes(normalizeCondition(condition));
}

export function expireEffectsAtBoundary(
  effects: EngineEffectInstance[],
  actorId: string,
  boundary: "start" | "end",
  round: number
): EngineEffectInstance[] {
  return effects.map((effect) => {
    if (effect.status !== "active") return effect;
    const duration = effect.duration;
    if (duration.kind === "turn-boundary") {
      const subjectRef = duration.subject === "target"
        ? effect.targetRefs.some((ref) => refMatches(ref, actorId))
        : refMatches(effect.sourceRef, actorId);
      const started = effect.startAnchor.round;
      if (subjectRef && duration.boundary === boundary && round >= started + duration.offsetTurns) {
        return { ...effect, status: "expired" as const };
      }
    }
    if (duration.kind === "fixed" && effect.clearedBy.includes("duration")) {
      const multiplier = duration.unit === "round"
        ? 1
        : duration.unit === "minute"
          ? 10
          : duration.unit === "hour"
            ? 600
            : 14_400;
      if (round >= effect.startAnchor.round + duration.amount * multiplier) {
        return { ...effect, status: "expired" as const };
      }
    }
    return effect;
  });
}

export function expireSourceLifetimeEffects(
  effects: EngineEffectInstance[],
  liveSourceRefs: ReadonlySet<string>
): EngineEffectInstance[] {
  return effects.map((effect) => effect.status === "active"
    && effect.duration.kind === "source-lifetime"
    && !liveSourceRefs.has(effect.sourceRef)
    ? { ...effect, status: "expired" }
    : effect);
}

export function normalizeCondition(condition: string): string {
  return condition.trim().toLocaleLowerCase("en-US");
}

function effectTargets(effect: EngineEffectInstance, actorId: string): boolean {
  return effect.targetRefs.some((ref) => refMatches(ref, actorId));
}

function refMatches(ref: string, actorId: string): boolean {
  return ref === actorId || ref === `character:${actorId}` || ref === `combatant:${actorId}`;
}

function sameRefs(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}
