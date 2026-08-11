# PGPZ Coalition

Selective partner workspace for `coalition.pgpz.org`, built with Next.js 15.
Members authenticate with Better Auth magic links and become active through an
administrator-approved application or an administrator-created invitation.
There is no X social-proof membership path.

## Ownership and capabilities

Coalition owns:

- application, approval, invitation, activation, and membership policy;
- policy interest groups and the opt-in active-member directory;
- protected `/members/[slug]` vanity profiles in the Coalition-only slug
  namespace;
- letter campaigns and exact-document sign-on workflows;
- invitation templates and Coalition-specific email rendering/audiences;
- Coalition-to-Community sync policy and Coalition infrastructure;
- app adapters for shared auth, email, jobs, access log, files, notifications,
  admin UI, and policy-update distribution.

Current central feature switches enable public files and letter sign-ons. ZEC
Shelf and the document vault are disabled.

The existing `memberDirectoryOptIn` consent remains authoritative. Vanity
profiles preserve its active-member-only audience and current field set. The
directory remains compatible with records that have not yet received a slug;
use the guarded [slug backfill runbook](../../docs/member-profile-slug-backfill.md)
before treating vanity coverage as complete.

See [manual approval membership](docs/manual-approval-membership.md) for the
current membership and invitation contracts.

## Runtime boundaries

- Better Auth and application records use Coalition's table selected by
  `NEXTAUTH_TABLE`; the legacy name does not mean NextAuth is active.
- Production DynamoDB, S3, SQS, and SESv2 access comes from Coalition's Amplify
  SSR compute role and default AWS credential chain.
- Invitations are not active memberships. Invited users stay out of active
  audiences, the member directory, and member-only workflows until activation.
- Community sync is one-way, explicit, and job-backed. It does not merge tables,
  sessions, roles, or Coalition-only fields.
- Managed files and letter documents remain in private Coalition storage and are
  delivered through authorized app routes.

## Configuration

Use `.env.example` for the production-shape inventory and `.env.local.example`
for offline development. Important groups are site/Better Auth, Coalition table
and compute role, email tracking/delivery, durable jobs, Community sync,
policy-update/public-file storage, and letter-sign-on storage.

Production requires valid signing secrets, `EMAIL_TRANSPORT=ses`, and app-owned
AWS resources. Never serialize SMTP credentials or static AWS keys into a
production build.

## Local development

Follow [`docs/local-dev.md`](../../docs/local-dev.md). From the root:

```bash
cp apps/coalition/.env.local.example apps/coalition/.env.local
docker compose up -d
npm run seed:local
npm run dev:coalition
```

Coalition runs at `http://localhost:3001`; MailHog is at
`http://localhost:8025`. Complete one magic-link sign-in, then grant admin:

```bash
npm run admin:coalition -- paul@paulbrigner.com
```

Offline config disables durable delivery jobs. Do not use local testing as
evidence that live SQS/Lambda infrastructure is configured.

## Validation and deployment

```bash
npm run test --workspace=apps/coalition
npm run typecheck:coalition
npm run build:coalition
npm run parity:check
```

Root `amplify.yml` is authoritative with
`AMPLIFY_MONOREPO_APP_ROOT=apps/coalition`. Use the current runbook selected
from [`docs/README.md`](../../docs/README.md), inspect live Amplify/AWS state,
and identify the rollback target before production work.

The [UX enhancement process](docs/ux-enhancement-process.md) documents the
app's design capture and handoff workflow.
