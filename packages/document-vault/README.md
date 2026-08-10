# `@pgpz/document-vault`

Neutral governance-document lifecycle and repository contracts. The package
models document metadata, staging/finalization states, authorization-independent
download behavior, and injected repository/storage interfaces.

## Entry points

- `@pgpz/document-vault` exports domain types and lifecycle rules.
- `@pgpz/document-vault/server` exports server-only repository/download
  behavior and an in-memory implementation.
- `@pgpz/document-vault/test` is reserved for package-boundary tests.

The package does not choose roles, tables, buckets, KMS keys, retention periods,
Object Lock policy, route responses, or audit semantics. Board owns those
decisions and injects its isolated infrastructure. Reference may demonstrate
neutral contracts but must not attach Board resources.

## Consumers and validation

```bash
npm run test --workspace=@pgpz/document-vault
npm run typecheck --workspace=@pgpz/document-vault
npm run test:board-backend-infra
npm run build:board
```

See `docs/board-deployment.md` for the current Board storage and retention
boundary. Do not infer live bucket or Object Lock state from package tests.
