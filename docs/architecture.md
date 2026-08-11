# Current Architecture

This document describes durable repository boundaries. It intentionally omits
route-by-route detail and live cloud state; inspect the relevant app and verify
production separately when a task depends on either.

## System shape

```text
                         packages/core + packages/ui
                                   |
              neutral domain/runtime packages (injected deps)
                                   |
        +--------------------------+--------------------------+
        |                          |                          |
 apps/community              apps/coalition              apps/board
 X proof, X Monitor,         approval, invites,          private roles,
 ZEC Shelf                   groups, sign-ons            vault + audit
        |
 apps/reference (neutral read-only proof of selected package contracts)
```

All four applications build from the monorepo root but deploy independently.
There is no shared runtime process or shared authorization layer.

## Application ownership

| App | Membership/auth | App-specific capabilities | Data boundary |
| --- | --- | --- | --- |
| Community | Better Auth magic link plus X and canary-gated ZcashMe social proof | X Monitor, Topic Briefings, ZEC Shelf, referrals | Community table/buckets/queue/compute role |
| Coalition | Better Auth magic link plus manual approval or invitation | policy groups, directory, invitations, letter sign-ons | Coalition table/buckets/queue/compute role |
| Board | Better Auth password plus explicit member/staff allowlists | governance documents and audit review | Board auth, document, audit, and storage resources |
| Reference | externally managed/no attached identity provider | neutral read-only ZEC Shelf and document examples | synthetic/inert by default; never branded resources |

Community and Coalition may share neutral implementation packages, but each
injects its own clients, tables, secrets, membership checks, administrator
authorization, routes, brand, and email policy.

## Package layers

### Foundation

- `@pgpz/core`: client-safe site/capability contracts and server-only injected
  configuration plus the shared policy-update DOCX/PDF pipeline.
- `@pgpz/ui`: brand-neutral primitives and shared admin presentation.

### Domain contracts

- `@pgpz/background-jobs`: job states, retention, cursors, recipients, and an
  injected runtime configured independently by each branded app.
- `@pgpz/email-domain`: pure preferences, link capabilities, tracking, and
  history normalization.
- `@pgpz/letter-signons`: campaign/version/signature rules.
- `@pgpz/audit-log`: canonical serialization and hash-chain contracts.
- `@pgpz/document-vault`: document lifecycle and repository contracts.

### Injected server and feature packages

- `@pgpz/auth-dynamodb`: Better Auth persistence and rate-limit storage.
- `@pgpz/email-runtime`: email persistence, handlers, and worker behavior.
- `@pgpz/access-log`: access repository, request metadata, routes, and UI.
- `@pgpz/public-files`: managed-file repository, delivery/admin handlers, UI.
- `@pgpz/signup-notifications`: preferences, route handlers, jobs, and UI.
- `@pgpz/zec-shelf`: catalog domain, client, repository, and safe URL checker.
- `@pgpz/x-monitor-core`: pinned read-only client snapshot for Community.
- `@pgpz/email-admin-ui`: shared newsletter administration UI.

## Dependency direction

Allowed:

```text
app -> package -> lower-level package
app -> app-owned adapters/config/infrastructure
```

Forbidden:

```text
package -> app
app -> sibling app
shared package -> branded environment/config singleton
client entry point -> server-only module
```

`npm run boundaries:check` validates workspace imports, aliases, and direct
dependency declarations. Package exports deliberately separate client, server,
route, and test entry points where needed.

## Community and Coalition parity

Parallel files are classified in `tooling/parity/manifest.json`:

- `exact-copy`: byte-identical adapters/tests that must move together;
- `branding-config-variant`: same role, intentionally different identity/config;
- `intentional-workflow-divergence`: different product or membership policy;
- `reconcile-before-sharing`: drift that cannot yet be called shared.

For any cross-branded change, inspect both apps before editing. Extract only the
neutral center; keep app policy in thin adapters. Run `npm run parity:check`
afterward. Never update hashes merely to silence the check.

## Feature enablement

Feature names are registered by `@pgpz/core`; app configuration decides whether
each is enabled. Current notable enablement:

| Feature | Community | Coalition | Board | Reference |
| --- | ---: | ---: | ---: | ---: |
| ZEC Shelf | yes | no | no | yes |
| Public files | yes | yes | no | no |
| Letter sign-ons | no | yes | no | no |
| Document vault | no | no | yes | no |

Other capabilities such as X Monitor, access logs, email administration, and
signup notifications are app-owned integrations and may not use the central
site-feature switch surface.

## Persistence and authorization

- `NEXTAUTH_TABLE` is a legacy variable name for each branded app's broader
  application table; Better Auth is the active provider.
- DynamoDB keys and indexes are contracts. GSI, TTL, ownership, or queue changes
  require the relevant runbook and schema-first deployment.
- UI visibility is not authorization. Every protected route rechecks its
  current app session, membership/role, and record access.
- S3 buckets remain private. Stable download routes authorize and stream or sign
  access; they do not make buckets public.
- Board document retention and audit resources are isolated from branded member
  apps and fail closed when required infrastructure is absent.

## Deployment

Root `amplify.yml` defines one build per app root. Each Amplify app retains its
own environment map, domain, compute role, table, storage, and rollback target.
`tooling/write-amplify-env.mjs` allowlists variables into the selected build and
must never print values.

Operational documentation describes safe procedures, not confirmed live state.
Before production work, identify the app, AWS profile/account/region, branch,
current commit, environment variables, resource names, and rollback target.
