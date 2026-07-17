# Reference deployment record — 2026-07-17

## Release identity

- Owner: Paul Brigner
- Purpose: protected, non-production confirmation of the executable reference application
- Source pull request: [#4](https://github.com/paulbrigner/pgpz-sites/pull/4)
- Deployed merge commit: `c9a5f92b28548718bb37204de2cc4442b6fc3cf9`
- Amplify application: `pgpz-reference` (`d7mhjyhzcct32`)
- Branch: `main`, stage `BETA`, automatic builds disabled
- Initial release job: `1`, succeeded at `2026-07-17T15:29:49Z`
- Default hostname: `https://main.d7mhjyhzcct32.amplifyapp.com`
- Confirmation hostname: `https://reference.pgpz.org`
- Access posture: Amplify Basic Auth enabled; credentials are held outside the repository
- Review and cleanup checkpoint: `2026-07-31`
- Operator cost ceiling: `$10` in any rolling 30-day period. Disable and review the app if actual or forecast cost reaches the ceiling.
- Monitoring path: Amplify job history and hosting logs for app `d7mhjyhzcct32`, plus authenticated route checks against the custom hostname

This is not a production membership service. It remains seed-backed, read-only,
non-indexed, and protected while the reference configuration is being reviewed.

## Isolation evidence

- The app has no Amplify compute role. The existing Amplify SSR logging service
  role is attached only for hosting logs.
- The only application environment keys are
  `AMPLIFY_MONOREPO_APP_ROOT`, `NEXT_PUBLIC_SITE_URL`,
  `REFERENCE_DEPLOYMENT_MODE`, and `EMAIL_DELIVERY_MODE`.
- No DynamoDB table, auth provider or secret, sender, SMTP credential, storage,
  production bucket, access key, member record, or branded partition is attached.
- `EMAIL_DELIVERY_MODE=disabled`; there is no sign-in, signup, admin,
  newsletter, directory, or write route.
- The custom-domain association contains only the `reference` prefix. Route 53
  added `reference.pgpz.org` and the associated ACM-validation CNAME; no apex,
  `community`, or `coalition` record changed.
- Community remained on successful job `118`; Coalition remained on successful
  job `41`. Both production branches have automatic builds enabled, their
  domain associations are unchanged, and both live roots returned `200` after
  this release.

## Acceptance evidence

- Pull-request and merged-main Monorepo CI both succeeded, covering 378 tests,
  all workspace typechecks and linters, history verification, parity checks,
  dependency boundaries, and independent Community, Coalition, and Reference
  production builds.
- A deliberate Reference-to-Community import made the boundary check fail; the
  clean source tree passed after the negative fixture was removed.
- Built client assets contain no server configuration, credential, sender, or
  table markers. Reference runtime traces contain no S3, `fast-xml-parser`, or
  Nodemailer dependency.
- The Reference-only production audit has no high or critical findings. Its two
  remaining moderate findings are the Next.js-nested PostCSS build-time
  advisory; the app processes no user-supplied CSS.
- Unauthenticated requests to the default and custom hostnames return `401`.
  With Basic Auth, all public pages, legal routes, the social image, and
  `robots.txt` return `200` over valid TLS.
- The live ZEC Shelf renders six app-owned resources, filters to one Orchard
  result, exposes no assigned-number indicators, and contains no disabled
  feature links.
- The live API returns six resources for `GET` and returns `405` with
  `Allow: GET, HEAD, OPTIONS` for `POST`.
- Live browser validation found no page or console errors. Canonical metadata,
  `noindex`, CSP, anti-framing, content-type, referrer, and permissions headers
  are present on the custom hostname.

## Rollback and teardown

The branch already has automatic builds disabled. If the app becomes unsafe,
remove the custom hostname first:

```bash
aws amplify delete-domain-association \
  --app-id d7mhjyhzcct32 \
  --domain-name pgpz.org \
  --profile pgpcommunity \
  --region us-east-1
```

Redeploy the last-known-good Reference commit only if it has independently
passed the same acceptance checks. Otherwise remove the isolated application:

```bash
aws amplify delete-app \
  --app-id d7mhjyhzcct32 \
  --profile pgpcommunity \
  --region us-east-1
```

After either action, verify that Community is still job `118`, Coalition is
still job `41`, both production auto-build flags are enabled, their domain
associations are unchanged, and both live roots return `200`. Never use a
Reference rollback to update, reconnect, or redeploy a branded application.
