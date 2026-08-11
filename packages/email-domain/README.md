# @pgpz/email-domain

Shared, application-neutral email contracts and pure domain behavior for PGPZ
sites. The package intentionally excludes persistence, authentication, roster
selection, transport configuration, and Next.js route handlers.

Applications provide environment-bound secrets and persistence adapters while
reusing this package for preference interpretation, link capabilities, tracking
record normalization, newsletter validation, and policy-update history grouping.

```bash
npm run test --workspace=@pgpz/email-domain
npm run typecheck --workspace=@pgpz/email-domain
```
