# `@pgpz/core`

App-independent configuration and membership contracts for PGPZ sites.

- `@pgpz/core` is client-safe. It exports the strict `SiteConfig` schema,
  membership-mode and feature-switch types, and navigation helpers.
- `@pgpz/core/server` imports `server-only`. It exports injected infrastructure
  configuration and a narrow membership-resolution contract. It never reads
  environment variables or chooses an application's table, sender, storage,
  authentication adapter, or workflow.

Applications own their branding, legal identity, environment mapping,
infrastructure clients, membership behavior, and seed content.
