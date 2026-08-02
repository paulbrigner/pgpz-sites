# Strengthen Zcash Topic Briefings — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Upgrade the Community X Monitor Topic Briefings from "curated X-conversation answers" into complete Zcash policy briefings — each with an explicit Zcash relevance statement, primary-source evidence links, a "what changed" note, prominent last-reviewed state, related PGPZ updates and ZEC Shelf resources, and a member feedback loop (suggest source / flag outdated / request briefing).

**Architecture:** The briefing *synthesis* pipeline lives in the external zodldashboard backend and its contracts are vendor-pinned in `packages/x-monitor-core` (verified by `xmonitor:verify-vendor`). We therefore do **not** extend the pinned contracts. Instead we add an **app-owned editorial metadata layer** in `apps/community`: a DynamoDB item type (`BRIEFING_EDITORIAL#`) holding per-topic editorial content (relevance, primary sources, related links, what-changed), joined to the fetched `CuratedBriefing` at render time, plus a feedback item type (`BRIEFING_FEEDBACK#`) for member submissions. Admin gets an editorial editor and a feedback inbox; the public page gets the enriched presentation. Everything is tolerant of the editorial record being absent (briefings still render as today).

**Feature classification (per AGENTS.md):** intentional app-specific enhancement of an already-extracted shared feature. `x-monitor-core` remains community-`active`, coalition-`not-enabled-intentional`; nothing moves to `packages/*` — Coalition has no X Monitor surface. New files are Community `appOwnedIntegrationPaths` and get registered in `tooling/parity/manifest.json` (additive only).

**Tech Stack:** Next.js 15 (App Router, server components + client components), React 19, TypeScript, DynamoDB via `@aws-sdk/lib-dynamodb` on the existing Community `TABLE_NAME` (nextauth table, key-prefix pattern proven by `zec-shelf`), vitest colocated tests, existing lucide-react icon set and glass-surface design tokens.

---

## Current state (verified)

- Public page: `apps/community/app/x-monitor/briefings/page.tsx` (member-gated via `getMemberAccess` + `canAccessCommunityXMonitor`; feature-flagged by `NEXT_PUBLIC_XMONITOR_BRIEFINGS_ENABLED`; renders `UnavailableNotice` when the backend is unreachable).
- Presentation: `apps/community/components/x-monitor/XMonitorBriefings.tsx` — accordion per topic; shows category chip, stale badge ("Update under review"), question, "Evidence through" + source count, key-points box, markdown answer with auto-linked `[n]` citation markers, metadata grid (Evidence current through / AI draft generated / PGPZ reviewed / Published), source cards (X posts), disclaimer, deep link. Already has `formatDate` helpers and a `buildCitationReferences` utility.
- Admin: `apps/community/components/admin/BriefingsAdminPanel.tsx` + `apps/community/lib/admin/x-monitor-briefings.ts` (external admin API client, topic/version CRUD, review workflow) + BFF routes `apps/community/app/api/admin/x-monitor/briefings/[...segments]/route.ts` (GET/PATCH/DELETE/POST).
- Contracts (pinned, external): `packages/x-monitor-core/src/contracts.ts` — `CuratedBriefing` (`topic_id`, `slug`, `question`, `category`, `order`, `version_id`, `answer_text`, `key_points`, `citations[]`, `generated_at`, `corpus_from/through`, `reviewed_at`, `published_at`, `stale_after`, `stale`, `models`, `provenance`).
- Data access: Community uses one DynamoDB table (`lib/dynamodb.ts` → `TABLE_NAME`), keyed `pk`/`sk` with item-type prefixes (`RESOURCE#` for zec-shelf; `zec-shelf-server.ts` shows the repository-instantiation pattern).
- Feature flags: `lib/x-monitor-public.ts` (`isCommunityXMonitorBriefingsEnabled`).

**Gaps vs. roadmap requirements:** (1) no Zcash-relevance statement; (2) citations are X posts only — no primary sources (official docs/announcements); (3) no "what changed" surface; (4) last-reviewed exists but is buried in a 4-cell grid; (5) no related PGPZ updates / ZEC Shelf links; (6) no feedback mechanism; (7) no editorial gate enforcing a meaningful Zcash connection.

---

## Design decisions

- **Editorial record keyed by briefing slug** (`BRIEFING_EDITORIAL#<slug>`): the same slug exists on topic and briefing, so admin and page can join without the external backend.
- **All public enrichment tolerant of missing records** — treat "no editorial record" as today's rendering, never fail the page.
- **Feedback stored, not messaged**: submissions land in DynamoDB (`BRIEFING_FEEDBACK#<slug>#<id>`), member-identifiable, surfaced in the admin panel as an inbox queue (mark reviewed). No email/Signal wiring in this phase — the roadmap's "handoff to Signal" applies to the expertise directory, not here.
- **Editorial gate**: a briefing cannot be marked "reviewed" in the editorial record without a non-empty `zcash_relevance` (enforced in the admin PUT route + admin UI validation) — this operationalizes "coverage requires a meaningful Zcash connection."
- **No new IAM/table**: reuse `TABLE_NAME` with new prefixes; parity manifest registration is additive.

---

## Tasks

### Task 1: Define editorial record types and repository

**Objective:** Create the typed DynamoDB repository for per-briefing editorial metadata.

**Files:**
- Create: `apps/community/lib/x-monitor-briefing-editorial.ts`
- Test: `apps/community/lib/x-monitor-briefing-editorial.test.ts`

**Step 1: Write failing test** — colocated vitest with a mocked `documentClient` (mirror `packages/zec-shelf/src/server/repository.test.ts` style):
- `getEditorial(slug)` returns `null` when absent.
- `upsertEditorial(slug, input)` persists and returns the merged record with `updated_at`.
- Validation: `zcash_relevance` must be non-empty on upsert; `primary_sources[].url` must be `https:`; `related_zec_shelf_resource_ids` and `related_pgpz_update_slugs` are string arrays with caps (e.g. 20 each).

**Step 2:** Run `npm run test --workspace=apps/community` — expected: FAIL (module missing).

**Step 3: Implement** — types:

```ts
export type BriefingPrimarySource = {
  title: string;        // 1..200 chars
  kind: "documentation" | "announcement" | "regulation" | "research" | "other";
  url: string;          // https only
};

export type BriefingEditorial = {
  slug: string;
  zcash_relevance: string;              // markdown, 1..4000, REQUIRED for reviewed
  primary_sources: BriefingPrimarySource[];
  related_pgpz_update_slugs: string[];  // /updates/[slug]
  related_zec_shelf_resource_ids: string[]; // zec-shelf resource ids
  what_changed: string;                 // markdown, optional; free text "what's new in this version"
  review_note: string | null;           // optional admin note
  reviewed: boolean;
  updated_at: string;
};
```

- Repository functions: `getBriefingEditorial(slug)`, `upsertBriefingEditorial(slug, input)`, `listBriefingEditorials(slugs?: string[])` (batch gets). Use `cleanBriefingEditorialDraft(input)` for normalization + errors (mirror `cleanZecShelfDraft` in `zec-shelf/src/domain.ts`). SK pattern: `BRIEFING_EDITORIAL#${slug}` inside the Community partition key.
- Server-only (`import "server-only";` at top).

**Step 4:** Run the test — expected: PASS. **Step 5:** commit `Add briefing editorial metadata repository (#56)`.

### Task 2: Instantiate the community editorial repository

**Objective:** Wire config into a server module, like `zec-shelf-server.ts`.

**Files:**
- Modify: `apps/community/lib/x-monitor-briefing-server.ts` (Create)
- Test: colocated `apps/community/lib/x-monitor-briefing-server.test.ts`

**Steps:** export `communityBriefingEditorialRepository` built from `documentClient` + `TABLE_NAME` (import from `@/lib/dynamodb`) with partition key matching the zec-shelf usage. Test: repository is constructed with the community table name; config errors propagate. Run the community workspace tests, commit.

### Task 3: Admin editorial BFF route

**Objective:** Authorized GET/PUT for a single briefing's editorial record.

**Files:**
- Create: `apps/community/app/api/admin/x-monitor/briefings/[slug]/editorial/route.ts`
- Test: colocated `route.test.ts` (mirror `apps/community/app/api/admin/x-monitor/briefings/route.test.ts` auth patterns).

**Steps:**
- `GET`: admin-auth (reuse the existing admin authorization helper used by the sibling briefing routes), return editorial or `{ editorial: null }`.
- `PUT`: validate via `cleanBriefingEditorialDraft`; **reject non-empty-`zcash_relevance` gate when `reviewed: true`** (400 with a message); upsert; return the record.
- Tests: anonymous → 401; non-admin → 403; invalid URL → 400; `reviewed: true` without `zcash_relevance` → 400; valid upsert → 200 + persisted shape.
- Run `npm run test --workspace=apps/community`, commit `Add briefing editorial admin API (#56)`.

### Task 4: Extend BriefingsAdminPanel with an Editorial tab

**Objective:** Admin can edit relevance, primary sources, related links, what-changed, and mark reviewed.

**Files:**
- Modify: `apps/community/components/admin/BriefingsAdminPanel.tsx`
- Test: `apps/community/components/admin/BriefingsAdminPanel.test.tsx`

**Steps:**
- Add an "Editorial" tab per selected briefing: textarea `zcash_relevance` (with helper: "State the direct Zcash relevance — not general crypto relevance"), repeatable primary-source rows (title, kind select, https URL), multi-select text inputs for related `updates` slugs and `zec-shelf` resource ids, `what_changed` textarea, "Reviewed" toggle (disabled+saved only when relevance non-empty), save button → PUT to the route above.
- Reuse existing panel conventions (inputClass, section styles, `formatDate`).
- Tests: renders editorial fields when record exists; save disabled while relevance empty and reviewed checked (UI-level), successful save calls the route and refreshes.
- Run tests, commit `Add briefing editorial editor to admin panel (#56)`.

### Task 5: Public editorial panel component

**Objective:** Render the enrichment on the public briefing.

**Files:**
- Create: `apps/community/components/x-monitor/XMonitorBriefingEditorial.tsx`
- Test: `apps/community/components/x-monitor/XMonitorBriefingEditorial.test.tsx`

**Steps:** Client-safe component receiving `editorial: BriefingEditorial | null` + `briefingSlug`:
- "Why this matters for Zcash" callout card when `zcash_relevance` present (styled with existing `glass-surface`/`brand-*` tokens).
- "Primary sources" list (icon per kind, external links, `rel="noopener noreferrer"`).
- "Related resources" — PGPZ updates links (`/updates/<slug>`) and ZEC Shelf links (`/zec-shelf?...` or resource URL — use the zec-shelf resource URL when resolvable, else the shelf landing) .
- "What changed" block when `what_changed` present; only rendered inside the open accordion body.
- Renders `null` when `editorial === null`.
- Tests: null → renders nothing; full record → headings/links present; href safety (skip `javascript:`).
- Run tests, commit `Add briefing editorial presentation component (#56)`.

### Task 6: Join editorial records on the public page

**Objective:** `app/x-monitor/briefings/page.tsx` fetches editorials and passes them down.

**Files:**
- Modify: `apps/community/app/x-monitor/briefings/page.tsx`
- Modify: `apps/community/components/x-monitor/XMonitorBriefings.tsx`
- Test: `apps/community/components/x-monitor/XMonitorBriefings.test.tsx`

**Steps:**
- Page: after fetching briefings, `listBriefingEditorials(slugs)`; build `Map<slug, BriefingEditorial>`. On repository error, log and continue with empty map (never break the page).
- `XMonitorBriefings`: accept `editorials: Record<string, BriefingEditorial>`; inside each accordion body, after the metadata grid, render `<XMonitorBriefingEditorial editorial={...} />`.
- Also surface `reviewed_at` more prominently: change the grid label to "Last reviewed by PGPZ" and add a "Reviewed <date>" line in the collapsed summary when `reviewed_at` exists (cheap, closes requirement 4).
- Tests: passing editorials renders components; missing editorial renders nothing; stale badge + reviewed date both show.
- Run tests, commit `Join briefing editorials on the public page (#56)`.

### Task 7: Feedback repository

**Objective:** Store member submissions.

**Files:**
- Create: `apps/community/lib/x-monitor-briefing-feedback.ts`
- Test: `apps/community/lib/x-monitor-briefing-feedback.test.ts`

**Steps:** Types:

```ts
export type BriefingFeedbackKind = "suggest_source" | "flag_outdated" | "request_briefing";
export type BriefingFeedback = {
  id: string;               // uuid
  slug: string;             // briefing slug
  kind: BriefingFeedbackKind;
  body: string;             // 1..2000 chars
  member_id: string;        // hashed stable member id (reuse existing hashing helper if present)
  status: "new" | "reviewed";
  created_at: string;
  reviewed_at: string | null;
};
```

- `createBriefingFeedback(input)` (SK `BRIEFING_FEEDBACK#<slug>#<id>`, condition `attribute_not_exists`), `listBriefingFeedback(slug, { includeReviewed?: boolean })`, `markBriefingFeedbackReviewed(id, slug)`.
- Tests cover validation, persistence via mocked client, listing order (newest first), reviewed filtering. Run tests, commit `Add briefing feedback repository (#56)`.

### Task 8: Public feedback submit route

**Objective:** Member-authenticated POST.

**Files:**
- Create: `apps/community/app/api/x-monitor/briefings/[slug]/feedback/route.ts`
- Test: colocated `route.test.ts`

**Steps:** POST only; requires `getMemberAccess().authenticated` (401 otherwise) and `canAccessCommunityXMonitor`; validates `kind` in enum and `body` length; stores with hashed member id; caps: reject if the same member has > 3 `new` submissions for that slug (400). Tests: anonymous 401; invalid body 400; success 201; duplicate-spam cap 400. Run tests, commit `Add briefing feedback submission API (#56)`.

### Task 9: Feedback UI on the public briefing

**Objective:** Members can suggest / flag / request.

**Files:**
- Modify: `apps/community/components/x-monitor/XMonitorBriefings.tsx` (or the new editorial component)
- Test: `apps/community/components/x-monitor/XMonitorBriefingEditorial.test.tsx` / `XMonitorBriefings.test.tsx`

**Steps:** Small client form at the bottom of each briefing body: three buttons ("Suggest a source", "Flag as outdated", "Request a briefing") opening a textarea + submit; POST to the route; success state ("Thanks — PGPZ will review"); error state inline. No comments/forums — submission only. Tests: renders buttons, submits, shows success. Run tests, commit `Add briefing feedback UI (#56)`.

### Task 10: Admin feedback inbox

**Objective:** Admins see and resolve submissions.

**Files:**
- Modify: `apps/community/app/api/admin/x-monitor/briefings/[slug]/feedback/route.ts` (Create)
- Modify: `apps/community/components/admin/BriefingsAdminPanel.tsx`
- Test: colocated route test + panel test

**Steps:** Admin GET list + PATCH mark-reviewed per briefing; panel "Feedback" tab listing slug/new/reviewed counts with expandable bodies and a "Mark reviewed" action. Run tests, commit `Add admin briefing feedback inbox (#56)`.

### Task 11: Register app-owned paths in the parity manifest

**Objective:** Keep `parity:check` consistent with the new Community surfaces.

**Files:**
- Modify: `tooling/parity/manifest.json` — under `extractedFeatures` → `x-monitor-core` → `appOwnedIntegrationPaths.community`, add: `lib/x-monitor-briefing-editorial.ts`, `lib/x-monitor-briefing-feedback.ts`, `lib/x-monitor-briefing-server.ts`, `app/api/x-monitor/briefings/[slug]/feedback/route.ts`, `app/api/admin/x-monitor/briefings/[slug]/editorial/route.ts`, `app/api/admin/x-monitor/briefings/[slug]/feedback/route.ts`, `components/x-monitor/XMonitorBriefingEditorial.tsx`.
- Documentation note in the manifest's `contentOwnership` string: "Community owns briefing editorial metadata, feedback, and enriched presentation."

**Verify:** `npm run parity:check` passes (additive entries only; no sibling-file drift). Commit `Register briefing editorial paths in parity manifest (#56)`.

### Task 12: Full gate + docs

**Objective:** Everything green.

**Steps:**
1. `npm run check` (history:verify, parity:check, boundaries:check, typecheck, test, lint) — fix any failures. Note: `npm test` is the full multi-suite; for iteration use `npm run test --workspace=apps/community`, then the full `npm run check` once.
2. Update `docs/x-monitor-community-integration.md` with a short "Briefing editorial metadata and feedback" section (storage prefixes, admin surface, public surface, privacy note that feedback stores hashed member ids only).
3. Commit `Document briefing editorial metadata and feedback (#56)`.

---

## Verification & rollout

- **Local:** `npm run check` green; targeted suites: `npm run test --workspace=apps/community`, `npm run parity:check`.
- **Prod smoke (after deploy):** sign in as active member → `/x-monitor/briefings` renders briefings with editorial content where present; anonymous → redirect; non-member → membership-required; feedback submit succeeds and appears in admin inbox; flagging a briefing without relevance is possible, and admin sees a `zcash_relevance`-less briefing cannot be marked reviewed.
- **Deploy:** push to `main` (webhook builds Community + Coalition) or `aws amplify start-job --app-id d2xb9ethk5a24j --branch-name main --job-type RELEASE --region us-east-1` when the user requests. Reference unaffected (feature-flag off). No schema-sensitive env changes beyond the existing `NEXT_PUBLIC_XMONITOR_*` flags.

## Out of scope (deliberate)

- Extending `packages/x-monitor-core` contracts or touching the compose pipeline (vendor-pinned; backend work happens in zodldashboard).
- Email/Signal delivery of feedback; comments/forums; automated "relevance" scoring.
- Coalition enablement.
