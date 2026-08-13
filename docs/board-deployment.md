# Board portal deployment runbook

> **Status: current guarded runbook.** Confirm the live Amplify branch,
> allowlists, stack outputs, Object Lock parameters, and rollback target before
> any production change.

`apps/board` is the private PGPZ Board of Directors portal at
`https://board.pgpz.org`. This runbook covers the AWS/Amplify side: the
DynamoDB table, the Amplify application, the IAM role, environment variables,
and director provisioning. It mirrors the Community/Coalition isolation rules:
the portal must never reuse another application's table, secret, bucket, or
sender.

## 1. DynamoDB table

The versioned `PgpzBoardBackend` CloudFormation stack creates a dedicated
`PGPZBoardNextAuth` table and retained `PGPZBoardAccess` registry in the same
region as the Amplify app. The Better
Auth adapter (`@pgpz/auth-dynamodb`) uses the same schema as Community and
Coalition:

| Attribute | Type | Purpose |
| --- | --- | --- |
| `pk` | String (partition key) | `BETTER_AUTH#<model>#<id>` |
| `sk` | String (sort key) | same value as `pk` |
| `GSI1PK`/`GSI1SK` | String | GSI `GSI1` — email and token lookups |
| `GSI2PK`/`GSI2SK` | String | GSI `GSI2` — sessions/accounts by userId |
| `expires` | Number | TTL (sessions, verifications, rate limits) |

The stack enables on-demand billing, server-side encryption, TTL on `expires`,
point-in-time recovery, DynamoDB deletion protection, retained replacement and
deletion policies, and CloudFormation termination protection. Plan, validate,
and explicitly deploy it with:

```bash
npm run provision:board-backend -- --account-id 860091316962
npm run provision:board-backend -- --account-id 860091316962 \
  --profile zodldashboard --validate-only
npm run provision:board-backend -- --account-id 860091316962 \
  --profile zodldashboard --apply --confirm PROVISION-BOARD-BACKEND
```

The default invocation is local-only and makes no AWS calls. The apply mode
verifies the selected account, table status, TTL, point-in-time recovery, and
deletion protection before reporting success.

The access registry is KMS-encrypted, PITR-enabled, deletion-protected, and
Retain-protected. It deliberately has no TTL. Its `Roster` index lists profiles
without a scan; normalized email ownership is enforced by a conditionally
created claim row; every create, role/status change, and session-revocation
change writes an immutable revision. The web role receives no `DeleteItem` or
`Scan` on this table.

## 2. Amplify application

Create an Amplify application from the pgpz-sites monorepo with:

- `AMPLIFY_MONOREPO_APP_ROOT=apps/board`
- Branch: `main` (or the release branch used by the other apps)

The root `amplify.yml` contains the `apps/board` application block; the
app-local `apps/board/amplify.yml` is retained as a rollback reference.

### Custom domain

Add `board.pgpz.org` to the Amplify app domain settings and issue the TLS
certificate. Per the repository custom-header policy, board-specific headers
are already applied by the application (`next.config.ts`: strict CSP,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and
`X-Robots-Tag: noindex, nofollow, noarchive`), so no `customHttp.yml` entry is
needed. Do **not** add Board to a repository-root `customHttp.yml`.

### IAM role

The `PgpzBoardBackend` stack creates the dedicated
`PgpzBoardAmplifyMainCompute` role, granting only:

- `dynamodb` on `PGPZBoardNextAuth` and its indexes: `GetItem`, `PutItem`,
  `Query`, `Scan`, `UpdateItem`, `DeleteItem`, `TransactWriteItems` (no
  `DescribeTable`)
- no other application tables or buckets

The same role has a separate `PGPZBoardAccess` statement limited to `GetItem`,
`PutItem`, `Query`, and `TransactWriteItems` on the registry and its index.

`Scan` is required for the adapter's safe fallback when a query cannot be
served by the modeled indexes. Its resource remains restricted to the Board
table. Authentication delivery is restricted to `ses:SendEmail` and
`ses:SendRawEmail` against the `pgpz.org` identity; the Board role has no
general-purpose sender permission.

## 3. Environment variables

Set these on the Amplify app (also documented in `apps/board/.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://board.pgpz.org` |
| `BETTER_AUTH_URL` | yes | `https://board.pgpz.org` |
| `BETTER_AUTH_SECRET` | yes | ≥32 random bytes, board-only, never reused |
| `BETTER_AUTH_TRUSTED_ORIGINS` | yes | `https://board.pgpz.org` |
| `NEXTAUTH_TABLE` | yes | `PGPZBoardNextAuth`; also stores Board passkey rows under physical model `better_auth_passkeys` |
| `BOARD_ACCESS_TABLE` | yes | `PGPZBoardAccess`; Board-only roles, status, email claims, and immutable revisions |
| `BOARD_ACCESS_REGISTRY_ENABLED` | yes | Keep `false` until the roster migration is verified; then `true` makes the registry authoritative |
| `REGION_AWS` | yes | table/region |
| `BOARD_MEMBER_EMAILS` | yes | comma- or whitespace-separated allowlist of current directors' emails |
| `BOARD_ADMIN_EMAILS` | yes | legacy deployment name for the Board Chair allowlist; every entry must also be in `BOARD_MEMBER_EMAILS` and resolves to `chair` |
| `BOARD_EXECUTIVE_DIRECTOR_EMAILS` | no | staff allowlist: the Executive Director has full Board administration **without** joining the Board roster; must be disjoint from `BOARD_MEMBER_EMAILS` |
| `BOARD_LEGAL_COUNSEL_EMAILS` | no | legacy staff allowlist: Legal Counsel can manage documents and review the audit ledger, but cannot manage users; must be pairwise disjoint from `BOARD_MEMBER_EMAILS` and `BOARD_EXECUTIVE_DIRECTOR_EMAILS` |
| `BOARD_PASSWORDLESS_AUTH_ENABLED` | yes | `true` enables magic links and passkeys |
| `BOARD_PASSWORD_AUTH_ENABLED` | yes | normal value is `false`; set `true` only for a controlled emergency rollback |
| `EMAIL_TRANSPORT` | yes | `ses` is mandatory in production |
| `EMAIL_FROM` | yes | Board-specific verified sender, e.g. `PGPZ Board <board@pgpz.org>` |

`tooling/write-amplify-env.mjs board` fails the build if any required variable
is missing. Both roster variables are intentionally required. An unset member
allowlist locks every account out, a Board Chair outside the member roster
fails configuration instead of gaining access, and an Executive Director who
overlaps the member roster fails configuration instead of holding a dual role.

## 4. Provisioning users and assigning roles

Accounts cannot self-register. A Board Chair or Executive Director creates a
user through `/admin/users`, assigns a current role, and sends no password. The
user requests a magic link on `/signin`, then registers a passkey from
`/account/security`. Role and status changes take effect immediately and append
an immutable access revision plus audit event.

| Role | Documents | Audit ledger | User management |
| --- | --- | --- | --- |
| Director | view | no | no |
| Board Chair | manage | review | manage |
| Executive Director | manage | review | manage |
| Legal Counsel | manage | review | no |
| Board Support | manage | no | no |

Document-management controls live directly in `/documents`; the legacy
`/admin/documents` location redirects there. Authorized document managers can
add records, publish versions, change presentation-only display names, and
archive or restore records without entering a separate administration
interface. Display-name changes preserve canonical document and retained-object
identity and are recorded as `display_name_updated` audit events.

The legacy stored role `admin` remains readable as Board Chair for safe rollout,
but current APIs do not assign it. Another full-administration user can change a
legacy record to `chair` in `/admin/users`; self-role changes remain prohibited.

Before the access-registry migration, role authorization remains
environment-managed. After the migration is verified, set
`BOARD_ACCESS_REGISTRY_ENABLED=true`: the Board administration UI becomes the
role/status authority and changes take effect without editing Amplify rosters
or redeploying. Missing, invited, and deactivated registry records fail closed;
there is no fallback to the legacy allowlists.

### Passwordless operation and credential retirement

1. Verify the Board SES sender/domain, DKIM and DMARC; grant the Board Amplify
   role only `ses:SendEmail` and `ses:SendRawEmail` against that identity.
2. Keep `BOARD_PASSWORDLESS_AUTH_ENABLED=true` and
   `BOARD_PASSWORD_AUTH_ENABLED=false`. Confirm a magic-link request always
   returns the same generic response and expires after ten minutes; confirm the
   stored verification identifier is hashed.
3. Passkey is required for every user before private Board content is available.
   Magic link is only an onboarding and controlled-recovery entry point: it can
   open `/account/security`, but cannot satisfy Board-content authentication.
   Registration and authentication must both complete WebAuthn user verification.
4. Verify recovery email ownership and encourage every user to register two
   passkeys. A passkey-authenticated session lasts up to 12 hours. Document
   mutations, access changes, audit verification/export, and passkey changes
   require a passkey verification no more than 10 minutes old. Review
   `magic_link_sent`, `passkey_registered`, `passkey_updated`,
   `passkey_removed`, and `user_passkeys_reset` in the Board audit ledger.
5. If a user loses every authenticator, a Board Chair or Executive Director can
   use `/admin/users` to perform the exact-confirmation passkey reset. The reset
   atomically removes passkeys and sessions while appending its audit evidence;
   the user then follows a magic link and enrolls a replacement passkey.
6. After deploying password disablement, revoke all existing sessions and
   confirm password endpoints reject sign-in while magic links and passkeys work.
7. Run the credential-removal migration in dry-run mode and review
   exact account targets and per-user session counts:

   ```bash
   BOARD_PASSWORD_AUTH_ENABLED=false NEXTAUTH_TABLE=PGPZBoardNextAuth \
     npm run remove:board-password-credentials
   ```

   Apply only after the dry-run review:

   ```bash
   BOARD_PASSWORD_AUTH_ENABLED=false NEXTAUTH_TABLE=PGPZBoardNextAuth \
     npm run remove:board-password-credentials -- \
       --apply --confirm REMOVE_BOARD_PASSWORD_CREDENTIALS \
       --actor-email operator@pgpz.org
   ```

   The script refuses any state other than explicit password disablement and
   conditionally deletes only `providerId=credential` accounts plus each
   affected user's current sessions, while appending the traceable Board audit
   event in the same transaction. Its 97-delete per-user ceiling reserves three
   transaction items for the immutable ledger append. Users, passkeys,
   verifications, OAuth accounts, and existing audit records are never deletion
   targets. Any partial multi-user failure is reported with the exact affected
   account IDs; rerun dry-run before retrying.

Rollback before credential removal is configuration-only: restore
`BOARD_PASSWORD_AUTH_ENABLED=true` and redeploy. After credential removal,
rollback requires explicitly reprovisioning credentials and is not automatic.

## 5. Removing a Board user

1. Use `/admin/users` and type the required confirmation to deactivate access.
2. The access transition, immutable revision, session deletions, and audit-chain
   append commit in one DynamoDB transaction. If any part fails, access is not
   reported as changed.
3. Preserve the identity, passkeys, access revisions, and audit history. The
   normal Board workflow does not permanently delete people or governance
   evidence.
4. Remove the address from the legacy environment roster during later
   configuration cleanup; while registry mode is enabled it is not an access
   authority.

## 6. Verification after deploy

- `https://board.pgpz.org/signin` renders the sign-in card.
- Any other path redirects to `/signin?callbackUrl=...` while signed out, and
  neither the document nor an RSC request body contains portal content
  (regression-covered by `e2e/board-portal.spec.ts`).
- Malicious `callbackUrl` values (`javascript:`, `//host`, absolute URLs)
  resolve to `/` instead of navigating.
- Password controls are absent and credential sign-in endpoints reject use.
- A magic-link request has a generic response for known, unknown, and delivery-failure cases.
- A magic link is single-use, hashed at rest, and expires in ten minutes.
- Passkey sign-in uses RP ID `board.pgpz.org`, exact origin `https://board.pgpz.org`, and required user verification.
- A magic-link session can reach `/account/security` but is redirected there
  from every private Board-content route until a passkey is registered and verified.
- `/account/security` supports passkey registration/removal, recommends two
  authenticators, and prevents removal of the final passkey.
- A passkey-authenticated session expires after 12 hours; sensitive mutations
  require a passkey verification no more than 10 minutes old.
- A Board Chair or Executive Director can perform an audited administrative
  passkey reset; the affected user receives a security notification.
- The Board Chair sees the `Board Chair` badge and can manage documents, audit,
  and users; ordinary directors receive a concealed 404 on privileged routes.
- An email on `BOARD_EXECUTIVE_DIRECTOR_EMAILS` signs in, sees the
  `Executive Director` badge, and has full Board administration without
  appearing on the Board roster.
- An email on `BOARD_LEGAL_COUNSEL_EMAILS` signs in, sees the "Legal Counsel"
  badge, can manage documents and review the audit ledger, and cannot manage
  users, roles, access status, or sessions.
- A `Board Support` user can manage documents but cannot review the audit ledger
  or manage users, roles, access status, or sessions.
- Signing in with a non-roster email shows the "not on the board roster" panel.
- `curl -I` shows `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, CSP.
- `https://board.pgpz.org/robots.txt` disallows all crawlers.

## 7. Governance document vault and audit ledger infrastructure

The Board backend stack (Phases 3+) provisions isolated governance resources in
addition to the auth table. All are **Retain**-protected, KMS-encrypted
(Board-only key, rotation on), PITR-enabled, and deletion-protected. They are
described here because they carry distinct retention and isolation guarantees.

### Dedicated tables

- `PGPZBoardDocuments` — governance-document metadata + immutable per-version
  rows (`PK=DOCUMENT#<id>`, `SK=META` / `SK=VERSION#<seq>#<versionId>`). Query
  via the `Library`/`ByCategory`/`ByStatus` GSIs — never `Scan`. Web compute IAM
  allows read + conditional write but **no `DeleteItem`**.
- `PGPZBoardAuditLog` — append-only ledger. Web compute IAM allows only
  `GetItem`/`PutItem`/`Query` (no `UpdateItem`/`DeleteItem`/`Scan`), so the
  table is append-only by IAM as well as by application invariant. A DynamoDB
  Stream (`NEW_AND_OLD_IMAGES`) feeds an external, separately-permissioned
  `PgpzBoardAuditArchiver` role that writes to the WORM archive — the web
  runtime has **no** access to that archive.

Neither table has a TTL: documents and audit events are retained.

### Storage boundaries

- **Staging** — short-lived upload landing zone; lifecycle-expired
  (`staging/`), deletable by the web runtime for orphan/rejected cleanup.
- **Retained documents** — S3 Versioning + Object Lock enabled, TLS-only bucket
  policy, BucketOwnerEnforced, Block Public Access. Web runtime IAM allows
  put/get/head on `objects/*` but **no `DeleteObject`/`DeleteObjectVersion`**
  (enforced by an explicit Deny).
- **WORM audit archive** — Object Lock + Versioning; only the separate
  archiver role may write; web compute is never granted access.

### Legal retention decision

`PgpzBoardBackend` exposes two parameters: `BoardObjectLockMode` (default
`GOVERNANCE`) and `BoardRetentionDays` (default `90`). Per the revised plan,
**only Legal Counsel may approve Object Lock mode and duration.** Use Governance
mode in the isolated test stack; switch production to `COMPLIANCE` only after
approving the irreversible retention period. Do not hide this decision in source
constants — it lives in the CloudFormation parameters and the deployment record.

### Environment variables

The stack outputs supply `BOARD_DOCUMENTS_TABLE`, `BOARD_AUDIT_TABLE`, `BOARD_ACCESS_TABLE`,
`BOARD_DOCUMENTS_STAGING_BUCKET`, `BOARD_DOCUMENTS_RETAINED_BUCKET`,
`BOARD_AUDIT_ARCHIVE_BUCKET`, and `BOARD_KMS_KEY_ID`. `write-amplify-env.mjs
board` materializes them; the build now rejects a deployment when any of these
bindings is absent.

The stack also provisions `PgpzBoardAuditArchiver`, a separately permissioned
Lambda subscribed to the audit-table stream. It copies every stream record to
the Object-Locked archive under `events/<date>/<event-id>.json`; partial batch
failures are retried by the DynamoDB event-source mapping. The Amplify compute
role cannot read from or write to this archive.
