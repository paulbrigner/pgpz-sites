# `@pgpz/core`

App-independent configuration and membership contracts for PGPZ sites.

- `@pgpz/core` is client-safe. It exports the strict `SiteConfig` schema,
  membership-mode and feature-switch types, and navigation helpers.
- `@pgpz/core/server` imports `server-only`. It exports injected infrastructure
  configuration, membership resolution, and the shared policy-update DOCX/PDF
  pipeline. It never reads environment variables or chooses an application's
  table, sender, storage, authentication adapter, or workflow.

Applications own their branding, legal identity, environment mapping,
infrastructure clients, membership behavior, and seed content.

Branded applications that have not yet adopted a complete `SiteConfig` use
`defineFeatureSwitches` for the same registered feature names. This keeps
enablement explicit per site while allowing storage, metadata, authorization,
and presentation adapters to remain application-owned.

The DOCX parser enforces package/expansion limits, rejects macros, and reads
dimensions only from bounded, signature-validated PNG/JPEG headers. Apps remain
responsible for administrator authorization, private object storage, and
publishing policy.

```bash
npm run test --workspace=@pgpz/core
npm run typecheck --workspace=@pgpz/core
```
