# PGPZ sites

This repository contains the independently deployed PGPZ Community and PGPZ
Coalition applications, the private PGPZ Board of Directors portal, and
narrowly scoped packages that keep shared behavior consistent. A shared
repository does not merge the applications' membership workflows, data,
sessions, environment variables, domains, or release controls.

## Repository layout

```text
apps/community/         PGPZ Community Next.js application
apps/coalition/         PGPZ Coalition Next.js application
apps/reference/         Neutral executable example and CI proving ground
apps/board/             Private PGPZ Board of Directors portal
packages/core/          Public and server-only configuration contracts
packages/auth-dynamodb/ Injected Better Auth persistence and rate limits
packages/ui/            Brand-neutral interface primitives
packages/zec-shelf/     Reusable ZEC Shelf feature
templates/              Starter configuration examples
tooling/                Repository and deployment helpers
docs/                   Migration records and operating runbooks
```

The two source histories were imported without squashing. See
[`docs/history-import.md`](docs/history-import.md) for the immutable source-tip
baseline and its verification command.

## Requirements

- Node.js 22, as recorded in `.nvmrc` and the workspace engine constraint.
- npm with the checked-in root `package-lock.json`. The root lockfile becomes
  authoritative once generated; application-local lockfiles are migration
  inputs only and should not remain active afterward.

Install dependencies once at the repository root:

```bash
nvm use
npm ci
```

Common commands:

```bash
npm run dev:community
npm run dev:coalition
npm run dev:reference
npm run dev:board
npm run check
npm run build:community
npm run build:coalition
npm run build:reference
npm run build:board
npm run history:verify
npm run parity:check
npm run boundaries:check
npx playwright install chromium
npm run test:e2e
```

`npm run check` verifies the imported-history baseline, enforces the parity
manifest and extracted-feature placement, checks workspace import and direct
dependency boundaries, typechecks both apps and package workspaces, runs all
tests, and runs each available workspace linter.

`npm run test:e2e` starts the two branded applications and the private Board
portal on isolated local ports and runs the same anonymous critical journeys
against Community and Coalition (server-rendered public content,
protected-admin redirects, mobile navigation, and serious/critical axe
accessibility findings), plus the Board portal's privacy-boundary journeys
(anonymous document/RSC payload checks, malicious post-sign-in callback
validation, robots and hardening headers). It uses only local test
configuration and does not send email or require a production login.

## Dependency boundaries

- Applications may depend on declared packages but may not import another
  application workspace.
- Packages must not import from either application or use an application's `@/`
  alias.
- Application-specific membership state machines, access policy, routes,
  branding, seed content, and infrastructure remain inside their application.
- Each workspace must declare the packages and command-line tools it consumes;
  root hoisting is not a substitute for a direct declaration.

`npm run boundaries:check` rejects package-to-application and
application-to-application imports, and verifies that every statically or
dynamically imported third-party or workspace package is declared directly by
its consumer. `npm run parity:check` separately enforces the sibling-file
manifest and ZEC Shelf extraction placement.

## Deployment

The root `amplify.yml` describes four independently deployed Amplify
applications. Community, Coalition, and Board retain their own domains,
environment variables, IAM roles, and DynamoDB tables. Reference is an
isolated, seed-backed, read-only demonstration with no application data
plane. Configure the matching monorepo root on each Amplify project:

- Community: `AMPLIFY_MONOREPO_APP_ROOT=apps/community`
- Coalition: `AMPLIFY_MONOREPO_APP_ROOT=apps/coalition`
- Reference: `AMPLIFY_MONOREPO_APP_ROOT=apps/reference`
- Board: `AMPLIFY_MONOREPO_APP_ROOT=apps/board`

The build helper writes only the selected application's allowlisted variables
to its own `.env.production`; it overwrites atomically and never prints values.
Application-local `amplify.yml` files are retained during the observation
period as rollback references, but the root specification is authoritative for
monorepo builds.

See [`docs/monorepo-migration-runbook.md`](docs/monorepo-migration-runbook.md)
for cutover gates, live checks, and rollback instructions.

Schema-sensitive production releases must also follow the guarded
[`Better Auth user-index runbook`](docs/better-auth-user-index-runbook.md) and
[`durable background-jobs runbook`](docs/durable-jobs-runbook.md) before the
matching application code is deployed.

## Reference application

`apps/reference` is the executable proof that shared packages can be configured
without importing Community or Coalition branding, aliases, membership state
machines, seed content, or infrastructure wiring. It is not a third production
membership service. Its optional public deployment at `reference.pgpz.org` is
non-production, read-only, non-indexed, and isolated from both branded apps.

See [`docs/reference-application-plan.md`](docs/reference-application-plan.md)
for its configuration contract, dependency rules, acceptance gates, and the
later `create-pgpz-site` generator decision.

## Board portal

`apps/board` is the private portal for the PGPZ Board of Directors at
`board.pgpz.org`. Every route except the sign-in page and the Better Auth API
is gated by an authenticated layout, and access further requires the email to
be on the `BOARD_MEMBER_EMAILS` allowlist. Self-registration is disabled;
accounts are provisioned with
`apps/board/scripts/provision-board-member.ts`. The site refuses search
indexing at every layer and ships without outbound email.

See [`docs/board-deployment.md`](docs/board-deployment.md) for the Amplify
app, DynamoDB table, IAM role, environment variables, and director
provisioning runbook.

## License

PGPZ Sites and its shared packages are available under either the MIT License
or the Apache License 2.0 (`MIT OR Apache-2.0`). See `LICENSE-MIT` and
`LICENSE-APACHE`. Copyright is held by PGPZ contributors.
