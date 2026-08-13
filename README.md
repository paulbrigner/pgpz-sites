# PGPZ Sites

PGPZ Sites is an npm-workspace monorepo containing four independently deployed
Next.js applications and neutral packages shared where their behavior is truly
the same. Sharing source does **not** merge application data, membership,
sessions, authorization, infrastructure, configuration, or release controls.

## Start here

- [Agent guide](AGENTS.md): compact rules and task-specific context routing.
- [Documentation index](docs/README.md): current runbooks versus historical records.
- [Architecture](docs/architecture.md): app boundaries, package layers, and feature ownership.
- [Local development](docs/local-dev.md): offline DynamoDB/MailHog setup.
- [Testing](docs/testing.md): focused checks and release gates.

## Applications

| Workspace | Purpose | Primary boundary |
| --- | --- | --- |
| [`apps/community`](apps/community/README.md) | Public/member Community site | X and canary-gated ZcashMe social-proof membership, X Monitor, ZEC Shelf |
| [`apps/coalition`](apps/coalition/README.md) | Selective policy partner workspace | Manual approval, invitations, groups, letter sign-ons |
| [`apps/board`](apps/board/README.md) | Private Board governance portal | Passkeys/magic links, scoped roles, document vault, audit ledger |
| [`apps/reference`](apps/reference/README.md) | Neutral executable example | Read-only demo with no branded data plane |

Each app has its own domain, environment, auth policy, runtime resources, and
Amplify release. Community and Coalition deliberately retain some parallel
adapters where site policy differs.

## Shared packages

| Package | Responsibility |
| --- | --- |
| [`@pgpz/core`](packages/core/README.md) | Site configuration, capabilities, server contracts, policy-update DOCX/PDF pipeline |
| [`@pgpz/ui`](packages/ui/README.md) | Brand-neutral UI and admin-shell primitives |
| [`@pgpz/auth-dynamodb`](packages/auth-dynamodb/README.md) | Better Auth DynamoDB adapter, indexes, TTL, and rate limits |
| [`@pgpz/background-jobs`](packages/background-jobs/README.md) | Durable-job domain plus injected DynamoDB/SQS runtime |
| [`@pgpz/email-domain`](packages/email-domain/README.md) | Pure email preferences, tracking, and history behavior |
| [`@pgpz/email-runtime`](packages/email-runtime/README.md) | Injected email persistence, route, and worker behavior |
| [`@pgpz/email-admin-ui`](packages/email-admin-ui/README.md) | Shared newsletter administration UI |
| [`@pgpz/access-log`](packages/access-log/README.md) | Access events, routes, tracker, and admin UI |
| [`@pgpz/member-directory`](packages/member-directory/README.md) | Protected member-profile contracts, safe projections, and vanity-slug rules |
| [`@pgpz/public-files`](packages/public-files/README.md) | Managed-file domain, runtime, routes, and admin UI |
| [`@pgpz/signup-notifications`](packages/signup-notifications/README.md) | Signup notification preferences and delivery flow |
| [`@pgpz/letter-signons`](packages/letter-signons/README.md) | Provider-neutral campaign and signer contracts |
| [`@pgpz/zec-shelf`](packages/zec-shelf/README.md) | Reusable resource catalog feature |
| [`@pgpz/x-monitor-core`](packages/x-monitor-core/README.md) | Pinned framework-neutral X Monitor read client |
| [`@pgpz/audit-log`](packages/audit-log/README.md) | Tamper-evident audit-chain contracts |
| [`@pgpz/document-vault`](packages/document-vault/README.md) | Governance document lifecycle and storage contracts |

Packages own neutral behavior and accept dependencies from consumers. Apps own
branding, environment mapping, AWS clients, authentication/authorization,
membership policy, route adapters, and deployment.

## Requirements and install

- Node.js `>=22 <23` (`.nvmrc` and root engine constraint).
- npm and the checked-in root `package-lock.json`.
- Docker only for the optional offline local stack.

```bash
nvm use
npm ci
```

Install once at the repository root. Do not create app-local lockfiles or rely
on root hoisting instead of direct workspace dependencies.

## Common commands

```bash
npm run dev:community
npm run dev:coalition
npm run dev:board
npm run dev:reference

npm run test --workspace=apps/community
npm run test --workspace=@pgpz/core
npm run typecheck --workspace=@pgpz/core
npm run build:community

npm run docs:verify
npm run parity:check
npm run boundaries:check
npm run check

npx playwright install chromium
npm run test:e2e
```

Use focused checks during development. Before closing a cross-workspace change,
run the final gate described in [Testing](docs/testing.md).

## Architectural rules

- Apps may import declared packages, never another app.
- Packages may not import from `apps/*` or use an app's `@/` alias.
- Every workspace declares every package and CLI it consumes directly.
- Shared behavior belongs in packages only when it can remain brand-, policy-,
  environment-, auth-, and infrastructure-neutral.
- Feature registration is central; enablement and adapters remain app-owned.
- Community/Coalition mirrored files are governed by
  `tooling/parity/manifest.json`, not by assumption.

The automated boundary and parity checks enforce these rules. See
[Architecture](docs/architecture.md) before extracting or broadening a feature.

## Deployment

Root [`amplify.yml`](amplify.yml) defines four independent Amplify builds:

| App | `AMPLIFY_MONOREPO_APP_ROOT` |
| --- | --- |
| Community | `apps/community` |
| Coalition | `apps/coalition` |
| Reference | `apps/reference` |
| Board | `apps/board` |

`tooling/write-amplify-env.mjs` writes only the selected app's allowlisted
runtime variables. Production AWS access uses app-specific Amplify SSR compute
roles and the default AWS credential chain. Never infer current production
state from a README or dated record; inspect the live Amplify branch and use the
current runbook selected from [the documentation index](docs/README.md).

## History and license

Community and Coalition histories were imported without squashing. The
immutable source-tip baseline and verifier are documented in
[`docs/history-import.md`](docs/history-import.md).

The repository is dual-licensed under MIT or Apache-2.0. See `LICENSE-MIT` and
`LICENSE-APACHE`.
