# PGPZ Reference

Neutral executable proof of selected shared PGPZ contracts. Reference is not a
third membership service and must not import Community/Coalition aliases,
branding, membership workflows, seed content, or infrastructure singletons.

## Safety contract

The default deployed/local shape is read-only and non-production:

- externally managed membership with no attached identity provider;
- synthetic ZEC Shelf data and inert server adapters;
- no sign-up, sign-in, profiles, admin, newsletter, invitation, or mutation API;
- outbound email disabled;
- indexing prohibited;
- no branded table, bucket, sender, secret, credential, or member record.

Current central feature switches enable only ZEC Shelf. The `/documents` surface
is a neutral demonstration; it does not attach Board storage.

## Routes and configuration

- `/`: purpose and runtime posture;
- `/architecture`: configuration/dependency boundaries;
- `/zec-shelf`: shared feature with Reference-owned synthetic content;
- `/documents`: neutral document contract demonstration;
- `/api/zec-shelf/resources`: cached read-only API;
- `/terms`, `/privacy`, `/reference-notice`: app-owned notices.

`config/site.ts` is client-safe and validated through `@pgpz/core`.
`config/server.ts` injects inert or isolated server resources. If persistence is
ever enabled, provision Reference-only resources in a reviewed change.

## Local development

Reference needs no Docker services:

```bash
cp apps/reference/.env.local.example apps/reference/.env.local
npm run dev:reference
```

It runs at `http://localhost:3003` with `REFERENCE_DEPLOYMENT_MODE=demo` and
`EMAIL_DELIVERY_MODE=disabled`.

## Validation and deployment

```bash
npm run test --workspace=apps/reference
npm run typecheck:reference
npm run lint --workspace=apps/reference
npm run build:reference
```

Root `amplify.yml` is authoritative with
`AMPLIFY_MONOREPO_APP_ROOT=apps/reference`. A hosted Reference deployment must
remain isolated, non-indexed, and email-disabled. The dated design/deployment
documents are historical; this README and current config/tests define behavior.
