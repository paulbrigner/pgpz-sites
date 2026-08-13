# PGPZ Board

Private governance portal at `board.pgpz.org`. Every route except `/signin` and
the Better Auth API is protected. Self-registration is disabled and the site
refuses indexing at metadata, robots, and response-header layers.

## Access model

Authentication alone never grants portal access. During migration, access is
read from the deployment allowlists below:

- `BOARD_MEMBER_EMAILS`: directors allowed into the portal;
- `BOARD_ADMIN_EMAILS`: director administrators; must be a member subset;
- `BOARD_EXECUTIVE_DIRECTOR_EMAILS`: administrator-equivalent staff, disjoint
  from directors;
- `BOARD_LEGAL_COUNSEL_EMAILS`: administrator-equivalent counsel, pairwise
  disjoint from directors and Executive Director.

An absent/empty member and staff roster locks everyone out. After the guarded
roster migration, `BOARD_ACCESS_REGISTRY_ENABLED=true` makes
`PGPZBoardAccess` the sole runtime role/status authority; it does not fall back
to allowlists for a missing or deactivated record. UI badges do not replace
server authorization; routes and repositories enforce current roles.

### Access registry migration

`PGPZBoardAccess` stores a unique normalized-email claim, one
optimistic-locking profile, and an immutable revision for every change. The
guarded legacy-roster migration is dry-run by default:

```bash
npm run migrate:board-access -- --actor-email administrator@pgpz.org
```

After reviewing its create/unchanged/conflict plan, apply only with
`--apply --confirm MIGRATE_BOARD_ACCESS_ROSTER`. Apply mode writes each access
record and its hash-chained audit entry in one DynamoDB transaction. It refuses
to overwrite an existing record whose role or status differs from the roster.

## Governance boundary

Board owns its auth table, document metadata table, audit table, staging bucket,
retained/Object-Lock bucket, audit archive, access registry, KMS key, and compute role. The
`@pgpz/document-vault` and `@pgpz/audit-log` packages provide neutral contracts;
Board supplies retention, roles, infrastructure, routes, and event semantics.

The document vault and audit ledger fail closed when required resources are
unset. Reference examples must never attach Board data or credentials.

## Brand and marketing library

`/brand` is a Board-owned curated view of the current PGPZ identity and social
media packages. It does not introduce a second file store: each download points
to the same `brand-trademark` document record retained by the governance vault,
so document versioning, Object Lock retention, role checks, and download audit
events remain authoritative. The full `/documents` surface continues to expose
the complete governance library and its current records.

The full `/documents` surface groups records into Board-owned category folders
and uses the curated brand registry to present packages, guidelines, manifests,
and checksums as related document collections. Collections are collapsed until
opened, while direct links from `/brand` can focus the authoritative record and
its retained version history. These relationships are presentation metadata
only; every row still downloads the authoritative retained vault record and
generates the same audited read event.

Board's upload adapter permits PDF, ZIP, JSON, Markdown, text, and CSV records.
The neutral `@pgpz/document-vault` package validates the injected app policy and
file signatures; ZIP bundles are delivered as attachments rather than rendered
by the Board site.

The guarded importer is dry-run by default and is idempotent by the current
vault SHA-256. It requires live Board backend environment values and an existing
administrator-equivalent actor:

```bash
cd apps/board
NODE_OPTIONS=--conditions=react-server AWS_PROFILE=zodldashboard \
npx tsx scripts/import-brand-library.ts --actor-email div@pgpz.org
```

Use the exact `--apply --confirm IMPORT_PGPZ_BRAND_LIBRARY` gate only after the
dry-run plan and current production resources have been verified.

## Local development

Follow [`docs/local-dev.md`](../../docs/local-dev.md). From the root:

```bash
cp apps/board/.env.local.example apps/board/.env.local
docker compose up -d dynamodb-local
npm run seed:local -- --app board --password 'choose-at-least-12-characters'
npm run dev:board
```

Board runs at `http://localhost:3002`. Local authentication/admin surfaces work;
S3/KMS/Object Lock governance persistence does not run in the offline stack.

## Legacy password provisioning

Use the guarded script from the repository root:

```bash
REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZBoardNextAuth \
npx tsx apps/board/scripts/provision-board-member.ts \
  director@example.org --name "Director Name"
```

This transition-only script prints a generated password once, rotates an
existing password and revokes sessions by default, supports `--dry-run`, and
refuses addresses outside the configured Board/staff rosters. After the access
registry and passwordless cutover, add users through `/admin/users`; do not use
this password provisioner.

## Passwordless authentication

Board supports 10-minute, single-use hashed magic links and WebAuthn passkeys.
Passkey registration requires an authenticated session, uses the exact Board
origin/RP ID (`board.pgpz.org` in production), and requires user verification.
Users manage passkeys at `/account/security`.

The rollout is migration-aware: `BOARD_PASSWORDLESS_AUTH_ENABLED=true` enables
magic links and passkeys while `BOARD_PASSWORD_AUTH_ENABLED=true` retains the
existing password flow in a secondary disclosure. Do not disable passwords
until every active Board user has completed a magic-link or passkey sign-in and
the administrator has verified recovery access. After that checkpoint, set
`BOARD_PASSWORD_AUTH_ENABLED=false`, deploy, revoke all sessions, and only then
remove legacy credential-account records. The removal tool uses strongly
consistent read-only scans and prints exact credential accounts and session
counts by default:

```bash
BOARD_PASSWORD_AUTH_ENABLED=false NEXTAUTH_TABLE=PGPZBoardNextAuth \
  npm run remove:board-password-credentials
```

After reviewing every target, apply only with
`--apply --confirm REMOVE_BOARD_PASSWORD_CREDENTIALS --actor-email
operator@pgpz.org`. Each user's credential accounts, current sessions, and
three-item Board audit-ledger append are committed in one bounded DynamoDB
transaction. The 97-delete ceiling reserves transaction capacity for that
immutable audit evidence. The tool never targets users, passkeys,
verifications, OAuth accounts, or existing audit records, and reports partial
multi-user failures for a fresh dry-run before retry. Keep magic links
available for onboarding and controlled passkey recovery.

Production email uses the Board-specific SES identity through the Amplify
compute role. Local development uses MailHog SMTP; no production SMTP password
or static AWS credential is supported.

## Validation and deployment

```bash
npm run test --workspace=apps/board
npm run typecheck:board
npm run build:board
npm run test:board-backend-infra
```

Use [`docs/board-deployment.md`](../../docs/board-deployment.md) for current
roles, environment, infrastructure, provisioning, release checks, and legal
retention prerequisites. Root `amplify.yml` is authoritative with
`AMPLIFY_MONOREPO_APP_ROOT=apps/board`.
