# Better Auth Direct Cutover Runbook

Status: Community and Coalition use Better Auth exclusively for new sign-ins, server session resolution, and sign-out. The legacy NextAuth route and runtime dependency are removed; a browser holding only a NextAuth cookie must complete one new magic-link sign-in.

Application identity, profiles, membership, referrals or invitations, and administrator authorization remain in the shared `USER#...` records. Better Auth users and sessions map to those records by normalized email, so the cutover does not migrate or discard membership data.

## Hardened runtime

- Better Auth is mounted at `/api/better-auth/[...all]`; `/api/auth/[...nextauth]` is not mounted.
- ID reads use the base-table key. Email, session-token, verification-identifier, and provider/account reads use `GSI1`; session/account ownership reads use sparse `GSI2` keys rather than table scans.
- Session and verification records write the epoch-second `expires` attribute used by DynamoDB TTL.
- Better Auth rate limiting uses a shared DynamoDB fixed-window counter with atomic conditional updates, so limits apply across serverless instances.
- The auth route normalizes CloudFront's immutable `CloudFront-Viewer-Address` into an internal bare-IP header. A single-value `X-Forwarded-For` remains a fail-closed fallback; spoofable multi-hop chains are rejected rather than trusted.
- Adapter, concurrency, session, and provider-telemetry tests cover the cutover contract.
- New access-log events identify Better Auth. Historical or unattributed events remain visible in the Admin Access Log.
- Profile email changes atomically update the normalized-email ownership claim, application user, Better Auth user/index, and token consumption. Email-change tokens retain the existing `VT#...` key shape.
- Every normalized email has one durable `EMAIL_OWNERSHIP#...` item. It can bind independent application and Better Auth IDs and is maintained in the same transaction as identity creation, email movement, or deletion. Use the root `docs/email-ownership-and-identity-reconciliation.md` runbook for backfill and audit ordering.

`GSI2` is reserved for session/account ownership. Arbitrary admin lists and unsupported bulk predicates retain a compatibility scan path; ID, interactive sign-in, session-token, provider/account, and user-ownership lookups must not scan. Follow the repository-root `docs/better-auth-user-index-runbook.md` for schema-first deployment, legacy-record backfill, and rollback.

## Required production configuration

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET` (at least 32 bytes)
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `NEXTAUTH_TABLE` (legacy variable name for the shared application table)
- `EMAIL_TRACKING_SECRET` (at least 32 bytes)
- optional `EMAIL_TRACKING_SECRET_PREVIOUS` (at least 32 bytes, verification only)
- `EMAIL_TRANSPORT=ses`
- the branch-level Amplify SSR Compute role and existing site URL variables

`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, static AWS access keys, and SES SMTP credentials are no longer serialized into the production runtime. Follow the repository-root signing-secret and compute-role runbook for cutover and rollback.

## Pre-deployment criteria

All criteria must pass in both applications:

1. `npm test`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` succeed.
2. Adapter contract tests prove that supported hot-key lookups use `Get` or `Query`, paginate correctly, preserve residual predicates, and consume one-time records once.
3. Durable rate-limit tests prove that separate storage instances share one atomic counter and enforce the configured maximum.
4. The DynamoDB table, `GSI1`, and `GSI2` are `ACTIVE`; the reverse-user backfill is complete; and TTL on `expires` is `ENABLED`.
5. Amplify has non-default Better Auth URL, secret, and trusted-origin values for each canonical domain.
6. Current and optional previous email-tracking secrets pass the production validator; saved links verify across a rehearsed current/previous-key swap.
7. Amplify provides a usable client IP; there is no evidence that unrelated visitors collapse into one rate-limit bucket.
8. A rollback commit is identified before deployment.

## Release verification

Deploy Coalition and Community together, then verify:

1. The Amplify job for each repository reaches `SUCCEED` at the expected commit.
2. `/signin` loads, `/api/better-auth/get-session` responds, and `/api/auth/[...nextauth]` is absent.
3. A returning member can request and consume a Better Auth magic link.
4. Both known administrators can sign in and retain administrator access.
5. A normal active member can reach member-only content but not administrator routes.
6. Signup/legal acceptance, invitation acceptance, manual approval, profile/email change, and sign-out work.
7. The Admin Access Log attributes new authenticated activity to Better Auth.
8. Post-deploy SSR logs contain neither Better Auth client-IP fallback warnings nor unexpected shared per-path rate-limit buckets.

Monitor authentication and authorization closely for the first 24 hours. Keep the prior known-good commits immediately deployable for 72 hours; this is a rollback window, not a dual-provider runtime.

## Rollback criteria

Rollback both applications if any of the following is confirmed:

- an administrator or active member cannot sign in;
- an authorization regression grants or removes protected access incorrectly;
- Better Auth API/session failures exceed 1% for 15 minutes with at least 20 attempts;
- internal magic-link send failures exceed 5% for 15 minutes, excluding recipient rejection or bounce;
- unrelated clients are rate-limited together because their IPs collapse into one bucket;
- profile/email changes create an identity mismatch or duplicate account.

## Rollback procedure

1. Revert the Better Auth-only cutover commit in each repository, or redeploy the recorded prior commit.
2. Push/release both applications and wait for both Amplify jobs to succeed.
3. Verify a new magic-link sign-in, `/api/auth/session/app`, member access, administrator access, and sign-out in each application.
4. Preserve Better Auth users, sessions, verifications, rate-limit items, access telemetry, and all application `USER` records for diagnosis.
5. Record the trigger, timestamps, affected flows, and evidence required before reattempting the cutover.

Do not delete or recreate the DynamoDB table during rollback. Despite its legacy `NEXTAUTH_TABLE` name, it remains the shared application data store.
