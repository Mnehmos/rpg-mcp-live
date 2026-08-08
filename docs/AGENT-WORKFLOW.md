# Agent Workflow

## The complete delivery flow

```
Issue becomes READY
        │
        ▼
One agent claims the issue
        │
        ▼
Short-lived branch + isolated worktree
        │
        ▼
Audit, if required
        │
        ▼
Implementation plan
        │
        ▼
Fresh-context critic review
        │
        ▼
Draft pull request
        │
        ▼
Implementation and local verification
        │
        ▼
Required CI
        │
        ▼
Auto-merge (CI green → squash to main)
        │
        ▼
Automatic staging deployment
        │
        ▼
Staging smoke / gauntlet
        │
        ▼
Automatic production promotion
        │
        ▼
Deployment evidence attached to release
```

No human gate sits between "implementation" and "production." CI proves the change, the engine owns truth, staging proves integration, and the gauntlet proves correctness.

## AI-agent roles

| Role                | May read                      | May write                                   | May deploy             |
| ------------------- | ----------------------------- | ------------------------------------------- | ---------------------- |
| Orchestrator        | Issues, roadmap, repo         | Issue status/comments                       | No                     |
| Auditor             | Repo, tests, docs             | Audit branch/docs and issue report          | No                     |
| Planner             | Repo, audit, ADRs             | Implementation-plan comment                 | No                     |
| Fresh critic        | Issue, plan, diff, tests      | Critic comment/review                       | No                     |
| Implementer         | Claimed issue and branch      | One feature branch and PR                   | No                     |
| Staging operator    | Release SHA and staging logs  | Staging deployment records                  | Staging only           |
| Production operator | Approved release manifest     | Production deployment records               | Production (automated) |

One agent should never simultaneously have code-write access + production secrets + production deployment authority.

Agents never receive production Clerk, Stripe, OpenRouter, Railway, or engine-token values.

## Claim and locking protocol

Only issues labeled `status:ready` may be claimed.

The writer agent posts:

```
CLAIMED

Issue: #25
Agent run: <run-id>
Branch: issue/25-world-context-patch
Base SHA: <main-sha>
Risk: R2
Expected files:
  - src/engine-domain.ts
  - src/engine.test.ts
Claim expires: <timestamp>
```

Then apply: `status:ready → status:claimed → status:in-progress`

Rules:

- One active writer per issue.
- One active writer per branch.
- A stale claim expires after 12 hours without a heartbeat.
- A new agent must explicitly take over the existing branch or have the claim released.
- An agent seeing an unexpected dirty worktree must stop.
- No agent may silently overwrite another agent's uncommitted work.

Use one local worktree per implementation:

```bash
git fetch origin
git worktree add ../worktrees/issue-25 -b issue/25-world-context-patch origin/main
```

## Planning and critic cycle

The issue body is the specification. The latest implementation-handoff comment is the work order.

The agent loads:

```
issue body
latest implementation-handoff comment
linked audit
accepted ADRs
cross-cutting EPIC decisions
current main source and tests
```

The planner writes a concise plan: current behavior, exact scope, expected files, contracts added/consumed, state migration, tests, negative tests, rollback, explicit deferrals.

A fresh-context critic receives only those artifacts — not the planner's private reasoning. The critic must answer:

```
Which invariant does this plan risk violating?
Which accepted cross-cutting decision does it contradict?
Which acceptance criterion cannot currently be satisfied?
Which rejected path could still mutate state?
Which dependency is assumed but not actually implemented?
What is the smallest missing test?
```

Raw agent reasoning and hidden scratchpads are never committed. Persist: decision, evidence, plan, diff, test results, critic findings, resolution.

## Persistence rules

Nested-agent findings must be written to a durable issue comment or file. Prior research sweeps demonstrated that nested delegation can route findings to the wrong parent agent, requiring manual forwarding.
