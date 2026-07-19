# Better Auth reverse-user index migration

## Purpose and storage contract

Better Auth removes sessions and linked provider accounts by `userId`. The shared
adapter stores those records in the application auth table, while their existing
`GSI1` keys remain reserved for unique token and provider/account lookups. A
sparse `GSI2` removes the remaining table scan from user-owned session/account
operations:

| Model | `GSI2PK` | `GSI2SK` |
| --- | --- | --- |
| `better_auth_sessions` | `BETTER_AUTH#better_auth_sessions#userId#<userId>` | `<session id>` |
| `better_auth_accounts` | `BETTER_AUTH#better_auth_accounts#userId#<userId>` | `<account id>` |

Other records omit these attributes and therefore do not occupy the index. The
index is named `GSI2`, uses `GSI2PK`/`GSI2SK`, and projects `ALL` attributes.

## Safety boundaries

`tooling/manage-better-auth-user-index.mjs` is read-only unless both `--apply`
and the application/phase-specific confirmation phrase are supplied. It accepts
only the two pinned production targets:

- `PGPZCommunityNextAuth`, `us-east-1`, account `860091316962`.
- `PGPZCoalitionNextAuth`, `us-east-1`, account `860091316962`.

Before any write, the tool verifies the caller account, exact table ARN,
`PAY_PER_REQUEST` billing, `pk`/`sk`, and the existing `GSI1`. Backfill is
refused unless the table and `GSI2` are both `ACTIVE`; any malformed owned
record blocks the whole apply. Updates are conditional on the observed record
identity, `userId`, and prior derived keys.

## Required deployment order

Use this order for both applications: **schema first, backfill second, adapter
code last**. Complete each stage for both tables before moving to the next
stage. This prevents a deployed adapter from querying an absent index or from
temporarily hiding legacy records that have not received sparse keys.

### 1. Validate the contracts locally

```sh
npm run typecheck --workspace=@pgpz/auth-dynamodb
npm test --workspace=@pgpz/auth-dynamodb
npm run test:better-auth-user-index-tooling
```

The DynamoDB Local contract is also required in CI. When running it manually,
start the same DynamoDB Local endpoint used by CI, then run:

```sh
PGPZ_DYNAMODB_INTEGRATION_REQUIRED=1 \
PGPZ_DYNAMODB_INTEGRATION_ENDPOINT=http://127.0.0.1:8000 \
npm run test:integration --workspace=@pgpz/auth-dynamodb
```

### 2. Create and validate `GSI2`

Dry-run Community, apply with the exact confirmation, then re-run the dry-run:

```sh
npm run migrate:better-auth-user-index -- \
  --app community --phase schema --profile pgpcommunity

npm run migrate:better-auth-user-index -- \
  --app community --phase schema --profile pgpcommunity \
  --apply --confirm ENSURE-COMMUNITY-BETTER-AUTH-GSI2

npm run migrate:better-auth-user-index -- \
  --app community --phase schema --profile pgpcommunity
```

Repeat for Coalition:

```sh
npm run migrate:better-auth-user-index -- \
  --app coalition --phase schema --profile pgpcommunity

npm run migrate:better-auth-user-index -- \
  --app coalition --phase schema --profile pgpcommunity \
  --apply --confirm ENSURE-COALITION-BETTER-AUTH-GSI2

npm run migrate:better-auth-user-index -- \
  --app coalition --phase schema --profile pgpcommunity
```

Do not start backfill until both final dry-runs report `already-active`.

### 3. Backfill existing sessions and accounts

Community:

```sh
npm run migrate:better-auth-user-index -- \
  --app community --phase backfill --profile pgpcommunity

npm run migrate:better-auth-user-index -- \
  --app community --phase backfill --profile pgpcommunity \
  --apply --confirm BACKFILL-COMMUNITY-BETTER-AUTH-GSI2

npm run migrate:better-auth-user-index -- \
  --app community --phase backfill --profile pgpcommunity
```

Coalition:

```sh
npm run migrate:better-auth-user-index -- \
  --app coalition --phase backfill --profile pgpcommunity

npm run migrate:better-auth-user-index -- \
  --app coalition --phase backfill --profile pgpcommunity \
  --apply --confirm BACKFILL-COALITION-BETTER-AUTH-GSI2

npm run migrate:better-auth-user-index -- \
  --app coalition --phase backfill --profile pgpcommunity
```

Both final summaries must report `planned: 0`, `invalid: 0`, and `failed: 0`.
`alreadyIndexed` should equal the number of owned records found. A conditional
race is safe but leaves the run incomplete; rerun the dry-run and apply until
the final state satisfies those gates.

### 4. Deploy the adapter code

Only after both tables satisfy the schema and backfill gates, merge/push the
application commit and allow the normal Community and Coalition Amplify builds
to deploy it. Verify both builds use the same commit. No email delivery is
needed for this migration check.

Post-deployment verification should cover:

- normal sign-in/session resolution for the two administrator test accounts;
- indexed session enumeration and revocation by `userId` in a non-production or
  DynamoDB Local contract;
- linked-account enumeration/deletion by `userId` in the adapter contract;
- absence of DynamoDB `ValidationException`, missing-index, throttling, or auth
  error spikes in both application logs.

## Cutover and rollback criteria

Cut over only when both `GSI2` indexes are `ACTIVE`, both final backfill
dry-runs are clean, package/unit/integration contracts pass, and both
applications are deploying the same reviewed adapter version.

Roll back the application code immediately if either site shows missing-index
errors, previously valid sessions/accounts disappear, session revocation fails,
or sign-in error rates materially increase. Rollback means redeploying the last
known-good application commit; leave `GSI2` and its derived attributes in place.
They are ignored by the previous adapter and are safe to retain, while deleting
an index during an incident adds risk and blocks a fast forward recovery. After
rollback, rerun both schema and backfill dry-runs, diagnose the discrepancy, and
repeat the same gated sequence before trying the code deployment again.
