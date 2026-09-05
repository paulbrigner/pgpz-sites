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

Category filters use the `category` URL parameter (for example,
`/zec-shelf?category=Learning`). Selecting a category updates the current URL;
“All resources” removes that parameter. Browser Back/Forward restores the
selection. Matching ignores case, and unknown categories show all resources.
Apps may pass `initialCategory` for filtered server rendering and must preserve
the category in their own sign-in callback URL. Text search remains local.

The administrator client checks the catalog one resource per request, reports
progress, continues after individual failures, and reloads the persisted
results at the end. A consuming check route must accept `{ id }` and return
`{ results: [result] }` from `checker.checkOne(resource)`. It must reject requests
without an ID instead of checking the entire catalog within one HTTP request.
The checker limits page work (including DNS and all redirects) to 12 seconds
and page plus preview work to 20 seconds, leaving time for the app's session,
repository, and response handling. Preview failures preserve successful page
checks and the previous preview, and are reported to the administrator.
Each check also probes the saved preview with a bounded, redirect-free image
request. Unavailable previews trigger a fresh capture even when page content
is unchanged; newly captured images must be reachable before being saved.
These probes and captures share the existing 20-second budget. If an image
fails in the browser, the client tries the app's URL-matched bundled fallback
and then displays the resource initial. A later refreshed preview is retried.

Run the package contracts from the monorepo root:

```bash
npm run test --workspace=@pgpz/zec-shelf
npm run typecheck --workspace=@pgpz/zec-shelf
```

## License

This package is licensed under the GNU Affero General Public License, version
3 only (`AGPL-3.0-only`), under the repository's root [`LICENSE`](../../LICENSE).
