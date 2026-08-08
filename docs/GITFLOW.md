# Git Flow — Protected Trunk GitHub Flow with Staged Promotion

## Architectural decision

Lantern uses a **protected-trunk GitHub Flow**, not classic Git Flow.

There is one permanent code branch:

```
main
```

Everything else is short-lived:

```
issue/25-world-context-patch
audit/23-world-object-affordances
adr/26-effects-kernel
hotfix/123-provider-timeout
```

No `develop` branch exists. A second permanent integration branch would create stale-agent context, merge debt, and ambiguity about which branch contains authoritative truth.

## Governing units

| Unit            | Role                                      |
| --------------- | ----------------------------------------- |
| Issue           | Unit of intent and scope                  |
| Branch/worktree | Isolated agent workspace                  |
| Pull request    | Unit of integration and review            |
| Commit SHA      | Unit of deployment                        |
| Annotated tag   | Unit of production release                |

## `main` rules

`main` must always be:

- Integrated
- Green
- Deployable to staging
- Safe to promote to production
- Free of knowingly incomplete slices

## Branch naming

```
issue/<number>-<slug>
audit/<number>-<slug>
adr/<number>-<slug>
hotfix/<number>-<slug>
ops/<number>-<slug>
```

The agent identity belongs in the issue claim comment, not the branch name. This allows another agent to resume the same branch without renaming it.

## Merge strategy

- **Squash merge only.** Merge commits and rebase-through-UI are disabled.
- Branch auto-deletes after merge.
- Auto-merge is enabled: when `CI / required` passes, the PR squashes and merges automatically. No human clicks merge.

Squash commit message = PR title:

```
fix(engine): convert world_context to patch semantics (#25)
feat(effects): add canonical effect lifecycle (#2)
docs(audit): audit DM production-room boundary (#24)
```

## Release tags

Production releases use protected annotated tags:

```
v0.1.1
v0.2.0
```

The tag points to a commit reachable from `main`. Only the production deployment workflow creates `v*` tags — agents never do.

## Rollback

### Code-only release

Redeploy the previous verified release SHA/tag.

### Schema or content migration

Fix forward, or restore the verified pre-migration database backup. Never delete or rewrite migration events as a rollback shortcut.
