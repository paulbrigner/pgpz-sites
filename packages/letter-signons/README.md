# `@pgpz/letter-signons`

Shared, provider-neutral contracts for PGPZ letter campaigns. The package owns
campaign state and deadline rules, signer identity validation, immutable
document-version acceptance rules, material-revision reconfirmation, and
brand-injected confirmation/update email rendering.

Each application remains responsible for its own authentication, membership
rules, DynamoDB records, PDF object storage, email transport, routes, and
administrative UI. Coalition is the first enabled consumer; Community registers
the feature switch but keeps it disabled until its launch is authorized.

```bash
npm run test --workspace=@pgpz/letter-signons
npm run typecheck --workspace=@pgpz/letter-signons
```
