# PGPZ Coalition Membership

PGPZ Coalition membership can be activated through manual admin approval or through an admin-created invitation. The app intentionally does not include an X social-proof approval path.

## Manual Approval Flow

1. A prospective member creates a profile with name, corporate affiliation, job title, LinkedIn URL, X handle, directory preference, and legal acceptance.
2. The home screen prompts the user to request coalition approval.
3. `POST /api/manual-approval/request` marks the user record as `manualApprovalStatus = pending`.
4. The admin roster surfaces pending requests.
5. `POST /api/admin/members/manual-approval` activates membership with `membershipProvider = manual`.

## Admin Invitation Flow

1. An admin adds a member from `/admin` with email, name, corporate affiliation, job title, LinkedIn URL, X handle, and directory preference.
2. `POST /api/admin/members` creates the member with `membershipStatus = invited` and `membershipProvider = admin_invite`.
3. The admin can edit the invitation email template from the user-management admin screen and send a draft copy before saving. The saved template controls future invitation sends and supports `[Name]`, `[First Name]`, `[Last Name]`, and `[Activation Link]` placeholders, plus safe Markdown for links, bold, italic, inline code, and simple lists.
4. The admin can send or resend an invitation email from the roster.
5. `POST /api/admin/email/send` creates a one-time activation token and sends a branded activation email with a conspicuous activation button inserted after the greeting.
6. `GET /api/invitations/activate?token=...` activates the member, changes `membershipStatus` to `active`, records `invitationAcceptedAt`, and invalidates the token.

Invited members are not active members. They are excluded from newsletter and policy-update audiences, member-directory results, and active-member calls to action until activation is complete.

## DynamoDB Records

- User records store `membershipStatus`, `membershipProvider`, `membershipVerifiedAt`, `company`, `jobTitle`, `linkedinUrl`, `xHandle`, `memberDirectoryOptIn`, invitation timestamps, and manual approval timestamps.
- Pending profile records store first name, last name, corporate affiliation, job title, LinkedIn URL, X handle, directory preference, legal acceptance, and the signup profile id until the email magic link is completed.
- Invitation token records store a hashed one-time activation token with a 14-day expiry.
- Email event, newsletter send-run, policy-update send-run, and email tracking records log delivery, open, click, unsubscribe, and failure outcomes for admin review.

## Admin Review

Admins can filter the roster to manual requests, invited members, active members, or unapproved members. The roster supports expandable member details, admin notes, manual approval, welcome email sends, editable invitation template language, draft template sends, and invitation email sends. Approval and activation are intentionally explicit so coalition access remains limited to selected Zcash ecosystem partners working on crypto policy.

## Member Directory

Active members can view contact details for other active members who opted into the directory. The directory shows name, email, corporate affiliation, job title, LinkedIn URL, and X handle. Members who do not opt in are not listed.

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
