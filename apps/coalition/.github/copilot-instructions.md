# Copilot Instructions: PGPZ Coalition

- Repository: This app lives at `apps/coalition` in the `pgpz-sites` npm
  workspace. Install once from the repository root with `npm ci`; the root
  `package-lock.json`, root scripts, root CI, and root `amplify.yml` are
  authoritative.
- Project: Next.js 15 application for `coalition.pgpz.org`, deployed as an
  independent AWS Amplify application with Coalition-only environment values,
  IAM permissions, DynamoDB data, domain, and release controls.
- Purpose: Selective workspace for Zcash ecosystem partners coordinating crypto
  policy resources, messaging, campaigns, and member collaboration.
- Auth/session: Better Auth email magic links are the only active sign-in and
  server-session provider. Better Auth is mounted at
  `app/api/better-auth/[...all]`; there is no NextAuth runtime or NextAuth auth
  route. `app/api/auth/session/legacy` only expires old NextAuth cookies.
- Auth storage: The custom Better Auth DynamoDB adapter uses base-table ID reads
  and `GSI1` for interactive non-ID lookups. Rate limits use shared atomic
  DynamoDB counters, not process memory. Preserve the adapter, rate-limit,
  client-IP, and session contract tests when changing authentication.
- Legacy names: `NEXTAUTH_TABLE` is the historical name of the application data
  table, not an active authentication provider. Historical access-log values
  may still say `next-auth`, and `NEXTAUTH_SECRET` may temporarily remain only
  as an email-tracking compatibility fallback.
- Membership: Coalition uses invitation and manual administrator approval.
  Admin-created users begin as `invited`; approved/activated users become
  `active`. Keep pending, invited, active, deactivated, and administrator
  behavior explicit in routes, roster actions, directory visibility, and email
  recipient selection.
- No social/on-chain gate: Do not add Community's X proof flow or reintroduce
  wallet, NFT, Unlock Protocol, SIWE, or other on-chain membership gates unless
  explicitly requested.
- Coalition-specific features: Invitation acceptance/activation, manual
  approval, the opt-in active-member directory, policy-interest groups,
  resource sharing, newsletters/policy updates, and tracked email tooling.
  Welcome and distribution email paths must preserve active-member guards.
- Community synchronization: Coalition owns the explicit synchronization script
  and its server-only Community-table configuration. Keep synchronization out
  of shared packages and require an explicit apply mode for mutating runs.
- ZEC Shelf: Coalition does not currently enable a shelf. A future Coalition
  catalog may consume `@pgpz/zec-shelf`, but Coalition must own its content,
  access policy, routes, theme/configuration, data injection, and seed records.
- Authorization: Route handlers must resolve the application session and apply
  explicit membership/admin checks. `isAdmin` is stored on application user
  records. Admins can use the shared page-shell "View as member" mode; do not
  treat that presentation mode as a server authorization change.
- Data: Application identity, profile, membership, invitation, email, content,
  and admin records remain in Coalition's table. The table uses the shared
  `pk`/`sk` and `GSI1` schema without sharing records with Community.
- Styling: Tailwind CSS v4 and the Coalition gold/green/teal tokens live in
  `app/globals.css`. Shared packages must accept configuration rather than
  importing Coalition aliases, CSS modules, branding, or assets.
- Environment: Keep secrets server-only and unprefixed; expose only intentional
  browser configuration through `NEXT_PUBLIC_*`. Never commit credentials or
  copy Community environment values into Coalition outside the named sync
  configuration.
- Commands: From the repository root use `npm run dev:coalition`,
  `npm run test --workspace=apps/coalition`, `npm run typecheck:coalition`, and
  `npm run build:coalition`. Node 22 is required.
- Boundaries: Applications may import declared workspace packages but not a
  sibling application. Code under `packages/` may not import `apps/` or this
  app's `@/` alias. All imported packages must be directly declared. Run
  `npm run boundaries:check` and `npm run parity:check` after structural changes.
- Deployment: Use the root build spec with
  `AMPLIFY_MONOREPO_APP_ROOT=apps/coalition`. The app-local `amplify.yml` is a
  temporary rollback reference, not the monorepo deployment authority. Follow
  `docs/monorepo-migration-runbook.md` for preview, cutover, and rollback gates.
- Licensing: Repository and shared-package code is dual-licensed
  `MIT OR Apache-2.0` under the root license files.
