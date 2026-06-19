# PGPZ Coalition

Membership site for `coalition.pgpz.org`, built with Next.js 15 and AWS Amplify.

The coalition site is a selective workspace for Zcash ecosystem partners involved in shaping crypto policy. It is intended for sharing policy resources, coordinating messaging, and organizing coalition campaigns that advance Zcash policy in Washington, DC.

## Features

- Email magic-link authentication with NextAuth.
- DynamoDB-backed user/profile/session persistence.
- Manual admin approval for coalition membership access.
- Admin-created invitations with one-time activation links and an `invited` state.
- Admin roster for pending, invited, active, and unapproved members with expandable member details.
- Welcome, invitation, newsletter, and policy-update email tooling backed by AWS SES SMTP.
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

Copy `.env.example` and set:

```bash
NEXT_PUBLIC_SITE_URL=https://coalition.pgpz.org
REGION_AWS=us-east-1
PGPZ_AWS_ACCESS_KEY_ID=...
PGPZ_AWS_SECRET_ACCESS_KEY=...
NEXTAUTH_URL=https://coalition.pgpz.org
NEXTAUTH_SECRET=...
NEXTAUTH_TABLE=PGPZCoalitionNextAuth
EMAIL_SERVER_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=...
EMAIL_SERVER_PASSWORD=...
EMAIL_FROM="PGPZ Coalition <no-reply@coalition.pgpz.org>"
```

## DynamoDB

Create or verify the table:

```bash
REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZCoalitionNextAuth node scripts/setup/create-dynamodb-tables.mjs
```

For AWS CLI operations in the existing environment, use:

```bash
aws sts get-caller-identity --profile zodldashboard --region us-east-1
```

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

## Deployment

The app is configured for AWS Amplify via `amplify.yml`. Runtime environment variables should be configured in the Amplify app before deployment.

## Design Resources

See [PGPZ UX Enhancement Process](docs/ux-enhancement-process.md) for the Coalition Figma resource structure, capture workflow, and handoff process.
