# PGPZ Board

Private governance portal at `board.pgpz.org`. Every route except `/signin` and
the Better Auth API is protected. Self-registration is disabled and the site
refuses indexing at metadata, robots, and response-header layers.

## Access model

Authentication alone never grants portal access. During migration, access is
read from the deployment allowlists below:

- `BOARD_MEMBER_EMAILS`: directors allowed into the portal;
- `BOARD_ADMIN_EMAILS`: legacy deployment name for the Board Chair allowlist;
  it must be a member subset and resolves to the `chair` role;
- `BOARD_EXECUTIVE_DIRECTOR_EMAILS`: full-administration staff, disjoint from
  directors;
- `BOARD_LEGAL_COUNSEL_EMAILS`: limited counsel access, pairwise disjoint from
  directors and Executive Director.

An absent/empty member and staff roster locks everyone out. After the guarded
roster migration, `BOARD_ACCESS_REGISTRY_ENABLED=true` makes
`PGPZBoardAccess` the sole runtime role/status authority; it does not fall back
to allowlists for a missing or deactivated record. UI badges do not replace
server authorization; routes and repositories enforce current roles.

| Role | Documents | Meetings | Audit ledger | User management |
| --- | --- | --- | --- | --- |
| Director | view | view + RSVP + eligible electronic consents and discussion | no | no |
| Board Chair | manage | manage + communicate + discuss | review | manage |
| Executive Director | manage | manage + communicate + discuss | review | manage |
| Legal Counsel | manage | view + meeting documents + discuss | review | no |
| Board Support | manage | prepare drafts and records; discussion read-only | no | no |

The stored legacy role `admin` is read as Board Chair so existing access never
fails during rollout, but current APIs and UI never assign `admin` to a new or
updated record.

### Access registry migration

`PGPZBoardAccess` stores a unique normalized-email claim, one
optimistic-locking profile, and an immutable revision for every change. The
guarded legacy-roster migration is dry-run by default:

```bash
npm run migrate:board-access -- --actor-email administrator@pgpz.org
```

After reviewing its create/unchanged/conflict plan, apply only with
`--apply --confirm MIGRATE_BOARD_ACCESS_ROSTER`. Apply mode writes each access
record and its hash-chained audit entry in one DynamoDB transaction. It refuses
to overwrite an existing record whose role or status differs from the roster.

## Governance boundary

Board owns its auth table, access registry, meeting table, document metadata table, audit table, staging bucket,
retained/Object-Lock bucket, audit archive, KMS key, and compute role. The
`@pgpz/document-vault` and `@pgpz/audit-log` packages provide neutral contracts;
Board supplies retention, roles, infrastructure, routes, and event semantics.

The document vault and audit ledger fail closed when required resources are
unset. Reference examples must never attach Board data or credentials.

All active portal users can open `/governance-safeguards` from the dashboard or
footer for a plain-language explanation of role-scoped access, preserved
document versions, integrity verification, recorded activity, and the
Board-specific AWS hosting boundary. The all-member architecture overview
describes HTTPS transport, encryption at rest, versioned retention-protected
object storage, and protected databases with recovery and deletion safeguards.
It describes these controls as support for governance and record-retention
obligations, not as a legal or regulatory certification. Board Chair, Executive
Director, and Legal Counsel roles additionally see a more detailed technical
overview; account and resource identifiers, IAM policy details, and operational
secrets are never exposed. The dashboard shows a dismissible first-use notice,
while the Document Library and Board Meetings surfaces provide small contextual
links without duplicating records or management interfaces.

Authorized reviewers see audit events newest-first in `/admin/audit`, 25 per
page, with explicit refresh and newer/older navigation. Pagination affects only
the presentation query; the integrity indicator continues to verify the entire
stored hash chain against its recorded head.

## Brand and marketing records

Current PGPZ identity and social-media packages live in the authoritative
`brand-trademark` folder in `/documents`; the dashboard does not expose a
separate curated brand view. Existing `/brand` bookmarks redirect to the
Document Library. Document versioning, Object Lock retention, role checks, and
download audit events therefore stay on the same governance-vault records.

The full `/documents` surface groups records into Board-owned category folders
and uses the curated brand registry to present packages, guidelines, manifests,
and checksums as related document collections. Category folders and collections
start collapsed; a direct link to a document opens its containing folder and
collection. Search and category, collection, or file-type filters expand matching
results. Filters combine with keyword search, show a matching document count,
and can be cleared back to the active library. File type reflects the current
retained file, independently of its display name or brand-package role.
Active documents are the default. Document managers can choose Active, Archived,
or All documents; directors continue to receive active records only, including
in filter options and counts. These relationships are presentation metadata
only; every row still downloads the authoritative retained vault record and
generates the same audited read event.

The Board-owned **Adopted documents** filter combines with the existing library
filters and does not change Active/Archived visibility. Each document's adoption
panel identifies the exact adopted versions, resolutions, actual adoption times,
director consent counts, and separately signed effective-date/condition text.
Uploading a revision neither adopts it nor supersedes an earlier adopted version.
An absent link means no explicit portal adoption record, not a legal finding that
the document was never adopted elsewhere. Ordinary categories stay unchanged.

The **In effect** badge identifies an officer-designated version, independently
of the latest upload and portal adoption records. The badge and **Open in-effect
version** link appear on desktop and mobile; version history marks the exact
version. **Filter by effect → In effect** combines with search and all other
filters. **Not designated** means no designation is recorded, not a finding that
the document has no legal effect. Directors still cannot see archived records.

The Chair or Executive Director can open version history → **Manage in-effect
designation**, select a retained version (or clear the designation), explain the
basis, and confirm the current status. Other document managers cannot change it.
The service rechecks active officer access and the document revision, binds the
stored version ID and SHA-256, and atomically writes the designation, immutable
change record, access guard, and audit event. Changes require recent passkey
verification. One version per library entry can be designated; a newer upload,
restoration, archive or metadata edit does not replace that designation. Officers
verify approval, filing and other conditions before setting it; adoption and
uploads never infer effectiveness automatically. Meeting and restricted records
are not eligible. See the [release runbook](../../docs/board-deployment.md#in-effect-document-designations).

Document management is integrated into this same library rather than exposed as
a parallel interface. Board Chair, Executive Director, Legal Counsel, and Board
Support roles see permission-scoped controls for creating documents, adding a
version within version history, changing a display name, and archiving or
restoring records. Directors see only the reading interface. Display names are
mutable Board presentation metadata: changing one does not rename retained
objects, alter canonical document identity, or break governed brand-package
relationships. Every mutation retains recent-passkey step-up enforcement and
appends its normal audit evidence. `/admin/documents` remains only as a
compatibility redirect to `/documents`.

## Board meetings

`/meetings` is an upcoming-first Board workspace with a retained past-meeting
archive. Every active portal user can review published meetings, download an
iCalendar event, and record an RSVP for a live meeting. Board Support can create
and prepare draft meetings, agendas, attendance, decisions, action items, and
draft minutes.
Only the Board Chair and Executive Director may publish, reschedule, cancel, or
close a meeting, record minutes approval, or send an official communication.

A meeting can be `live` or an `asynchronous` workspace for **action without a
meeting by unanimous written consent**. Async discussion is not a legally
convened meeting, and agreement to use the portal does not approve an action.
Each resolution has its own electronic consent record; an omnibus resolution
or an uploaded signature PDF is unnecessary. Meeting details show separate opening
and closing dates and times in the meeting timezone; list summaries also include
the closing date for multi-day windows.

Asynchronous meeting pages lead with a compact **Your resolution checklist**.
Each collapsed row shows the viewer's recorded review or consent status,
collection status, consent count, and document/discussion counts. Search covers
resolution titles, text, and attached document titles. **Needs my attention**,
**My consent delivered**, **Waiting**, and **Reference** filters distinguish
outstanding personal steps from completed signatures and historical items.
A completed review never counts as a consent; paused rosters, closed windows,
and cancelled items do not prompt new signatures. Staff see a reading-oriented
resolution list using only their existing authorized payload.

Opening a row reveals the exact action, documents, and existing review/signature
controls. Director consent lists, discussions, and management tools expand
separately. Collapse and filtering preserve unfinished form entries. Existing
`#ballot-<id>` links reveal the referenced row and clear any hiding filters.
**Refresh status** retrieves current server records. Preparation materials,
follow-up tasks, and minutes start collapsed in asynchronous meetings, with
section links including the existing restricted Executive Sessions entry.
These are Board-only presentation changes; authorization, consent requirements,
review records, and retention rules remain enforced by the existing services.

Draft resolution text and document previews are collapsed until opened.
Cancelled resolution cards use neutral shading and a **Cancelled · reference
only** label, with discussions collapsed by default. Readers can expand the
retained discussion and open document or consent records; consent counts and
director statuses are explicitly historical and no participation controls are
offered for cancelled items.

The editor shows included documents first; **Add documents** opens a searchable,
scrollable picker. Adding a document defaults to supporting material, and
searching never removes an existing selection. Older selected versions remain
explicit until the officer reviews and replaces them. Select **Show earlier
versions** to include a comparison alongside a clean version of the same entry.
Each attachment has an optional description (up to 1,000 characters), displayed
beside its exact version in the resolution and printable consent record. Only
one version per document may be an adoption target; other versions are supporting
material. Descriptions become fixed when consent collection opens.

When preparing a resolution, select **Supporting document** or **Adopt this
document** for each included version. Only explicit adoption targets acquire
library adoption evidence; background materials never inherit adoption merely
because they were attached. Effective-date/condition text must agree with the
resolution and is fixed and signed with it. The portal does not determine that
an implementation condition has been fulfilled. New records use consent payload
schema 2, or schema 3 when attachment descriptions are present. Schema 3 binds
those descriptions to the signed digest. Required-review resolutions use schema 4,
which also binds the finalized director review record. Already opened schema 1 and 2 consents
retain their original digest; unsigned descriptions are omitted from their
views and exports. Schema 1 consents remain signable; they
do not retroactively classify attachments as adopted.

The Chair or Executive Director prepares the exact resolution text and selects
specific versions of active library or workspace documents. The opening officer
confirms the displayed roster contains every director currently in office and
that the action is permitted without a meeting under applicable law and the
articles/bylaws, including any conflict requirements. All directors must have
active portal access. The app fixes the full director roster, resolution text,
incorporated document IDs, version IDs and SHA-256 digests, declarations, and
collection window. Edits require a new resolution with fresh signatures. The
collection window and workspace format cannot change after a resolution opens.

Each director reviews the exact record, types their full name, explicitly
confirms electronic-signature intent, and submits through their own passkey
session with recent step-up verification. The server binds the receipt to the
authenticated user and director access record and records delivery time. An
ordinary yes vote, abstention, recusal, or silence is never a signed consent.
No threshold controls, excluded-director subset, manual majority finalization,
or manual async decision entry can adopt an action.

The transaction delivering the last required unrevoked consent automatically
adopts that resolution and appends its decision, without waiting for the window
to end. Until adoption a director can deliver a signed withdrawal, including
after the collection deadline. A completed action cannot be withdrawn, cancelled,
or rewritten. Conditions in the resolution (such as funding prerequisites)
continue to govern the action's implementation. An incomplete collection is not
adopted at its deadline; the officer may cancel it and use a new consent or an
appropriate live meeting. Resolve conflict/recusal exceptions with counsel;
this workflow always requires every director and cannot lower that requirement.

Each resolution displays its required directors' latest **Consented**, **Not yet
consented**, or **Withdrawn** status to active directors (including the Chair and
legacy admin role), with delivery times in the meeting's time zone. Pending is
not opposition. Statuses use the resolution's frozen roster and current receipt
per access ID; a later consent replaces a withdrawal in this display. The server
omits named status metadata for Executive Director, Legal Counsel, Board Support,
and inactive or missing access records. This summary does not expose other
directors' signature receipts or change executive-session admission controls.

Current receipts and immutable receipt history are retained in the Board
meetings table without TTL. The authenticated per-resolution record endpoint
`/api/meetings/[id]/ballots/[ballotId]/record` provides printable HTML and
`?format=json`. Before adoption the export reveals only the viewer's own receipts;
after adoption it includes all signatures and withdrawal history. Incorporated
versions remain available through that record even if their library head is
later archived. The general audit ledger records action/resolution identifiers,
not signature text. Legacy ordinary ballots remain historical records and
cannot be relabeled or finalized as signed consents.

The final consent transaction also creates immutable per-document adoption
locators in the meetings table. Library reads verify the underlying action,
signed targets, digest, and full current receipts before showing adoption.
**Download adoption packet**, available from the resolution and library panel,
uses `/api/meetings/[id]/ballots/[ballotId]/packet?document=<id>`. An ordinary PDF
is reproduced with a resolution/signature appendix and embedded exact original,
HTML, and JSON records. Other formats, interactive/encrypted PDFs, PDFs over 150
pages, or typography unsupported by the PDF renderer use a ZIP containing the
unchanged source, UTF-8 HTML/JSON consent records, and a manifest instead.
Packets are generated on demand, never uploaded as a new source version, and do
not create signatures or Secretary certifications. The original remains
authoritative. Sources over 12 MiB or packets over 4 MiB must be downloaded as
the original and consent record separately to respect buffered hosting limits.
Generation failures never undo adoption. Downloads require an authenticated
passkey session, verify retained bytes against the signed SHA-256, and audit the
exact document version. Restricted disclosures and executive-session materials
are excluded; only the expressly adopted ordinary-vault document is included.

A strongly consistent director-roster manifest is transactionally maintained by
access-registry mutations. Director additions, removals, role/status changes,
and session revocations invalidate unfinished collections; completed records
keep their original roster. Initialization is an explicit guarded operation in
[the Board deployment runbook](../../docs/board-deployment.md#unanimous-written-consent-release).
Collection fails closed until initialization. The website needs no Scan or
additional IAM permission. Officers must still verify that access records
match the legal board; removing portal access does not itself remove a director.

The Chair or Executive Director can send consent reminders only to eligible
directors without a current consent. The message contains a portal link and
deadline, not the motion, signatures or attachments. A changed roster pauses
reminders. Delivery retains the existing per-recipient idempotency and audit
behavior.

Every opened written resolution has an asynchronous discussion thread. Active
Directors, the Board Chair, Executive Director, and Legal Counsel can post and
reply; Board Support has read-only access. Messages are attributed to the
passkey-authenticated account, may be edited by their author for 15 minutes,
and cannot be deleted. The current message plus an immutable revision for every
post and edit are retained in the meeting partition, and each mutation appends
the normal hash-chained Board audit event with a content hash. Discussion opens
with the collection window and becomes read-only when the window closes or the
resolution is adopted or cancelled, while remaining visible in the historical meeting record.
Long URLs and other unbroken text wrap inside both messages and replies, including
author bylines, without changing the retained message contents.
Discussion does not constitute an electronic signature or consent. Threads refresh on
request; email notifications, unread counts, reactions, attachments, and live
chat delivery are intentionally outside the initial discussion scope.

Meeting lifecycle data is Board-specific and stored in `PGPZBoardMeetings` as
an optimistic aggregate with retained child records and immutable revisions.
Important mutations compose the meeting write with the Board hash-chained audit
append in one DynamoDB transaction. The table is KMS-encrypted, PITR-enabled,
deletion-protected, `Retain`-protected, has no TTL, and gives web compute no
`DeleteItem` or `Scan` permission.

### Required review before consent

The Chair may enable **Review before consent** on a draft written resolution,
enter the required due-diligence instructions, and select **Start director
review** after confirming the complete active director roster. Directors can
then view this draft and record their own review before the consent window
opens. Ordinary drafts remain hidden from non-managers until review starts.
This feature belongs only to Board; it shares no membership or records with
other apps.

Each authenticated director records an actual review date, a conflict/recusal
assessment, readiness or a request for follow-up, a brief supporting assessment,
and an explicit review attestation. The server supplies attribution and the
recorded-at time. These are review records, never votes or consents. A director
can update their own review before consent collection opens; every prior
submission and review round remains immutable. The Chair cannot complete a
review for another director. A pending review does not indicate opposition.

Detailed assessments and HTML/JSON/PDF review exports are restricted to current
active directors. The server omits them from staff and counsel page payloads,
and export authorization checks current registry status before reading review
content. Use the existing Executive Session boundary when conflicts or
compensation deliberations require a narrower participant group. This general
review feature cannot exclude a director or settle a conflict of interest.

Each recorded assessment has **Reply / Discuss** for active directors on the
current review roster. Replies are attributed and retained with the exact
assessment version and round. They do not update anyone's readiness or restart
review; only the assessment author can update their review. Updated assessments
and restarted rounds leave earlier threads available under **Earlier assessments
and replies**. Threads become read-only when consent collection opens, the
resolution or meeting is cancelled, the deadline passes, or the roster changes.
The director-only HTML/JSON/PDF review packet includes the retained threads;
new finalizations bind the current round's discussion digest into the consent
record, while existing finalized records keep their original digest.

Posting a reply attempts one email to the director being answered (the assessment
author or the selected message's author), with a link that opens that assessment
thread after sign-in or passkey verification. The validated opaque target is
preserved in the authentication callback. The email omits resolution titles,
assessments and reply text. Self-replies
and recipients without matching current active director access are skipped.
Delivery claims and results are retained separately from review readiness; an
uncertain or failed email does not undo the saved reply and is not retried
automatically. The portal reports the send outcome to the person posting.

For a required-review resolution, only the Chair can edit, start/restart review,
cancel, or open consent collection. Every director must record readiness with
no unresolved conflict flag. Changes to the reviewed resolution text, attachment
versions/descriptions, adoption targets, effective terms, or instructions require
an explicit restart and fresh reviews. A roster change also requires a restart.
Once started, the review requirement cannot be removed from that resolution.

Before opening consents, the Chair records findings presented for adoption and
confirms that the supporting review evidence, final terms, outstanding issues,
and timing requirements have been addressed. The server checks the exact
reviewed materials and current roster again. It freezes the review record and
binds its digest to schema 4 consent signatures. All signatures are still
required for adoption; review completion or the Chair's finalization never
adopts an action. The app records the declarations supplied, not a legal
conclusion that due diligence or a tax presumption has been established.

**Download review packet** provides a PDF containing the current round and
embedded full HTML/JSON history. Earlier reviews remain downloadable after
materials are revised or the resolution is cancelled, including when no current
review round exists; these records do not approve the changed materials.
Unsupported typography falls back to a ZIP of
UTF-8 HTML/JSON without substituting text; browser Print can produce a PDF.
The ordinary consent/adoption export includes only the review digest, keeping
the detailed review record restricted to directors.

Existing open or adopted items cannot acquire this review stage retroactively.
For an unadopted item needing revised terms, retain/cancel the original and
prepare a new required-review resolution. New review/consent collections must
open before the workspace deadline. Existing consent schemas 1-3 and their
signed bytes remain supported. See the [release safeguards](../../docs/board-deployment.md#required-resolution-review-release).

### Restricted executive sessions

The Chair (including the legacy `admin` role) can open an executive session
inside a scheduled or materials-published meeting. This is a Board-specific
authorization boundary implemented by `lib/executive-session-access.ts`,
`lib/executive-sessions-repository.ts`, and the nested `executive-sessions`
page/API routes. The access registry must be enabled; allowlists alone do not
grant executive-session access.

The Chair explicitly selects active directors, may explicitly invite active
Legal Counsel, and appoints one selected director as facilitator. The fixed
snapshot records each participant's registry ID, email, name, and director or
counsel capacity. Every request rechecks current active status and role against
that snapshot. Staff, unselected directors, uninvited counsel, and an excluded
Chair cannot list, read, download, or mutate the session. No general admin or
document-management capability overrides this check. Counsel can read and
contribute but cannot facilitate or acquire a vote through the invitation.
Use a new session when the participant group or facilitator must change.
Authorization first reads only the viewer's immutable admission grant; private
session metadata is never fetched for an excluded viewer, including during
development server-component promise tracing.

Selected participants can post immutable contributions; corrections are new
messages. The facilitator can retain private materials and permanently close
deliberation. Files support the Board upload types with a 4 MiB limit, are
validated and hashed before retention, and have session-owned metadata only.
They never enter the ordinary Document Library, meeting-material index, or
generic vault version/download routes. Downloads pass through authenticated
session authorization with `private, no-store` responses, integrity verification,
and no reusable presigned download URL. Files and messages remain readable to
authorized participants after closure. A failed concurrent close/revocation
can leave an unreferenced retained object, which is never exposed or deleted.

Closure does not constitute a vote or consent. After closure, the facilitator
may preview and explicitly publish one reviewed outcome to the ordinary meeting.
Only that text, publication time, and publisher name are released to all active
portal users, including staff. No private title, purpose, participant list,
discussion, or attachment is copied automatically. Formal resolutions, recusal
records, and required signed consents must be handled separately. Previously
shared library or ordinary meeting materials remain shared; uploading a private
copy does not revoke earlier access.

Participants find sessions on the ordinary meeting page and refresh to load new
contributions. Opening or posting does not send email; existing ordinary meeting
communications contain no executive-session content. Session mutations include
an atomic audit append, optimistic session version, and current roster guards.
The ordinary audit ledger contains opaque session/material identifiers, actor,
and action evidence, never private text, filenames, or participant lists. This
is portal access control, not cryptographic exclusion of infrastructure operators.
See the [deployment runbook](../../docs/board-deployment.md#executive-session-storage-and-release)
for the additive record layout, release checks, and rollback behavior.

Meeting documents use the same governance vault, immutable versions, retained
objects, checksums, and audited downloads as the general Document Library. A
sparse ownership index assigns each document one owner: library documents remain
in `/documents`; meeting-owned agenda, preparation, minutes, resolution, and other
records appear only inside their meeting. Changing a meeting status never deletes
its documents.

Document managers can use **Preparation materials → Add from Document Library**
in an active live or asynchronous meeting to search and select an exact retained
version. The reference pins its title, version, filename and checksum without
copying bytes or changing library ownership. Later library versions do not replace
that selection. Up to 50 active references are supported; the same document/version
cannot be linked twice. Removing a reference preserves the library document and
retained add/remove history. Closed or cancelled meetings retain read-only references.
Existing referenced versions remain downloadable by the meeting's readers if the
library item is subsequently archived; this exception requires the exact active
reference and does not expose concealed draft meetings or restricted session files.
Preparation references neither adopt documents nor change any resolution attachments
or review packet. Use the resolution's own document selector for those actions.
The Board-only materials API uses document-management authorization, passkey step-up,
meeting-version concurrency and an atomic audit append. No upload or email is sent
when adding a reference. See the deployment runbook for the additive record layout.

Calendar downloads use a stable iCalendar UID and sequence. Board Chair and
Executive Director users can manually send an invitation, update, materials
notice, reminder, consent reminder, or cancellation. Messages are delivered one recipient at a
time through the Board SES identity; that identity remains the calendar
organizer even when a different authorized officer sends an update. Messages
contain authenticated portal links rather than confidential attachments and
persist per-recipient pending/result evidence with safe partial retry. No
automated scheduler, external calendar OAuth,
transcription, or meeting-platform integration is enabled.

Board's upload adapter permits PDF, ZIP, JSON, Markdown, text, and CSV records.
The neutral `@pgpz/document-vault` package validates the injected app policy and
file signatures; ZIP bundles are delivered as attachments rather than rendered
by the Board site.

Production uploads use a ten-minute presigned `PUT` to the Board staging bucket.
The response CSP derives one exact `connect-src` origin from
`BOARD_DOCUMENTS_STAGING_BUCKET` and `REGION_AWS`; it does not permit wildcard
AWS or general external connections. The bucket independently restricts CORS to
the canonical Board origin. Local filesystem uploads remain same-origin.

The guarded importer is dry-run by default and is idempotent by the current
vault SHA-256. It requires live Board backend environment values and an existing
actor with document-management access:

```bash
cd apps/board
NODE_OPTIONS=--conditions=react-server AWS_PROFILE=zodldashboard \
npx tsx scripts/import-brand-library.ts --actor-email div@pgpz.org
```

Use the exact `--apply --confirm IMPORT_PGPZ_BRAND_LIBRARY` gate only after the
dry-run plan and current production resources have been verified.

## Local development

Follow [`docs/local-dev.md`](../../docs/local-dev.md). From the root:

```bash
cp apps/board/.env.local.example apps/board/.env.local
docker compose up -d dynamodb-local
npm run seed:local -- --app board --password 'choose-at-least-12-characters'
npm run dev:board
```

Board runs at `http://localhost:3002`. Local authentication/admin surfaces work;
the seed creates the local meetings, documents, and append-only audit tables.
Document bytes are written beneath the ignored `.local/board-documents`
directory through a same-origin development adapter. This exercises staging,
versions, checksums, meeting ownership, downloads, and audit behavior, but does
not emulate production KMS encryption or S3 Object Lock retention enforcement.

## Emergency password rollback

Normal accounts are created through `/admin/users` and use passwordless sign-in.
Creating a user sends a Board welcome email with the assigned role, sign-in
link, and passkey-enrollment instructions. Access creation remains successful
if email delivery is temporarily unavailable; the administrator sees the
delivery outcome and the audit ledger records success or failure.
The old credential provisioner is retained only for controlled rollback and
refuses to run unless password auth is explicitly enabled:

```bash
BOARD_PASSWORD_AUTH_ENABLED=true REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZBoardNextAuth \
npx tsx apps/board/scripts/provision-board-member.ts \
  director@example.org --name "Director Name"
```

Do not use this tool for onboarding. Any rollback-created credential is
temporary and must be removed through the guarded removal workflow after the
incident is resolved.

## Passwordless authentication

Board requires a user-verified WebAuthn passkey before any private Board content
is available. Passkey ceremonies use the exact Board origin/RP ID
(`board.pgpz.org` in production), and both registration and authentication
reject ceremonies that do not verify the user. A passkey-authenticated session
is valid for up to 12 hours; document mutations, access changes, audit
verification/export, and passkey changes require another passkey verification
within the preceding 10 minutes.

Ten-minute, single-use hashed magic links are limited to initial onboarding and
controlled recovery. A magic link can open `/account/security`, but it cannot
open Board content. Users must register and then verify a passkey before
continuing. Successful verification automatically returns the user to the
protected Board route they originally requested. Users manage passkeys at
`/account/security`; two passkeys are
recommended, and the final passkey cannot be removed. Board Chair and Executive
Director users can perform an audited passkey reset for a user who has lost all
authenticators. The user then uses a magic link to enroll a replacement.
Registration, removal, and administrative reset send security notifications.

`BOARD_PASSWORD_AUTH_ENABLED=false` is the normal state. After it has been
deployed and existing sessions have been revoked, remove legacy credential
records. The removal tool uses strongly
consistent read-only scans and prints exact credential accounts and session
counts by default:

```bash
BOARD_PASSWORD_AUTH_ENABLED=false NEXTAUTH_TABLE=PGPZBoardNextAuth \
  npm run remove:board-password-credentials
```

After reviewing every target, apply only with
`--apply --confirm REMOVE_BOARD_PASSWORD_CREDENTIALS --actor-email
operator@pgpz.org`. Each user's credential accounts, current sessions, and
three-item Board audit-ledger append are committed in one bounded DynamoDB
transaction. The 97-delete ceiling reserves transaction capacity for that
immutable audit evidence. The tool never targets users, passkeys,
verifications, OAuth accounts, or existing audit records, and reports partial
multi-user failures for a fresh dry-run before retry. Keep magic links
available only for onboarding and controlled passkey recovery.

Production email uses the Board-specific SES identity through the Amplify
compute role. Local development uses MailHog SMTP; no production SMTP password
or static AWS credential is supported.

## Individual conflict disclosures

`/disclosures` provides Board-owned annual and matter-specific forms, individual
passkey-backed electronic signatures, private drafts, immutable signed
amendments, and a completion register. The Chair assigns requests to directors,
the Executive Director, or other covered portal users; active users can also
start their own request. Invited users may be assigned and emailed before their
first login. The subject, explicitly assigned reviewing director, and invited
counsel are the only readers of submitted content; administrative roles have no
override. Only the subject sees drafts. A director must record completion of
review, and nobody can review their own disclosure. Reviewers can explicitly
record **Review complete — satisfactory**, request clarification, or retain
findings with documented follow-up. Existing review records are not relabeled
as satisfactory; statuses and retained history distinguish the new outcome.
After recording a review, the review panel shows and focuses a confirmation
in place of the cleared form. Saved current-review outcomes remain visible
after reopening the request; an explicit action starts another review note.
A confirmed write followed by a failed refresh still reports that it was saved.
Each newly recorded director review automatically attempts one status-only email
to the subject after the review commits. The attempt is claimed with the review;
provider acceptance or uncertainty is retained separately and shown in the
confirmation. Counsel advice and existing records do not trigger emails.

`lib/disclosures-service.ts` checks current access and content-free admission
before loading private records. `lib/disclosures-repository.ts` stores them in
separate retained Board meetings-table partitions, outside ordinary meeting and
document-library indexes. Mutations guard the current request and access-record
versions and atomically append audit evidence without private text. Signed
records bind the exact policy version, canonical form, acknowledgment,
authenticated identity, delivery timestamp, and previous signed digest. Policy
downloads and printable/JSON exports require current admission. Amendments and
review notes are retained; reassignment revokes removed reviewers and resets
review status. Automatic outcome notices and manual reminders use the Board email transport with persisted
attempt/result records and no sensitive contents or attachments.

Read [Board disclosures](../../docs/board-disclosures.md) for the Chair and
signer steps, private review, recusal routing, and records handling. The flow
does not approve conflicted transactions or automatically gate meetings.

## Validation and deployment

```bash
npm run test --workspace=apps/board
npm run typecheck:board
npm run build:board
npm run test:board-backend-infra
```

Use [`docs/board-deployment.md`](../../docs/board-deployment.md) for current
roles, environment, infrastructure, provisioning, release checks, and legal
retention prerequisites. Root `amplify.yml` is authoritative with
`AMPLIFY_MONOREPO_APP_ROOT=apps/board`.
