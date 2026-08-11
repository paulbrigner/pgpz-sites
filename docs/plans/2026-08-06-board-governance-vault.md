# Board Governance Vault + Legal Counsel Role + Audit Log — Implementation Plan

> **Status: superseded.** Use the
> [revised plan](2026-08-06-board-governance-vault-revised.md) for historical
> design rationale and [`../board-deployment.md`](../board-deployment.md) for
> current operations.

**Goal:** Give the private PGPZ Board portal (a) a versioned governance-document
vault, (b) a Legal Counsel auth role with admin-equivalent access, and (c) a
tamper-evident audit log covering authentication and document-vault lifecycle.

**Architecture:** Reuse the board's allowlist membership model for a new
`legal-counsel` staff role; adapt the proven Community/Coalition S3 + retained-
versions document pattern into a private board vault; add a dedicated
append-only, SHA-256 hash-chained audit log table with write-only IAM.

**Tech Stack:** Next.js 15 (App Router), better-auth, `@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner`, `@aws-sdk/client-dynamodb`, Node `crypto`.

**Confirmed scope (from user):** Audit log captures **A) authentication events**
(sign-in, sign-out, failed sign-in) and **B) document-vault lifecycle** (upload,
new version, restore, archive, metadata edit, download). NOT admin/config
provisioning or full per-request traces.

---

## Design decisions (defaults — flag any you want changed)

1. **Legal Counsel role** — new allowlist `BOARD_COUNSEL_EMAILS`, a **staff**
   roster like the ED: disjoint from both `BOARD_MEMBER_EMAILS` and
   `BOARD_EXECUTIVE_DIRECTOR_EMAILS` (overlap fails config), role = `legal-counsel`,
   `isAdmin = true` (so it passes `requireBoardAdmin`), shown as a **"Legal Counsel"**
   badge.
2. **Vault read/write model** — every authenticated board member (roster + ED +
   counsel) can **view** governance documents; only **admin / ED / counsel** can
   **upload, revise, restore, archive, or edit metadata**.
3. **Vault storage** — new private S3 bucket `pgpz-board-documents` (SSE-AES256,
   non-public, version-id in object key); metadata in the board table
   `PGPZBoardNextAuth` under a `BOARD_DOCUMENT#` partition key. **All file
   versions are retained** (never pruned) to honour the "preserve founding
   documents" goal.
4. **Audit log storage** — dedicated `PGPZBoardAuditLog` DynamoDB table; every
   entry is one `PutItem` with `attribute_not_exists(sk)` (immutable id) plus a
   SHA-256 **hash chain** maintained via an atomically-replaced head item; IAM
   grants only `PutItem`, `GetItem`, `Query` (no UpdateItem/DeleteItem/Scan) →
   append-only and tamper-evident.
5. **Infra** — the board's `PgpzBoardBackend` CloudFormation stack is extended
   with the S3 bucket, the audit table, and IAM grants. All code + provisioning
   tooling will be authored here; **applying the AWS-side changes is a deploy
   step you run** (no AWS creds in this environment).

---

## Phase 0 — Legal Counsel role (roles/auth surface)

Files: `apps/board/lib/membership.ts`, `apps/board/lib/session.ts`,
`apps/board/config/server.ts`, `apps/board/config/server.test.ts`,
`apps/board/lib/membership.test.ts`, `apps/board/lib/session.test.ts`,
`apps/board/scripts/provision-board-member.ts`,
`apps/board/components/dashboard/BoardDashboard.tsx`,
`apps/board/config/site.ts`, `apps/board/.env.example`, `docs/board-deployment.md`,
`tooling/write-amplify-env.mjs`.

- `membership.ts`: add `parseBoardCounselEmails`; extend
  `createBoardMembershipAdapter` to read `BOARD_COUNSEL_EMAILS`, resolve
  `role: "legal-counsel"`, `isAdmin: true`; fail fast if counsel overlaps
  member or ED rosters (mirror the ED disjoint check).
- `session.ts`: add `"legal-counsel"` to `BoardRole` and to the role mapping
  (admin/ED/counsel → `isAdmin`).
- `config/server.ts` + `config/site.ts`: keep `isAdmin` derivation; no new
  server wiring needed beyond env passthrough.
- `provision-board-member.ts`: accept addresses on `BOARD_COUNSEL_EMAILS`.
- `BoardDashboard.tsx`: render **"Legal Counsel"** badge for `legal-counsel`
  role (alongside the ED / Board-of-Directors branch).
- Tests: membership (counsel resolves active + admin, overlaps member/ED
  rejected), session (role + badge metadata), config/server (env accepts the
  new var).
- Docs/env: `.env.example`, `board-deployment.md`, `write-amplify-env.mjs`
  (add `BOARD_COUNSEL_EMAILS`).

## Phase 1 — Audit log subsystem

Files: `apps/board/lib/audit.ts`, `apps/board/lib/audit.test.ts`,
`apps/board/lib/config.ts` (new `BOARD_AUDIT_TABLE`), `apps/board/lib/dynamodb.ts`
(audit client), `apps/board/app/api/better-auth/[...all]/route.ts` (auth-event
hooks).

- `lib/audit.ts`: `appendAuditEvent({ actorId, actorEmail, actorRole, category,
  action, target?, summary?, details? })`. Reads head item, computes
  `sha256(prevHash || canonicalJSON(event))`, puts the entry with
  `attribute_not_exists(sk)`, replaces head with `ConditionExpression` on the
  read prev-hash (retry on concurrent mismatch). Exports `listAuditEvents(limit)`
  for an admin review view.
- Auth event capture in `app/api/better-auth/[...all]/route.ts`: after
  `auth.handler(request)`, detect `/sign-in` (success vs failed via response
  status/body) and `/sign-out`, and append auth events with the normalized
  email. (This path drives both success and failure without relying on
  better-auth hook semantics.)
- Vault routes (Phase 2) call `appendAuditEvent` for each lifecycle action and
  **download**.
- Tests: hash-chain continuity, immutability (re-put of same sk rejected),
  concurrent-append conflict retry, event serialization.

## Phase 2 — Governance document vault

Files: `apps/board/lib/documents.ts`, `apps/board/lib/documents.test.ts`,
`apps/board/lib/config.ts` (`BOARD_DOCUMENTS_BUCKET`/prefix), `apps/board/lib/s3.ts`,
`apps/board/app/api/documents/route.ts` (list, prepareUpload, completeUpload,
archive, restore, metadata), `apps/board/app/api/documents/[id]/download/route.ts`
(streaming GET/HEAD, admin/ED/counsel + all-member read guard), board UI:
`apps/board/components/documents/DocumentLibrary.tsx`,
`apps/board/app/(portal)/documents/page.tsx` (viewable by all members),
`apps/board/app/(portal)/documents/manage/page.tsx` (admin/ED/counsel).

- `lib/documents.ts`: record shape `{ id, title, category, description,
  currentVersion, previousVersions[] }` with version `{ versionId, s3Key,
  originalFileName, contentType, fileSize, etag, uploadedAt, uploadedByRole }`.
  Prepare/complete flow mirrors `coalition/lib/admin/public-files.ts`
  (presigned PUT, server re-`Head` + magic-byte signature check, conditional
  revision put). Retain all versions (no pruning cap).
- `lib/s3.ts`: board `S3Client` (mirror `coalition/lib/s3.ts`).
- API: `POST /api/documents` guarded by `requireBoardAdmin` (admin/ED/counsel);
  `GET /api/documents` listable by any authenticated roster member;
  download route streams from S3 with range support and `private, no-store`.
- UI: library grid (title, category, version count, date, download) for
  members; manage view with upload (presigned), revise, restore, archive, and
  metadata forms for admin/ED/counsel.
- Tests: document create/version/restore/archive round-trips, authz
  boundaries (member cannot upload/manage; admin/ED/counsel can), validation
  failures, audit events written per action.

## Phase 3 — Provisioning, docs, and verification

Files: `tooling/` board-stack CloudFormation additions + `provision:board-backend`
extensions, `package.json` scripts, `docs/board-deployment.md`,
`e2e/board-documents.spec.ts`.

- Extend `PgpzBoardBackend` stack: `pgpz-board-documents` S3 bucket
  (versioning off — version-id in key is the source of truth; block public
  access; SSE-AES256), `PGPZBoardAuditLog` table (no TTL, deletion protection),
  IAM: board compute role gains s3 on the bucket (Put/Get/Head/Delete on
  `documents/*`) and dynamodb PutItem/GetItem/Query on the audit table
  (explicitly **no** UpdateItem/DeleteItem/Scan), env output vars.
- Update `write-amplify-env.mjs board` to require/emit the new vars.
- Full verification: `npm run lint`, `typecheck`, `test` (board + any shared),
  `build`; rules to confirm counsel/ED/admin role gates and that a plain member
  can view but not upload; confirm audit rows exist after sign-in, sign-out,
  upload, version, download.

---

## Open question to confirm before building

- **Infra provisioning:** OK that I author the CloudFormation + IAM + env changes
  (code) and the bucket/table policy as part of this work, with the actual AWS
  apply left as a runbook step for you? (The board currently has **no** S3 access
  and a DynamoDB-only IAM role, so the vault cannot function until the stack is
  updated — regardless of how complete the app code is.)
