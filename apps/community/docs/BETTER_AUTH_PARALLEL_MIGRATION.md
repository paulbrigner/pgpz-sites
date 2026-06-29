# Better Auth Parallel Migration

Status: Better Auth is mounted in parallel with the existing NextAuth/Auth.js route.

The production sign-in form now starts Better Auth email magic-link sign-ins through `/api/better-auth/sign-in/magic-link`. The legacy `/api/auth/[...nextauth]` route remains mounted during the rollback window and existing session bridge period.

## Shape

- Better Auth is mounted at `/api/better-auth/[...all]`.
- NextAuth remains mounted at `/api/auth/[...nextauth]`.
- Better Auth stores separate records in the existing DynamoDB table with `BETTER_AUTH#...` item types.
- The existing `USER#<id>` records remain the app-level profile, membership, admin, and authorization source of truth.
- A compatibility app-session resolver checks NextAuth first, then Better Auth, and maps Better Auth users back to existing `USER` records by email.

## Required Environment

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_TRUSTED_ORIGINS`

Keep `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_TABLE` configured until the legacy route and rollback bridge are intentionally removed.
