# `@pgpz/auth-dynamodb`

Injected DynamoDB persistence contracts for Better Auth.

The package exports factories rather than application singletons:

- `createBetterAuthDynamoDBAdapter({ documentClient, tableName })`
- `createBetterAuthAdapterImplementation({ documentClient, tableName })`
- `createBetterAuthDynamoDBRateLimitStorage({ documentClient, tableName })`

Unique indexed lookups use the injected `GSI1` name by default. Session and
account ownership lookups use the sparse injected `GSI2` name by default. ID
lookups use the base key, and only unsupported query shapes use a compatibility
scan. Session and verification records receive DynamoDB TTL values. Rate-limit
keys are hashed and counters are updated atomically in DynamoDB, so limits
remain shared across serverless instances. Existing production tables must
follow the repository-root `docs/better-auth-user-index-runbook.md` before
deploying `GSI2` reads.

Applications that maintain a canonical email-ownership record inject a
`userEmailOwnership` policy. User creation, email changes, and identity deletion
then transact the Better Auth record and ownership claim together. Generic
updates use optimistic versions, while compatible ID-addressed counter updates
use DynamoDB `ADD` so concurrent requests cannot lose increments.

The fast contract suite uses an in-memory client. The integration suite creates
a temporary table against an explicit AWS-compatible endpoint and exercises the
same adapter with real DynamoDB expressions and transactions:

```sh
docker run --rm -p 8000:8000 amazon/dynamodb-local:latest
PGPZ_DYNAMODB_INTEGRATION_ENDPOINT=http://127.0.0.1:8000 \
  PGPZ_DYNAMODB_INTEGRATION_REQUIRED=1 \
  npm run test:integration --workspace=@pgpz/auth-dynamodb
```

Without `PGPZ_DYNAMODB_INTEGRATION_ENDPOINT`, those emulator tests are reported
as skipped. CI or release validation can set `PGPZ_DYNAMODB_INTEGRATION_REQUIRED=1`
to fail rather than silently omit a requested integration run.

No environment variable, application alias, table singleton, branded model,
membership workflow, or infrastructure client is selected by this package.
