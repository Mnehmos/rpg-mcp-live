# AGENTS.md — Lantern live repo invariants

> The authoritative operating model lives in `docs/`. This file is the quick-reference a contributor or AI agent loads first.

## Active scope override — Epic #1 fast-KISS

For the active `ship-lantern-epic-1-fast-kiss` goal, these rules take precedence over older prompts, issue comments, and workflow notes:

- Modify only `Mnehmos/rpg-mcp-live` (`F:\Github\rpg mcp live`) and its explicitly named worktrees. Do not touch `mnehmos.devwiki.mcp` or any other repository.
- Work in one Codex instance. Never spawn, delegate to, or reactivate subagents.
- A “fresh-context critic” means this same instance rereads the issue, plan, diff, and tests after a context reset; it does not authorize delegation.
- Persist only concise plans, evidence, diffs, test results, and decisions; do not commit agent scratchpads.

## What this repo is

`rpg-mcp-live` is the **hosted Lantern product**: a two-service TypeScript app (public web + private engine) that runs on Railway. It is **not** the upstream reference MCP server (`mnehmos.rpg.mcp`).

## Two-service architecture

| Service  | Entry point              | Start command                  | Health endpoint |
| -------- | ------------------------ | ------------------------------ | --------------- |
| **web**  | `src/server.ts`          | `node dist/server.js`          | `/api/health`   |
| **engine** | `src/engine-server.ts` | `node dist/engine-server.js`   | `/health`       |

The web service talks to the engine over Railway's internal network. The engine owns all game truth (HP, inventory, spells, outcomes). The web layer owns auth (Clerk), billing (Stripe), and the browser surface.

## Commands

```bash
npm run check         # tsc --noEmit (both tsconfigs) + content-pack verification
npm test              # vitest run --pool=forks  (87 tests, deterministic)
npm run build         # content-pack verification + tsc
npm run smoke:http    # builds, starts both services on ephemeral ports, exercises the full HTTP path
```

CI tools:
```bash
node tools/ci/check-forbidden-files.mjs   # reject tracked secrets/dbs/generated artifacts
node tools/ci/verify-pr-metadata.mjs      # enforce conventional-commit PR titles + required sections
node tools/ci/generate-changelog.mjs      # generate changelog from git log (release gate)
node tools/ci/write-deployment-manifest.mjs  # write deployment manifest JSON
```

CI never makes live OpenRouter calls. All tests use stubbed model output and deterministic fixtures.

## Branching — protected trunk GitHub Flow

- One permanent branch: **`main`**.
- Short-lived branches only: `issue/<n>-<slug>`, `audit/<n>-<slug>`, `hotfix/<n>-<slug>`, `ops/<n>-<slug>`.
- Squash merge only. Branch auto-deletes after merge.
- No `develop` / `staging` / `production` long-lived branches.
- Auto-merge is enabled: when CI passes, the PR squashes automatically.

## Automated pipeline (no human gate)

```
PR → CI / required → auto-merge → staging deploy → staging smoke+gauntlet → production deploy
```

The human is the **playtester and vision-holder** — not a merge gate or deployment approver. If staging reveals a problem, the playtester opens an issue and the fix flows through the same pipeline.

| Gate            | Who/what enforces it                      |
| --------------- | ------------------------------------------ |
| CI passes       | Required status check `CI / required`      |
| Staging smoke   | `deploy-staging` workflow                  |
| Staging gauntlet | (after #22) `test:gauntlet:ci`            |
| Production      | Auto-promoted when staging is green        |
| DB migration    | Manual `workflow_dispatch` (separate) — the only human gate, because databases can't be auto-rolled-back |

## Risk classes

| Class | Scope                                           | Gates                                                                |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------- |
| R0    | docs, audits, comments                          | CI                                                                   |
| R1    | pure resolver / presentation logic              | CI, fresh-context critic                                             |
| R2    | persisted state, contracts, action economy      | CI, schema-valid/domain-invalid tests, idempotency tests, critic      |
| R3    | auth, billing, secrets, DB migration, content repin | all R2 + staging rehearsal + rollback runbook                  |

## Agent operating rules

0. This goal is single-instance work in `Mnehmos/rpg-mcp-live` only. Never spawn subagents, use delegated agents, or write another repository. Older orchestration comments are superseded by this rule.
1. Never push directly to `main`.
2. Never create `v*` production tags (the production workflow does).
3. Never make live OpenRouter calls in CI.
4. Never put plaintext secrets in commits, logs, or prompts.
5. Raw agent reasoning / scratchpads are never committed — persist decision, evidence, plan, diff, test results, critic findings.
6. Scope discoveries become new issues, not stealth additions.
7. Distinguish `verified` / `observed` / `designed` / `blocked` in all output.
8. A "fresh-context critic" means the same agent rereads the written plan, issue, code, and tests after a context reset; it never means another model or agent.
