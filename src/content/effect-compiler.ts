import { sha256 } from "./hash.js";
import {
  compiledEffectProgramSchema,
  type CompiledCreatureAttack,
  type CompiledEffectOperation,
  type CompiledEffectProgram,
  type NormalizedCondition,
  type NormalizedCreature,
  type NormalizedDamageType,
  type NormalizedSpell,
} from "./schema.js";

const COMPILER_VERSION = "open5e-effect-compiler-v1" as const;
const NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
});
const ABILITIES = Object.freeze({
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
} as const);

type EffectUsage = NonNullable<CompiledEffectProgram["usage"]>;
type EffectArea = Extract<CompiledEffectOperation, { kind: "area" }>;
type EffectSave = Extract<CompiledEffectOperation, { kind: "saving-throw" }>;
type EffectDamage = Extract<CompiledEffectOperation, { kind: "damage" }>;
type EffectCondition = Extract<CompiledEffectOperation, { kind: "apply-condition" }>;
type AttackSequence = Extract<CompiledEffectOperation, { kind: "attack-sequence" }>;

export interface EffectCompilationResult {
  creaturePrograms: CompiledEffectProgram[];
  spellPrograms: CompiledEffectProgram[];
}

/**
 * Deterministically compiles only corroborated Open5e source text. The compiler
 * never repairs or completes prose, and its output always retains the exact
 * source description plus its digest for review and round-trip verification.
 */
export function compileOpen5eEffectPrograms(input: {
  creatures: NormalizedCreature[];
  spells: NormalizedSpell[];
  conditions: NormalizedCondition[];
  damageTypes: NormalizedDamageType[];
  creatureAttacks: CompiledCreatureAttack[];
}): EffectCompilationResult {
  return {
    creaturePrograms: compileCreatureEffectPrograms(
      input.creatures,
      input.conditions,
      input.damageTypes,
      input.creatureAttacks
    ),
    spellPrograms: compileSpellAreaPrograms(input.spells),
  };
}

export function compileCreatureEffectPrograms(
  creatures: NormalizedCreature[],
  conditions: NormalizedCondition[],
  damageTypes: NormalizedDamageType[],
  creatureAttacks: CompiledCreatureAttack[]
): CompiledEffectProgram[] {
  const conditionByWord = new Map(
    conditions.map((condition) => [condition.name.toLocaleLowerCase("en-US"), condition] as const)
  );
  const damageTypeByWord = new Map(
    damageTypes.map((damageType) => [damageType.name.toLocaleLowerCase("en-US"), damageType] as const)
  );
  const attacksByCreature = new Map<string, CompiledCreatureAttack[]>();
  for (const attack of creatureAttacks) {
    const attacks = attacksByCreature.get(attack.sourceContentKey) ?? [];
    attacks.push(attack);
    attacksByCreature.set(attack.sourceContentKey, attacks);
  }

  const programs: CompiledEffectProgram[] = [];
  for (const creature of creatures) {
    const attacks = attacksByCreature.get(creature.contentKey) ?? [];
    for (const action of creature.actions) {
      const sourceDescription = action.description.trim();
      if (!sourceDescription) continue;
      const normalized = normalizeProse(sourceDescription);
      const usage = compileUsage(action.usageLimits);
      const areas = compileAreas(normalized);
      const saves = compileSavingThrows(normalized);
      const damages = compileDamageOperations(normalized, damageTypeByWord);
      const conditionsApplied = compileConditionOperations(
        normalized,
        saves,
        conditionByWord,
        creature.name
      );
      const attackSequence = action.name.toLocaleLowerCase("en-US") === "multiattack"
        ? compileExactMultiattack(normalized, creature.actions, attacks)
        : null;

      let executionMode: CompiledEffectProgram["executionMode"] = "fragments";
      let hasDeferredProse = true;
      let operations: CompiledEffectOperation[] = [];

      if (usage) operations.push({ kind: "usage-limit", usage });
      operations.push(...areas, ...saves, ...damages, ...conditionsApplied);

      if (attackSequence) {
        operations = usage
          ? [{ kind: "usage-limit", usage }, attackSequence]
          : [attackSequence];
        executionMode = "multiattack";
        hasDeferredProse = false;
      } else if (
        saves.length === 1
        && damages.length === 1
        && conditionsApplied.length === 0
        && isExactSaveDamageAction(normalized)
      ) {
        executionMode = "saving-throw-damage";
        hasDeferredProse = false;
      } else if (
        saves.length === 1
        && damages.length === 0
        && conditionsApplied.length === 1
        && isExactSaveConditionAction(normalized)
      ) {
        executionMode = "saving-throw-condition";
        hasDeferredProse = false;
      }

      if (operations.length === 0) continue;
      programs.push(compiledEffectProgramSchema.parse({
        kind: "effect-program",
        fidelityTier: 2,
        key: `${creature.key}_${action.actionKey}_effect-program`,
        contentKey: `open5e:effect-program:${creature.gamesystem}:${creature.documentKey}:${creature.sourceKey}/${action.actionKey}`,
        sourceKey: `${creature.sourceKey}/${action.actionKey}/effect-program`,
        documentKey: creature.documentKey,
        gamesystem: creature.gamesystem,
        publisher: creature.publisher,
        licenseKeys: creature.licenseKeys,
        permalink: creature.permalink,
        sourceApiVersion: creature.sourceApiVersion,
        sourceFetchedAt: creature.sourceFetchedAt,
        sourceContentKey: creature.contentKey,
        sourceType: "creature-action",
        sourceActionKey: action.actionKey,
        sourceName: action.name,
        sourceDescription,
        sourceDescriptionSha256: sha256(sourceDescription),
        compilerVersion: COMPILER_VERSION,
        usage,
        operations,
        executionMode,
        hasDeferredProse,
      }));
    }
  }
  return programs.sort(compareByKey);
}

export function compileSpellAreaPrograms(spells: NormalizedSpell[]): CompiledEffectProgram[] {
  const programs: CompiledEffectProgram[] = [];
  for (const spell of spells) {
    if (!spell.area.shape || spell.area.size === null || spell.area.size <= 0) continue;
    programs.push(compiledEffectProgramSchema.parse({
      kind: "effect-program",
      fidelityTier: 2,
      key: `${spell.key}_area_effect-program`,
      contentKey: `open5e:effect-program:${spell.gamesystem}:${spell.documentKey}:${spell.sourceKey}/area`,
      sourceKey: `${spell.sourceKey}/area/effect-program`,
      documentKey: spell.documentKey,
      gamesystem: spell.gamesystem,
      publisher: spell.publisher,
      licenseKeys: spell.licenseKeys,
      permalink: spell.permalink,
      sourceApiVersion: spell.sourceApiVersion,
      sourceFetchedAt: spell.sourceFetchedAt,
      sourceContentKey: spell.contentKey,
      sourceType: "spell",
      sourceActionKey: null,
      sourceName: spell.name,
      sourceDescription: spell.description,
      sourceDescriptionSha256: sha256(spell.description),
      compilerVersion: COMPILER_VERSION,
      usage: null,
      operations: [{
        kind: "area",
        shape: spell.area.shape,
        size: spell.area.size,
        unit: spell.area.unit,
        width: null,
      }],
      executionMode: "spell-area",
      hasDeferredProse: true,
    }));
  }
  return programs.sort(compareByKey);
}

function compileUsage(
  source: NormalizedCreature["actions"][number]["usageLimits"]
): EffectUsage | null {
  if (!source) return null;
  if (source.type === "PER_DAY") return { kind: "per-day", uses: source.param };
  if (source.type === "RECHARGE_ON_ROLL") {
    if (source.param < 2 || source.param > 6) {
      throw new Error(`Unsupported Open5e recharge threshold: ${source.param}.`);
    }
    return { kind: "recharge", dieSides: 6, minimumRoll: source.param, maximumRoll: 6 };
  }
  throw new Error(`Unsupported Open5e usage limit type: ${source.type}.`);
}

function compileSavingThrows(source: string): EffectSave[] {
  const expression = /\bDC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\b/gi;
  return [...source.matchAll(expression)].map((match) => ({
    kind: "saving-throw" as const,
    dc: Number(match[1]),
    ability: ABILITIES[(match[2] as string).toLocaleLowerCase("en-US") as keyof typeof ABILITIES],
  }));
}

function compileDamageOperations(
  source: string,
  damageTypes: ReadonlyMap<string, NormalizedDamageType>
): EffectDamage[] {
  const expression = /\b(?:takes|taking)\s+(\d+)\s+\((\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\)\s+([A-Za-z]+)\s+damage\b/gi;
  const operations: EffectDamage[] = [];
  for (const match of source.matchAll(expression)) {
    const average = Number(match[1]);
    const diceCount = Number(match[2]);
    const dieSides = Number(match[3]);
    const bonusMagnitude = Number(match[5] ?? 0);
    const bonus = match[4] === "-" ? -bonusMagnitude : bonusMagnitude;
    const expectedAverage = Math.floor(diceCount * (dieSides + 1) / 2) + bonus;
    if (average !== expectedAverage) continue;
    const damageType = damageTypes.get((match[6] as string).toLocaleLowerCase("en-US"));
    if (!damageType) continue;
    const tail = source.slice((match.index ?? 0) + (match[0]?.length ?? 0));
    const halfOnSuccess = /on a failed save,?\s+or half as much damage on a successful one/i.test(tail)
      || /half as much damage on a successful/i.test(tail.slice(0, 140));
    const failedSave = /on a failed save/i.test(tail.slice(0, 80));
    operations.push({
      kind: "damage",
      average,
      expression: { kind: "dice", diceCount, dieSides, bonus },
      damageType: {
        sourceKey: damageType.sourceKey,
        contentKey: damageType.contentKey,
        name: damageType.name,
      },
      trigger: failedSave || halfOnSuccess ? "failed-save" : "automatic",
      saveOnSuccess: halfOnSuccess ? "half" : failedSave ? "none" : null,
    });
  }
  return operations;
}

function compileConditionOperations(
  source: string,
  saves: EffectSave[],
  conditions: ReadonlyMap<string, NormalizedCondition>,
  creatureName: string
): EffectCondition[] {
  const expression = /\b(?:or\s+|and\s+|is\s+)(?:be\s+|become\s+|fall\s+|knocked\s+)?(?:magically\s+)?(blinded|charmed|deafened|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)\b([^.]*)/gi;
  const operations: EffectCondition[] = [];
  for (const match of source.matchAll(expression)) {
    const condition = conditions.get((match[1] as string).toLocaleLowerCase("en-US"));
    if (!condition) continue;
    const suffix = (match[2] as string).trim();
    const duration = compileDuration(suffix, creatureName);
    if (!duration) continue;
    const preceding = source.slice(Math.max(0, (match.index ?? 0) - 220), match.index ?? 0);
    const trigger = /failed save|saving throw or/i.test(preceding) ? "failed-save" : "automatic";
    const save = saves[0];
    const repeatSave = save && /repeat the saving throw at the end of each of its turns/i.test(source)
      ? {
          timing: "end-of-turn" as const,
          ability: save.ability,
          dc: save.dc,
          endsOnSuccess: true as const,
        }
      : null;
    operations.push({
      kind: "apply-condition",
      condition: {
        sourceKey: condition.sourceKey,
        contentKey: condition.contentKey,
        name: condition.name,
      },
      trigger,
      duration,
      repeatSave,
    });
  }
  return dedupeConditions(operations);
}

function compileDuration(
  suffix: string,
  creatureName: string
): EffectCondition["duration"] | null {
  if (!suffix || /^(?:,|and\b)/i.test(suffix)) return { kind: "persistent" };
  const fixed = /\bfor\s+(\d+)\s+(round|minute|hour|day)s?\b/i.exec(suffix);
  if (fixed) {
    return {
      kind: "fixed",
      amount: Number(fixed[1]),
      unit: (fixed[2] as "round" | "minute" | "hour" | "day").toLocaleLowerCase("en-US") as "round" | "minute" | "hour" | "day",
    };
  }
  const boundary = /\buntil\s+the\s+(start|end)\s+of\s+(.+?)\s+next turn\b/i.exec(suffix);
  if (boundary) {
    const owner = (boundary[2] as string).toLocaleLowerCase("en-US");
    const sourceNamed = owner.includes(creatureName.toLocaleLowerCase("en-US"));
    return {
      kind: "turn-boundary",
      boundary: (boundary[1] as "start" | "end").toLocaleLowerCase("en-US") as "start" | "end",
      subject: sourceNamed ? "source" : "target",
      offsetTurns: 1,
    };
  }
  if (/\buntil\s+(?:the\s+)?[^.]+\bdies\b/i.test(suffix)) return { kind: "source-lifetime" };
  return null;
}

function compileAreas(source: string): EffectArea[] {
  const areas: EffectArea[] = [];
  const line = /\b(?:a|an)\s+(\d+)\s*-?\s*foot line that is\s+(\d+)\s+(?:feet|ft\.)\s+wide\b/gi;
  for (const match of source.matchAll(line)) {
    areas.push({ kind: "area", shape: "line", size: Number(match[1]), unit: "feet", width: Number(match[2]) });
  }
  const shapes = /\b(?:a|an)\s+(\d+)\s*-?\s*foot(?:-radius)?\s+(cone|cube|cylinder|sphere)\b/gi;
  for (const match of source.matchAll(shapes)) {
    areas.push({
      kind: "area",
      shape: (match[2] as "cone" | "cube" | "cylinder" | "sphere").toLocaleLowerCase("en-US") as "cone" | "cube" | "cylinder" | "sphere",
      size: Number(match[1]),
      unit: "feet",
      width: null,
    });
  }
  return dedupeAreas(areas);
}

function compileExactMultiattack(
  source: string,
  actions: NormalizedCreature["actions"],
  attacks: CompiledCreatureAttack[]
): AttackSequence | null {
  const simple = /^The\s+[^.]+?\s+makes\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(.+?)\s+attacks?\.$/i.exec(source);
  if (simple) {
    const attack = resolveAttackPhrase(simple[2] as string, actions, attacks);
    if (!attack) return null;
    return {
      kind: "attack-sequence",
      steps: [{
        actionKey: attack.actionKey,
        attackContentKey: attack.contentKey,
        name: attack.name,
        count: parseCount(simple[1] as string),
      }],
    };
  }

  const listed = /^The\s+[^.]+?\s+makes\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+attacks?:\s+(.+)\.$/i.exec(source);
  if (listed) {
    const steps = parseListedAttackSequence(listed[2] as string, actions, attacks);
    if (!steps || steps.reduce((total, step) => total + step.count, 0) !== parseCount(listed[1] as string)) return null;
    return { kind: "attack-sequence", steps };
  }

  const compound = /^The\s+[^.]+?\s+makes\s+(.+)\.$/i.exec(source);
  if (compound && /\battacks?\b/i.test(compound[1] as string)) {
    const steps = parseCompoundAttackSequence(compound[1] as string, actions, attacks);
    if (steps) return { kind: "attack-sequence", steps };
  }
  return null;
}

function parseListedAttackSequence(
  source: string,
  actions: NormalizedCreature["actions"],
  attacks: CompiledCreatureAttack[]
): AttackSequence["steps"] | null {
  const pieces = source
    .replace(/,\s+and\s+/gi, ", ")
    .replace(/\s+and\s+(?=(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+with\b)/gi, ", ")
    .split(/,\s*/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const steps: AttackSequence["steps"] = [];
  for (const piece of pieces) {
    const match = /^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+with\s+(?:its|his|her|the)\s+(.+?)s?$/i.exec(piece);
    if (!match) return null;
    const attack = resolveAttackPhrase(match[2] as string, actions, attacks);
    if (!attack) return null;
    steps.push({
      actionKey: attack.actionKey,
      attackContentKey: attack.contentKey,
      name: attack.name,
      count: parseCount(match[1] as string),
    });
  }
  return steps.length ? steps : null;
}

function parseCompoundAttackSequence(
  source: string,
  actions: NormalizedCreature["actions"],
  attacks: CompiledCreatureAttack[]
): AttackSequence["steps"] | null {
  const pieces = source
    .replace(/,\s+and\s+/gi, ", ")
    .replace(/\s+and\s+(?=(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b)/gi, ", ")
    .split(/,\s*/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const steps: AttackSequence["steps"] = [];
  for (const piece of pieces) {
    const match = /^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(.+?)\s+attacks?$/i.exec(piece);
    if (!match) return null;
    const attack = resolveAttackPhrase(match[2] as string, actions, attacks);
    if (!attack) return null;
    steps.push({
      actionKey: attack.actionKey,
      attackContentKey: attack.contentKey,
      name: attack.name,
      count: parseCount(match[1] as string),
    });
  }
  return steps.length > 1 ? steps : null;
}

function resolveAttackPhrase(
  source: string,
  actions: NormalizedCreature["actions"],
  attacks: CompiledCreatureAttack[]
): CompiledCreatureAttack | null {
  const normalizedSource = normalizeAttackIdentity(source);
  const actionMatches = actions.filter((action) =>
    action.name.toLocaleLowerCase("en-US") !== "multiattack"
    && normalizeAttackIdentity(action.name) === normalizedSource
  );
  if (actionMatches.length !== 1) return null;
  const action = actionMatches[0];
  if (!action) return null;
  return attacks.find((attack) => attack.actionKey === action.actionKey) ?? null;
}

function normalizeAttackIdentity(value: string): string {
  const words = value
    .toLocaleLowerCase("en-US")
    .replace(/[.'’]/g, "")
    .replace(/\battacks?\b/g, "")
    .replace(/\b(?:its|his|her|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word) => singularize(word)).join(" ");
}

function singularize(value: string): string {
  if (value.endsWith("ies") && value.length > 3) return `${value.slice(0, -3)}y`;
  if (value.endsWith("sses") || value.endsWith("shes") || value.endsWith("ches") || value.endsWith("xes")) {
    return value.slice(0, -2);
  }
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function isExactSaveDamageAction(source: string): boolean {
  const half = /^.+\bmust make a DC \d+ (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw, taking \d+ \(\d+d\d+(?:\s*[+-]\s*\d+)?\) [A-Za-z]+ damage on a failed save, or half as much damage on a successful one\.$/i;
  const none = /^.+\bmust succeed on a DC \d+ (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw or take \d+ \(\d+d\d+(?:\s*[+-]\s*\d+)?\) [A-Za-z]+ damage\.$/i;
  return half.test(source) || none.test(source);
}

function isExactSaveConditionAction(source: string): boolean {
  if (/\b(?:Melee|Ranged)(?: or (?:Melee|Ranged))? (?:Weapon|Spell) Attack:|\bHit:/i.test(source)) return false;
  const base = /^.+\bmust succeed on a DC \d+ (?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw or (?:be|become|fall) (?:magically )?(?:blinded|charmed|deafened|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious) (?:for \d+ (?:round|minute|hour|day)s?|until the (?:start|end) of .+? next turn)\.(?: (?:The target|A frightened creature|The creature) can repeat the saving throw at the end of each of its turns,[^.]+(?:success|successful save)\.)?$/i;
  return base.test(source);
}

function parseCount(value: string): number {
  const normalized = value.toLocaleLowerCase("en-US");
  return NUMBER_WORDS[normalized] ?? Number(normalized);
}

function normalizeProse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeConditions(operations: EffectCondition[]): EffectCondition[] {
  const seen = new Set<string>();
  return operations.filter((operation) => {
    const identity = `${operation.condition.contentKey}\u0000${operation.trigger}\u0000${JSON.stringify(operation.duration)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function dedupeAreas(operations: EffectArea[]): EffectArea[] {
  const seen = new Set<string>();
  return operations.filter((operation) => {
    const identity = `${operation.shape}\u0000${operation.size}\u0000${operation.unit}\u0000${operation.width ?? ""}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function compareByKey(left: { key: string }, right: { key: string }): number {
  return left.key.localeCompare(right.key);
}
