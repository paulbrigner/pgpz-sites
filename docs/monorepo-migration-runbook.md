# Monorepo migration, cutover, and rollback

## Immutable baseline

The source repositories remain unchanged emergency rollback sources. Their
production baselines at import were:

| Application | Repository | Source tip |
| --- | --- | --- |
| Community | `paulbrigner/pgpz-community` | `d6a1d1876dbdd5f0959d43ea3c8a19ebf70334ac` |
| Coalition | `paulbrigner/pgpz-coalition` | `ffffec98878729658f96ddba6624c73b316279f6` |

The detailed path rewrite, imported commit IDs, namespaced tags, and byte-exact
tree checks are recorded in [`history-import.md`](history-import.md). Run
`npm run history:verify` before and after repository-structure changes.

This migration must not rename, merge, recreate, or delete production DynamoDB
tables, Amplify applications, domains, IAM roles, SES identities, secrets, or
member records. It changes source and build topology only.

## Environment boundaries

`tooling/write-amplify-env.mjs` uses exact allowlists. It fails when a required
variable is absent, omits absent optional variables, safely quotes values,
escapes literal dollar signs for Next.js dotenv expansion, replaces the target
file atomically with mode `0600`, and logs counts but not names or values.

Required variables retain the existing single-app build behavior:

- Community: `NEXTAUTH_TABLE`, `REGION_AWS`, `X_BEARER_TOKEN`, `EMAIL_FROM`.
- Coalition: `NEXTAUTH_TABLE`, `REGION_AWS`, `EMAIL_FROM`.

Community additionally permits its X/social-proof settings and the optional
`MICROLINK_API_KEY`. Coalition additionally permits the two Community-table
aliases used by its synchronization path. Shared Better Auth, SESv2 mode,
CloudFront, and policy-upload variables are allowlisted for both apps without
copying one application's values into the other. `AWS_REGION` and
content-bucket aliases are retained when present. Static AWS keys, SMTP
credentials, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` are intentionally excluded;
see [`secrets-and-compute-role-cutover.md`](secrets-and-compute-role-cutover.md).

The July 2026 Community Amplify inventory also contains five legacy generation
keys that are not referenced anywhere in the imported application and are
intentionally not serialized by the monorepo build:

- `POLICY_UPDATE_GENERATION_BASE_URL`
- `POLICY_UPDATE_GENERATION_MAX_TOKENS`
- `POLICY_UPDATE_GENERATION_MODEL`
- `POLICY_UPDATE_GENERATION_TIMEOUT_MS`
- `VENICE_API_KEY`

Record these as deliberately retired—not unexplained omissions—when completing
the pre-cutover environment diff. They can be deleted with the credential
cleanup after the compute-role cutover gates and rollback rehearsal pass.

## Pre-cutover gates

Do not reconnect either production Amplify project until all gates pass:

1. `npm ci` succeeds from a clean checkout using the root lockfile and Node 22.
2. `npm run history:verify` confirms the immutable imported baseline.
3. `npm run typecheck`, `npm test`, and `npm run lint` pass.
4. Both `npm run build:community` and `npm run build:coalition` pass from the
   same commit with non-production environment values.
5. A deliberate package or application test failure is observed to block CI.
6. Two consecutive preview deployments succeed for each application.
7. The configured Amplify environment-key names are diffed against the old
   projects with no unexplained omissions or cross-application values.
8. DynamoDB key/GSI/TTL checks pass without schema mutation.
9. A rollback rehearsal can restore an old repository/tag within 15 minutes.

## Preview and smoke checks

Use non-production preview domains and data where a flow can mutate state.
Exercise shared behavior in both apps:

- Better Auth magic-link request, callback, session persistence, and sign-out.
- Profile email change and member-visible navigation.
- Admin authorization, user list/detail controls, and View as member.
- Newsletter, policy-update, system-email rendering, and tracked links without
  sending to real distribution lists.
- Public pages, authenticated pages, static assets, and PDF worker delivery.

Exercise application-specific behavior separately:

- Community: registration/verification, X proof, referrals, guarded welcome
  email, and ZEC Shelf viewing and administration.
- Coalition: invitations, acceptance/activation, manual approval, member
  directory, policy-interest groups, sharing, and Community synchronization.

Confirm canonical domains, application names, sender identities, table names,
email branding, and legal links for every check. A successful HTTP response
alone is not sufficient.

## Production cutover

Cut over one existing Amplify application at a time; do not create new data
stores or move the domains.

1. Record the currently deployed commit, build job, repository connection,
   branch, environment-key inventory, and application-local build spec.
2. Reconnect Coalition to the monorepo and protected `main` branch.
3. Set `AMPLIFY_MONOREPO_APP_ROOT=apps/coalition` and use the root
   `amplify.yml`; preserve all existing Coalition environment values and roles.
4. Deploy, run Coalition smoke checks, inspect authentication/access/email
   telemetry, and observe for one business day.
5. If Coalition remains healthy, reconnect Community and set
   `AMPLIFY_MONOREPO_APP_ROOT=apps/community` with its existing values/roles.
6. Deploy and run Community plus shared smoke checks.
7. Record both successful build job IDs and the deployed monorepo commit.

Initially, shared/root/package changes should build both applications. Do not
enable app-root-only diff deployment until a tested change detector guarantees
that edits under `packages/`, `tooling/`, the root lockfile, or shared build
configuration trigger both relevant builds.

## Rollback

Rollback does not require a data migration because the production tables,
domains, roles, and secrets never move.

For an application-specific regression:

1. Stop or cancel the affected deployment if it is still running.
2. Reconnect that Amplify application to its original repository and `main`
   branch at the recorded stable commit (the import baselines above are the
   minimum known rollback points).
3. Restore the original application-local `amplify.yml`.
4. Remove `AMPLIFY_MONOREPO_APP_ROOT` from that Amplify application's
   environment.
5. Redeploy with the same production environment values, role, table, and
   domain; then repeat the application's smoke checks.

For a shared-package regression, revert the responsible monorepo commit and
redeploy both applications. If the affected package cannot be safely reverted
quickly, reconnect both apps to their original repositories using the steps
above. Never repair a source regression by renaming or replacing production
tables, domains, secrets, or identities.

Keep both original repositories read-only and deployable for at least 30 days
after the second cutover. Archive them only after the observation window has no
migration-related authentication, authorization, membership, email, branding,
or data-boundary regressions and the final rollback record is complete.

## Post-cutover reference application

`apps/reference` is deliberately excluded from the import, package extraction,
and production cutover critical path. Begin it only after ZEC Shelf is stable as
a package, both branded applications build from a clean root install, both
production cutovers pass their smoke checks, and no migration rollback is in
progress.

The `2026-07-17` cutover record now satisfies those gates, so implementation and
CI integration may proceed while the original repositories remain available
for their independent 30-day rollback window. Reference work must not change a
branded application's repository connection, app root, build specification,
webhook, environment, domain, or runtime resource.

The reference application is a runnable CI proving ground and starter, not an
initial third deployment. Its full scope and acceptance criteria are recorded
in [`reference-application-plan.md`](reference-application-plan.md). Do not
start a `create-pgpz-site` generator until that app has demonstrated that its
public configuration surface is sufficient without branded imports or copied
application internals.

An optional public `reference.pgpz.org` demonstration is a later,
non-production release phase—not a third branded production deployment. Before
DNS is attached, it must pass the pre-DNS checklist in
[`reference-application-plan.md`](reference-application-plan.md), use a
dedicated reference-only Amplify application/build definition, keep email and
all mutations disabled, and prove by infrastructure diff that neither branded
application changed. Any reference rollback or teardown is confined to
reference-scoped resources; it must never reconnect or redeploy Community or
Coalition.
