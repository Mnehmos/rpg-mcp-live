# CI/CD

## Required CI

`.github/workflows/ci.yml` runs one required job — `CI / required` — on every PR and push to `main`.

Steps:

```
checkout (SHA-pinned)
set up Node 20.18.x
npm ci
reject forbidden tracked files        (tools/ci/check-forbidden-files.mjs)
verify PR metadata                    (tools/ci/verify-pr-metadata.mjs, PR only)
typecheck + content pack              (npm run check)
test                                  (npm test)
build                                 (npm run build)
two-service HTTP smoke               (npm run smoke:http)
```

- Third-party actions pinned to full commit SHAs.
- `GITHUB_TOKEN` has least-privilege permissions (`contents: read`).
- Concurrency cancels obsolete runs on old commits.
- CI never makes live OpenRouter calls.

### Forbidden-file gate

Rejects tracked files matching: `.env`, `*.db`, `*.sqlite`, `*.pem`, `*.key`, `id_rsa*`, `coverage/`, `dist/`, `*.log`.

Scans browser assets for secret-variable names: `OPENROUTER_API_KEY`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ENGINE_INTERNAL_TOKEN`. Reports filenames only — never values.

### Deterministic evaluation harness

Issue #22 adds two deterministic, stubbed evaluation commands. They use the
authoritative engine resolver and store; they never contact OpenRouter:

```
npm run test:invariants
npm run test:gauntlet:ci
```

The gauntlet emits ten versioned traces, hard privacy/atomicity/idempotency
assertions, a stable baseline digest, and separate pending human scorecards.
The same command also runs the random-event regression fixtures: stable table
and context provenance, actor/object reuse and instantiation, retry/restart
idempotency, noncombat continuation, and rejection of narrator substitution.
Live-provider evaluation remains opt-in and budget-capped through
`live-eval.yml`; it is never a required CI or deployment step.

## Automated changelog

Every production release generates a changelog entry from conventional-commit squash-merge messages (see `docs/RELEASE.md`). The changelog is a **hard release gate** — production deployment aborts if `generate-changelog.mjs --fail-empty` finds no changelog-worthy commits.

Because the repo uses squash merge and `verify-pr-metadata.mjs` enforces conventional-commit PR titles, the changelog always has parseable input. No PR can reach `main` without contributing a changelog entry.

## Nightly verification

`.github/workflows/nightly.yml` runs the full suite plus `npm audit --audit-level=high`. Initially `npm audit` is informational; once the dependency baseline is triaged, high/critical findings become a gate.

No live provider calls happen nightly.

## Live model evaluation

`.github/workflows/live-eval.yml` is manually dispatched:

- Staging only
- Separate low-budget OpenRouter key
- Hard max model calls + cost
- No production database
- Results uploaded as artifact
- Never a required CI job

## Staging deployment

GitHub Actions owns CI. Railway owns staging deployment through the connected
`Mnehmos/rpg-mcp-live` GitHub source on `main`, with native autodeploy and
Railway **Wait for CI** enabled on both service instances. Railway waits while
the push's GitHub check suites run; a failed suite skips the deployment, and a
successful suite lets Railway build the repository using the service-specific
`/railway/engine.json` or `/railway/web.json` config.

`.github/workflows/verify-staging.yml` listens only for Railway's successful
`deployment_status` event. It checks the event's repository, `main` ref,
Railway deployment ID, and exact 40-character commit SHA, then reads the
engine and web health endpoints and uploads the evidence. It has no Railway
token, does not call GraphQL, does not upload source, and never calls
`railway up`.

## Production deployment

Production is disabled for this correction. The only production workflow is a
disabled placeholder; no production Railway source, autodeploy, or deployment
mutation is changed. A future policy may use a protected `production` branch
with the same native GitHub source plus Wait for CI, promoted from a proven
staging SHA.

## Production migration

`.github/workflows/production-migration.yml` is the only manual workflow (`workflow_dispatch`). Database migrations require explicit backup confirmation and plan hash. Never combined with code deployment.

## Dependabot

`.github/dependabot.yml` tracks weekly updates for `npm` and `github-actions`.

## Concurrency

CI concurrency cancels obsolete runs on old branch commits. Deployment workflows use separate concurrency groups (staging cancels old; production does not cancel).

## Security rules

1. No direct push to `main`.
2. No agent-created production tags.
3. No production Railway token in implementation jobs.
4. No live OpenRouter calls in normal CI.
5. No `pull_request_target` execution of branch code.
6. No plaintext secrets in issue comments, logs, artifacts, or prompts.
7. GitHub Actions use least-privilege permissions.
8. Third-party actions pinned to full SHAs.
9. Deployment jobs do not execute artifacts produced by an untrusted PR.
10. Agents cannot edit branch rulesets or workflow secrets.
