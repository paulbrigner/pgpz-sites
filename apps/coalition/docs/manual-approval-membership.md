# PGPZ Coalition Manual Approval Membership

PGPZ Coalition membership is activated by admin review. The app intentionally does not include an X social-proof approval path.

## Flow

1. A prospective member creates a profile and signs in with an email magic link.
2. The home screen prompts the user to request coalition approval.
3. `POST /api/manual-approval/request` marks the user record as `manualApprovalStatus = pending`.
4. The admin roster surfaces pending requests.
5. `POST /api/admin/members/manual-approval` activates membership with `membershipProvider = manual`.

## DynamoDB Records

- User records store `membershipStatus`, `membershipProvider`, `membershipVerifiedAt`, and manual approval timestamps.
- Pending profile records store first name, last name, LinkedIn URL, legal acceptance, and the signup profile id until the email magic link is completed.
- Email event records log magic-link and welcome-email outcomes for admin review.

## Admin Review

Admins can filter the roster to manual requests, inspect profile details, approve membership, and send welcome emails. Approval is intentionally explicit so coalition access remains limited to selected Zcash ecosystem partners working on crypto policy.

## Required Environment

- `NEXT_PUBLIC_SITE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_TABLE`
- `REGION_AWS`
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_FROM`
