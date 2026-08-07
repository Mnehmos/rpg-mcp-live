# Lantern Action Economy & Spatial Movement — Design Intent and Requirements Transcript

Transcribed: 2026-08-07
Source: external design research supplied by the product owner in-conversation, written in response to `docs/hosted-handoff/action-economy-and-spatial-audit.md`.
Status of this document: **reference / backing material, not itself a decision.** The decisions distilled from it are recorded in [ADR-H23](ADR-H23-typed-action-economy-kernel.md) (action economy) and [ADR-H24](ADR-H24-frame-scoped-2-5d-positions.md) (spatial movement). Where this document's checklists go further than those two ADRs commit to, treat the ADRs as authoritative for what Lantern is building *now*, and this document as the fuller intent/checklist to draw on for later ADRs.
Truncation note: the source material was cut off mid-list (inside "A7. Make currently advertised actions honest") by a 50,000-character limit on the pasted message. Everything up to that cutoff is transcribed below verbatim in substance. If the remainder of A7 and any later sections become available, append them here rather than re-deriving them.

---

## Part 1 — Action economy design intent

### Why this is P0

Action economy is not merely "one attack per combat turn." It is the engine's universal authority over:

> Who may do what, when they may do it, what it costs, how much fictional time passes, what can interrupt it, and when the opportunity to act resets.

That includes combat, movement, reactions, exploration, searching, social pressure, travel, crafting, projects, resting, item use, spellcasting, hazards, NPC behavior, and world events.

Lantern's GDD already establishes the right trust boundary: the model interprets and narrates, while the server owns state, dice, validation, inventory, health, spells, and consequences. Action economy is the subsystem that makes that boundary executable.

### Research models to combine

**D&D 5e (2014 rules) — distinct typed pools.** A creature normally gets movement up to its Speed and one Action on its turn. A Bonus Action exists only when a feature grants a legal option, and a creature normally gets one Reaction until the start of its next turn. Movement may be split before and after the Action, and one ordinary object interaction can be incidental.

**Pathfinder 2e — a generic action kernel.** Three fungible actions and one Reaction per turn; activities consume one to three actions; traits such as attack, move, manipulate, concentrate, exploration, and downtime. Play is explicitly divided into encounter, exploration, and downtime modes.

**Blades in the Dark — when *not* to meter actions.** Call for an action roll only when an attempt is dangerous or troublesome; use progress clocks for extended objectives; limit important downtime activities without pretending that all ordinary conversation or movement consumes a formal turn.

The synthesized design direction:

> **Mode-specific action budgets inside one generic action-economy kernel.**

Not every mode needs six-second initiative, and not every ruleset needs one scalar action-point number.

### Recommended Lantern model

#### 1. Named budget pools, not one universal integer

For the first 5e/SRD-2014-style combat profile:

```ts
interface CombatTurnBudget {
  action: number;          // Normally 1
  bonusAction: number;     // Normally 1, but only usable by eligible options
  reaction: number;        // Normally 1
  movementFeet: number;    // Derived from current Speed
  interaction: number;     // Normally 1 ordinary interaction
}
```

An attack would consume:

```ts
{ budget: { action: 1 } }
```

Dash would consume:

```ts
{
  budget: { action: 1 },
  effects: [{ type: "add_movement", amount: "actor.speed" }]
}
```

Moving fifteen feet would consume:

```ts
{ budget: { movementFeet: 15 } }
```

Ready is more complicated:

```text
Now:
  consume 1 Action
  create a persisted readied-action trigger

Later, when triggered:
  consume 1 Reaction
  resolve the prepared action
```

A generic engine can later support a Pathfinder-like profile:

```ts
interface ThreeActionBudget {
  actionPoints: number; // Normally 3
  reaction: number;     // Normally 1
}
```

The command and event formats should not assume either profile.

#### 2. Separate five concepts

```text
ActionDefinition
    ↓ instantiated from current state
ActionOffer
    ↓ selected by player/LLM
ActionCommand
    ↓ resolved by server
ActionResult
    ↓ persisted as truth
ActionEvent
```

**Action Definition** — the versioned rule: `weapon.attack`, `combat.dash`, `exploration.search`, `social.influence`, `travel.navigate`, `downtime.craft`.

**Action Offer** — a precomputed, currently legal option:

```json
{
  "offerId": "offer_31",
  "actionId": "weapon.attack",
  "actorId": "fighter_1",
  "weaponId": "battleaxe_17",
  "validTargets": ["goblin_2"],
  "cost": { "action": 1 },
  "computed": {
    "attackBonus": 5,
    "damage": "1d8+3",
    "damageType": "slashing",
    "targetAc": 15
  },
  "stateVersion": 42
}
```

**Action Command** — what the player or model selects:

```json
{
  "commandId": "cmd_91",
  "offerId": "offer_31",
  "actorId": "fighter_1",
  "parameters": { "targetId": "goblin_2" },
  "expectedStateVersion": 42
}
```

The caller supplies the choice, **not the mathematics**.

**Action Result** — what the server returns:

```json
{
  "status": "applied",
  "commandId": "cmd_91",
  "eventIds": ["evt_212"],
  "rolls": [
    {
      "type": "attack",
      "die": 20,
      "roll": 13,
      "modifier": 5,
      "total": 18,
      "target": 15,
      "outcome": "hit"
    }
  ],
  "effects": [
    { "type": "damage", "targetId": "goblin_2", "amount": 7, "before": 7, "after": 0 }
  ],
  "costs": {
    "before": { "action": 1, "movementFeet": 15 },
    "spent": { "action": 1 },
    "after": { "action": 0, "movementFeet": 15 }
  },
  "stateVersion": 43
}
```

#### 3. Make precomputation authoritative

The reference engine already points in this direction: its combat participant state tracks movement remaining, main Action, Bonus Action, Reaction, spell timing, Dash, Disengage, legendary actions, and related resources, with explicit validation, commitment, and start-of-turn reset behavior. Its tests demonstrate preset-driven AC, attack damage, and attack-bonus calculation.

But its raw action schema still accepts optional caller-supplied `attackBonus`, `dc`, and `damage`; Dodge, Help, and Ready currently return descriptive effects rather than fully authoritative persisted effects. **Lantern should remove that ambiguity.**

The server should calculate an immutable action snapshot from:

```text
Character base state
+ level/class/ancestry
+ equipped weapon and armor
+ proficiency
+ active conditions
+ temporary effects
+ current action budget
+ target defenses
+ distance and cover
+ visibility
+ environmental effects
= authoritative ActionOffer
```

Every derived value should also carry an explanation:

```json
{
  "attackBonus": {
    "total": 5,
    "components": [
      { "source": "Strength modifier", "value": 3 },
      { "source": "Proficiency", "value": 2 }
    ]
  }
}
```

The LLM may say: *"Use the battleaxe against Goblin 2."* It may never say: *"Attack at +100 and deal 99,999 damage."*

### Action economy must span several modes

| Mode | Structure | Recommended economy |
| --- | --- | --- |
| **Free play** | Flexible narration | Meter only risky, contested, resource-consuming, or state-changing attempts |
| **Combat encounter** | Strict initiative and rounds | Action, Bonus Action, Reaction, movement, interaction |
| **Structured social** | Scene rounds | One meaningful Influence, Discover, Assist, Defend, or Withdraw action per actor |
| **Exploration** | One-to-ten-minute segments | Each character sustains one exploration activity while the party moves |
| **Travel** | Watches or days | Group pace plus assigned roles such as Scout, Navigate, Forage, Guard |
| **Downtime** | Days or phases | Limited major activity slots for crafting, recovery, research, work, or training |
| **Projects** | Variable intervals | Actions advance a progress clock and possibly a danger/deadline clock |
| **Reaction window** | Instant | Triggered responses, hazards, counters, opportunity attacks, readied actions |

Pathfinder's social Influence subsystem divides a social encounter into flexible-length rounds and lets each character act once per round to Influence or Discover. Its Research subsystem uses rounds ranging from minutes to days and accumulates Research Points; its hexploration subsystem budgets a limited number of activities per day. This is a much better foundation for noncombat play than forcing every tavern conversation into six-second initiative.

**The escalation rule:** use free play by default. Enter structured action economy when sequencing between actors matters, danger or opposition matters, time pressure matters, repeated attempts could be abused, resources are being consumed, or a progress race or failure clock exists. Return to free play when that pressure ends.

### A player message may contain multiple actions

A natural-language game cannot assume one user message equals one mechanical action. The player may say:

> "I run to the goblin, draw my axe, attack it, then duck behind the pillar."

The interpreter should produce a **TurnPlan**:

```json
{
  "planId": "plan_12",
  "steps": [
    { "action": "movement.move", "destination": { "x": 5, "y": 4 } },
    { "action": "interaction.draw_item", "itemId": "battleaxe_17" },
    { "action": "weapon.attack", "targetId": "goblin_2" },
    { "action": "movement.move", "destination": { "x": 3, "y": 6 } }
  ]
}
```

The engine should execute that plan **sequentially**, because the goblin might make an opportunity attack during movement, the character might be incapacitated, or the battlefield might change.

Execution stops when: the next action becomes illegal; a reaction materially changes the situation; a player decision is needed; the actor becomes incapacitated; the action budget is exhausted; the mode changes; or the plan reaches its bounded step limit.

Do not let the LLM create an unbounded internal action loop. Also, do not automatically advance initiative after every individual action — a character may move, attack, take a Bonus Action, move again, and then explicitly end the turn.

### The essential P0 checklist (action economy)

**Rules and contracts**
- [ ] Adopt a versioned `5e-srd-2014` action-economy profile.
- [ ] Define free play, encounter, social, exploration, travel, and downtime modes.
- [ ] Define typed budget pools and explicit reset policies.
- [ ] Define action traits such as `attack`, `move`, `manipulate`, `concentrate`, `magic`, `hostile`, `secret`, `exploration`, and `downtime`.
- [ ] Distinguish budget costs, persistent resource costs, and world-time costs.
- [ ] Define validation failure, resolved failure, interruption, cancellation, and partial-success semantics.

**Derived state**
- [ ] Create one canonical `DerivedStatService`.
- [ ] Derive AC, attack bonuses, weapon damage, speed, save DC, spell attack, and legal targets server-side.
- [ ] Attach explanation components to derived values.
- [ ] Cache only against explicit state revisions.
- [ ] Revalidate all precomputed offers before execution.
- [ ] Snapshot the exact values used in the event.

**Turn and action lifecycle**
- [ ] Create explicit turn and round IDs.
- [ ] Reset budgets at defined anchors.
- [ ] Process start-of-turn effects before allowing actions.
- [ ] Permit several commands within one turn.
- [ ] Support split movement.
- [ ] Require explicit or policy-driven `end_turn`.
- [ ] Process end-of-turn effects exactly once.
- [ ] Reject ordinary actions outside the actor's turn.
- [ ] Reject all encounter actions after encounter closure.

**Transactions**
- [ ] Require a unique command ID.
- [ ] Require expected state version.
- [ ] Validate actor, mode, turn, target, distance, visibility, budget, and resources.
- [ ] Reserve costs for interruptible actions.
- [ ] Resolve RNG on the server.
- [ ] Spend budget and apply effects in the same transaction.
- [ ] Append authoritative events in that transaction.
- [ ] Return success only after commit.
- [ ] Guarantee invalid commands mutate nothing.
- [ ] Make retries return the original result rather than executing twice.

**Reactions**
- [ ] Define trigger types and timing windows.
- [ ] Distinguish mandatory triggers from optional reactions.
- [ ] Determine eligible reactors from authoritative state.
- [ ] Consume Reaction only when the reaction resolves.
- [ ] Define priority when several reactions are available.
- [ ] Cap nested reactions.
- [ ] Revalidate the interrupted action afterward.
- [ ] Persist the trigger, reaction, and resumed or cancelled action.
- [ ] Implement Ready as a persisted trigger, not descriptive prose.

**Noncombat**
- [ ] Exploration actions must trade speed, time, noise, awareness, or resources.
- [ ] Searches must record areas/sources already exhausted.
- [ ] Social contests must have goals, stakes, rounds, progress, and consequences.
- [ ] Travel must advance distance, time, supplies, weather, fatigue, and encounter clocks.
- [ ] Downtime must consume activity slots and persist project progress.
- [ ] Rest must be a timed interruptible activity, not a direct healing mutation.
- [ ] Progress clocks must be authoritative state, not merely narration.

**LLM boundary**
- [ ] The model receives legal ActionOffers and remaining budget.
- [ ] The model supplies intent, selected action, target, and ordinary choices.
- [ ] The model never supplies authoritative bonuses, damage, AC, DC, healing, or rewards.
- [ ] The model never directly mutates budgets or resources.
- [ ] Unsupported intent returns clarification or a bounded improvisation path.
- [ ] Narration receives committed results only.
- [ ] Admin override actions are entirely separate from the hosted DM surface.

### First vertical-slice acceptance test (action economy)

The kernel is proven when a character can:

1. Begin a persisted turn with one Action, one eligible Bonus Action pool, one Reaction, and movement equal to Speed.
2. Move fifteen feet.
3. Attack a goblin using an equipped weapon and entirely server-derived statistics.
4. Spend the Action whether the attack hits or misses.
5. Move using the remaining Speed.
6. Be prevented from taking a second main Action.
7. Explicitly end the turn.
8. Trigger a valid enemy opportunity attack that consumes the enemy's Reaction.
9. Refresh the browser and recover the exact same budget, HP, positions, and events.
10. Retry the same command without duplicating movement, damage, resource use, or action expenditure.
11. Experience a narration timeout without repeating mechanics.
12. Inspect every roll, modifier source, cost, effect, and before/after value.

---

## Part 2 — Spatial movement design intent

### Recommended approach: native 3D data, hybrid navigation

The Lantern engine should **store space natively in three dimensions**, but not simulate the whole world as a giant cube of voxels. Use three cooperating layers:

```text
World / scene graph
    rooms, regions, decks, floors, portals, roads

Navigable surfaces and volumes
    floors, stairs, walls, water, air, tunnels

Local tactical geometry
    exact positions, bodies, obstacles, reach, paths, hazards
```

Most creatures walk on **2D surfaces embedded in 3D space**. Flying, swimming, falling, jumping, and burrowing require true 3D volumes. World-scale travel should use connected locations rather than pathfinding through millions of five-foot cubes.

The crucial invariant:

> **Movement is never "set the actor's position." Movement is a validated path that consumes a budget, crosses geometry, causes triggers, and ends in a legal pose.**

### What the reference engine already gives us

`mnehmos.rpg.mcp` already has a useful geometry foundation: optional `z` coordinates; Euclidean, Manhattan, and Chebyshev distance; 3D spheres and cones; A* pathfinding with 26 neighbors in 3D; configurable diagonal and terrain costs.

But it is not yet a complete authoritative 3D model:
- Its 3D A* permits movement to any neighboring `z` cell without asking whether the actor is walking, flying, climbing, or supported by a floor.
- Its combat collision model still represents obstacles as `"x,y"` keys.
- Creature footprints expand only across `x` and `y`.
- Its combat-grid cost hardcodes a `1.5` diagonal approximation.
- Its field-of-view implementation remains fundamentally 2D.

Reuse the algorithms and lessons; define a more complete spatial contract for Lantern rather than porting this as-is.

### 1. A position needs more than `x, y, z`

A character at `(10, 15, 20)` might be standing on a balcony, flying twenty feet above a floor, climbing a wall, swimming underwater, falling, standing on a moving ship, or inside one room whose coordinates overlap another room's local coordinates.

```ts
type MovementMode =
  | "walk" | "crawl" | "climb" | "swim" | "fly"
  | "burrow" | "jump" | "fall" | "teleport"
  | "carried" | "vehicle";

type Stance =
  | "standing" | "prone" | "climbing" | "swimming"
  | "flying" | "falling" | "mounted";

interface Pose3D {
  frameId: string;

  // Fixed-point authoritative coordinates.
  x: number;
  y: number;
  z: number;

  stance: Stance;

  // What physically supports the actor, when applicable.
  supportSurfaceId?: string;

  // Useful for cones, facing, mounts, and presentation.
  yawDegrees?: number;
}
```

`frameId` matters: a dungeon level, ship, building, cavern, and outdoor battlefield can each have their own local coordinate frame. A portal connects frames:

```ts
interface SpatialPortal {
  id: string;
  fromFrameId: string;
  toFrameId: string;
  fromRegionId: string;
  toRegionId: string;

  kind:
    | "door" | "stairs" | "ladder" | "elevator"
    | "shaft" | "tunnel" | "teleport";

  traversalRequirements?: string[];
}
```

That prevents the entire game world from requiring one enormous coordinate system.

### 2. Use fixed-point units, not floating-point authority

The authoritative database should not accumulate floating-point drift. A practical choice:

```text
1 authoritative spatial unit = 1/1000 foot
5 feet = 5,000 units
30 feet = 30,000 units
```

The API may display ordinary feet; persistence and calculations use integers. This supports exact, deterministic approximations for three-dimensional diagonals:

```text
5-foot orthogonal step:       5,000 units
5-foot two-axis diagonal:     7,071 units
5-foot three-axis diagonal:   8,660 units
```

Alternatively, a strict grid profile can bill every adjacent cube as five feet. The geometry engine and the rules profile should remain separate so this can be selected explicitly.

### 3. Make the distance rule configurable

Three-dimensional diagonal movement is a **ruleset decision**, not merely a pathfinding implementation detail.

The 2014 Basic Rules' grid variant counts any adjacent square, including a diagonal square, as one five-foot segment, explicitly favoring smooth play over geometric realism; movement can be split before/after actions and combined across walking, climbing, swimming, and flying. Pathfinder's published three-dimensional guidance instead counts every other 3D diagonal as ten feet.

```ts
type SpatialMetric =
  | "continuous_euclidean"
  | "five_e_grid_simple"
  | "alternating_diagonal";

interface SpatialRulesProfile {
  metric: SpatialMetric;
  tacticalCellFeet: number;
  roundDisplayedDistanceToFeet: number;
  preventCornerCutting: boolean;
}
```

**Recommendation for Lantern (from the source research):** because Lantern is text-first rather than a physical grid interface, use **fixed-point Euclidean distance** as the default internal movement and range metric — this prevents a flyer from moving thirty feet sideways and thirty feet upward while paying only thirty feet. Retain `five_e_grid_simple` as a compatibility profile for tests or later grid-based play. Do **not** use a blanket `1.5` cost for all diagonals: a two-axis diagonal is geometrically different from a three-axis diagonal, an alternating 5-10 rule requires tracking diagonal parity, and a simple 1.5 multiplier can cause A* to select a different path than the actual billing rule. Whichever profile is selected must govern movement, range, reach, and area measurement consistently.

> Note: [ADR-H24](ADR-H24-frame-scoped-2-5d-positions.md) chose `five_e_simple`/Chebyshev for v1 instead of continuous Euclidean, since Lantern's v1 scope is 2D tactical combat, not a physical 3D grid — this research's Euclidean recommendation is preserved here as the documented option for whenever a true 3D/flight profile is built.

### 4. Separate surfaces from free-space volumes

**Navigable surfaces.** Walking creatures should move only across connected surfaces:

```ts
interface NavSurface {
  id: string;
  frameId: string;

  kind:
    | "floor" | "ramp" | "stairs" | "wall"
    | "ceiling" | "ledge" | "vehicle_deck";

  allowedModes: MovementMode[];
  difficultTerrain: boolean;
  maxClearanceHeight: number;
  geometryRevision: number;
}
```

Walking A* generates neighbors along a floor or ramp. It must **not** generate an arbitrary upward neighbor merely because `(x, y, z + 1)` is empty. Vertical transitions require stairs, a ramp, a climbable surface, a ladder, a jump, a flying speed, or some other explicit rule.

**Navigable volumes.** Free three-dimensional movement occurs inside bounded volumes:

```ts
interface NavVolume {
  id: string;
  frameId: string;

  kind: "air" | "water" | "burrowable_material";

  allowedModes: MovementMode[];
  bounds: VolumeShape;
  geometryRevision: number;
}
```

A bird may fly within an air volume; a fish may swim within a water volume; an earth elemental may burrow through an eligible earth volume; a walking character cannot navigate any of those volumes without a corresponding capability.

### 5. Every actor needs a body volume

A point can pass through spaces the actual creature cannot. Use a collision body distinct from combat reach:

```ts
interface SpatialBody {
  shape: "capsule" | "box";

  width: number;
  depth: number;
  height: number;

  sizeCategory:
    | "tiny" | "small" | "medium"
    | "large" | "huge" | "gargantuan";

  squeezeWidth?: number;
  squeezeHeight?: number;
}
```

The 2014 rules define the horizontal combat space controlled by each creature size, but that space is not necessarily its literal body dimensions — Lantern needs explicit height and clearance defaults of its own rather than assuming the tabletop size table defines a complete 3D box.

For each proposed segment, check the actor's **swept volume** from start to finish. That prevents moving through thin walls diagonally, large creatures clipping through ceilings, flying through a gap too narrow for wings/body, moving between two blocked cells by cutting their shared corner, and ending partially inside another creature.

**Corner cutting.** For a diagonal step, do not merely check the destination. A two-axis diagonal must check the adjoining orthogonal spaces; a three-axis diagonal must check all relevant faces and edges the creature's body crosses:

```text
From (0,0,0) to (1,1,1)

Do not allow the move merely because (1,1,1) is empty.

Also verify clearance through:
(1,0,0)
(0,1,0)
(0,0,1)
and the crossed edge/face combinations
```

A conservative "supercover" traversal is preferable to permitting corner clipping.

### 6. Give actors a movement profile

```ts
interface MovementProfile {
  walkSpeed?: number;
  climbSpeed?: number;
  swimSpeed?: number;

  fly?: { speed: number; hover: boolean };

  burrow?: { speed: number; permittedMaterials: string[] };

  jump?: {
    standingHorizontal: number;
    runningHorizontal: number;
    standingVertical: number;
    runningVertical: number;
  };

  maxStepHeight: number;
  maxWalkableSlopeDegrees: number;
}
```

The engine derives this from: character + ancestry + class + equipment + active spells + conditions + encumbrance + current environment. The model never supplies movement speed or declares that the character can fly.

### 7. Track movement cost and physical distance separately

D&D allows a creature to mix different movement modes; when switching speeds, distance already moved reduces what remains under the newly selected speed. Difficult terrain and climbing/swimming without a corresponding special speed consume additional movement.

```ts
interface MovementLedger {
  physicalDistanceMoved: number;
  movementCostSpent: number;

  dashAllowance: number;

  activeMode?: MovementMode;

  segments: MovementSegment[];
}

interface MovementSegment {
  from: Pose3D;
  to: Pose3D;

  mode: MovementMode;

  physicalDistance: number;
  terrainMultiplier: number;
  modeMultiplier: number;
  movementCost: number;

  enteredRegions: string[];
  exitedRegions: string[];
  triggerIds: string[];
}
```

Example:

```text
10 feet of ordinary walking
Physical distance: 10
Movement cost: 10

10 feet of difficult terrain
Physical distance: 10
Movement cost: 20

10 feet of climbing without Climb Speed
Physical distance: 10
Movement cost: 20
```

Movement normally consumes the movement ledger, not the main Action. Dash consumes the Action and adds an additional movement allowance; movement can then continue before or after other actions.

### 8. Different movement modes require different path rules

| Mode | Path rule |
| --- | --- |
| **Walk** | Must remain on a supporting floor, ramp, stairs, or equivalent surface |
| **Crawl** | Ground surface required; additional movement cost; reduced clearance |
| **Climb** | Must remain attached to a climbable surface; check handholds and transition points |
| **Swim** | Must remain within a water volume; full 3D neighbors |
| **Fly** | Must remain within traversable air; full 3D neighbors |
| **Burrow** | Must remain inside permitted material; cannot cross protected or unsupported materials |
| **Jump** | Validate a trajectory and landing point; do not pathfind as arbitrary flight |
| **Fall** | Forced downward displacement to the first support surface or interception |
| **Teleport** | Validate range, visibility if required, destination volume, and occupancy; no traversed path |
| **Vehicle** | Movement belongs to the mount or vehicle; rider position is relative to it |

**Walking** permits elevation changes only through connected geometry: `floor → stair → upper floor`, `floor → ramp → raised platform`, `floor → climb transition → wall`.

**Climbing.** A climber has a surface attachment, a surface normal, available holds, clearance from the wall, and a transition at the top or bottom. The engine should not merely increase `z`.

**Flying** uses a free-space path but still checks ceilings, walls, creature volumes, minimum clearance, zones and hazards, reach boundaries, and whether the creature can hover. The 2014 rules say a flying creature generally falls if knocked prone, reduced to Speed 0, or otherwise deprived of movement, unless it can hover or is magically held aloft.

**Swimming** is volumetric like flying but belongs to a water volume and may add currents, surface transitions, depth, breath/suffocation clocks, visibility modifiers, and underwater attack restrictions. Do not simulate fluid physics — treat currents as terrain costs or forced movement.

**Jumping** should be a special path segment:

```ts
interface JumpSegment extends MovementSegment {
  takeoff: Pose3D;
  apex: Pose3D;
  landing: Pose3D;

  requiredRunup: number;
  clearanceValid: boolean;
  landingSupportId: string;
}
```

The engine validates available movement, jump capability, required run-up, arc clearance, landing space, and fall consequences if the landing fails.

**Falling.** Do not build a real-time physics engine. Resolve falling as an authoritative forced-movement event:

```text
Lose support
→ identify downward collision path
→ open eligible reaction window
→ move to first support/interception point
→ calculate fall consequence
→ update pose and conditions
```

For very high-altitude encounters, falling can remain a multi-round state, but that is not required for the first slice.

### 9. Movement must be resolved along the path, not at its endpoint

A move from A to B may cross an enemy's reach boundary, a trap, fire, difficult terrain, a spell area, a narrow passage, a door, a visibility threshold, a pressure plate, a ledge, or a current/wind field. The engine must inspect the ordered path:

```text
Plan path
→ validate body clearance
→ calculate cost
→ locate ordered triggers
→ move to first interrupt point
→ resolve trigger/reaction
→ revalidate
→ continue or stop
```

This is especially important for opportunity attacks.

### 10. Reach and opportunity attacks become 3D volumes

Do not test merely whether two anchors are "adjacent." Each creature has:

```text
Occupied body volume
+ reach distance
= threatened volume
```

A movement path provokes when it crosses from inside a hostile threatened volume to outside it, subject to the rules profile. Store the movement cause:

```ts
type MovementCause =
  | "voluntary" | "forced" | "fall"
  | "teleport" | "carried" | "vehicle";
```

That lets the reaction policy distinguish ordinary movement from forced displacement or teleportation. A reaction resolves at the actual boundary-crossing segment, not after the actor has already appeared at the destination.

### 11. Use one geometry model for movement, reach, range, LOS, and AoE

Spatial contradictions happen when pathfinding says a wall blocks movement, but line of sight ignores the wall, a spell area passes through it, and cover uses an unrelated approximation. Objects should have distinct properties:

```ts
interface SpatialObstacle {
  id: string;
  frameId: string;
  volume: VolumeShape;

  blocksMovement: boolean;
  blocksVision: boolean;
  blocksLineOfEffect: boolean;

  cover: "none" | "half" | "three_quarters" | "total";

  climbable: boolean;
  breakable: boolean;
}
```

A glass wall might block movement (yes) but not vision (no), while usually blocking line of effect (yes). A curtain might not block movement (no) but block vision (yes), without blocking line of effect (no).

**Three-dimensional areas.** Support explicit shapes:

```ts
type AreaShape = Sphere | Cylinder | Cone | Line | Box;
```

Determine whether an actor is affected by intersecting the area volume with the actor's occupied volume, not merely by asking whether the actor's anchor point is inside it. The reference engine already computes 3D spheres and cones, which is useful — but its visibility and combat occupancy systems must be brought onto the same 3D geometry model before being trustworthy for Lantern.

### 12. Use semantic destinations for the LLM

The hosted DM should usually not invent coordinates. It should select targets such as:

```ts
type SpatialTarget =
  | { kind: "point"; frameId: string; position: { x: number; y: number; z: number } }
  | { kind: "region"; regionId: string }
  | { kind: "entity"; entityId: string; relation: "adjacent" | "within_reach" | "above" | "behind" }
  | { kind: "portal"; portalId: string };
```

For "I fly above the ogre and land on the balcony," the interpreter proposes:

```json
{
  "actorId": "hero_1",
  "destination": { "kind": "region", "regionId": "north_balcony" },
  "preferredMode": "fly",
  "routePreferences": { "avoidEnemyReach": true }
}
```

The engine decides the exact takeoff point, the legal air path, required altitude, distance and movement cost, whether the balcony has a valid landing space, and whether the route crosses an enemy's reach or a hazard.

### 13. Movement command contract

```ts
interface MoveCommand {
  commandId: string;
  actorId: string;

  destination: SpatialTarget;
  preferredMode?: MovementMode;

  routePolicy?: "shortest" | "safest" | "quietest";

  expectedCampaignVersion: number;
  expectedGeometryRevision: number;
}
```

The engine first creates a plan:

```ts
interface MovementPlan {
  planId: string;
  actorId: string;

  startingPose: Pose3D;
  endingPose: Pose3D;

  segments: MovementSegment[];

  totalPhysicalDistance: number;
  totalMovementCost: number;

  detectedTriggers: {
    triggerId: string;
    segmentIndex: number;
    position: Pose3D;
    mandatory: boolean;
  }[];

  geometryRevision: number;
  stateVersion: number;
  planHash: string;
}
```

Then it executes against the same state version. A successful result contains:

```ts
interface MovementResult {
  status: "completed" | "paused" | "rejected";

  commandId: string;
  eventIds: string[];

  before: Pose3D;
  after: Pose3D;

  completedSegments: MovementSegment[];
  remainingSegments?: MovementSegment[];

  budgetBefore: MovementLedger;
  budgetAfter: MovementLedger;

  reactions: unknown[];
  hazards: unknown[];

  resultingCampaignVersion: number;
}
```

### 14. Transactions and reaction windows

**No optional interruption** (every reaction can be resolved automatically):

```text
validate whole path
→ calculate ordered triggers
→ resolve movement and triggers
→ spend movement
→ persist all effects atomically
→ return result
```

**Optional player reaction:**

```text
move to reaction boundary
→ persist movement_paused
→ present reaction offer
→ resolve reaction
→ revalidate remaining route
→ resume or cancel
```

This becomes a resumable action rather than a single uncontrolled model loop. At no point should the browser or LLM mutate the position directly.

### 15. Ground exploration should remain mostly 2.5D

Do not run volumetric A* for every trip through a building. Represent most exploration as:

```text
Room
 ├─ floor surface
 ├─ balcony surface at z = 15 ft
 ├─ stairs link
 ├─ ladder link
 └─ open shaft volume
```

Travel between ordinary rooms is a graph traversal. Local metric pathfinding is used only when exact range matters, combat begins, hazards cover part of a room, several routes through the same space matter, vertical positioning matters, or the player is flying, swimming, jumping, or falling. This gives real 3D behavior without turning Lantern into a physics engine or VTT.

### Implementation order (source research's proposed phasing)

**Phase 1: authoritative 2.5D.** Mandatory `frameId`/`x`/`y`/`z`; floor surfaces at elevations; stairs, ladders, doors, and ledges as explicit links; walking, climbing, jumping, and falling; three-dimensional distance and reach; body clearance; swept-path collision; path-based opportunity attacks; structured movement events. No unrestricted flying yet.

**Phase 2: free 3D volumes.** Flying; hover; water volumes; swimming; 3D line of sight; spheres, cylinders, cones, boxes, and lines; vertical cover; volumetric hazards.

**Phase 3: complex relationships.** Mounts and riders; moving ships and platforms; parent coordinate frames; burrowing; grappled and carried movement; simultaneous movement; wind, currents, and moving hazards.

> Note: [ADR-H24](ADR-H24-frame-scoped-2-5d-positions.md) commits only to a subset of Phase 1 (mandatory frame+coordinates with `z` pinned to 0, no surfaces/stairs/climb/jump/fall yet) as the current decision. The rest of Phase 1 and all of Phases 2-3 remain intent for future ADRs, not commitments.

### Minimum acceptance checklist (spatial)

- [ ] Every persisted position has a frame and three coordinates.
- [ ] A walking creature cannot increase `z` without stairs, a ramp, climbing, jumping, or another legal transition.
- [ ] A flying creature can move vertically through valid air.
- [ ] A non-flying creature cannot path through air.
- [ ] A swimmer cannot leave the water without a valid surface transition.
- [ ] Movement cost is calculated from the complete path.
- [ ] Physical distance and movement cost are separately recorded.
- [ ] Movement can be split before and after an Action.
- [ ] Switching movement modes follows the active speed rules.
- [ ] Dash adds an allowance and consumes the correct action resource.
- [ ] Difficult terrain and climbing modify cost.
- [ ] Large creatures cannot pass through insufficient clearance.
- [ ] Diagonal movement cannot clip through corners.
- [ ] Every intermediate pose is collision-checked.
- [ ] A creature cannot willingly end inside another creature.
- [ ] Reach is measured between occupied volumes.
- [ ] Opportunity attacks trigger at the boundary crossing.
- [ ] Forced movement, falling, and teleportation are distinguishable.
- [ ] Falling begins when support is lost.
- [ ] Hover prevents the appropriate fall cases.
- [ ] Jump arcs check overhead clearance and landing space.
- [ ] Teleports validate the destination but do not traverse intervening hazards.
- [ ] Rejected movement changes no position, bounds, budget, or geometry.
- [ ] A stale geometry revision forces replanning.
- [ ] Pathfinding tie-breaking is deterministic.
- [ ] The persisted event includes the path, costs, triggers, before/after poses, and state version.
- [ ] Refreshing the site reconstructs the identical position and remaining movement.
- [ ] Retrying the same command does not move the actor twice.
- [ ] Movement, visibility, cover, reach, and areas use the same geometry definitions.

### Bottom line (spatial, as stated by the source research)

> Mandatory 3D positions + local coordinate frames + navigable ground surfaces + explicit vertical links + bounded air/water volumes + fixed-point distances + full-path collision and triggers + server-owned movement ledger + structured movement events.
>
> The key improvement over the reference engine is not merely making `z` mandatory. It is making **movement mode, support, body volume, route, cost, and interruption** authoritative alongside the coordinate.

---

## Part 3 — Synthesis and milestone intent (as supplied)

### Framing

The audit gives a clean answer: **do not begin 3D movement yet. First finish the action-economy kernel Lantern already has, because its transactional foundation is good but its combat semantics are incomplete.**

The strongest asset is the existing command pipeline: turn ownership, post-encounter rejection, one-Action gating, optimistic concurrency, idempotent replay, and atomic state/event/result persistence are already implemented and tested.

The immediate blocker is the player attack path: it ignores the equipped weapon and always resolves as Strength plus proficiency against a hardcoded `1d8 + Strength`, while enemy attacks correctly use compiled content statistics.

The spatial system is not partially implemented — it is absent by design: movement is currently traversal through narrative exits, and `distanceFeet` is only a scalar range gate.

### Product-owner decisions recommended to lock now (as supplied)

| Decision | Recommendation |
| --- | --- |
| Spatial scope | **2.5D-ready schema, 2D behavior first.** Keep scene-graph movement for exploration. Add local tactical coordinates for structured encounters later. Store `z`, but initially require `z = 0`; do not implement flight, volumetric collision, or 3D A* for launch. |
| Distance metric | Use a named `five_e_simple` profile backed by **Chebyshev distance** for the first tactical implementation. Every adjacent horizontal or diagonal cell costs five feet. A true 5-10-5 rule is an alternating-diagonal metric, not Chebyshev, and can be added as a separate profile later. |
| Action pools | Use **typed pools**, not one generic point total: Action, Bonus Action, Reaction, movement allowance, and optionally one ordinary interaction. |
| Turn completion | Add an explicit `end_turn` command. Do not automatically move to the enemy immediately after the player spends their Action, because movement and Bonus Action may remain. |
| Optional reactions | Persist an explicit `pendingReaction` state. Pause only for optional player reactions. Mandatory effects and NPC reactions may resolve automatically according to deterministic policy. |
| Noncombat economy | Keep ordinary roleplay freeform. Add structure only when time, danger, opposition, repeated attempts, or resource consumption matter. Do not give casual conversation a combat-like action-point meter. |

> Note: this table is what [ADR-H23](ADR-H23-typed-action-economy-kernel.md) and [ADR-H24](ADR-H24-frame-scoped-2-5d-positions.md) formally adopted. See those ADRs for the accepted decision text and consequences.

### Preserve the audited baseline (urgent, precedes any implementation)

The Lantern repository currently has **no commits**, and every file is untracked. The build and all 83 tests pass, but there is no recoverable baseline in Git. Before implementation:

1. Inspect untracked files for secrets, databases, generated content, and local `.env` files.
2. Complete `.gitignore`.
3. Commit the audited state.
4. Tag it, for example: `audit-baseline-2026-08-07`.

This is more urgent than any engine refactor.

### Milestone A: finish the action-economy foundation

#### A1. Fix server-owned weapon attack derivation

Create one canonical service:

```ts
interface DerivedWeaponAttack {
  weaponId: string;
  weaponName: string;

  ability: "strength" | "dexterity";
  abilityModifier: number;

  proficient: boolean;
  proficiencyBonus: number;

  attackBonus: number;

  damage: {
    diceCount: number;
    dieSides: number;
    modifier: number;
    damageType: string;
  };

  properties: string[];
  reachFeet: number;
  normalRangeFeet?: number;
  longRangeFeet?: number;

  explanation: DerivedValueComponent[];
}
```

Something equivalent to:

```ts
deriveWeaponAttack({ character, equippedWeapon, attackMode, ruleset });
```

must determine: which equipped weapon is being used; whether it is owned and actually equipped; Strength versus Dexterity; finesse handling; ranged weapon handling; proficiency; attack bonus; damage dice and modifier; damage type; reach and range metadata; critical-hit dice; applicable conditions and temporary modifiers.

The command should accept:

```ts
{ action: "attack", targetId: string, weaponId?: string }
```

It must **not** accept: `attackBonus`, `damage`, `targetAc`, `critical`. Those remain server-owned.

The event should include the derivation:

```json
{
  "attackBonus": {
    "total": 5,
    "components": [
      { "source": "Strength", "value": 3 },
      { "source": "Weapon proficiency", "value": 2 }
    ]
  },
  "damage": { "expression": "1d8+3", "source": "Battleaxe" }
}
```

Add regression fixtures for: Strength melee weapon; finesse weapon using Dexterity; ranged weapon; non-proficient weapon; versatile weapon in one and two hands (if versatile is in scope); natural 20 doubling dice, not the ability modifier; missing or unequipped weapon rejection; rejection causing no state, version, Action, or inventory mutation.

#### A2. Replace loose flags with a real turn budget

```ts
interface TurnBudget {
  action: { available: number; spent: number };
  bonusAction: { available: number; spent: number };
  reaction: { available: number; spent: number };
  movementFeet: { available: number; spent: number };
  interaction?: { available: number; spent: number };
}
```

Keep ordinary persistent resources separate: spell slots, hit dice, class feature uses, ammunition, charges, consumables, concentration.

A Bonus Action budget existing does **not** mean every actor has a legal Bonus Action — it means the resource exists; legal action offers determine whether anything may spend it.

The command resolver should use a consistent sequence:

```text
load current turn
→ verify actor
→ verify timing
→ verify legal action definition
→ verify budget
→ verify persistent resources
→ resolve
→ spend budget and resources
→ apply effects
→ commit atomically
```

#### A3. Add explicit `end_turn`

The current automatic turn advance becomes incompatible the moment the player can still move or use a Bonus Action after attacking.

Recommended behavior:

```text
Player begins turn
→ may move
→ may act
→ may use Bonus Action when eligible
→ may move again
→ calls end_turn
→ engine processes end-of-turn effects
→ enemies resolve
→ next player turn begins
```

Allow server-side automatic ending only when: the player explicitly requested an all-in-one turn plan that ends with completion; the actor has no remaining legal offers; or a deterministic timeout/automation policy is explicitly configured. Do not silently end a turn simply because the Action was spent.

#### A4. Add legal action offers

The audit found that `availableActions` is not proven to be populated from live legality and that there is no authoritative ActionOffer system.

The engine should return:

```ts
interface ActionOffer {
  actionId: string;
  label: string;

  timing: "action" | "bonus_action" | "reaction" | "movement" | "free";

  validTargets?: string[];

  cost: {
    action?: number;
    bonusAction?: number;
    reaction?: number;
    movementFeet?: number;
  };

  reasonUnavailable?: string;
}
```

The DM should receive legal offers such as:

```json
[
  { "actionId": "weapon.attack", "timing": "action", "validTargets": ["goblin-1"] },
  { "actionId": "fighter.second_wind", "timing": "bonus_action" },
  { "actionId": "end_turn", "timing": "free" }
]
```

The model selects from offers. It does not invent action timing.

#### A5. Implement one real Bonus Action

The clean first candidate is **Fighter Second Wind**:

```text
Timing: Bonus Action
Resource: once per short/long rest
Effect: server-computed healing
```

This proves: independent Bonus Action budget; feature resource use; healing; before/after state; atomicity; rest recovery; legal action offer generation. Do not choose a fake "test bonus action" with no player-facing mechanical meaning.

#### A6. Implement one genuine optional Reaction

Because movement does not yet exist, opportunity attacks should wait until Milestone B. The strongest first reaction is a **Shield-like reaction to an incoming hit**, assuming the content slice contains the spell or equivalent feature.

The enemy attack lifecycle becomes:

```text
Enemy attack roll indicates a hit
→ engine detects eligible player reaction
→ commit pendingReaction
→ return reaction offer
→ player uses or declines reaction
→ engine consumes Reaction and resource if used
→ recalculate hit
→ resolve damage
→ finish enemy action
```

Persist:

```ts
interface PendingReaction {
  id: string;
  trigger: "incoming_attack_hit";

  sourceActorId: string;
  targetActorId: string;

  sourceActionId: string;
  attackRoll: number;
  attackTotal: number;

  eligibleReactionIds: string[];
  createdAtVersion: number;
}
```

Mandatory effects and enemy-controlled reactions can resolve automatically. Optional player reactions should pause because they spend scarce resources and may materially change the result. This is a better proof of the Reaction architecture than implementing natural-language Ready triggers first.

#### A7. Make currently advertised actions honest (**truncated in source — partial**)

The audit found:
- Dodge has some mechanical state.
- Dash, Disengage, … *(source message was cut off here by a 50,000-character limit; the remainder of A7, and anything after it, was not received. Append the rest here if/when it becomes available.)*

---

## Sources cited by the pasted research

The source material cited the following (URLs as supplied by the product owner; not independently re-verified as part of this transcription):

- D&D Beyond, *Basic Rules for Dungeons and Dragons (D&D) Fifth Edition (5e) — Combat*.
- Archives of Nethys, Pathfinder 2nd Edition — *Chapter 8: Playing the Game*.
- Archives of Nethys, Pathfinder 2nd Edition — Rules ID 3040 (social/exploration subsystems referenced for Influence, Research, hexploration).
- Blades in the Dark — *Action Roll*.

---

## Traceability to ADRs

| This document | Captured by | Status |
| --- | --- | --- |
| Part 1 §"Named budget pools", §"Five concepts", explicit `end_turn`, `pendingReaction` | ADR-H23 | Accepted; implementation pending |
| Part 1 §"Precomputation authoritative" (weapon-attack derivation) | ADR-H23 | Accepted; implementation pending (treated as a prerequisite, not deferred) |
| Part 1 §"Modes table", §"Escalation rule", noncombat P0 checklist | *Not yet adopted* | Deferred — ADR-H23 explicitly keeps noncombat freeform until a mode demonstrates real pressure |
| Part 1 §"Multi-action turn plans" (TurnPlan) | *Not yet adopted* | Compatible with ADR-H15's multi-effect commit, but no ADR has committed to LLM-authored TurnPlans yet |
| Part 2 §1-§4 (Pose3D, frames/portals, fixed-point units, distance-metric configurability) | ADR-H24 | Partially accepted: `frameId`+coordinates reserved now, `z` pinned to 0; `five_e_simple`/Chebyshev chosen over the research's Euclidean-first recommendation for v1 |
| Part 2 §5-§10 (body volume, movement profile/ledger, mode-specific path rules, path-based triggers, reach/OA volumes) | *Not yet adopted* | Deferred — explicitly out of scope for ADR-H24; needs its own ADR(s) once positions ship |
| Part 2 §11-§14 (unified geometry model, semantic destinations, movement command contract, reaction windows) | *Not yet adopted* | Deferred — depends on both ADR-H23's Reaction work and ADR-H24's positions |
| Part 2 §15 + implementation phases | ADR-H24 | Phase 1 partially accepted (schema only); Phases 2-3 explicitly deferred |
| Part 3 milestone A1-A6 | ADR-H23 | Reflected in ADR-H23's decision list |
| Part 3 milestone A7+ | *Unknown* | Not received (truncated) |
| Part 3 "preserve the audited baseline" (git commit/tag) | *Not an ADR* | Operational task, not a design decision — should be done directly, not gated on an ADR |
