# Board portal deployment runbook

`apps/board` is the private PGPZ Board of Directors portal at
`https://board.pgpz.org`. This runbook covers the AWS/Amplify side: the
DynamoDB table, the Amplify application, the IAM role, environment variables,
and director provisioning. It mirrors the Community/Coalition isolation rules:
the portal must never reuse another application's table, secret, bucket, or
sender.

## 1. DynamoDB table

Create one table for the board portal (e.g. `PGPZBoardNextAuth`) in the same
region as the Amplify app. The Better Auth adapter (`@pgpz/auth-dynamodb`)
uses the same schema as Community and Coalition:

| Attribute | Type | Purpose |
| --- | --- | --- |
| `pk` | String (partition key) | `BETTER_AUTH#<model>#<id>` |
| `sk` | String (sort key) | same value as `pk` |
| `GSI1PK`/`GSI1SK` | String | GSI `GSI1` — email and token lookups |
| `GSI2PK`/`GSI2SK` | String | GSI `GSI2` — sessions/accounts by userId |
| `expires` | Number | TTL (sessions, verifications, rate limits) |

Enable TTL on `expires`. Billing: `PAY_PER_REQUEST` is fine for a board-sized
workload. The Coalition script
`apps/coalition/scripts/setup/create-dynamodb-tables.mjs` can be run with
`--nextauth-table PGPZBoardNextAuth` to create and verify the identical
schema.

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

Create the Amplify compute role or extend an existing one scoped to this app,
granting at minimum:

- `dynamodb` on `PGPZBoardNextAuth`: `GetItem`, `PutItem`, `Query`, `UpdateItem`,
  `DeleteItem`, `TransactWriteItems` (no `DescribeTable`)
- no other tables, buckets, or SES identities

The workflow `tooling/amplify-compute-role.mjs` plans Community/Coalition
roles; copy its shape for the board app with the board table ARN only. SES is
not required — the portal ships with outbound email disabled.

## 3. Environment variables

Set these on the Amplify app (also documented in `apps/board/.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://board.pgpz.org` |
| `BETTER_AUTH_URL` | yes | `https://board.pgpz.org` |
| `BETTER_AUTH_SECRET` | yes | ≥32 random bytes, board-only, never reused |
| `BETTER_AUTH_TRUSTED_ORIGINS` | yes | `https://board.pgpz.org` |
| `NEXTAUTH_TABLE` | yes | `PGPZBoardNextAuth` |
| `REGION_AWS` | yes | table/region |
| `BOARD_MEMBER_EMAILS` | yes | comma- or whitespace-separated allowlist of current directors' emails |
| `EMAIL_FROM` | no | unused until email delivery is added |

`tooling/write-amplify-env.mjs board` fails the build if any required variable
is missing. `BOARD_MEMBER_EMAILS` is intentionally required: an unset
allowlist locks every account out (safe default).

## 4. Provisioning directors

Accounts cannot self-register. The board administrator creates and rotates
them with:

```bash
cd apps/board
REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZBoardNextAuth \
  npx tsx scripts/provision-board-member.ts director@example.org --name "Director Name"
```

- Generates a random 24-character password, prints it once; deliver privately.
- Rerunning for the same email rotates the password hash **and revokes every
  stored session for that director by default**, so the old password and all
  existing session cookies stop working immediately. Use `--keep-sessions` to
  rotate the password only.
- New identities are created transactionally (user + credential account in a
  single `TransactWriteItems`), so a failure cannot leave a half-created
  account. Session-revocation failures abort with a non-zero exit; partial
  recovery is never silent.
- `--dry-run` reports the planned action, account id, and session-revocation
  count without writing anything.
- Refuses emails not on `BOARD_MEMBER_EMAILS` when that variable is set in the
  shell — always set it to the same value as the Amplify allowlist to prevent
  provisioning mistakes.
- Records are written in the exact `BETTER_AUTH#...` shape the
  `@pgpz/auth-dynamodb` adapter reads, with Better Auth's own scrypt hash
  (`better-auth/crypto`), so sign-in works through the normal flow.

## 5. Removing a director

1. Remove the address from `BOARD_MEMBER_EMAILS` in Amplify (takes effect on
   next deploy; until then the roster still admits them).
2. Delete the account records (user + credential account) from
   `PGPZBoardNextAuth`, e.g. `aws dynamodb delete-item` on
   `pk=sk=BETTER_AUTH#better_auth_users#<id>` and
   `pk=sk=BETTER_AUTH#better_auth_accounts#<id>`.
3. Optionally rotate `BETTER_AUTH_SECRET` if the departure is sensitive.

## 6. Verification after deploy

- `https://board.pgpz.org/signin` renders the sign-in card.
- Any other path redirects to `/signin?callbackUrl=...` while signed out, and
  neither the document nor an RSC request body contains portal content
  (regression-covered by `e2e/board-portal.spec.ts`).
- Malicious `callbackUrl` values (`javascript:`, `//host`, absolute URLs)
  resolve to `/` instead of navigating.
- Signing in with a roster email + provisioned password reaches the dashboard.
- Signing in with a non-roster email shows the "not on the board roster" panel.
- Rotating a director's password signs their other devices out (sessions
  revoked), and `--dry-run` reports the revocation count first.
- `curl -I` shows `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, CSP.
- `https://board.pgpz.org/robots.txt` disallows all crawlers.
