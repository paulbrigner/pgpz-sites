# `@pgpz/audit-log`

Application-neutral contracts for canonical, tamper-evident audit chains. The
package defines actors, targets, outcomes, canonical serialization, hash-chain
construction, verification, and an in-memory implementation for tests.

## Entry points

- `@pgpz/audit-log` exports client-safe domain types and canonical serialization.
- `@pgpz/audit-log/server` exports hashing, append/verification contracts, and
  the in-memory ledger. It is guarded by `server-only`.
- `@pgpz/audit-log/test` is reserved for package-boundary tests.

The package does not select a table, KMS key, archive bucket, actor policy,
retention rule, or application event taxonomy. Board supplies those adapters
and resources. Hash-chain integrity provides tamper evidence, not authorization
or immutable storage by itself.

## Consumers and validation

Board is the current production consumer. Its operational boundary is described
in `docs/board-deployment.md`.

```bash
npm run test --workspace=@pgpz/audit-log
npm run typecheck --workspace=@pgpz/audit-log
npm run test:board-backend-infra
```
