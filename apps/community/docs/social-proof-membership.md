# PGPZ Social Proof Membership

## Overview

PGPZ Community membership is based on verified social proof, not NFTs, wallets, or on-chain locks.

For V1, X is the automated proof provider:

1. A signed-in user generates a one-time proof code.
2. The user publishes the generated text from their X account.
3. The user pastes the X post URL into the site.
4. The server verifies the post with the X API and activates membership.

## Storage

The app uses the existing NextAuth DynamoDB table:

- `USER#<userId>` records store denormalized membership fields for fast sessions and admin lists.
- `SOCIAL_PROOF#USER#<userId>` records store challenge and proof audit records.
- `GSI1PK = SOCIAL_PROOF#POST#<postId>` prevents one post from being claimed by multiple users.

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

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_TABLE`
- `REGION_AWS`
- `X_BEARER_TOKEN`
- `EMAIL_*` / `EMAIL_FROM`

Optional:

- `X_API_BASE_URL`
- `X_API_TIMEOUT_MS`
- `X_PROOF_CHALLENGE_TTL_MINUTES`
- `MEMBERSHIP_PROOF_RETENTION_POLICY`
