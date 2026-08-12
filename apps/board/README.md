# PGPZ Board

Private governance portal at `board.pgpz.org`. Every route except `/signin` and
the Better Auth API is protected. Self-registration is disabled and the site
refuses indexing at metadata, robots, and response-header layers.

## Access model

Authentication alone never grants portal access:

- `BOARD_MEMBER_EMAILS`: directors allowed into the portal;
- `BOARD_ADMIN_EMAILS`: director administrators; must be a member subset;
- `BOARD_EXECUTIVE_DIRECTOR_EMAILS`: administrator-equivalent staff, disjoint
  from directors;
- `BOARD_LEGAL_COUNSEL_EMAILS`: administrator-equivalent counsel, pairwise
  disjoint from directors and Executive Director.

An absent/empty member and staff roster locks everyone out. UI badges do not
replace server authorization; routes and repositories enforce current roles.

## Governance boundary

Board owns its auth table, document metadata table, audit table, staging bucket,
retained/Object-Lock bucket, audit archive, KMS key, and compute role. The
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

## Provisioning

Use the guarded script from the repository root:

```bash
REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZBoardNextAuth \
npx tsx apps/board/scripts/provision-board-member.ts \
  director@example.org --name "Director Name"
```

It prints a generated password once, rotates an existing password and revokes
sessions by default, supports `--dry-run`, and refuses addresses outside the
configured Board/staff rosters. Deliver credentials through a private channel.

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
