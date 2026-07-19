# PGPZ Coalition

Membership site for `coalition.pgpz.org`, built with Next.js 15 and AWS Amplify.

The coalition site is a selective workspace for Zcash ecosystem partners involved in shaping crypto policy. It is intended for sharing policy resources, coordinating messaging, and organizing coalition campaigns that advance Zcash policy in Washington, DC.

## Features

- Email magic-link authentication with Better Auth.
- DynamoDB-backed user/profile/session persistence.
- Manual admin approval for coalition membership access.
- Admin-created invitations with one-time activation links and an `invited` state.
- Admin roster for pending, invited, active, and unapproved members with expandable member details.
- Bulk invite action for outstanding invite-able members that have not already received an invitation email.
- Welcome, invitation, newsletter, and policy-update email tooling backed by AWS SES SMTP.
- Admin-editable invitation email template language for launch and future invite cohorts, including draft test sends and safe Markdown formatting.
- Policy update archive with recurring weekly updates and featured/special updates.
- Email open, click, unsubscribe, delivery, and send-run stats for newsletters and policy updates.
- Active-member directory for members who opt into sharing contact details, including LinkedIn profiles and X handles when provided.
- Members-only Signal group CTA with a scan-ready QR code on the authenticated home screen.
- Zcash-inspired visual system using `#F5A800` as the primary gold with a distinct civic green/teal coalition palette.

## Membership Flow

1. User requests access with email, profile details, corporate affiliation, job title, LinkedIn URL, X handle, and directory preference.
2. User confirms the email magic link.
3. User submits a coalition approval request.
4. A PGPZ admin reviews the request.
5. Admin approval activates coalition membership.
6. Approved members can return to the partner workspace.

Admins can also create a member directly from the admin roster. New admin-created members start as `invited`; they are excluded from active-member email sends, the member directory, and other active-member workflows until they activate the account from the invitation email.

There is no X social-proof approval path in this app.

See [Manual Approval Membership](docs/manual-approval-membership.md) for implementation details.

## Environment

From the monorepo root, copy `apps/coalition/.env.example` to
`apps/coalition/.env.local` and set:

```bash
NEXT_PUBLIC_SITE_URL=https://coalition.pgpz.org
REGION_AWS=us-east-1
PGPZ_AWS_ACCESS_KEY_ID=...
PGPZ_AWS_SECRET_ACCESS_KEY=...
NEXTAUTH_TABLE=PGPZCoalitionNextAuth
BETTER_AUTH_URL=https://coalition.pgpz.org
BETTER_AUTH_SECRET=...
BETTER_AUTH_TRUSTED_ORIGINS=https://coalition.pgpz.org
EMAIL_TRACKING_SECRET=...
EMAIL_SERVER_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=...
EMAIL_SERVER_PASSWORD=...
EMAIL_FROM="PGPZ Coalition <no-reply@coalition.pgpz.org>"
```

`NEXTAUTH_TABLE` is retained as the legacy name of the shared application table; it does not indicate that NextAuth is still active. `EMAIL_TRACKING_SECRET` is required in production and does not fall back to an authentication secret there. It may initially retain the former `NEXTAUTH_SECRET` value for fingerprint continuity, but must remain stable because it also signs tracked links and email-only assets.

See the [Better Auth Direct Cutover Runbook](docs/BETTER_AUTH_PARALLEL_MIGRATION.md) for release and rollback criteria.

## DynamoDB

Create or verify the table:

```bash
REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZCoalitionNextAuth \
  node apps/coalition/scripts/setup/create-dynamodb-tables.mjs
```

For AWS CLI operations in the existing environment, use:

```bash
aws sts get-caller-identity --profile zodldashboard --region us-east-1
```

## Development

The root workspace install and lockfile are authoritative. Run these commands
from the monorepo root; do not create an application-local lockfile or run a
separate install in `apps/coalition`.

```bash
npm ci
npm run dev:coalition
npm run test --workspace=apps/coalition
npm run build:coalition
npm run start:coalition
```

The former `serve out` script was intentionally removed. This application uses
the Next.js server runtime and does not configure `output: "export"`, so it does
not produce an `out/` directory; use `npm run start:coalition` after building.

## Deployment

The repository-root `amplify.yml` is authoritative for monorepo deployments;
`apps/coalition/amplify.yml` is retained only as a rollback reference during
the migration observation period. Configure the existing Coalition Amplify app
with `AMPLIFY_MONOREPO_APP_ROOT=apps/coalition`, keep its runtime environment
variables and IAM role application-specific, and follow the root
`docs/monorepo-migration-runbook.md` before reconnecting or deploying it.

## Design Resources

See [PGPZ UX Enhancement Process](docs/ux-enhancement-process.md) for the Coalition Figma resource structure, capture workflow, and handoff process.
