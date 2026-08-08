# ADR-H29: Reviewed Challenge Adjudication Policy

Status: Accepted

## Decision

Issue #21 owns the server decision about whether an open-ended action is
automatic, impossible, or uncertain, and records why that decision was made.
The first bounded contract is `challenge_attempt`. Its decision evidence stores
the actor, challenge, scene, goal, normalized approach and hash, feasibility,
rule family, DC source/provenance, selected difficulty policy, stakes, bounded
outcomes, retry policy, costs, information policy, policy revision, and rules
version. Attempts are retained in a bounded campaign history and are included in
the authoritative event evidence.

The reviewed first-slice definitions are:

- `ordinary-unlocked-door-v1`: automatic success, no roll, no cost;
- `multi-ton-stone-gate-v1`: impossible by hand, with a causal reason and
  alternative approach categories, without mutation;
- `barred-door-v1`: uncertain Athletics check with reviewed DC bands of 10, 14,
  and 18, bounded success or failure-with-complication, and inert time/noise/
  exposure costs.

The active player experience profile selects the final difficulty band and
policy key. A model-proposed band or stakes list is retained as a request only;
the model cannot supply the final DC, outcome, or consequence. Uncertain checks
reuse the existing `resolveCheck` d20 path, so #6 remains the owner of check
execution and dice semantics.

## Invariants

Unknown definitions, impossible actions, identical retries, invalid requests,
and stale versions reject without state, version, log, event, or RNG mutation.
An identical retry of a challenge is blocked until the approach or scene state
changes. A changed approach may be adjudicated again. Replaying a resolved
command returns the stored result and does not reroll or append a second
attempt. Costs are evidence-only in this slice; #12 owns the future campaign
clock and #2 owns future mechanical effects.

`informationPolicy` is currently `public` as a placeholder. #7 owns the later
player/DM projection boundary for secret or withheld adjudications. Existing
New `world_context` writes reject free `socialDc` authoring, so an NPC cannot
gain a new DM-owned DC through the open-ended patch path. Existing persisted
NPCs retain the legacy field for compatibility until social checks are migrated
to a reviewed challenge definition; opposed actors and that resolver migration
are deferred to the execution/migration work in #6 and #13.

## Consequences and deferrals

- The DM has one bounded tool for requesting adjudication and must not invent a
  DC or consequence in prose.
- Full check execution changes, opposed checks, help/advantage policy, secret
  information projection, clock advancement, and mechanical consequence
  application remain owned by #6, #7, #12, and #2 respectively.
- Broader improvised-action migration, social-check migration, and additional
  reviewed challenge definitions are intentionally deferred rather than added
  to this issue.
