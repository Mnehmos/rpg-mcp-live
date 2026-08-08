# Release Process

## Overview

Production releases are **automatic** — promoted when staging smoke and gauntlet pass. The human is the playtester and vision-holder, not a deployment approver.

```
PR merges to main
     → staging deploys (engine first, then web)
     → staging smoke + gauntlet pass
     → production deploys (engine first, then web)
     → changelog generated (fails if empty)
     → CHANGELOG.md committed to main
     → annotated tag created
     → GitHub release published with changelog body
```

## Automated changelog (release gate)

Every production release generates a changelog from the conventional-commit squash-merge messages between the last `v*` tag and the current SHA. This is a **hard release gate**:

- `tools/ci/generate-changelog.mjs --version <tag> --fail-empty` runs before the tag is created.
- If no changelog-worthy commits exist (`feat`, `fix`, `perf`, `refactor`, `audit`, `docs`, `test`, `ci`, `ops`, `build`), the release **aborts**.
- The generated changelog entry is prepended to `CHANGELOG.md`, committed to `main`, used as the GitHub release body, and attached as a release asset.

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

## Staging deployment

1. Checkout exact merged SHA.
2. `npm ci` → `npm run check` → `npm run build`.
3. Deploy engine to Railway staging. Wait for `/health`.
4. Verify: SHA, pack hash, pack version, tool count, historical packs.
5. Deploy web to Railway staging. Wait for `/api/health` (web must reach engine).
6. Run two-service HTTP smoke (`npm run smoke:http`).
7. Run deterministic gauntlet (after #22).
8. Write deployment manifest.

Deploy engine and web from the **same Git SHA**.

## Production deployment (automatic)

Triggered when staging completes successfully.

1. Verify SHA is reachable from `main`.
2. Verify SHA was deployed to staging.
3. Deploy engine to Railway production. Verify health + backward compatibility.
4. Run safe read + synthetic safe mutation against a dedicated acceptance campaign.
5. Deploy web to Railway production. Verify health + engine reachability.
6. Create annotated release tag (`vMAJOR.MINOR.PATCH`).
7. Publish deployment manifest.

## Health endpoints expose deployed SHA

Both services must expose the deployed Git SHA in their health response.

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
  "engineHealth": "pass",
  "webHealth": "pass",
  "smoke": "pass",
  "gauntletVersion": "...",
  "deployedAt": "..."
}
```
