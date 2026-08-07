# ADR-H24: Frame-scoped 2.5D positions now, deferred full 3D volumes

Status: Accepted; implementation pending
Date: 2026-08-07
See also: `docs/hosted-handoff/action-economy-and-spatial-design-intent.md` (Part 2) for the fuller research/checklist this ADR distills.

## Context

The action-economy and 3D-spatial audit (`docs/hosted-handoff/action-economy-and-spatial-audit.md`) found that Lantern has no spatial system at all, 2D or 3D: no coordinates of any kind exist in `src` (confirmed by repo-wide search for `coordinate`/`position`/`x:number`/`pathfind`/`grid`). `resolveMove` (`src/engine-domain.ts:426-462`) only validates that a chosen `destinationId` matches an `exits` entry on the current DM-authored `worldContext` — a scene-graph edge traversal, not a spatial move. Combat range/area is a single scalar, `distanceFeet`, compared against a spell's flat range number (`src/engine-domain.ts:1430-1436`); despite one existing test's name ("...area geometry..."), no shape, angle, or position is ever evaluated. This matches the product's own scope: `docs/GDD.md:135` explicitly excludes "a map renderer or 3D client."

The reference engine (`mnehmos.rpg.mcp`) has real 3D-capable machinery — optional `z`, Euclidean/Manhattan/Chebyshev distance, 3D spheres/cones, A* with 26-neighbor 3D movement — but the audit also found it is not a complete authoritative model even there: its 3D A* lets an actor move into any neighboring `z` cell regardless of whether it is walking, flying, or supported; its collision model keys obstacles as 2D `"x,y"` strings; and its combat-grid cost hardcodes a `1.5` diagonal approximation rather than a real 2-axis/3-axis distinction. Per ADR-H13, it is comparison material only; even setting that boundary aside, none of it is a drop-in port as-is.

## Decision

Reserve a real coordinate schema now, but ship 2D tactical behavior first, and keep exploration ungridded:

1. **Mandatory `frameId` + `x` + `y` + `z` on any position that gets one at all**, but `z` is pinned to `0` and flight/climb/swim/burrow movement modes are not implemented in this phase. This avoids a breaking schema migration when verticality is eventually needed, without building unused 3D machinery (pathfinding neighbors, volumes, collision) ahead of a validated need. `frameId` scopes coordinates to one map/encounter so unrelated locations never share a coordinate space.
2. **Positional coordinates are additive to structured/tactical contexts only** (combat encounters, and locations explicitly authored as "mapped"). Ordinary exploration between rooms continues to use the existing `worldContext`/`exits` scene graph — that traversal model is not being replaced, because most of the game (per the audit's noncombat findings) is narrated free play, not a grid.
3. **One authoritative distance profile for v1: `five_e_simple`, backed by Chebyshev distance** — every horizontally/diagonally adjacent tactical cell costs 5 feet. This single metric governs movement cost, spell range, and reach alike, closing the gap the audit flagged where `distanceFeet` is an isolated scalar unrelated to any real geometry. Alternating 5-10-5 diagonals and fixed-point Euclidean distance are documented as future profile options, not built now — they are a rules-content decision, not an engineering blocker, and can be added as a second named profile without touching callers that already use `five_e_simple`.
4. **Movement is a validated, budgeted path, never a raw position write.** A `move` (or `combat_move`) command spends the `movementFeet` budget introduced in ADR-H23, validates against `expectedCampaignVersion`, and rejects with position/version/budget unchanged on failure — reusing the exact `rejection()`/`commit()` atomic pattern already proven for `combat_action` (ADR-H11, ADR-H15; `src/engine.test.ts:311-330`, `:1378-1389`).
5. **Explicitly deferred, no commitment made in this ADR:** flight, hover, swimming, burrowing, climbing, jump trajectories, falling/forced movement, body-volume/swept-path collision, corner-cutting checks, 3D line of sight/line of effect, moving or parent coordinate frames, and opportunity attacks (which depend on both a real position and the Reaction work in ADR-H23). Each of these should get its own ADR once a concrete product need appears — e.g., a specific encounter design that requires verticality — rather than being built speculatively.
6. **The reference engine's 3D pathfinding/collision code is not safe to port as-is**, independent of the ADR-H13 boundary: its neighbor generation has no surface/capability gating (a walking actor can move into open air) and its collision model is 2D-keyed. Any future reuse means rewriting the neighbor-generation and collision layers against Lantern's own frame/surface model, not copying the reference implementation.

## Consequences

- No 3D (or even freely walkable multi-level) gameplay ships in the near term. This is an explicit, scoped decision consistent with the GDD's exclusion of a map/3D client, not an oversight.
- Reserving `frameId`/`x`/`y`/`z` now (even with `z` pinned to 0) avoids a second breaking migration if/when tactical maps with elevation are prioritized later.
- Spell range, reach, and movement cost converge on one distance metric (`five_e_simple`/Chebyshev) instead of the current disconnected `distanceFeet` scalar, which directly fixes the "billed cost doesn't match derived cost" risk the audit called out.
- Structured combat encounters gain real positions once this and ADR-H23's `movementFeet` budget are implemented together (the audit's "Milestone B"); exploration and travel remain narrative and ungridded until a separate ADR extends them.
- Opportunity attacks, 3D reach, and 3D area effects remain absent until both a real position (this ADR) and a real Reaction (ADR-H23) exist — they are called out here so neither ADR is mistaken for delivering them alone.

## Rejected alternatives

- **Importing the reference engine's 3D A*/collision wholesale:** rejected — not authoritative-grade even in its own repo (no surface gating, 2D-keyed collision, hardcoded 1.5 diagonal cost), and rejected per ADR-H13's reference-engine boundary regardless of quality.
- **Building full 3D movement (flight/swim/burrow/volumes) now:** rejected — no product requirement has been demonstrated, and the GDD explicitly excludes a 3D client; this would add and maintain unused complexity ahead of a validated need.
- **Keeping `distanceFeet` as the permanent range/reach abstraction:** rejected — it already causes range and reach to diverge from any future positional movement and blocks opportunity attacks or shaped area effects, which need real geometry to exist at all.
- **Optional `z` with no schema commitment (i.e., leave positions undesigned until 3D is needed):** rejected — more likely to force a breaking migration later; reserving the field now while keeping it inert (`z = 0`, no volumetric modes) costs little and preserves the option.
