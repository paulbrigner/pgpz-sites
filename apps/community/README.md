# PGPZ Community

Community application for `community.pgpz.org`. It is a Next.js 15 application
with Better Auth magic-link sign-in and fail-closed X and ZcashMe social-proof
membership. It does not
use the former NFT, wallet, SIWE, token, allowance, or renewal model.

## Ownership and capabilities

Community owns:

- X proof challenge, discovery, verification, rate limits, and membership policy;
- ZcashMe OAuth/PKCE verification with allowlist or wildcard rollout controls plus an administrator no-write dry run;
- X Monitor and administrator-managed Topic Briefings integration;
- the Community ZEC Shelf catalog and access policy;
- referrals, Community copy/branding/legal identity, and Community infrastructure;
- the app-local protected member-profile adapter, consent, fields, routes, and
  Community-only vanity namespace;
- app adapters for shared auth, email, jobs, access log, files, notifications,
  admin UI, and policy-update distribution.

Current central feature switches enable the protected member directory, ZEC
Shelf, and public files. Letter sign-ons and the document vault remain disabled.
A package being available in the monorepo does not authorize enabling it here.

`/members` and `/members/[slug]` authorize an active Community member before
reading any profile. Profiles are off by default, use a sparse
`GSI1` projection plus an app-local conditional slug claim, and never expose
email, ZcashMe identity, or membership-proof data.

See [social-proof membership](docs/social-proof-membership.md) for the current
membership records and flow, and the root [architecture map](../../docs/architecture.md)
for shared-package boundaries.

## Runtime boundaries

- Better Auth users/sessions and application records use the Community table
  selected by the legacy-named `NEXTAUTH_TABLE` variable.
- Production DynamoDB, S3, SQS, and SESv2 access comes from Community's Amplify
  SSR compute role through the default AWS credential chain.
- Community buckets, queues, X credentials, signing secrets, member records,
  and authorization must never be reused by Coalition, Board, or Reference.
- Managed `/resources/...` files remain in a private bucket and are authorized
  by app routes. Do not add competing static files under `public/resources`.
- X Monitor is a separate read/manage API boundary. See
  [`docs/x-monitor-community-integration.md`](../../docs/x-monitor-community-integration.md).

## Configuration

Use `.env.example` as the production-shape inventory and `.env.local.example`
for offline development. Do not duplicate the entire variable list here; the
examples and server validators are authoritative.

Important groups are site/Better Auth, Community table and compute role, email
tracking/delivery, background jobs, X proof, X Monitor, policy-update storage,
and public-file storage. Production signing secrets must satisfy the root
production validator and `EMAIL_TRANSPORT` must be `ses`.

## Local development

Follow [`docs/local-dev.md`](../../docs/local-dev.md). From the repository root:

```bash
cp apps/community/.env.local.example apps/community/.env.local
docker compose up -d
npm run seed:local
npm run dev:community
```

Community runs at `http://localhost:3000`. Magic-link email is captured by
MailHog at `http://localhost:8025`. After the first local sign-in, grant admin:

```bash
npm run admin:community -- paul@paulbrigner.com
```

The X proof flow still needs a valid X API credential; unrelated local flows do
not. Background delivery jobs remain disabled in the offline configuration.

## Policy updates and files

New policy updates use DOCX as the canonical source. The admin flow uploads the
source, generates structured portal content and a PDF, allows review, then
publishes/sends through the durable workflow. Existing legacy PDF records remain
readable. The Markdown exporter is an operational fallback:

```bash
AWS_PROFILE=pgpcommunity REGION_AWS=us-east-1 \
NEXTAUTH_TABLE=PGPZCommunityNextAuth \
npm run forum:update --workspace=apps/community -- \
  --slug 2026-06-15-weekly-policy-memo \
  --output output/zcash-forum-weekly-policy-memo-2026-06-15.md
```

Administrators manage stable public or members-only downloads through **Admin ->
Public files**. Objects stay private; Archive removes route access without
deleting stored history.

## Validation and deployment

```bash
npm run test --workspace=apps/community
npm run typecheck:community
npm run build:community
npm run parity:check
```

Root `amplify.yml` is authoritative with
`AMPLIFY_MONOREPO_APP_ROOT=apps/community`. Before production changes, select
the relevant current runbook from [`docs/README.md`](../../docs/README.md),
inspect live branch variables/resources, and identify the rollback commit.
