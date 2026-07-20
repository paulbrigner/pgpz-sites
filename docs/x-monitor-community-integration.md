# X Monitor Community integration

## Scope

`apps/community` provides an active-member, read-only view of X Monitor at
`/x-monitor`. It includes:

- generated conversation summaries;
- keyword or meaning-based semantic search, plus X-handle, watch-list, and
  theme filtering;
- significant or all-post feed views;
- activity-volume trends for 24 hours, 7 days, 30 days, or 90 days;
- pagination and captured-post detail pages.

It intentionally excludes Answer Mode, Compose, email, schedules, capture-plan
controls, ingestion, and operational endpoints. Those capabilities still
require the privileged zodldashboard viewer boundary and must not receive the
Community read credential. Semantic retrieval returns at most 24 ranked posts
and does not expose Answer Mode or pagination.

This is an intentional product divergence. `apps/coalition` does not expose X
Monitor.

## Ownership and trust boundaries

- `packages/x-monitor-core` is a pinned copy of provider-neutral contracts and
  the read client extracted from `paulbrigner/zodldashboard` commit
  `9061f599c2be49890bad389ff42040a6e8dfe25f`. Run
  `npm run xmonitor:verify-vendor` to verify the recorded file hashes.
- `apps/community/lib/x-monitor-server.ts` is the only Community module that
  reads the backend client secret. It injects the credential into outbound
  requests, sets bounded timeouts, disables caching and redirects, and permits
  only the five integrated GET paths plus the dedicated semantic-query POST.
- Community presents the current `teammate` list as **Zodl Team** and folds
  historical `investor` records into **Influencer**. It intentionally exposes
  theme filters but no debate-topic filter or debate-focused chart.
- Community page and API authorization uses Better Auth's
  `protectedContent` capability. This includes active members and active
  administrators; inactive or unverified accounts fail closed.
- Same-origin API routes repeat authorization independently, discard caller
  headers, and construct allowlisted, bounded upstream queries. They return
  private, non-indexable responses.
- The page server-renders through the same server-only client. The credential is
  never available to browser JavaScript or included in a `NEXT_PUBLIC_`
  variable.
- The backend creates semantic embeddings with its own provider credential.
  Community never receives the Venice key or the broader
  `XMONITOR_USER_PROXY_SECRET`. Semantic requests accept only bounded text and
  allowlisted feed filters; caller-supplied vectors are rejected.
- Community hashes the stable member ID for per-member semantic budgets and
  deduplicates identical normalized prompt/filter requests for five minutes in
  the private application DynamoDB table. Cache hits do not consume semantic
  quota or create another embedding.
- Uncached semantic requests are limited to 10 per member per five minutes and
  50 per member per day. Community-wide and backend-client ceilings are 120 per
  five minutes and 1,000 per day. Keyword search is not subject to these
  semantic limits.
- The backend applies its client budget atomically before calling the embedding
  provider, has an independent semantic-client kill switch, and emits
  prompt-free CloudWatch usage metrics.

## Runtime configuration

The Community Amplify app requires the complete set below before the feature is
enabled:

```text
NEXT_PUBLIC_XMONITOR_ENABLED=true
XMONITOR_READ_API_BASE_URL=https://84kb8ehtp2.execute-api.us-east-1.amazonaws.com/v1
XMONITOR_READ_CLIENT_ID=pgpz-community
XMONITOR_READ_CLIENT_SECRET=<independent secret of at least 32 characters>
XMONITOR_READ_TIMEOUT_MS=10000
```

The backend Secrets Manager document at `xmonitor/rds/app` must contain the
same independent secret and explicit capabilities under
`read_clients.pgpz-community`, without modifying any existing client entries:

```json
{
  "secrets": ["<same independent secret>"],
  "capabilities": ["read", "semantic:query"]
}
```

Legacy array entries remain read-only. The backend caches valid client
configuration for five minutes. Apply backend migration
`033_xmonitor_semantic_client_usage.sql` before adding the semantic capability.

Never configure `XMONITOR_USER_PROXY_SECRET` in Community. Never put the read
secret, the API base URL, or the client ID in a public variable. Only the
non-secret enable flag is public because navigation needs the same build-time
state as the server.

## Rotation

1. Generate a new independent secret and append it to the backend
   `read_clients.pgpz-community.secrets` array, preserving the current secret
   and both capabilities.
2. Wait for the five-minute backend cache window and verify the new credential.
3. replace `XMONITOR_READ_CLIENT_SECRET` in the Community Amplify environment
   without changing unrelated variables, then deploy and smoke-test.
4. Remove the former backend secret, wait for the cache window, and verify that
   the former value is rejected while Community and zodldashboard reads remain
   healthy.

The backend accepts at most three active secrets per client.

## Verification

Before release, run:

```bash
npm run xmonitor:verify-vendor
npm run test --workspace=@pgpz/x-monitor-core
npm run test --workspace=apps/community
npm run typecheck
npm run boundaries:check
npm run parity:check
npm run lint
npm run build:community
```

Production smoke checks must confirm:

- unsigned and invalid direct backend reads return `401`;
- `pgpz-community` and the existing `zodldashboard` clients can read the feed;
- only the semantic-capable `pgpz-community` client can call semantic query;
- cached identical Community searches do not create duplicate backend calls,
  and exhausted client budgets return `429` before embedding work;
- existing viewer-proxy semantic search in zodldashboard remains healthy;
- the Community semantic client still cannot call Compose, email, schedules,
  ingestion, operations, or access-control endpoints;
- anonymous Community API requests return `401`;
- `/x-monitor` redirects anonymous viewers to sign-in;
- active members and administrators can load the page and detail routes;
- Community API and page responses are private and non-indexable;
- the secret is absent from rendered HTML and static assets;
- no new backend authentication-configuration or 5xx errors appear.
