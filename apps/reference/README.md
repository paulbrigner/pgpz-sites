# PGPZ Reference

`apps/reference` is a neutral, executable example of the public PGPZ site
contracts. It proves that shared packages can be configured without importing
PGPZ Community or PGPZ Coalition branding, aliases, membership workflows,
seed content, or infrastructure singletons.

The deployed reference is deliberately non-production:

- membership mode is `externally-managed`, with no identity provider attached;
- ZEC Shelf uses this app's synthetic, read-only seed catalog;
- sign-up, sign-in, profiles, administration, and all mutation routes are absent;
- newsletters, welcome mail, invitations, and all outbound email are disabled;
- robots metadata and response headers prohibit indexing;
- no production table, bucket, sender credential, or member record is used.

## Local development

Install once from the monorepo root, copy `.env.example` to `.env.local`, and
run the workspace commands:

```bash
npm ci
npm run dev --workspace=apps/reference
npm run test --workspace=apps/reference
npm run typecheck --workspace=apps/reference
npm run lint --workspace=apps/reference
npm run build --workspace=apps/reference
```

The runnable demo requires only these safety-oriented values:

```text
NEXT_PUBLIC_SITE_URL=http://localhost:3000
REFERENCE_DEPLOYMENT_MODE=demo
EMAIL_DELIVERY_MODE=disabled
```

`REGION_AWS`, `DYNAMODB_TABLE`, `ZEC_SHELF_PARTITION_KEY`, and the Better Auth
keys are reserved for an isolated server adapter. They do not activate a
production integration. Never use either branded application's table,
credentials, storage, sender, auth secret, or catalog partition here.

## Routes

- `/` explains the reference purpose and safe runtime posture.
- `/architecture` shows the configuration and one-way dependency boundaries.
- `/zec-shelf` renders the shared feature package with app-owned content.
- `/api/zec-shelf/resources` exposes only cached `GET`, `HEAD`, and `OPTIONS`.
- `/terms`, `/privacy`, and `/reference-notice` are app-owned legal notices.

There is intentionally no `/signin`, `/admin`, member-directory, newsletter,
or write API surface.

## Configuration boundary

`config/site.ts` is client-safe and validated by `@pgpz/core`. It defines the
canonical origin, neutral identity, navigation, legal links, externally managed
membership mode, and feature switches. Server resources must be injected
through `@pgpz/core/server`; credentials and resource identifiers must never be
added to the public site configuration.

## Amplify safety

The root monorepo build specification is authoritative. The app-local
`amplify.yml` documents a standalone fallback and still installs/builds from
the monorepo root. A non-production Amplify app should use:

- `WEB_COMPUTE` and `AMPLIFY_MONOREPO_APP_ROOT=apps/reference`;
- no runtime IAM role, table, auth provider, or storage for the initial
  seed-backed read-only deployment;
- Basic Auth and disabled automatic builds during initial validation;
- the exact custom hostname `reference.pgpz.org` only after the default
  Amplify hostname passes smoke tests;
- `EMAIL_DELIVERY_MODE=disabled` with no SMTP credentials.

If a later feature needs persistence, authentication, or storage, provision a
reference-only IAM role, table, partition, auth secret, and bucket in a
separate reviewed change. Never attach a branded application's resources.

Promoting this example into a site generator remains a separate decision after
the reference build stays green through multiple shared-package changes.
