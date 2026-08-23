# Local development without AWS

> **Status: current local workflow.** It is intentionally isolated from AWS and
> does not validate production queues, email delivery, X access, or Board
> governance storage.

Run all four PGPZ apps locally against local stand-ins for the managed AWS
services they touch at runtime, with no AWS account or credentials required.

## What is replaced

| AWS service | Local replacement | Container |
| --- | --- | --- |
| DynamoDB | `amazon/dynamodb-local` | `dynamodb-local`, port `8000` |
| SES / SMTP delivery | MailHog fake SMTP + inbox UI | `mailhog/mailhog:v1.0.1`, SMTP `1025`, web UI `8025` |

The app AWS SDK clients are pointed at DynamoDB Local through the standard
`AWS_ENDPOINT_URL_DYNAMODB` environment variable — no code changes required.
Each `.env.local.example` also sets dummy credentials (`AWS_ACCESS_KEY_ID=dummy`
/ `AWS_SECRET_ACCESS_KEY=dummy`) because DynamoDB Local requires some access key
to be present even though it ignores the values; without them the AWS SDK's
default provider chain fails with `CredentialsProviderError`. Outbound email is
captured by MailHog and never delivered, which makes the magic-link sign-in flow
testable offline.

Not everything runs offline:

- **Background jobs** (newsletters, bulk sends) need the SQS/Lambda durable-jobs
  stack and are gated off via `BACKGROUND_JOBS_ENABLED=false`.
- **Board WORM audit ledger + document vault** use S3/KMS and are fail-closed
  no-ops while their `BOARD_*` bucket variables are unset. Board authentication
  and the admin surface work; governance persistence does not.
- **Community X-proof membership** needs live access to the X API.

## Prerequisites

- Docker with the Compose plugin (verified on macOS, arm64 host).
- Node.js >=22 <23 and `npm ci` completed at the monorepo root.

## Quick start

```bash
# 1. Start local services (DynamoDB Local + MailHog)
docker compose up -d

# 2. Create tables and provision paul@paulbrigner.com
npm run seed:local -- --password 'LocalDevAdmin!2026'
```

The password above is the example; use your own value of at least 12 characters.
It is printed once during seeding for Board sign-in.

## Running each app

Copy the corresponding `.env.local.example` to a real `.env.local`, adjust
ports/URLs, then run from the monorepo root. Each Next.js dev server uses its
own port so all four can run together:

| App | Port | Command |
| --- | ---: | --- |
| Community | 3000 | `npm run dev:community` |
| Coalition | 3001 | `npm run dev:coalition` |
| Board | 3002 | `npm run dev:board` |
| Reference | 3003 | `npm run dev:reference` |

> The `.env.local.example` files already point at the local stack. If you prefer
> different ports, keep each app's `BETTER_AUTH_URL` /
> `NEXT_PUBLIC_SITE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` in sync with the port.

## Signing in as an admin

### Board (email + password)

paul@paulbrigner.com is provisioned by `npm run seed:local` and put on both
rosters in `apps/board/.env.local.example`. He signs in at
http://localhost:3002 with the seeding password, and membership/adminship come
from those allowlists automatically. No further step required.

### Community & Coalition (email magic-link)

These apps authenticate by email magic-link only — there is no password path to
pre-create an account. Better Auth mints its user record on first successful
sign-in:

1. Start the app and request a sign-in link for `paul@paulbrigner.com`.
2. Open MailHog at http://localhost:8025 and click the magic link that arrived.
3. Promote him to admin once the account exists:
   - Community: `npm run admin:community -- paul@paulbrigner.com`
   - Coalition: `npm run admin:coalition -- paul@paulbrigner.com`

### Reference

The reference app is fully offline by contract (inert clients, synthetic seed
catalog). It has no sign-in or admin surface; nothing to provision.

## Seeding details

`scripts/seed-local-dev.mjs` orchestrates the existing per-app setup scripts so
you do not have to run them individually:

- Creates `PGPZCommunityNextAuth`, `PGPZCoalitionNextAuth`, and
  `PGPZBoardNextAuth` tables (identical better-auth schema: `pk/sk` +
  GSI1/GSI2 + TTL).
- Creates the Board-only `PGPZBoardAccess`, `PGPZBoardAuditLog`,
  `PGPZBoardMeetings`, and `PGPZBoardDocuments` tables, including the meeting
  timeline and meeting-document indexes used by the local portal.
- Stores local document bytes beneath the ignored
  `apps/board/.local/board-documents` directory. The adapter preserves staging,
  immutable version keys, SHA-256 verification, and audited application flows;
  it does not emulate production KMS encryption or S3 Object Lock.
- Provisions the Board account via `provision-board-member.ts`.

The script is **idempotent** — rerunning detects existing tables and rotates
(instead of duplicating) the Board password. It only ever touches DynamoDB
Local, never real AWS.

Options:

```bash
npm run seed:local                              # all apps
npm run seed:local -- --app board               # board table + account only
npm run seed:local -- --password 'SECRET'       # pin the Board password (>= 12 chars)
```

## Resetting local data

DynamoDB Local runs with `-sharedDb` and without `-inMemory`, so it stores its
database in the container's writable filesystem. `docker compose restart` and
ordinary stop/start operations reuse the container and preserve its tables and
accounts. No host or named volume is mounted, however, so removing or recreating
the container loses that database. For example, `docker compose down && docker
compose up -d` creates a fresh empty container. Re-run `npm run seed:local` after
container removal/recreation or whenever the expected tables are missing.

Local document bytes are intentionally separate; remove
`apps/board/.local/board-documents` when you also want to reset uploaded files.

## Tearing the stack down

```bash
docker compose down        # remove containers; local DynamoDB data is lost
```

To leave nothing running:

```bash
docker compose rm -f       # remove stopped containers too
```
