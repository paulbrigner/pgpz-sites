# PGPZ Social Proof Membership

## Overview

PGPZ Community membership is based on verified social proof, not NFTs, wallets, or on-chain locks.

X is the generally available automated proof provider:

1. A signed-in user generates a one-time proof code.
2. The user publishes the generated text from their X account.
3. The user returns to the site.
4. The site can search X for the exact proof code, or the user can paste the X post URL.
5. The server verifies the post with the X API and activates membership.

The pasted URL flow remains the most reliable path, but the site also supports:

- A user-triggered **Find my X post** action.
- A scheduled background auto-verification job for pending proof codes.

Both discovery paths use exact one-time-code searches, exclude reposts and quotes, and still pass through the same proof transaction used by pasted URLs.

ZcashMe is an additional, fail-closed canary provider. An eligible user starts an
OAuth authorization-code flow with PKCE. ZcashMe adds the one-time PGPZ proof
link to the selected public profile, then PGPZ reads that public profile and
atomically activates membership. The signed OAuth-attempt cookie binds the PGPZ
user, mode, state, verifier, challenge, and ten-minute lifetime.

The public `/challenge/PGPZ-<code>` route explains the proof link but never
activates membership or reveals a PGPZ account. Activation occurs only in an
authenticated callback or manual verification request.

## Storage

The app uses the existing shared application DynamoDB table (still configured through the legacy `NEXTAUTH_TABLE` variable):

- `USER#<userId>` records store denormalized membership fields for fast sessions and admin lists.
- `SOCIAL_PROOF#USER#<userId>` records store challenge and proof audit records.
- `SOCIAL_PROOF#USER#<userId> / CURRENT_CHALLENGE` atomically permits only one active provider challenge per user.
- `GSI1PK = SOCIAL_PROOF#POST#<postId>` prevents one post from being claimed by multiple users.
- `SOCIAL_PROOF#POST#<postId>` claim records prevent direct post reuse.
- `SOCIAL_PROOF#X_AUTHOR#<authorId>` claim records prevent one X account from activating multiple memberships.
- `SOCIAL_PROOF#ZCASHME_ADDRESS#<addressHash>` claim records prevent one ZcashMe address from activating multiple memberships.
- `RATE_LIMIT#SOCIAL_PROOF#...` records enforce user/IP rate limits for challenge and verify requests.
- Pending challenge records also store bounded auto-verification metadata such as `autoVerifyUntilAt`, `autoVerifyNextCheckAt`, `autoVerifyAttemptCount`, and `autoVerifyLastStatus`.

Verified user fields include:

- `membershipStatus = active`
- `membershipProvider = x`
- `membershipVerifiedAt`
- `membershipProofPostUrl`
- `membershipProofPostId`
- `membershipProofHandle`
- `proofRetentionPolicy`

ZcashMe activations instead store `membershipProvider = zcashme`, the verified
public profile URL and username, and a ZcashMe address uniqueness claim. The raw
address is not used in the claim key.

## Retention Policy

The default `MEMBERSHIP_PROOF_RETENTION_POLICY` is `valid_if_deleted`.

That means membership remains active if the public X post is later deleted. The stored proof record keeps enough audit context to support a future policy change, such as periodic rechecks or admin review.

## Required Environment

- `NEXT_PUBLIC_SITE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `NEXTAUTH_TABLE`
- `REGION_AWS`
- `X_BEARER_TOKEN`
- `EMAIL_*` / `EMAIL_FROM`

Optional:

- `X_API_BASE_URL`
- `X_API_TIMEOUT_MS`
- `X_PROOF_CHALLENGE_TTL_MINUTES`
- `X_PROOF_RATE_LIMIT_WINDOW_MINUTES`
- `X_PROOF_CHALLENGE_RATE_LIMIT`
- `X_PROOF_VERIFY_RATE_LIMIT`
- `X_PROOF_AUTOVERIFY_WINDOW_MINUTES`
- `X_PROOF_AUTOVERIFY_BATCH_SIZE`
- `X_PROOF_AUTOVERIFY_GROUP_SIZE`
- `X_PROOF_AUTOVERIFY_MAX_ATTEMPTS`
- `SOCIAL_PROOF_AUTOVERIFY_SECRET` (required in production, at least 32 bytes)
- `SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS` (optional verification-only rotation key)
- `MEMBERSHIP_PROOF_RETENTION_POLICY`
- `ZCASHME_VERIFICATION_ENABLED` (defaults to `false`)
- `ZCASHME_VERIFICATION_ALLOWED_EMAILS` (comma, semicolon, or whitespace separated)
- `ZCASHME_ADMIN_DRY_RUN_ENABLED` (defaults to `false`)
- `ZCASHME_AUTH_ISSUER` (defaults to `https://auth.zcash.me`)
- `ZCASHME_DIRECTORY_URL` (defaults to `https://zcash.me`)
- `ZCASHME_API_TIMEOUT_MS` (defaults to `15000`)

## ZcashMe Rollout

Normal activation requires both `ZCASHME_VERIFICATION_ENABLED=true` and an exact,
case-insensitive email match in `ZCASHME_VERIFICATION_ALLOWED_EMAILS`. An empty
allowlist always denies activation, including when the global switch is on.
Every ZcashMe route rechecks this policy server-side.

`ZCASHME_ADMIN_DRY_RUN_ENABLED=true` exposes a separate control to active
administrators. The dry run completes real OAuth/PKCE and verifies the public
profile proof, but it does not create a challenge record, activate membership,
claim a ZcashMe address, or send signup notifications. The external ZcashMe
service does add or replace the PGPZ proof link on the selected public profile.

Registered callbacks are production Community and `http://localhost:3000`; an
Amplify preview callback is not required for this rollout. Validate with mocked
tests, localhost, the production admin dry run, and later a dedicated canary
account before adding user emails.

For an immediate kill switch, set `ZCASHME_VERIFICATION_ENABLED=false` and
`ZCASHME_ADMIN_DRY_RUN_ENABLED=false`. Reverting the application code is also
straightforward because the data model is additive. Neither action removes
already-created proof records, address claims, membership fields, or public
ZcashMe proof links; audit and remove those separately only if policy requires it.

## Background Verification

The protected endpoint is `POST /api/social-proof/x/autoverify`. It requires `Authorization: Bearer <SOCIAL_PROOF_AUTOVERIFY_SECRET>` or `x-pgpz-autoverify-secret`. During a rotation, the application accepts the current and one previous secret, while the trigger sends only its current value. Deploy the application with `current=new` and `previous=old` before updating the trigger to the new value; remove the previous value after the trigger and its retry window are verified.

Each run scans a capped batch of pending challenge records, groups several exact challenge-code searches into one X API recent-search request, and backs off each challenge after misses. Defaults are conservative:

- 24-hour verification window.
- 25 pending challenges per run.
- 5 challenge codes per X API search.
- 8 attempts per challenge.

This keeps the scheduled job useful for people who post and leave, while bounding X API usage.

## Access Control

Protected content endpoints should read the current `USER#<userId>` record before issuing a signed URL. Session tokens may contain denormalized membership fields for UI rendering, but signed content access should use the fresh DynamoDB membership state so revocation takes effect immediately.
