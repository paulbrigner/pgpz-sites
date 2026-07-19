# PGPZ Community

Community site for `community.pgpz.org`, built with Next.js 15 and AWS Amplify.

Membership is activated through automated X social proof. The previous NFT, Unlock, wallet, SIWE, token, allowance, and renewal model has been removed from this repo.

## Features

- Email magic-link authentication with Better Auth.
- DynamoDB-backed user/profile/session persistence.
- X proof challenge generation and automatic verification.
- Denormalized active membership state on the user record.
- Social proof audit records in the same DynamoDB table.
- Admin roster for active/unverified members and welcome emails.
- Zcash-inspired visual system using `#F5A800` as the primary gold.

## Membership Flow

1. User signs in by email.
2. User generates an X proof code.
3. User posts the generated proof text publicly on X.
4. User submits the X post URL.
5. Server verifies author/content/timing through the X API.
6. Membership becomes active automatically.

By default, membership remains valid if the proof post is later deleted. The setting is captured as `MEMBERSHIP_PROOF_RETENTION_POLICY=valid_if_deleted` so the policy can be changed later without redesigning the data model.

See [Social Proof Membership](docs/social-proof-membership.md) for implementation details.

## Environment

From the monorepo root, copy `apps/community/.env.example` to
`apps/community/.env.local` and set:

```bash
NEXT_PUBLIC_SITE_URL=https://community.pgpz.org
REGION_AWS=us-east-1
PGPZ_AWS_ACCESS_KEY_ID=...
PGPZ_AWS_SECRET_ACCESS_KEY=...
NEXTAUTH_TABLE=PGPZCommunityNextAuth
BETTER_AUTH_URL=https://community.pgpz.org
BETTER_AUTH_SECRET=...
BETTER_AUTH_TRUSTED_ORIGINS=https://community.pgpz.org
EMAIL_TRACKING_SECRET=...
X_BEARER_TOKEN=...
X_API_BASE_URL=https://api.x.com/2
X_API_TIMEOUT_MS=15000
X_PROOF_RATE_LIMIT_WINDOW_MINUTES=15
X_PROOF_CHALLENGE_RATE_LIMIT=10
X_PROOF_VERIFY_RATE_LIMIT=6
EMAIL_SERVER_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=...
EMAIL_SERVER_PASSWORD=...
EMAIL_FROM="PGPZ Community <no-reply@community.pgpz.org>"
```

`NEXTAUTH_TABLE` is retained as the legacy name of the shared application table; it does not indicate that NextAuth is still active. `EMAIL_TRACKING_SECRET` is required in production and does not fall back to an authentication secret there. It may initially retain the former `NEXTAUTH_SECRET` value for fingerprint continuity, but must remain stable because it also signs tracked links and email-only assets.

See the [Better Auth Direct Cutover Runbook](docs/BETTER_AUTH_PARALLEL_MIGRATION.md) for release and rollback criteria.

## DynamoDB

Create or verify the shared table:

```bash
REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZCommunityNextAuth \
  node apps/community/scripts/setup/create-dynamodb-tables.mjs
```

For AWS CLI operations in the existing environment, use:

```bash
aws sts get-caller-identity --profile zodldashboard --region us-east-1
```

## Development

The root workspace install and lockfile are authoritative. Run these commands
from the monorepo root; do not create an application-local lockfile or run a
separate install in `apps/community`.

```bash
npm ci
npm run dev:community
npm run test --workspace=apps/community
npm run build:community
npm run start:community
```

The former `serve out` script was intentionally removed. This application uses
the Next.js server runtime and does not configure `output: "export"`, so it does
not produce an `out/` directory; use `npm run start:community` after building.

## Forum Markdown Export

After an update has been uploaded and generated in the admin interface, use **Admin → Update distribution → Markdown** to copy and download a clean Markdown version for forum posting. The export uses direct links and public email-asset image URLs, with no tracking links, open pixel, unsubscribe link, or inline attachments.

The command-line exporter is available as a fallback:

```bash
AWS_PROFILE=pgpcommunity REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZCommunityNextAuth \
  npm run forum:update --workspace=apps/community -- \
  --slug 2026-06-15-weekly-policy-memo \
  --output output/zcash-forum-weekly-policy-memo-2026-06-15.md
```

If the local AWS SSO session is expired, refresh it first:

```bash
aws sso login --profile pgpcommunity
```

Before the generated record is available, the exporter can use the source PDF as a fallback while still pointing social images at the expected public email-asset URLs for that slug:

```bash
npm run forum:update --workspace=apps/community -- \
  --source pdf \
  --pdf "/path/to/weekly-policy-memo.pdf" \
  --slug 2026-06-15-weekly-policy-memo \
  --title "Weekly Policy Memo: June 15, 2026" \
  --published-at 2026-06-15 \
  --display-date "Week of June 15, 2026" \
  --summary "FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements" \
  --output output/zcash-forum-weekly-policy-memo-2026-06-15.md
```

## Deployment

The repository-root `amplify.yml` is authoritative for monorepo deployments;
`apps/community/amplify.yml` is retained only as a rollback reference during
the migration observation period. Configure the existing Community Amplify app
with `AMPLIFY_MONOREPO_APP_ROOT=apps/community`, keep its runtime environment
variables and IAM role application-specific, and follow the root
`docs/monorepo-migration-runbook.md` before reconnecting or deploying it.
