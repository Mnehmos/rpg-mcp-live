# Railway deployment ownership

This runbook records the cutover for issue #67. Railway's native GitHub
integration is the deployment controller for the existing services. GitHub
Actions owns CI and post-deploy health/readback evidence only. The repository,
services, data, domains, private networking, and variables are not recreated
by this change.

## Existing topology (sanitized baseline)

| Resource | ID / value |
| --- | --- |
| Project | `e399aea4-85c5-4532-a24a-9504363441bb` (`RPG MCP Live`) |
| Staging environment | `102bec2f-e96b-429e-b5cc-290ed99d0592` |
| Production environment | `d80d069c-2ffb-482e-bcc9-2bc8682b68ec` |
| Web service | `8dd2fefa-966f-4709-8476-2896876a28f7` (`rpg-mcp-live`) |
| Engine service | `2536aaf9-66c7-42ec-ada5-4966579ac31f` (`lantern-engine`) |

Before the cutover, all four service/environment instances reported no source
repository (`NO_REPO`) and native autodeploy disabled. The healthy deployment
IDs observed at the baseline were staging engine
`8bbed6c7-2f22-40e6-9c5d-c100c1277f23`, staging web
`2eb46c2c-b4be-4f41-bb26-a9aee83d41cc`, production engine
`6c76e1ae-421a-4f28-bc15-357d44273073`, and production web
`e40401ec-a457-49e2-92ca-23602b13cb76`.

Each environment already has one `/app/data` volume for each service, with
the existing 50 GB allocation and data retained. Existing Railway domains and
the engine's private web-to-engine connection are unchanged. Treat these
values as an inventory, not as permission to replace resources.

### Cutover-side-effect containment

Connecting the existing services through Railway's source-connect operation
started builds for the current `main` SHA in both environments before native
autodeploy could be disabled. Those builds completed successfully as staging
engine `35d0582c-c7eb-4525-b4e1-0f557539c122`, staging web
`34b45dec-dd20-4206-8e1b-de141f3a93e3`, production engine
`da09fa85-419a-446a-92d6-684f211489ad`, and production web
`369ab485-0ef8-4192-a78c-051170ec1af9`, all from `57e81603ca7b17ce0dc2efb595d5094082dc1ecb`.
Native autodeploy was then read back as disabled for all four instances.
No volume, database, domain, private-network, or variable mutation was made.
This is recorded as an observed cutover side effect; it is not the required
GitHub Actions staging proof.

## Normal deployment path

1. A squash merge to `main` starts GitHub CI.
2. Railway's connected GitHub trigger creates a native staging deployment in
   `WAITING` while CI check suites run (`checkSuites: true`).
3. After CI succeeds, Railway builds and deploys the repository natively for
   the engine and web services using `/railway/engine.json` and
   `/railway/web.json`.
4. `verify-staging.yml` receives the successful `deployment_status`, verifies
   the Railway bot, staging environment, `main` ref, exact deployment SHA, and
   both health endpoints, then uploads readback evidence.

GitHub Actions never calls `serviceInstanceDeployV2`, uploads a local archive,
or uses `railway up`. Project-token secrets are retained until this corrected
path has been proven; they are not used by the ordinary path.

## GitHub scope

The `staging` GitHub environment holds only the existing public health URL
variables used by the post-deploy evidence workflow. Railway project-token
secrets are retained during this cutover so they can be removed only after the
native path is proven; the ordinary CI or verification path does not read them.
The `production` environment remains disabled and its promotion policy is
unset.

## Cutover and rollback

Connect both existing Railway services to `Mnehmos/rpg-mcp-live` on `main`,
set the service config paths to `/railway/engine.json` and
`/railway/web.json`, and verify the read-back source/config/autodeploy state in
both environments. Connecting a source is not permission to recreate a
service or alter a volume.

If a staging deployment fails, leave production untouched and inspect the
Railway deployment status and evidence artifact. Correct the repository through
the normal protected GitHub flow. The Railway CLI is a break-glass diagnostic
path only; do not use it for normal deployment.

Never reset, copy, migrate, or delete the existing databases or volumes as
part of this cutover.
