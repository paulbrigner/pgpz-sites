# Copilot Instructions: PGPZ Community

- Repository: This app lives at `apps/community` in the `pgpz-sites` npm
  workspace. Install once from the repository root with `npm ci`; the root
  `package-lock.json`, root scripts, root CI, and root `amplify.yml` are
  authoritative.
- Project: Next.js 15 application for `community.pgpz.org`, deployed as an
  independent AWS Amplify application with Community-only environment values,
  IAM permissions, DynamoDB data, domain, and release controls.
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
- Membership: Users sign in by email, generate an X proof code, post it publicly,
  and submit the post for server-side verification. Successful proof activates
  `membershipStatus: "active"`; do not add Coalition's invitation or manual
  approval state machine to Community unless explicitly requested.
- Community-specific features: X proof verification, referrals, policy updates,
  newsletters, member/admin email tools, and guarded welcome mail. Welcome mail
  requires an active membership on both the route and UI paths.
- ZEC Shelf: Reusable domain, client, checker, and repository behavior comes
  from `@pgpz/zec-shelf`. Community owns its catalog, access policy, routes,
  theme/configuration, DynamoDB injection, partition key, and seed content in
  this application. Do not copy the package implementation back into the app.
- Authorization: Route handlers must resolve the application session and apply
  explicit membership/admin checks. `isAdmin` is stored on application user
  records. Admins can use the shared page-shell "View as member" mode; do not
  treat that presentation mode as a server authorization change.
- Data: Application identity, profile, membership, referral, email, content, and
  admin records remain in Community's table. Do not import Coalition data or
  infrastructure wiring into shared packages.
- Styling: Tailwind CSS v4 and the app's Zcash-inspired Community tokens live in
  `app/globals.css`. Shared packages must accept configuration rather than
  importing Community aliases, CSS modules, branding, or assets.
- Environment: Keep secrets server-only and unprefixed; expose only intentional
  browser configuration through `NEXT_PUBLIC_*`. Never commit credentials or
  copy Coalition environment values into Community.
- Commands: From the repository root use `npm run dev:community`,
  `npm run test --workspace=apps/community`, `npm run typecheck:community`, and
  `npm run build:community`. Node 22 is required.
- Boundaries: Applications may import declared workspace packages but not a
  sibling application. Code under `packages/` may not import `apps/` or this
  app's `@/` alias. All imported packages must be directly declared. Run
  `npm run boundaries:check` and `npm run parity:check` after structural changes.
- Deployment: Use the root build spec with
  `AMPLIFY_MONOREPO_APP_ROOT=apps/community`. The app-local `amplify.yml` is a
  temporary rollback reference, not the monorepo deployment authority. Follow
  `docs/monorepo-migration-runbook.md` for preview, cutover, and rollback gates.
- Licensing: Repository and shared-package code is dual-licensed
  `MIT OR Apache-2.0` under the root license files.
