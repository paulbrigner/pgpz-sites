# `@pgpz/zec-shelf`

Reusable ZEC Shelf domain, client, and server behavior for PGPZ applications.
The package deliberately contains no site catalog, membership policy, app
alias, DynamoDB singleton, secret, route, navigation entry, or branded asset.

## Entry points

- `@pgpz/zec-shelf` exports resource/configuration types, draft validation, and
  ordering behavior.
- `@pgpz/zec-shelf/client` exports the configurable client interface.
- `@pgpz/zec-shelf/server` exports injected repository and checker factories.

Each application supplies its own `ZecShelfClientConfig`, seed resources,
access/session checks, API routes, `DocumentClient`, table and partition key,
theme values, preview assets, and optional Microlink credential. Bundled
fallback previews include their canonical source URL, so changing an entry's
URL cannot display a stale screenshot. The server checker resolves and
validates public addresses, pins its HTTPS connection to the validated address,
and repeats that validation for every redirect. Community intentionally
keeps the existing `ZEC_SHELF` partition key and stored item shapes so this
extraction requires no production data migration. A future Coalition catalog
should provide different seed/configuration data and either use Coalition's
separate table or a distinct partition key.

## Consumer setup

A Next.js application consuming the client must:

- declare `@pgpz/zec-shelf` directly and add it to `transpilePackages`;
- add the package source to Tailwind v4 scanning, for example
  `@source "../../../packages/zec-shelf/src"` from an app stylesheet; and
- allow `https://**.microlink.io` in `images.remotePatterns` when the injected
  checker captures Microlink previews.

The application must also own the routes that call the repository/checker and
enforce its membership and administrator policy before invoking them.

Run the package contracts from the monorepo root:

```bash
npm run test --workspace=@pgpz/zec-shelf
npm run typecheck --workspace=@pgpz/zec-shelf
```

## License

This package is available under either the MIT License or the Apache License
2.0 (`MIT OR Apache-2.0`) under the repository's root license files.
