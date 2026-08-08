# Audit: Perception, Stealth, Senses, Hidden State, Knowledge, Discovery, and Memory

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#7` `[P1][Perception] Stealth, senses, hidden state, knowledge, discovery, and memory`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern has **no perception, stealth, visibility, or knowledge subsystem.** There is no hidden/secret state, no actor-knowledge model, no stealth/invisibility/light mechanic, and the DM-context builder does not filter facts by actor scope. Creature `senses` (darkvision/tremorsense/blindsight/passive perception) exist only as **imported content metadata** on monster views; PC characters carry **no senses at all** beyond a single computed `passivePerception` that is **never checked against anything.** This is the largest greenfield issue in Phase 1: nearly the entire model is new.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineWorldContext` `:581-589`, `EngineNpc` `:591-600`, `EngineCombatantView.senses` `:908`, `EngineNote` `:617-622`, `EngineCharacter` has no senses/hidden/knowledge fields `:764-788`), `src/engine-domain.ts` (`passivePerception` derivation `:4354`, `worldContext` handling, `normalizeNpc` `:3913-3922`), `src/content/schema.ts` (`NormalizedCreature.senses` `:387-392`), `src/content/open5e-import.ts` (senses import `:2284-2289,617-619`; `is_secret` content flag `:356,2682`), `src/open5e-rules.ts` (`materializeCombatant` surfaces creature senses `:909`). Tests: none cover perception/stealth/knowledge. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Observation and world context | `LANTERN_PARTIAL` | `EngineWorldContext` `engine-contracts.ts:581-589` is an authored scene: `{id,title,description,exits[],features:string[],npcs,merchants}`. It is **fully DM-authored and fully player-visible** — there is no per-actor visibility filter. `observe`/`world_context` tools return it verbatim. |
| NPC memories and player notes | `LANTERN_PARTIAL` | `EngineNpc.memories: string[]` and `relationshipScore` (`:599,598`); `EngineNote` durable player/DM notes (`:617-622`). These are **narrative-only prose**, not structured knowledge with provenance/confidence. |
| Passive Perception and Insight | `LANTERN_PARTIAL` / `ABSENT` | `passivePerception` is computed in the character view (`engine-domain.ts:4354`) but **never checked** against any hidden DC. Passive Insight does not exist. |
| Hidden / secret fields | `ABSENT` | No hidden/secret/discovered/visibility field on world context, NPCs, items, or characters. `is_secret` exists only as an imported content flag on species/doors (`open5e-import.ts:356,2682`) — not a runtime hidden-state model. |
| Stealth and invisibility | `ABSENT` | No stealth value, no hide action, no invisible/unseen condition, no stealth-vs-perception contest. |
| Light and darkness | `ABSENT` | No illumination/light-source state; no darkness effect on visibility. |
| Senses (darkvision, blindsight, tremorsense, hearing) | `CONTENT_ONLY` | `NormalizedCreature.senses` carries `darkvision/tremorsense/blindsight/passive_perception` ranges (`schema.ts:387-392`; imported `open5e-import.ts:2284-2289,617-619`), surfaced read-only on `EngineCombatantView.senses` (`engine-contracts.ts:908`). **PC characters have no senses field at all**; nothing consumes creature senses for visibility. |
| Traps, secret doors, disguises, illusions, surprise | `ABSENT` | No trap/secret-door/disguise/illusion entities; no surprise mechanic (couples to #11). |
| What information is sent into the DM prompt | `UNKNOWN`(unfiltered) | No actor-knowledge scope exists; inference: the DM prompt receives the full authored `worldContext` regardless of what the PC could perceive. **This is the security boundary the issue must build.** |
| Whether actor-specific knowledge is structured | `ABSENT` | NPC `memories` are prose; no actor-known/actor-perceived/false-belief model. |

## 3. The two-tract gap

The issue requires separating **world truth** from **actor-perceived / actor-known / rumor / false belief / hidden**. Lantern currently has only **world truth** (the authored `worldContext`) and **player-authored notes**. Every other tract is absent. Notably:

- **Creature senses exist but PC senses do not** — symmetry is broken before any mechanic can be built.
- **`passivePerception` is a dead number** — derived, displayed, never compared.
- **No stealth counterpart** — there is nothing for perception to contest.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *one visible object; one hidden trap/secret compartment; one dark area; one normal-vision observer and one darkvision observer; passive observation then active search; one revealed fact that persists and one unrevealed fact that never reaches the player-facing DM context. Scene/region-level visibility allowed.*

**What exists that helps:** transactional persistence (discoveries can be event-sourced like other state); the content pack already carries creature sense ranges to model; the `roll_check` primitive (via #6) for active search.

**What is missing and must be built:**
- A **knowledge model**: world-facts vs actor-perceived vs actor-known vs rumor vs false-belief vs hidden, each with source/timestamp/version/confidence. None exists.
- A **DM-context filter** that excludes unrevealed hidden facts per requesting actor — **the highest-stakes correctness requirement**; must be tested adversarially (an unrevealed trap must never appear in the prompt).
- **PC senses** (at minimum darkvision from species) and a **visibility rule** combining light/darkness + sense.
- **Passive Perception actually checked** at scene boundaries (exactly once).
- **Active search** via #6 returning only authorized information tiers.
- **Stealth contest** (server-resolved) producing a hidden/unseen state (via #2).
- **Persistent actor-scoped discoveries** with staleness representation (a changed world fact must not silently rewrite historical knowledge).

## 5. Required-model gaps (vs. issue's "Required model")

Issue model: world facts; actor-perceived; actor-known; rumors/claims; false beliefs; hidden/secret; discovery source+timestamp+version; visibility/obscurity; sense capabilities; memory provenance+confidence. **Every one of these is new.** The closest existing artifact is `EngineNpc.memories: string[]` (unstructured prose).

## 6. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| World truth stored separately from actor knowledge/perception | No | only world truth exists |
| Player-facing DM prompt cannot receive unrevealed hidden facts | No | no filter; no hidden facts |
| Passive Perception server-derived, checked exactly once at scene boundary | No | derived but never checked |
| Active search uses #6 retry rules + authorized info tiers | No | #6 not built; no tiers |
| Stealth contests server-resolved with explicit hidden/unseen state | No | absent |
| Darkness + one special sense change visibility deterministically | No | absent |
| Invisible/unseen integrate through #2 | No | #2 not built |
| Discoveries persist across refresh/restart, actor-scoped | No | absent |
| Rumor, fact, false belief distinguishable | No | absent |
| Altering a world fact does not silently rewrite historical knowledge (staleness explicit) | No | absent |
| Failed/rejected searches do not reveal hidden metadata | No | nothing to reveal yet, but no guard either |
| Replay does not duplicate discovery events | Yes (kernel) | inherited, once discoveries exist |
| Focused tests (passive reveal, failed/successful search, darkvision diff, prompt filtering, stale knowledge, cross-actor isolation) | No | none exist |

## 7. Dependencies and risks

- **#2 (effects)** — invisible/unseen should be an effect/visibility-condition, not a bespoke flag (issue explicitly prefers this).
- **#6 (resolution)** — checks, secret rolls, retry policies, information tiers. Co-design the secret-roll policy (#6 hides roll/DC; #7 decides *what* may be revealed).
- **#10 (spatial)** — later adds LOS/cover; #7 owns the knowledge model independent of geometry (issue: scene/region-level visibility acceptable first).
- **#11 (encounter)** — surprise eligibility derives from #7; #11 owns final encounter handling.
- **Risk (critical):** the DM-prompt filter is a **correctness/security boundary**. If an unrevealed hidden fact leaks into the LLM context, the LLM will narrate it. This must be the first thing proven, not the last.
- **Risk:** knowledge staleness — needs a discovery-version model so repins/content changes don't silently rewrite what an actor "knows."

## 8. Recommendation

Sequence: **#2 → #6 → #7** (EPIC guide). Build the **knowledge model + DM-context filter first**, before any stealth/light mechanic, because the filter is the boundary that makes everything else safe. Add PC senses (darkvision from species) to match the creature-sense content that already exists. Defer LOS to #10; keep region/scene-level visibility for the first slice.
