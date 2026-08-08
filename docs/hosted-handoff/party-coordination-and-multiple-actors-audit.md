# Audit: Party Coordination — Multiple Allied Actors, Shared State, Formation, Split Parties, and Coordination

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#17` `[P2][Party] Multiple allied actors, shared state, formation, split parties, and coordination`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern is **structurally single-PC.** Campaign state carries one `character`; every domain path — combat (player + enemies), inventory (single owner), rewards (`character.xp`/`character.currency`), quests (single reward to the PC), social checks (one PC vs one NPC), rest, death saves, spells — assumes exactly one actor. There is **no party, no membership, no viewpoint/active-actor concept, no group checks, no split-party scenes, and no reward-allocation policy.** This issue is the highest-blast-radius one in the plan: removing the one-actor assumption touches every domain path. It must come **after** #16 (which introduces the first non-PC actor) and should be scoped to a small, enumerated path set.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineCharacter` single `:764-788`, `EngineCampaignState.character` singular, `EngineCombat.enemies` + implicit single PC `:919-931`, `EngineQuest.reward` paid to the PC `:942-943`, `EngineInventoryItem` single-owner `:668-677`, `EngineNpc` social target `:591-600`), `src/engine-domain.ts` (reward accrual to `character.xp`/`character.currency` `:741,2791-2793`, `resolveSocialCheck` one PC `:587-623`, `resolveRest` one PC `:2843-2909`, `resolveDeathSave` one PC `:2720-2775`), `src/engine-store.ts` (campaign state is one character blob). Grep for `party|member|viewpoint|active_actor|group_check|split|formation|allocation` across `src` finds **no** party model. Tests: none. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Party membership and leadership | `ABSENT` | No party entity; campaign state is one `character`. |
| One-PC assumptions in campaign state, routes, prompts, combat, inventory, quests, rewards | **Pervasive** | Rewards → `character.xp`/`character.currency` (`engine-domain.ts:741,2791-2793`); inventory single-owner (`engine-contracts.ts:780`); combat = single PC + `enemies` (`:928`); quests reward the PC (`:942-943`); rest/death/spells operate on `state.character`. The DM prompt is built around one protagonist. |
| Allied turns and initiative | `ABSENT` | Implicit player→enemies order (`:1777,1797`); no multi-actor turns (couples to #11/#16). |
| Individual vs. shared inventory/currency | `ABSENT`(shared) / `IMPLEMENTED`(personal) | Only personal inventory exists; no shared container/currency pool. |
| Individual vs. shared knowledge | `ABSENT` | No actor-knowledge model at all (see #7); nothing is actor-scoped yet. |
| Group checks and assistance | `ABSENT` | No group-check rule; Help is narration-only (see #6). |
| Formation and travel roles | `ABSENT` | No formation; no travel (see #12). |
| Split-party locations / scenes | `ABSENT` | One `worldContext` per campaign (`engine-contracts.ts:581-589`); no per-actor scene context. |
| Character switching | `ABSENT` | One character; no viewpoint/active-actor selection. |
| Permanent-choice consent and authorization | `ABSENT` | No consent/authorization seam (the issue's future-multiplayer boundary). |
| Reward / XP division | `ABSENT` | Rewards go entirely to the single PC. |
| Campaign membership seams for future multiplayer | `ABSENT` | Account/actor scoping exists at the *campaign* level (`RequestContext.accountId/campaignId/actorId` `engine-contracts.ts:566-572`) but not at a *party member* level. |

## 3. The blast-radius problem

Unlike the other P2 issues (which add a *new* subsystem), #17 **modifies existing ones**: combat must hold multiple allied turns; inventory must distinguish personal vs. shared ownership; rewards must allocate across actors; knowledge must be per-actor; the DM prompt must follow the active viewpoint. The issue's own AC — *"campaign state no longer assumes exactly one actor in every domain path touched by the first slice"* — is an invasive refactor. The mitigations are (a) sequence it strictly after #16 (which establishes the first non-PC actor and the actor-ownership contract), and (b) scope the first slice to an **enumerated** set of paths (sheets/budgets, one shared container, one group check, one split/rejoin, viewpoint switch) rather than "all paths."

## 4. First-slice feasibility (issue's KISS slice)

Issue slice (after #16 provides one controlled companion): *one human controls PC + companion → each has independent state/knowledge/inventory/position/turn → party has shared quest membership + optional shared currency/container → one group check → one party split into separate scene contexts → switching viewpoint changes DM context without leaking the other actor's hidden knowledge → party reunites, shared state consistent.*

**What exists:** transactional persistence; the account/campaign scoping boundary; (after #16) the first-class controlled-actor + ownership contract.

**What must be built (modifies existing + new):**
- **Party ID + membership records** with actor role/controller/leadership policy.
- **Active viewpoint / controlled actor** selection that changes *presentation/control only*, never ownership or hidden knowledge.
- **Shared vs. personal ownership scopes** (shared quest membership; one shared container/currency pool) — cannot be read/mutated as personal state accidentally.
- **Group-check + assistance policy** (server-owned rule; not model-decided).
- **Per-actor location/scene and knowledge** (split parties maintain separate contexts without leakage).
- **Reward/XP allocation policy** (no cross-actor duplication).
- **Typed authorization/consent seam** for permanent choices (the future-multiplayer boundary — must exist even for single-player).

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Campaign state no longer assumes exactly one actor in touched paths | No | pervasive one-PC assumption |
| Party membership/actor control/leadership/viewpoint explicit + authorized | No | absent |
| Each actor independent HP/effects/actions/knowledge/inventory/location | No | only the PC has any of these |
| Shared quest/container/currency explicitly scoped; not read as personal | No | absent |
| Group checks use reviewed server-owned rule; not model-decided | No | absent |
| Assistance consumes/obeys correct action/time rules (#3/#6) | No | Help narration-only |
| Split parties maintain separate scene + knowledge without leakage | No | absent (couples to #7) |
| Switching viewpoint changes only presentation/control, not ownership/hidden knowledge | No | absent |
| Rewards/XP allocated by explicit policy; no cross-actor duplication | No | rewards → single PC |
| Permanent choices have typed authorization/consent seam for future multi-human | No | absent |
| Rejected control/switch/share ops preserve all actor + party state byte-for-byte | Yes (kernel) | inherited, once ops exist |
| Replay does not duplicate membership/shared transfers/rewards/scene transitions | Yes (kernel) | inherited |
| Refresh/restart preserves membership/viewpoint/splits/shared ownership/turn state | No | absent |
| Tests (unauthorized control, group check, shared transfer, split/rejoin, knowledge filtering, viewpoint switch, reward allocation, stale version, idempotency) | No | none exist |

## 6. Dependencies and risks

- **#6** (group checks/assistance), **#7** (actor-specific knowledge — the viewpoint-switch leakage boundary), **#8** (shared/personal ownership), **#10** (actor positions), **#11** (multi-actor initiative/encounter outcomes), **#15** (shared quest state), **#16** (controlled-actor foundation — hard prerequisite).
- **Risk (blast radius):** the highest of any issue. Scope to an **enumerated path set**; do not attempt "all paths" in one slice.
- **Risk (boundary):** viewpoint switching must never leak the *other* actor's hidden knowledge into the DM context — this is the #17 analogue of #7's prompt-filter boundary; co-design it.
- **Risk (future):** the **typed consent/authorization seam** is required now even for single-player, because retrofitting it later (when a second human joins) means re-touching every permanent-choice path. Build the seam, not the networking.
- **Risk (rewards):** allocation policy must prevent an encounter from paying every actor full XP (duplication) or zeroing companions.

## 7. Recommendation

Sequence: **last** in the plan — `#6/#7/#8/#10/#11/#15/#16 → #17` (EPIC guide). Do **not** start #17 until #16 has established the first-class-actor + ownership contract. Scope the first slice tightly: party membership + viewpoint switch + one shared container + one group check + one split/rejoin, on an enumerated set of paths. Build the **typed consent/authorization seam** in this slice (it is the multiplayer boundary), but implement **no realtime networking** (EPIC non-goal). Any later multiplayer must layer per-human authorization over this model, never replace the engine's actor/party ownership contracts with client trust.
