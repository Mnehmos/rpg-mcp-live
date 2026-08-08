# Audit: Quests — Branching Objectives, Deadlines, Consequences, Predicates, and Progress Clocks

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#15` `[P2][Quests] Branching objectives, deadlines, consequences, predicates, and progress clocks`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** A quest is a **flat record**: title, free-text objective, a single `status` (`active/completed/failed/abandoned`), a scalar `progress` (0–100), one `reward{xp,copper}`, and a `rewardClaimed` flag. There is **no quest graph, no stages, no ordered/optional/hidden objectives, no transition predicates, no branching, no irreversible consequences, no follow-up eligibility, and no progress clocks.** `quest_update` flips status and pays the reward exactly-once — that is the entire mechanic. The exactly-once reward machinery is the only inherited asset; the graph/predicate/clock model is entirely new and depends on #5/#7/#11/#12/#13/#14.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineQuest` `:937-947`, `quest_create`/`quest_update`/`quest_progress` commands `:139-140,152`), `src/engine-domain.ts` (`resolveQuestCreate` `:697-718`, `resolveQuestUpdate` `:720-754`, reward claim at completion `:736-742`, `resolveLoot` quest-link `:2783-2803`), `src/engine-tools.ts` (quest tool defs `:510-511,720-721`). Grep for `predicate|branch|stage|objective|followup|follow_up|clock|prerequisite` across `src` finds **no** quest-graph model. Tests: `engine.test.ts:1518` (quest primitives), `engine-dm.test.ts:256-314` (quest reward end-to-end). Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Quest identity / status / progress / objectives | `LANTERN_PARTIAL` | `EngineQuest` `engine-contracts.ts:937-947`: `id, title, objective:string, status, progress:number, reward{xp,copper}, rewardClaimed, giverNpcId?, deadline?:string`. **One objective per quest (free text); no list of objectives.** |
| Ordered vs. unordered steps | `ABSENT` | No steps/stages; `progress` is a single scalar advanced by the DM (`quest_update.progress`). |
| Hidden / optional objectives | `ABSENT` | No objective-typing; nothing hidden (couples to #7). |
| Failure and abandonment | `LANTERN_PARTIAL` | `status` includes `failed`/`abandoned` (`:941`) — settable by the DM, but with **no automatic failure trigger or consequence**. |
| Deadlines and time integration | `ABSENT`(active) | `deadline?: string` exists (`:946`) but is inert free text — no game clock (#12) evaluates or expires it. |
| World-state predicates | `ABSENT` | No predicate/condition model; transitions are DM-authored `quest_update` calls. |
| Encounter / social / inventory triggers | `ABSENT` | No trigger wiring (encounter outcome via `resolveLoot` quest-link `:2783-2803` only *pays* a reward; it does not advance graph state). |
| Exactly-once rewards | `LANTERN_IMPLEMENTED` | `rewardClaimed` gate (`:943`); paid once on completion (`:736-742`); loot-link also gated (`:2800`). |
| Reputation / faction consequences | `ABSENT` | No faction/reputation (see #13). |
| Follow-up quest creation | `ABSENT` | No follow-up/eligibility model. |
| Progress / faction clocks | `ABSENT` | No clock concept (couples to #12). |
| What the DM can author and mutate directly | `LANTERN_PARTIAL` | The DM authors quests and their rewards, and can set `status`/`progress` directly via `quest_update` — i.e., **quest state is fully DM-authorable**; the engine only enforces reward once-ness. |

## 3. The DM-authorable transition problem

Today, quest advancement is whatever the DM says it is: `quest_update` accepts `status`/`progress`/`objective` directly (`engine-domain.ts:732-734`) and the engine applies it. The issue's core requirement — *"transitions are driven by typed predicates over authoritative state, not narration text"* — inverts this: the engine should *derive* that an objective is complete from world/inventory/encounter/social/time predicates, and the DM/LLM should not be able to flip predicates true directly. This is a fundamental change to how quests advance, not an extension.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *branching rescue quest: visible objective (reach ruin) + hidden optional (recover evidence) + deadline (next evening) → branch A (rescue succeeds) / B (fails, evidence recovered) / C (deadline passes) → each applies different exactly-once reward/reputation/world consequences → one follow-up becomes eligible.*

**What exists:** exactly-once reward payment; quest create/update; the `loot` quest-link; transactional persistence.

**What must be built (all new):**
- **Stable quest + objective IDs** (no collision, no double-completion).
- A **quest graph/stages** with **typed transition predicates** over authoritative state (world/inventory/encounter/social/time) — the central new contract; define the predicate vocabulary with the first fixture.
- **Ordered/unordered/optional/hidden** objective typing; hidden objectives filtered by #7.
- **Deadline processing** via #12 (expire exactly once).
- **Distinct terminal states** (success/failure/abandonment/expiration).
- **Irreversible consequence records** + reward/consequence bundles (exactly-once).
- **Follow-up eligibility** derived from committed outcomes.
- **One progress clock** (source + maximum; cannot exceed bounds or resolve twice).

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Stable quest/objective IDs; no collision/double-completion | Partial | quest `id` stable (UUID); objectives absent |
| Transitions driven by typed predicates over authoritative state, not narration | No | DM sets status/progress directly |
| Ordered/unordered/optional/hidden objectives distinct | No | single free-text objective |
| Hidden objectives filtered by #7; no leak via DM context/errors | No | absent |
| Deadlines advance from #12 game time, expire exactly once | No | `deadline` inert |
| Success/failure/abandonment/expiration distinct terminal states | Partial | status enum has them, but no automatic triggers |
| Branch consequences commit atomically with transition | Partial | reward commits atomically; branch model absent |
| Rewards/XP/items/currency/reputation/world changes exactly once | Partial | reward once; reputation/world-change absent |
| Follow-up eligibility derived from committed outcomes | No | absent |
| Progress clocks bounded; no advance without source; no double-resolve | No | absent |
| LLM may select authored choices/propose bounded content, cannot mark predicates true or mint rewards | Partial | today the DM *can* set status/progress directly — boundary must tighten |
| Rejected transitions preserve quest + world state byte-for-byte | Yes (kernel) | inherited |
| Replay does not duplicate objectives/consequences/clocks/rewards/follow-ups | Yes (kernel) | inherited, once they exist |
| Refresh/restart preserves hidden state/deadlines/branches/clocks | Partial | quest list persists; graph/clock new |
| Tests (each branch, optional, hidden reveal, deadline, duplicate completion, stale version, reward atomicity, follow-up eligibility) | No | only flat reward tested |

## 6. Dependencies and risks

- **#5** (advancement/reward integration), **#7** (hidden knowledge), **#8** (item/ownership predicates + rewards), **#11** (encounter outcomes), **#12** (time/deadlines), **#13** (faction/reputation consequences), **#14** (NPC/world-clock triggers).
- **Risk (design):** the **predicate vocabulary** is the load-bearing decision — it must be typed and closed (world-state/inventory/encounter/social/time), not a scripting language (EPIC forbids generic scripting). Scope it to the first fixture and extend only on concrete need.
- **Risk (boundary):** tightening quest advancement away from DM-authorable status flips toward engine-derived predicates changes the DM's authoring surface; coordinate with #11 (encounter outcomes must emit the predicates quests read).
- **Risk (hidden):** hidden objectives must not leak through DM context or error messages before discovery — couple to #7.

## 7. Recommendation

Sequence: **#5/#7/#8/#11/#12/#13/#14 → #15** (EPIC guide — the most-depended-upon P2 issue, sequenced last among Phase-2 reads). Build the **typed-predicate transition engine first** (with one concrete fixture), reusing the proven exactly-once reward path. Defer progress clocks until branch state is stable. Ensure encounter (#11), inventory (#8), and social (#13) outcomes **emit the predicates** quests consume — that contract should be agreed before #15 implementation begins.
