# @pgpz/email-runtime

Dependency-injected server behavior shared by the PGPZ Community and Coalition
applications.

The package owns newsletter persistence, email tracking persistence, policy
update email-log projections, and email background-job processing. Each
application remains responsible for configuring its own DynamoDB client and
table, email transport, secrets, roster policy, rendering, and background-job
adapters.

Next.js route files remain application-owned adapters. The shared newsletter
handler factory accepts request/response, auth, roster, transport, rendering,
and persistence dependencies from each application.

The runtime builds on `@pgpz/email-domain` and `@pgpz/background-jobs`. It must
not select an app table, sender, queue, or membership audience.

```bash
npm run test --workspace=@pgpz/email-runtime
npm run typecheck --workspace=@pgpz/email-runtime
```
