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

`.github/workflows/deploy-staging.yml` triggers when the required CI workflow
passes on `main`. It is the normal deployment controller; Railway native
autodeploy is disabled.

```
checkout exact CI-proven SHA
→ npm ci → check → build
→ validate project-token scope, current source/config, and disabled autodeploy
→ deploy exact SHA: engine first, then web
→ wait for health, pack/tool evidence, and web→engine reachability
→ run HTTP smoke, invariants, and deterministic gauntlet
→ write manifest with both Railway deployment IDs and commit metadata
```

The deploy helper uses environment-scoped Railway project tokens and first
queries `projectToken { projectId environmentId }` so a staging token cannot
touch production (or vice versa). It then reads the current service source,
repo trigger, Railway config path, and native autodeploy state before calling
the `serviceInstanceDeployV2` exact-commit mutation. It never logs token values,
uploads a local archive, or calls `railway up`. Concurrency is
`group: railway-staging, cancel-in-progress: true`.

## Production deployment

`.github/workflows/deploy-production.yml` consumes only the successful staging
manifest for the same SHA. The job attaches the `production` environment and
then evaluates `RAILWAY_PRODUCTION_PROMOTION_ENABLED` at runtime. Every
mutation step is gated by that result, so the environment variable is usable
without allowing a disabled run to reach Railway.

When explicitly enabled by the owner, it first checks full tag history, rejects
an existing release tag, verifies GitHub tag-write capability, and generates
the changelog before any production mutation. It then validates the staging
manifest, deploys engine then web through the same exact-SHA helper, binds
health responses to the expected service/environment and returned Railway
commit SHA, runs the production health/smoke/gauntlet checks, writes the
deployment manifest, and finally creates an annotated tag and GitHub release
through the authenticated GitHub API. It does not push to `main` or commit a
generated `CHANGELOG.md` back to the branch.

Concurrency: `group: railway-production, cancel-in-progress: false`.

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
