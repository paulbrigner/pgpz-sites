# `@pgpz/signup-notifications`

Shared administrator signup-notification preferences, recipient selection,
durable-job creation, email rendering flow, route handlers, and administration
UI for Community and Coalition.

Applications inject their own DynamoDB table, site identity, branded email
renderers, successful-join policy, background-job queue, and authorization.
The package does not share member records, delivery state, or configuration.

Entry points separate domain/UI exports, client factories, route factories, and
the server runtime so browser code cannot import server-only dependencies.

```bash
npm run test --workspace=@pgpz/signup-notifications
npm run typecheck --workspace=@pgpz/signup-notifications
```
