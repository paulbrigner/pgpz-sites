# PGPZ Social Proof Membership

## Overview

PGPZ Community membership is based on verified social proof, not NFTs, wallets, or on-chain locks.

For V1, X is the automated proof provider:

1. A signed-in user generates a one-time proof code.
2. The user publishes the generated text from their X account.
3. The user returns to the site.
4. The site can search X for the exact proof code, or the user can paste the X post URL.
5. The server verifies the post with the X API and activates membership.

The pasted URL flow remains the most reliable path, but the site also supports:

- A user-triggered **Find my X post** action.
- A scheduled background auto-verification job for pending proof codes.

Both discovery paths use exact one-time-code searches, exclude reposts and quotes, and still pass through the same proof transaction used by pasted URLs.

## Storage

The app uses the existing shared application DynamoDB table (still configured through the legacy `NEXTAUTH_TABLE` variable):

- `USER#<userId>` records store denormalized membership fields for fast sessions and admin lists.
- `SOCIAL_PROOF#USER#<userId>` records store challenge and proof audit records.
- `GSI1PK = SOCIAL_PROOF#POST#<postId>` prevents one post from being claimed by multiple users.
- `SOCIAL_PROOF#POST#<postId>` claim records prevent direct post reuse.
- `SOCIAL_PROOF#X_AUTHOR#<authorId>` claim records prevent one X account from activating multiple memberships.
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
- `SOCIAL_PROOF_AUTOVERIFY_SECRET`
- `MEMBERSHIP_PROOF_RETENTION_POLICY`

## Background Verification

The protected endpoint is `POST /api/social-proof/x/autoverify`. It requires `Authorization: Bearer <SOCIAL_PROOF_AUTOVERIFY_SECRET>` or `x-pgpz-autoverify-secret`.

Each run scans a capped batch of pending challenge records, groups several exact challenge-code searches into one X API recent-search request, and backs off each challenge after misses. Defaults are conservative:

- 24-hour verification window.
- 25 pending challenges per run.
- 5 challenge codes per X API search.
- 8 attempts per challenge.

This keeps the scheduled job useful for people who post and leave, while bounding X API usage.

## Access Control

Protected content endpoints should read the current `USER#<userId>` record before issuing a signed URL. Session tokens may contain denormalized membership fields for UI rendering, but signed content access should use the fresh DynamoDB membership state so revocation takes effect immediately.
