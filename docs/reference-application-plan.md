# Reference application plan

## Purpose and timing

Add `apps/reference` only after the initial monorepo migration, ZEC Shelf
extraction, production cutovers, and rollback checks are stable. It will be a
minimal executable Next.js application and a required CI build, not initially a
third production deployment.

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
