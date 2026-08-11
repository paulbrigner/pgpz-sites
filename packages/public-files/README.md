# `@pgpz/public-files`

Shared public-file domain, repository runtime, and administration UI for the
Community and Coalition applications.

- Import pure path, content-type, and metadata behavior from `@pgpz/public-files`.
- Configure and import the injected DynamoDB repository through
  `@pgpz/public-files/server`.
- Create dependency-injected administration and resource-delivery handlers from
  `@pgpz/public-files/server`; application routes supply auth, feature flags,
  response construction, and S3 operations.
- Bind application UI primitives with `createPublicFileLibraryPanel` from
  `@pgpz/public-files/client`.

Feature flags, authorization, AWS clients, deployment configuration, and thin
Next.js route adapters remain application-owned.

```bash
npm run test --workspace=@pgpz/public-files
npm run typecheck --workspace=@pgpz/public-files
```
