# Board Governance Vault, Legal Counsel Role, and Audit Ledger — Revised Plan

Status: architecture review complete; revise before implementation.

This plan supersedes the implementation details in the original Hermes draft. The
goal remains correct, but the original audit write was not atomic, the proposed
document-history item could grow without bound, the storage policy did not
actually preserve accepted objects, and the proposed Reference ownership would
conflict with the repository's application boundaries.

## Outcome and architectural classification

Build this as a **registered, per-site-enabled shared feature**, with Board as the
first production consumer.

| Classification | Ownership |
| --- | --- |
| Shared package: `@pgpz/document-vault` | Document/version contracts, validation, immutable-version lifecycle, optimistic concurrency, injected repository/object-store interfaces, upload state machine, safe download helpers, and brand-neutral UI primitives |
| Shared package: `@pgpz/audit-log` | Versioned event envelope, action/outcome schema, canonical serialization, hashing, transactional append contract, archive/checkpoint contract, and verifier |
| Board-specific | Director/admin/ED/legal-counsel roles, capability mapping, governance categories and copy, Board routes and pages, Better Auth hooks, Board-only AWS resources, retention policy, and audit viewer |
| Per-site enabled | Feature switch, routes, access policy, file types/limits, adapters, infrastructure, retention, audit coverage, and migrations |
| Reference-specific | Synthetic read-only fixtures and in-memory adapters proving package portability; no Board records, credentials, production writes, or shared AWS resources |
| Community/Coalition-specific | Existing `/resources/...` URLs, public/member semantics, current table keys and bucket prefixes, app-owned auth guards, and later compatibility migrations |

Do not implement reusable code in `apps/reference` and copy it later. Shared
packages cannot import application code, and one application cannot import
another. Follow the existing `@pgpz/zec-shelf` pattern: the package owns neutral
behavior; each app owns policy, identity, routes, content, and infrastructure.

Do not overload the existing `publicFiles` feature. Register a distinct feature,
`documentVault`, because Board documents are private and retention-protected,
while Community and Coalition currently support public or member-only resources.

## Required decisions and recommended defaults

These decisions must be recorded before the production infrastructure is applied.

1. **Legal Counsel access**
   - Recommended default: `role: "legal-counsel"`, `isAdmin: true` for current UI
     compatibility, plus named capabilities `manageBoardDocuments` and
     `reviewBoardAudit`.
   - This grants the same current web administration surface as Board admins and
     the Executive Director. It does not imply AWS console or CLI access.
   - Use `BOARD_LEGAL_COUNSEL_EMAILS`, optional and pairwise disjoint from
     `BOARD_MEMBER_EMAILS` and `BOARD_EXECUTIVE_DIRECTOR_EMAILS`.

2. **Document visibility**
   - Recommended v1 default: every active Board-portal principal may read active
     governance documents; Board admins, the ED, and Legal Counsel may create,
     revise, restore, archive, and edit metadata.
   - Model visibility as an app-owned policy value rather than hard-coding it in
     the shared package, so a future `privileged` or committee scope can be added
     without changing the storage model.

3. **Retention and legal hold**
   - Application behavior never deletes an accepted document version or audit
     event. Archive is a metadata state, not object deletion.
   - Counsel must approve the production Object Lock mode and retention duration.
     Use Governance mode in an isolated test stack. Use Compliance mode in
     production only after the irreversible retention period has been approved.
   - Keep retention periods configurable CloudFormation parameters; do not hide a
     legal-retention decision in source constants.

4. **Authentication hardening**
   - Recommended production gate: require MFA/passkey or an explicitly accepted
     risk for every privileged role before confidential governance files go live.
   - Define session duration, reauthentication for privileged mutations, recovery,
     and revocation behavior in the Board runbook.

5. **Reference scope**
   - Recommended default: add only a deterministic, read-only package
     demonstration to the deployed Reference app.
   - A writable Reference mode is a separate reviewed project requiring its own
     non-production auth, role, table, buckets, key, audit ledger, and Basic Auth.

## Audit scope: define “all actions” precisely

Use two complementary layers rather than pretending every framework request is a
governance event.

### Semantic Board audit ledger

Persist the following actions with `success`, `denied`, or `failure` outcomes as
applicable:

- authentication: sign-in success, sign-in failure, rate-limit rejection,
  sign-out, session revocation;
- authorization: denied access to private, privileged, document, and audit
  routes;
- account operations: account creation, credential rotation, account removal,
  and provisioning failures;
- roster/role operations: deployment of a changed Board/admin/ED/counsel roster,
  or a correlation to the operational CloudTrail change record;
- document reads: library view, metadata/version-history view, and one logical
  `document.download_authorized` event;
- document lifecycle: upload prepared, accepted, rejected, or failed; version
  created; arbitrary prior version restored; archive/unarchive; metadata changed
  with an approved before/after diff;
- audit operations: audit page viewed, filters queried, export requested,
  integrity verification run, and verification failure.

Do not log static assets, health checks, Next.js internal/RSC fetches, every PDF
byte-range request, passwords, hashes, session tokens, cookies, presigned URLs,
raw request/response bodies, or unbounded exception text.

Every semantic event contains:

- `schemaVersion`, `eventId`, `idempotencyKey`, `requestId`;
- `occurredAt`, `recordedAt`, chain sequence, `previousHash`, and `eventHash`;
- action, category, outcome, and a bounded reason code;
- actor snapshot: stable Better Auth user id when known, normalized email, Board
  role, and privilege/capability snapshot;
- anonymous claimed identity only where needed for failed sign-in, clearly
  separated from an authenticated actor;
- target type/id/version and a strictly allowlisted metadata object;
- bounded network/client metadata according to the approved privacy policy.

### Operational evidence

Use hosting logs and an existing or deliberately provisioned CloudTrail trail for
AWS control-plane activity. Enable narrowly scoped S3 and DynamoDB data events for
the Board vault and audit resources. Do not silently create a competing
account-wide trail without first inventorying the existing account trail.

The Board privacy notice and terms must describe the actual portal principals,
document storage, audit fields, purposes, access, retention, and contact process.

## Target persistence and integrity model

### Separate document table

Do not place governance-document history in `PGPZBoardNextAuth`. The auth table
requires session/account mutation permissions and has a different recovery and
retention lifecycle. Provision a dedicated `PGPZBoardDocuments` table with:

- on-demand capacity, server-side encryption, point-in-time recovery, deletion
  protection, and no TTL;
- CloudFormation `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain`;
- no runtime `DeleteItem` permission;
- queryable metadata indexes only where a demonstrated UI query needs one; no
  `Scan` dependency.

Suggested records:

```text
PK=DOCUMENT#<documentId>  SK=META
  title, description, category, visibility, status,
  currentVersionId, revision, createdAt/by, updatedAt/by

PK=DOCUMENT#<documentId>  SK=VERSION#<sequence>#<versionId>
  immutable logical version, opaque object key, S3 VersionId,
  SHA-256 checksum, MIME type, byte length, original filename,
  uploadedAt/by, source=upload|restore, restoredFromVersionId?

PK=DOCUMENT#<documentId>  SK=REVISION#<sequence>#<revisionId>
  optional immutable metadata snapshot/diff for state reconstruction
```

List documents through a purpose-built GSI or a bounded library partition. Query
versions by document with pagination. Never embed an unlimited
`previousVersions[]` array in a single item. Restore creates a new logical version
that references the preserved source version; it does not erase or rewrite
history.

### Staging and retained object storage

Use separate lifecycle boundaries:

- a short-lived Board upload staging bucket/prefix, where rejected/orphaned
  uploads may be deleted by a narrowly scoped role and lifecycle rule;
- a retained Board document bucket/prefix with S3 Versioning, Block Public
  Access, bucket-owner-enforced ownership, TLS-only bucket policy, encryption,
  CloudFormation retain policies, and no application `DeleteObject` permission;
- S3 Object Lock on accepted versions if preservation is literal, with the
  approved mode/duration and optional legal holds;
- CloudFormation-generated or account/region-qualified bucket names rather than
  the globally fixed `pgpz-board-documents` name.

Use opaque, server-created object keys. Preserve both the application version id
and S3 VersionId. Store a real SHA-256 checksum; do not treat ETag as a content
digest.

For confidential Board data, use a Board-only KMS key unless the approved threat
model selects SSE-S3. If using KMS, retain the key, enable rotation, restrict key
administration, and protect against accidental key deletion; locked ciphertext is
not recoverable if its encryption key is lost.

### Upload state machine

Use this sequence:

1. Authorize the actor before parsing confidential target details.
2. Create an idempotent upload intent and semantic audit event.
3. Issue a short-lived presigned POST/PUT constrained to the staging key, size,
   content type, checksum/encryption headers, and Board origin.
4. Validate actual object size and type server-side; inspect full container
   structure where relevant and malware-scan PDF/Office/ZIP content.
5. Promote an accepted object to a new immutable final key.
6. Atomically write the immutable version item, update the document head with a
   revision condition, and append the lifecycle audit event/head.
7. Leave recoverable, uniquely keyed orphans on retry; reconcile them by
   operation id. Staging lifecycle cleanup must never target retained objects.

The UI exposes only `available` versions. It may display `uploading`, `scanning`,
`rejected`, and `failed` states to the privileged uploader.

Direct browser upload also requires:

- exact-origin S3 CORS for `https://board.pgpz.org` and only the required methods
  and headers;
- an app-specific Board CSP `connect-src` entry for the exact S3 endpoint, or a
  same-origin upload architecture;
- updated Board header tests;
- no repository-root `customHttp.yml` unless it contains a nonempty block for
  every root `amplify.yml` app. The current app-specific-header approach should
  remain in `apps/board/next.config.ts`.

### Download semantics

An application event can prove that a download was authorized or started, not
that a browser consumed every byte. Record one logical
`document.download_authorized` event for the exact document/version, then return a
short-lived signed URL or access token. S3 CloudTrail data events provide the
object-level GET evidence. Do not count HEAD plus every browser range request as
separate user downloads.

Protected downloads and privileged mutations fail closed if their required audit
append cannot be durably committed.

## Audit-ledger integrity design

The original two-write algorithm must not be used. Writing an event and then
conditionally replacing a chain head can leave orphan events on concurrency or
process failure. `PutItem` permission also does not make a DynamoDB table
write-only or immutable.

Provision a dedicated `PGPZBoardAuditLog` table with:

- event partition(s) and a chain-head item;
- PITR, deletion protection, encryption, no TTL, and retain policies;
- a single `TransactWriteItems` append containing the conditional immutable event
  put and conditional chain-head update;
- an idempotency key and bounded retry of the whole transaction;
- pagination/query indexes required by the audit viewer, without Scan.

Where a document metadata mutation is in the same account and Region, include the
document write, version/revision insert, audit event insert, and head update in one
DynamoDB transaction. S3 remains outside that transaction and is handled by the
idempotent staging/promotion flow.

Be precise about the threat boundary: the DynamoDB hash chain is an
application-level integrity signal, not WORM protection against compromise of the
same runtime principal or an AWS administrator. Add an independent anchor:

- enable a DynamoDB Stream on the audit table;
- use a separately permissioned archiver to write every insert and any unexpected
  modification/removal record to a Board-only S3 Object Lock audit archive;
- deny Board web compute all access to that archive;
- optionally sign periodic chain-head checkpoints with a KMS asymmetric key not
  available to web compute;
- provide a verifier that compares table order/hash continuity, archived stream
  records, and checkpoints;
- alarm on append failure, stream/archiver failure, unexpected mutation/removal,
  checkpoint failure, and verification gaps.

Only after the independent anchor is deployed and verified should the product call
the ledger tamper-evident. Until then, call it append-only by application invariant.

## Authentication and authorization integration

### Legal Counsel role

Update the Board-owned role surface:

- `apps/board/lib/membership.ts`
- `apps/board/lib/session.ts`
- `apps/board/config/server.ts` and tests
- `apps/board/components/dashboard/BoardDashboard.tsx` and page tests
- `apps/board/scripts/provision-board-member.ts`
- `apps/board/.env.example` and `apps/board/README.md`
- `docs/board-deployment.md`
- `tooling/write-amplify-env.mjs`

Requirements:

- parse optional `BOARD_LEGAL_COUNSEL_EMAILS`;
- reject member/counsel, ED/counsel, and existing member/ED overlaps;
- resolve counsel as active with `role: "legal-counsel"` and `isAdmin: true`;
- keep a stable Better Auth user id on `BoardMember` for audit attribution;
- render an explicit Legal Counsel badge and never label counsel as a director;
- add named server-side capability helpers/guards for document management and
  audit review instead of scattering raw `isAdmin` checks through new routes;
- keep API guards request-aware and return controlled 401/403/404 responses rather
  than reusing page-only redirect/notFound behavior;
- derive actor, role, and target server-side; ignore actor fields supplied by the
  browser.

Fix the existing provisioning defect before extending the script: its current
`--dry-run` path counts sessions by revoking them before checking `dryRun`. A dry
run must perform no writes or deletions. Rename user-facing language from
“director” to “Board portal account” where the script also serves ED and counsel.

### Better Auth events

Use the proven typed Better Auth lifecycle surface where possible:

- successful sign-in: `databaseHooks.session.create.after`, as already used by
  Community and Coalition;
- failed `/sign-in/email`: an explicitly tested Better Auth hook/wrapper that
  reads only the normalized claimed email and bounded request metadata;
- sign-out: resolve the authenticated actor before session deletion, append an
  intent/outcome or use a tested session-delete hook that retains attribution;
- session revocation and credential rotation: emit semantic events from the
  provisioning/revocation tooling.

Never infer success by loosely inspecting raw response bodies. Test audit failure
behavior so a reported failed login cannot leave an unexpectedly usable session,
and sign-out is never prevented from invalidating a session.

## Routes and UI

Recommended application-owned route surface:

- member pages: `/documents`, `/documents/[id]`;
- privileged pages: `/admin/documents`, `/admin/audit`;
- member reads: `GET /api/documents`, `GET /api/documents/[id]`, and a download
  authorization route bound to an exact version;
- privileged writes under `/api/admin/documents/...` with explicit endpoints for
  upload preparation/completion, metadata, archive/unarchive, and arbitrary
  version restore;
- audit reads/export/verification under `/api/admin/audit/...`.

Every mutating route must enforce same-origin/CSRF protection, capability checks,
idempotency, bounded validation, optimistic concurrency, and semantic audit.
Authorize before revealing whether a confidential document id exists.

Update the Board route-surface tests; they currently assert that Better Auth is the
only API route. Add package dependencies and `transpilePackages` entries, update
the app-specific CSP/header tests, and update terms/privacy tests.

## Implementation sequence

### Phase 0 — policy, threat model, and current safety fix

1. Record the audit event taxonomy, privacy fields, failure policy, retention,
   Object Lock mode/duration, legal-hold process, visibility policy, and MFA gate.
2. Fix and regression-test the mutating `--dry-run` provisioning behavior.
3. Inventory the current CloudTrail trail and Board Amplify compute role before
   changing account-wide logging or IAM.

Exit criterion: approved architecture record and a truly non-mutating dry run.

### Phase 1 — Legal Counsel role as an isolated release

Implement the optional counsel roster, role/capability mapping, stable actor id,
provisioning support, UI badge, legal language, environment materialization, and
tests. Configure the live Amplify variable before deploying fail-closed code.

Exit criterion: member/admin/ED/counsel/unauthorized matrix passes locally and in
an authenticated post-deploy smoke test; no vault permissions exist yet.

### Phase 2 — neutral shared contracts

Create `packages/document-vault` and `packages/audit-log` with client-safe,
server-only, and test entry points as needed. Register `documentVault` in
`@pgpz/core` and set it explicitly for all four apps. Keep it disabled until an
app's complete route/resource surface is present.

The packages must contain no app aliases, brand copy, role names, environment
reads, AWS singleton, table/bucket names, or Next.js route ownership.

Exit criterion: package unit/type tests and `npm run boundaries:check` pass.

### Phase 3 — isolated Board infrastructure

Extend the Board CloudFormation builder and provisioning verifier with:

- `PGPZBoardDocuments` and `PGPZBoardAuditLog` tables;
- staging, retained-document, and independent audit-archive storage boundaries;
- Board-only KMS key(s) if selected;
- audit stream/archiver and alarms;
- narrowly scoped IAM, including no accepted-object delete and no web-compute
  access to the audit archive;
- CORS, secure transport, versioning/Object Lock, retain policies, and explicit
  outputs/environment variables.

Add CloudFormation tests for every protection and isolation invariant. Extend the
provisioning tool to verify the deployed state, not merely stack completion.

Exit criterion: dry-run and template validation pass; an isolated non-production
apply verifies every protection before application code is enabled.

### Phase 4 — audit ledger before document mutations

Implement the Board adapter, transactional append, Better Auth capture,
authorization-denial capture, provisioning events, admin audit page/API, filters,
pagination, export, integrity verifier, privacy/terms changes, and failure alarms.

Exit criterion: concurrency and fault-injection tests prove no orphan chain entries;
the external archive/verifier detects synthetic mutation or deletion; protected
reads/writes honor their fail-closed policy.

### Phase 5 — Board vault backend and upload pipeline

Implement the per-version repository, staging/scanning/promotion flow, document
and audit transaction, exact-version downloads, range/signed-URL behavior,
idempotent retries, orphan reconciliation, and app-owned route guards.

Exit criterion: create, new version, arbitrary restore, metadata edit,
archive/unarchive, rejection, concurrency, and missing-object recovery tests all
pass with matching audit events.

### Phase 6 — Board UI and safe Reference proof

Add the Board document library/manage UI and audit review UI. Then add a synthetic,
read-only Reference consumer using deterministic fixtures or an in-memory adapter.
Do not add Reference auth, write routes, AWS credentials, or production resources.

Exit criterion: the same package renders under Board policy and Reference fixtures
without app-to-app imports or shared data.

### Phase 7 — repository and live verification

Run at minimum:

```bash
npm run boundaries:check
npm run parity:check
npm run test:amplify-custom-headers
npm run test:board-backend-infra
npm run test --workspace=@pgpz/document-vault
npm run test --workspace=@pgpz/audit-log
npm run test --workspace=apps/board
npm run typecheck
npm run lint
npm run build
```

Also run:

- DynamoDB transaction/concurrency tests and S3 upload/scan/CORS integration tests;
- an authenticated role-matrix smoke suite against isolated test resources;
- CSP/CORS browser upload and exact-version download checks;
- audit-chain/archive verification and alarm tests;
- CloudFormation output, IAM, KMS, Object Lock, versioning, PITR, deletion
  protection, CloudTrail selector, and retention checks;
- a recovery exercise for DynamoDB metadata, retained S3 versions, and encryption
  keys.

The current Playwright Board project signs nobody in, so merely adding an
authenticated E2E file is insufficient. Add an isolated authenticated test backend
or keep production-account smoke tests as an explicit post-deploy harness.

### Phase 8 — later Community/Coalition adoption

After Board is stable, migrate Community and Coalition together behind
compatibility adapters. Preserve `/resources/...` URLs, public/member policy,
existing data, bucket prefixes, and app isolation. Update the parity manifest as
the exact-copy files move into the shared package. This is a separate release from
the Board vault.

A writable Reference deployment, if still desired, is also a separate reviewed
release with Reference-only resources.

## Acceptance criteria

The work is complete only when all of the following are true:

- Legal Counsel can sign in, is visibly identified as counsel, can reach the same
  intended privileged Board surfaces as an admin/ED, and is never represented as
  a director.
- An ordinary director can read active Board-wide documents but cannot mutate
  documents or view the audit ledger.
- No accepted object version or immutable version record is deletable by the Board
  web runtime; archive never deletes content.
- Every committed document mutation has one idempotent semantic audit event in
  the same atomic DynamoDB transaction.
- Auth, denial, protected-read, provisioning, document, and audit-review events
  match the approved taxonomy without secrets or raw bodies.
- Hash-chain continuity survives concurrency; the independent archive/verifier
  detects unexpected mutation, deletion, gaps, or checkpoint failure.
- Direct upload works under the actual Board CSP and exact-origin S3 CORS, and no
  file becomes visible before validation and malware scanning succeed.
- Restoring any retained version creates a new logical history entry and preserves
  both the source and intervening versions.
- Board, Community, Coalition, and Reference retain separate sessions, tables,
  buckets, keys, IAM, environment variables, and deployments.
- Reference proves the package through synthetic read-only data without weakening
  its current no-auth/no-write production posture.
- Full repository checks, infrastructure assertions, authenticated smoke tests,
  live resource inspection, audit verification, and recovery checks all pass.

## Explicit changes from the Hermes draft

1. Rename the role variable to `BOARD_LEGAL_COUNSEL_EMAILS` and add named
   capability guards.
2. Broaden audit coverage to semantic governance/security actions and operational
   provisioning evidence.
3. Replace response-body auth inference with typed Better Auth lifecycle capture
   plus tested failed-sign-in/sign-out handling.
4. Add a stable actor id to the Board session model.
5. Replace an unbounded `previousVersions[]` item with immutable per-version rows.
6. Move document metadata out of the authentication table.
7. Replace versioning-off/delete-capable storage with staging plus retained,
   versioned/Object-Locked storage and no final delete permission.
8. Replace the two-step hash append with one DynamoDB transaction and an
   independently permissioned WORM archive/verifier.
9. Add SHA-256 content integrity, malware scanning, CSP/CORS, idempotency,
   reconciliation, and failure semantics.
10. Keep Reference read-only and put reusable behavior in neutral packages.
11. Add the missing audit viewer, legal-copy changes, authenticated test backend,
    infrastructure assertions, alarms, and recovery verification.
12. Fix the existing provisioning `--dry-run` mutation before extending it.
