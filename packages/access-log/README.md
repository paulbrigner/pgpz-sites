# `@pgpz/access-log`

Shared access-event persistence, request metadata normalization, route handlers,
page-view tracking, and administration UI for Community and Coalition.

Applications configure their own DynamoDB client and table, and inject their
session resolver, administrator authorization, error types, and UI primitives.
The package does not share event data, sessions, or authorization between apps.

Entry points separate domain types (`@pgpz/access-log`), client factories
(`@pgpz/access-log/client`), route factories, and the configured server runtime.
App adapters must configure the runtime before calling repository functions.

```bash
npm run test --workspace=@pgpz/access-log
npm run typecheck --workspace=@pgpz/access-log
```
