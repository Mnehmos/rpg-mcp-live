<!--
  Lantern PR template — required sections are validated by
  tools/ci/verify-pr-metadata.mjs. Auto-merge fires when CI is green.

  Your PR title MUST follow Conventional Commits — it becomes the squash
  commit message AND the automated changelog entry:
    feat(effects): add canonical effect lifecycle (#2)
    fix(engine): convert world_context to patch semantics (#25)
    docs(audit): audit DM production-room boundary (#24)
-->

Closes #<issue>

## Risk
<!-- R0 (docs) | R1 (pure logic) | R2 (state/contracts/rules) | R3 (auth/billing/secrets/migration) -->

## Base
<!-- <main SHA at branch creation> -->

## Scope
<!-- What this PR changes and why -->

## Acceptance criteria
- [ ] <!-- criterion from the issue -->

## Contracts
Added:
Consumed:

## Verification
- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run smoke:http`

## Authority evidence
<!-- For R2+: schema-valid/domain-invalid case, state/version immutability, idempotent replay -->
Schema-valid/domain-invalid case:
State/version immutability:
Idempotent replay:

## Persistence or migration
<!-- None, or describe the data change -->

## #22 fixture
<!-- Contribution to the invariant census / gauntlet, or "n/a" -->

## Rollback
<!-- How to undo this if it breaks -->

## Explicit deferrals
<!-- What is intentionally NOT in this PR -->

## Agent evidence
<!-- Planner run / critic run / implementer run -->
