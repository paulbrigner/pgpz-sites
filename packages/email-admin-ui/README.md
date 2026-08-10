# @pgpz/email-admin-ui

Shared client UI for newsletter drafting, audience selection, delivery, and
send-history reporting. Applications inject their existing button primitive and
may override API paths while retaining control of authentication and server-side
newsletter behavior.

The package imports shared primitives from `@pgpz/ui`; it does not fetch member
data or authorize sends itself.

```bash
npm run test --workspace=@pgpz/email-admin-ui
npm run typecheck --workspace=@pgpz/email-admin-ui
```
