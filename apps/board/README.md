# PGPZ Board

Private governance portal at `board.pgpz.org`. Every route except `/signin` and
the Better Auth API is protected. Self-registration is disabled and the site
refuses indexing at metadata, robots, and response-header layers.

## Access model

Authentication alone never grants portal access. During migration, access is
read from the deployment allowlists below:

- `BOARD_MEMBER_EMAILS`: directors allowed into the portal;
- `BOARD_ADMIN_EMAILS`: legacy deployment name for the Board Chair allowlist;
  it must be a member subset and resolves to the `chair` role;
- `BOARD_EXECUTIVE_DIRECTOR_EMAILS`: full-administration staff, disjoint from
  directors;
- `BOARD_LEGAL_COUNSEL_EMAILS`: limited counsel access, pairwise disjoint from
  directors and Executive Director.

An absent/empty member and staff roster locks everyone out. After the guarded
roster migration, `BOARD_ACCESS_REGISTRY_ENABLED=true` makes
`PGPZBoardAccess` the sole runtime role/status authority; it does not fall back
to allowlists for a missing or deactivated record. UI badges do not replace
server authorization; routes and repositories enforce current roles.

| Role | Documents | Meetings | Audit ledger | User management |
| --- | --- | --- | --- | --- |
| Director | view | view + RSVP + eligible asynchronous votes and discussion | no | no |
| Board Chair | manage | manage + communicate + discuss | review | manage |
| Executive Director | manage | manage + communicate + discuss | review | manage |
| Legal Counsel | manage | view + meeting documents + discuss | review | no |
| Board Support | manage | prepare drafts and records; discussion read-only | no | no |

The stored legacy role `admin` is read as Board Chair so existing access never
fails during rollout, but current APIs and UI never assign `admin` to a new or
updated record.

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

Board owns its auth table, access registry, meeting table, document metadata table, audit table, staging bucket,
retained/Object-Lock bucket, audit archive, KMS key, and compute role. The
`@pgpz/document-vault` and `@pgpz/audit-log` packages provide neutral contracts;
Board supplies retention, roles, infrastructure, routes, and event semantics.

The document vault and audit ledger fail closed when required resources are
unset. Reference examples must never attach Board data or credentials.

Authorized reviewers see audit events newest-first in `/admin/audit`, 25 per
page, with explicit refresh and newer/older navigation. Pagination affects only
the presentation query; the integrity indicator continues to verify the entire
stored hash chain against its recorded head.

## Brand and marketing records

Current PGPZ identity and social-media packages live in the authoritative
`brand-trademark` folder in `/documents`; the dashboard does not expose a
separate curated brand view. Existing `/brand` bookmarks redirect to the
Document Library. Document versioning, Object Lock retention, role checks, and
download audit events therefore stay on the same governance-vault records.

The full `/documents` surface groups records into Board-owned category folders
and uses the curated brand registry to present packages, guidelines, manifests,
and checksums as related document collections. Collections are collapsed until
opened. These relationships are presentation metadata
only; every row still downloads the authoritative retained vault record and
generates the same audited read event.

Document management is integrated into this same library rather than exposed as
a parallel interface. Board Chair, Executive Director, Legal Counsel, and Board
Support roles see permission-scoped controls for creating documents, adding a
version within version history, changing a display name, and archiving or
restoring records. Directors see only the reading interface. Display names are
mutable Board presentation metadata: changing one does not rename retained
objects, alter canonical document identity, or break governed brand-package
relationships. Every mutation retains recent-passkey step-up enforcement and
appends its normal audit evidence. `/admin/documents` remains only as a
compatibility redirect to `/documents`.

## Board meetings

`/meetings` is an upcoming-first Board workspace with a retained past-meeting
archive. Every active portal user can review published meetings, download an
iCalendar event, and record an RSVP for a live meeting. Board Support can create
and prepare draft meetings, agendas, attendance, decisions, action items, and
draft minutes.
Only the Board Chair and Executive Director may publish, reschedule, cancel, or
close a meeting, record minutes approval, or send an official communication.

A meeting can be `live` or an `asynchronous` written-resolution workspace. The
Chair or Executive Director prepares exact motions while the meeting is a
private draft, schedules a voting window, and opens each ballot. Opening takes
an immutable snapshot of active Director and Board Chair records; staff roles
do not acquire a vote. Each ballot fixes its eligible roster hash, quorum count,
and required yes-vote count. Unspecified thresholds default to the meeting
quorum (or a majority of eligible directors) and a majority of eligible
directors, and the UI directs the officer to confirm them against the bylaws.

Eligible directors cast `yes`, `no`, `abstain`, or `recused` using their
passkey-authenticated account and recent step-up verification. They may change
their response until the deadline; the current ballot and every prior response
are retained. Voting closes automatically at the deadline. While voting is
open, the site shows response progress but hides live totals and all individual
choices. After the deadline, the Chair or Executive Director finalizes the automatically computed
quorum and approval result. Only the final aggregate totals are shown in the
meeting record. The finalized ballot also creates the retained meeting decision;
the meeting cannot be completed while a ballot remains draft or open.

The Chair or Executive Director can send a vote reminder only to eligible
directors who have not responded. The message contains an authenticated portal
link and deadline, not the motion or confidential attachments. Delivery follows
the same per-recipient idempotency and audit behavior as other meeting messages.

Every opened written resolution has an asynchronous discussion thread. Active
Directors, the Board Chair, Executive Director, and Legal Counsel can post and
reply; Board Support has read-only access. Messages are attributed to the
passkey-authenticated account, may be edited by their author for 15 minutes,
and cannot be deleted. The current message plus an immutable revision for every
post and edit are retained in the meeting partition, and each mutation appends
the normal hash-chained Board audit event with a content hash. Discussion opens
with the voting window and becomes read-only when the window closes or the
ballot is cancelled, while remaining visible in the historical meeting record.
Discussion does not expose a member's private ballot choice. Threads refresh on
request; email notifications, unread counts, reactions, attachments, and live
chat delivery are intentionally outside the initial discussion scope.

Meeting lifecycle data is Board-specific and stored in `PGPZBoardMeetings` as
an optimistic aggregate with retained child records and immutable revisions.
Important mutations compose the meeting write with the Board hash-chained audit
append in one DynamoDB transaction. The table is KMS-encrypted, PITR-enabled,
deletion-protected, `Retain`-protected, has no TTL, and gives web compute no
`DeleteItem` or `Scan` permission.

Meeting documents use the same governance vault, immutable versions, retained
objects, checksums, and audited downloads as the general Document Library. A
sparse ownership index assigns each record to exactly one surface: library
documents remain in `/documents`; meeting-owned agenda, preparation, minutes,
resolution, and other records appear only inside their meeting. Changing a
meeting status never deletes its documents.

Calendar downloads use a stable iCalendar UID and sequence. Board Chair and
Executive Director users can manually send an invitation, update, materials
notice, reminder, vote reminder, or cancellation. Messages are delivered one recipient at a
time through the Board SES identity; that identity remains the calendar
organizer even when a different authorized officer sends an update. Messages
contain authenticated portal links rather than confidential attachments and
persist per-recipient pending/result evidence with safe partial retry. No
automated scheduler, external calendar OAuth,
transcription, or meeting-platform integration is enabled.

Board's upload adapter permits PDF, ZIP, JSON, Markdown, text, and CSV records.
The neutral `@pgpz/document-vault` package validates the injected app policy and
file signatures; ZIP bundles are delivered as attachments rather than rendered
by the Board site.

The guarded importer is dry-run by default and is idempotent by the current
vault SHA-256. It requires live Board backend environment values and an existing
actor with document-management access:

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
the seed creates the local meetings, documents, and append-only audit tables.
Document bytes are written beneath the ignored `.local/board-documents`
directory through a same-origin development adapter. This exercises staging,
versions, checksums, meeting ownership, downloads, and audit behavior, but does
not emulate production KMS encryption or S3 Object Lock retention enforcement.

## Emergency password rollback

Normal accounts are created through `/admin/users` and use passwordless sign-in.
Creating a user sends a Board welcome email with the assigned role, sign-in
link, and passkey-enrollment instructions. Access creation remains successful
if email delivery is temporarily unavailable; the administrator sees the
delivery outcome and the audit ledger records success or failure.
The old credential provisioner is retained only for controlled rollback and
refuses to run unless password auth is explicitly enabled:

```bash
BOARD_PASSWORD_AUTH_ENABLED=true REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZBoardNextAuth \
npx tsx apps/board/scripts/provision-board-member.ts \
  director@example.org --name "Director Name"
```

Do not use this tool for onboarding. Any rollback-created credential is
temporary and must be removed through the guarded removal workflow after the
incident is resolved.

## Passwordless authentication

Board requires a user-verified WebAuthn passkey before any private Board content
is available. Passkey ceremonies use the exact Board origin/RP ID
(`board.pgpz.org` in production), and both registration and authentication
reject ceremonies that do not verify the user. A passkey-authenticated session
is valid for up to 12 hours; document mutations, access changes, audit
verification/export, and passkey changes require another passkey verification
within the preceding 10 minutes.

Ten-minute, single-use hashed magic links are limited to initial onboarding and
controlled recovery. A magic link can open `/account/security`, but it cannot
open Board content. Users must register and then verify a passkey before
continuing. Successful verification automatically returns the user to the
protected Board route they originally requested. Users manage passkeys at
`/account/security`; two passkeys are
recommended, and the final passkey cannot be removed. Board Chair and Executive
Director users can perform an audited passkey reset for a user who has lost all
authenticators. The user then uses a magic link to enroll a replacement.
Registration, removal, and administrative reset send security notifications.

`BOARD_PASSWORD_AUTH_ENABLED=false` is the normal state. After it has been
deployed and existing sessions have been revoked, remove legacy credential
records. The removal tool uses strongly
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
available only for onboarding and controlled passkey recovery.

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
