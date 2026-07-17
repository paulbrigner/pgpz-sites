# Reference application plan

## Purpose and timing

Add `apps/reference` only after the initial monorepo migration, ZEC Shelf
extraction, production cutovers, and rollback checks are stable. It will be a
minimal executable Next.js application and a required CI build, not initially a
third production deployment.

The production cutover record dated `2026-07-17` satisfies those sequencing
gates: both branded applications passed their available production validation,
ZEC Shelf is running from its package in Community, and no rollback is in
progress. Reference implementation may therefore begin. This does not by
itself authorize a public deployment; the isolated demonstration phase below
is a separate decision and release gate.

Its primary job is to prove that shared packages do not secretly depend on
Community or Coalition branding, `@/` aliases, membership state machines, seed
content, environment conventions, or infrastructure wiring. Its secondary job
is to provide a clean starting point for future PGPZ sites.

Target layout:

```text
apps/
  community/
  coalition/
  reference/

packages/
  core/
  auth-dynamodb/
  ui/
  zec-shelf/

templates/
  site-config.example.ts
```

The presence of this target in the plan does not authorize moving the branded
membership workflows into a universal state machine. Shared packages should
expose narrow contracts; each application remains responsible for choosing and
wiring behavior.

## Configuration contract

Split configuration into a client-safe `SiteConfig` and a server-only
`ServerConfig`. Never place credentials, table names, sender secrets, or storage
details in a module that can enter a client bundle.

`SiteConfig` should contain only:

- Site name, canonical URL, logo/assets, color tokens, navigation, and legal
  identity.
- A typed membership mode: `admin-approved`, `invitation-only`, or
  `externally-managed`.
- Typed feature switches for updates, newsletters, member directory, ZEC Shelf,
  and later feature packages.
- Package-specific presentation configuration, such as ZEC Shelf labels and
  categories, without catalog seed records.

`ServerConfig` should wire:

- DynamoDB client/table/partition configuration.
- SES transport and sender identity.
- Better Auth secrets, trusted origins, and adapter configuration.
- Storage clients, buckets, and content prefixes.
- Membership-mode adapters and any external membership resolver.

Reference infrastructure must use generic configuration names. In particular,
it uses `DYNAMODB_TABLE`, never the branded applications' legacy
`NEXTAUTH_TABLE` convention. The build-time materializer requires
`NEXT_PUBLIC_SITE_URL`, `REFERENCE_DEPLOYMENT_MODE`, and
`EMAIL_DELIVERY_MODE`; optional isolated runtime configuration may include
`REGION_AWS`, `DYNAMODB_TABLE`, Better Auth settings, `EMAIL_FROM`, and
`ZEC_SHELF_PARTITION_KEY`. The runnable example defaults to
`REFERENCE_DEPLOYMENT_MODE=demo` and `EMAIL_DELIVERY_MODE=disabled`.

Seed content belongs under `apps/reference` or a generated application, never
inside `@pgpz/core`, `@pgpz/ui`, `@pgpz/auth-dynamodb`, or
`@pgpz/zec-shelf`.

## Dependency and CI rules

- `apps/reference` may import shared packages; shared packages may not import
  from any application.
- Shared packages may not use a branded application's `@/` alias, assets,
  environment reader, membership types, or DynamoDB singleton.
- The reference build must use only documented configuration fields and dummy
  non-secret CI values.
- CI must lint, typecheck, test, and build the reference app alongside both
  branded applications.
- Boundary checks must reject imports containing `apps/community`,
  `apps/coalition`, or their private aliases from `packages/**` and
  `apps/reference/**`.
- Contract tests must exercise each membership mode and verify that disabled
  features do not expose navigation, routes, or server handlers.
- ZEC Shelf tests must use reference-owned seed content and a distinct catalog
  partition, proving content isolation from both production applications.

## Implementation sequence

1. Extract only the stable packages needed by the reference app, with
   application-owned adapters at every infrastructure or membership boundary.
2. Define and validate the typed public/server configuration schemas.
3. Build `apps/reference` with neutral assets, legal identity, navigation, and
   seed content.
4. Add package-boundary enforcement plus reference lint, test, typecheck, and
   production-build jobs to CI.
5. Prove all three membership modes through adapter contract tests; select one
   simple non-production mode for the runnable example.
6. Exercise feature switches, including a reference-owned ZEC Shelf catalog.
7. Document the smallest supported customization workflow and measure how much
   application-local code must be edited.
8. Complete the isolated-deployment acceptance review below before creating an
   Amplify application, attaching DNS, or enabling any server-side mutation.

## Isolated public demonstration phase

`reference.pgpz.org` may be published only as an explicitly non-production
demonstration after the executable reference milestone passes. It is not a
third branded membership service, a production data plane, or a promise that
every configuration combination is production-supported.

The initial public demonstration remains seed-backed and read-only:

- Deploy it through a dedicated non-production Amplify application and a
  reference-only build specification. Do not change the existing Community or
  Coalition application roots, build specifications, branches, webhooks, or
  domain associations.
- Use neutral assets, reference-owned legal identity and seed content, and the
  canonical origin `https://reference.pgpz.org`.
- Keep email delivery disabled. Do not expose signup, invitation, profile,
  administration, newsletter-send, content-write, or other mutation handlers.
- Do not provide either branded application's table, IAM role, access keys,
  auth/tracking secrets, sender credentials, bucket, catalog partition, or
  member records to the reference application.
- If a later demonstration needs authentication or persistence, add a separate
  review first. It must provision a reference-only least-privilege role, table,
  partition, auth secret, storage boundary, retention policy, and synthetic
  accounts. Email remains disabled unless a separately isolated sender and
  abuse-control review are approved.

### Pre-DNS acceptance checklist

Before attaching `reference.pgpz.org`, record all of the following:

1. A clean root install, lint, typecheck, test, and production build passes for
   Reference, Community, Coalition, and every shared package in protected CI.
2. A deliberate Community or Coalition import makes the boundary check fail;
   reference path aliases resolve only within `apps/reference` or declared
   shared packages.
3. Client-safe and server-only configuration are separated, and a built-bundle
   inspection finds no server configuration, credential, table, sender, or
   storage value in client assets.
4. All three membership adapters pass contract tests. The deployed demo uses
   the documented non-production mode, and disabled features have no visible
   navigation, routable page, or callable server handler.
5. The ZEC Shelf catalog, partition label, assets, legal identity, and fixtures
   are reference-owned; no production read or write is possible.
6. An infrastructure diff proves the deployment creates or changes only
   reference-scoped non-production resources. The two branded Amplify apps,
   domains, roles, tables, SES identities, buckets, environment digests, and
   latest successful jobs remain unchanged.
7. Public-route, asset, legal-link, canonical-host, read-only API, error-log,
   rate-limit, and dependency-boundary smoke checks pass before DNS is enabled.
   The release record names an owner, cost limit, monitoring path, cleanup date,
   deployed commit, and rollback command.

### Rollback and teardown

Immediately disable or remove the reference deployment for any branded-resource
access, unexpected mutation or email, authentication/data exposure, broken
feature gate, canonical-host error, sustained server failure, or dependency
boundary regression. Rollback must affect only the reference application:

1. Disable its automatic builds and detach `reference.pgpz.org` if the public
   surface is unsafe.
2. Redeploy the recorded last-known-good reference commit, or delete the
   non-production Amplify application when no independently verified good
   artifact exists.
3. Remove only reference-scoped synthetic sessions, records, table, role,
   secrets, storage, logs, and DNS after preserving the evidence required for
   incident review.
4. Re-run branded production invariants and prove that Community and Coalition
   repository connections, app roots, domains, environment digests, jobs, and
   data were unchanged.

Reference rollback must never rename, replace, reconnect, or redeploy either
branded production application. The original branded-repository rollback
window remains independent through at least `2026-08-16`.

## Generator decision

Consider `create-pgpz-site` only after the reference application has remained
green through multiple shared-package changes and a new site can be configured
without copying branded internals. The generator should then create an app from
the reference surface, copy `templates/site-config.example.ts`, prompt for the
two configuration layers and selected features, and leave deployment as an
explicit follow-up. Until those conditions are met, `apps/reference` remains
the canonical executable example.

## Exit criteria

The reference milestone is complete when:

- It installs and builds from a clean root checkout without Community or
  Coalition environment variables.
- Package-boundary CI fails on a deliberate branded import.
- Its catalog, assets, legal identity, and membership fixtures are entirely
  app-owned.
- Enabling or disabling each supported feature is covered by tests.
- Both branded applications still pass their complete pipelines.
- No production Amplify application, domain, table, SES identity, or member
  record was created or changed for the reference app.

The optional public-demonstration milestone is complete only when the pre-DNS
checklist passes, `reference.pgpz.org` passes its post-DNS smoke, email and
mutations remain disabled, the release record proves branded production stayed
unchanged, and the rollback/teardown path has been rehearsed without touching a
branded resource.
