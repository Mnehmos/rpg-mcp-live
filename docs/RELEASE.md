# Release Process

## Overview

Production release material is published automatically after the verified
staging SHA is promoted to the `production` branch.

```
PR merges to main
     → GitHub CI passes
     → Railway waits for CI, then natively deploys staging
     → staging health/evaluation passes
     → production ref advances directly to the same SHA
     → production CI passes and Railway natively deploys
     → production health/readback and release evidence
```

## Automated changelog (release gate)

Every production release generates a changelog from the conventional-commit squash-merge messages between the last `v*` tag and the current SHA. This is a **hard release gate**:

- `tools/ci/generate-changelog.mjs --version <tag> --fail-empty` runs before the tag is created.
- If no changelog-worthy commits exist (`feat`, `fix`, `perf`, `refactor`, `audit`, `docs`, `test`, `ci`, `ops`, `build`), the release **aborts**.
- The generated changelog is used as the GitHub release body and attached as a
  release asset. It is not committed back to `main` by a deployment workflow.

Because the repo uses **squash merge** and the PR title **is** the commit message, every merged PR must follow `type(scope): description (#NN)`. The CI metadata gate (`verify-pr-metadata.mjs`) enforces this on every PR — there is no way for a commit to reach `main` without a conventional-commit title that the changelog generator can parse.

### Changelog sections

| Commit type             | Changelog section   |
| ----------------------- | ------------------- |
| `feat`                  | Added               |
| `fix`                   | Fixed               |
| `perf`                  | Performance         |
| `refactor`              | Changed             |
| `audit`                 | Audits              |
| `docs`                  | Documentation       |
| `test`                  | Tests               |
| `ci`, `ops`             | Infrastructure      |
| `build`                 | Build               |
| `chore`, `style`        | *(skipped)*         |
| any type with `!` suffix | Breaking changes   |

## Staging-to-production deployment

1. Merge a harmless change to `main` through the normal protected flow.
2. GitHub CI runs on the push.
3. Railway creates a native GitHub deployment in `WAITING` while CI runs.
4. After CI succeeds, Railway builds/deploys the connected repository for both
   staging services and records the exact merge SHA.
5. `verify-staging.yml` verifies the successful staging environment deployment,
   runs invariant and deterministic evaluation, checks both health endpoints, and updates the
   `production` ref directly to that SHA without creating a commit.
6. The production push runs CI; Railway waits for it, then deploys both
   production services natively from the `production` branch.
7. `verify-production.yml` checks both production health endpoints and publishes
   the manifest, annotated tag, and GitHub release.

GitHub Actions never uploads source or calls a Railway deployment mutation.

## Health evidence

Both services expose their service and environment in health responses. The
exact deployed Git SHA is asserted from Railway's deployment response and is
recorded alongside the bound health evidence in the deployment manifest.

## Database and content migrations

Migrations are a **separate manual workflow** (`production-migration.yml`). They never run automatically with code deployment.

Required sequence:

```
verify requested code SHA is already deployed
→ create consistent SQLite online backup
→ calculate backup SHA-256
→ run SQLite quick_check
→ dry-run migration on backup copy
→ compare campaign/event counts and event digests
→ apply reviewed plan to production
→ post-migration audit
```

## Rollback

### Code-only release

Redeploy the previous verified release SHA/tag.

### Schema or content migration

Fix forward, or restore the verified pre-migration database backup. Never delete or rewrite migration events.

## Staging deployment manifest

Every deployment saves:

```json
{
  "gitSha": "...",
  "gitRef": "main",
  "nodeVersion": "20.18.x",
  "packId": "open5e-v2-full-corpus-s8",
  "packHash": "...",
  "schemaVersion": "...",
  "toolCount": 42,
  "engineDeploymentId": "...",
  "webDeploymentId": "...",
  "engineRailwayCommitSha": "...",
  "webRailwayCommitSha": "...",
  "engineHealth": "pass",
  "webHealth": "pass",
  "smoke": "pass",
  "gauntletVersion": "...",
  "deployedAt": "..."
}
```
