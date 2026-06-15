# PGPZ UX Enhancement Process

This document explains how designers should use the PGPZ Figma workspace and Codex together to improve the PGPZ Community website without losing track of the current product behavior, review decisions, or implementation requirements.

The core workflow is:

1. Start from the current app evidence.
2. Create one focused redesign packet in Figma.
3. Generate and refine design variants.
4. Get one design approved.
5. Hand the approved frame to Codex with explicit acceptance criteria.
6. Verify the implemented result against the approved design and named states.

## Figma Workspace

Use the shared Figma file:

[pgpz-community UX Refinement Workspace](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq)

Important pages:

- [01 Current flow map](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=33-2): system flow anchors named `F01`, `F02`, etc.
- [07 Screen inventory + flow links](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=34-2): current screen inventory named `S01`, `S02`, etc.
- [08 Screen captures](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=36-3): baseline screenshots of the current website.
- [02 UX audit backlog](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=64-2): intake board for candidate UX improvements.
- [09 UX enhancement process](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=66-3): visual process map.
- [10 Redesign work packet template](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=67-3): duplicable packet template for each screen or flow slice.
- [05 Decisions + handoff](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=65-2): approval, Codex handoff, QA, and traceability board.

## Terms

- **Screen ID (`Sxx`)**: a current product screen from the screen inventory, such as `S06 X proof verification`.
- **Flow anchor (`Fxx`)**: a step in the system flow map, such as `F07 Generate X challenge`.
- **Work packet**: one Figma frame that contains the current capture, design proposals, state matrix, approval decision, and Codex handoff details.
- **Approved frame**: the final reviewed Figma frame that Codex should implement.
- **Trace row**: a record tying one screen ID to an approved Figma node, implementation branch or PR, verification capture, and ship date.

## Designer Responsibilities

Designers own:

- Selecting a focused screen or flow slice to improve.
- Preserving current-state evidence before proposing changes.
- Creating design variants that cover the required states.
- Recording review decisions and unresolved questions.
- Preparing an implementation-ready handoff for Codex.
- Reviewing the implemented result against the approved design intent.

Designers should not:

- Edit or overwrite baseline screenshots on page 08.
- Ask Codex to implement from an unapproved exploratory frame.
- Combine unrelated screens into one implementation request.
- Leave auth, admin, legal, email, or permission behavior ambiguous.
- Treat visual polish as approved if the core user flow is still unclear.

## Process

### 1. Choose a Screen or Flow Slice

Start on [02 UX audit backlog](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=64-2).

Pick one backlog card or add a new one. The card should name:

- The screen ID, such as `S02`.
- The relevant flow anchors, such as `F03-F04`.
- The user or admin problem.
- The expected outcome.
- The next action.

Keep the scope narrow enough for one design review and one focused implementation pass. Good examples:

- `S06 X proof verification recovery states`
- `S02 signup form confidence and legal clarity`
- `S11 admin roster action clarity`

Poor examples:

- `Improve onboarding`
- `Redesign admin`
- `Make the site cleaner`

Before proceeding, confirm the chosen work has:

- One primary screen ID.
- One coherent flow slice.
- A named user or admin goal.
- A clear reason the current experience needs improvement.

### 2. Gather Current Evidence

Use these Figma pages before designing:

- Page 07 for the current screen inventory and route.
- Page 01 for the system flow anchors.
- Page 08 for the current screen captures.

If page 08 does not show a state that matters to the redesign, ask Codex to refresh or add current captures before creating variants. Designers should not rely on memory for current behavior when a screenshot or route check is practical.

Capture these details in the work packet:

- Current route or entry point.
- Current screen capture.
- Relevant `Fxx` anchors.
- Current copy that must remain, change, or be reviewed.
- Known role or permission requirements.
- Known email, admin, legal, or data side effects.

### 3. Duplicate the Work Packet Template

Open [10 Redesign work packet template](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=67-3).

Duplicate the top-level `Screen redesign work packet template` frame and move the duplicate to the design exploration page or another clearly named area. Rename it using this format:

```text
Sxx - short screen name - redesign packet - YYYY-MM-DD
```

Examples:

```text
S06 - X proof verification - redesign packet - 2026-06-15
S02 - Signup form clarity - redesign packet - 2026-06-15
```

Fill in the packet metadata:

- Screen ID.
- Flow anchors.
- Route.
- Owner or reviewer.
- Current status.
- Date created.

Fill in the problem and target outcome:

- Current problem.
- User or admin impact.
- Primary action to improve.
- Success criteria in plain language.
- Constraints.

### 4. Add Current Capture and State Requirements

Copy the relevant current screenshot from page 08 into the `Current capture` slot in the work packet.

Then complete the state coverage matrix. Keep rows that apply and delete only rows that truly do not apply.

Common rows:

- Happy/default state.
- Loading or waiting state.
- Empty or not found state.
- Error or retry state.
- Mobile/responsive state.
- Role or permission state.

For each row, add:

- Current evidence.
- Proposed design node.
- Copy or behavior notes.
- Acceptance criteria.

The packet is not ready for review until the state matrix names the states Codex must later verify.

### 5. Create Design Variants

Use the proposal slots in the packet:

- `Proposal A`: conservative improvement using the existing structure.
- `Proposal B`: more opinionated UX or hierarchy change.
- Optional additional frames if there is a genuinely different direction.

Design variants should:

- Stay grounded in the current screen capture.
- Preserve required auth, admin, legal, email, and data constraints.
- Show both desktop and mobile when layout changes materially.
- Include loading, empty, error, and permission states when they affect the workflow.
- Use existing product language unless the change is explicitly about copy.
- Avoid decorative redesign that does not improve task completion or confidence.

When using AI assistance to generate or refine a variant, provide the AI with:

- The screen ID and flow anchors.
- The current capture.
- The target user outcome.
- Required states.
- Constraints and out-of-scope items.
- Any existing design system guidance.

### 6. Review and Approve One Direction

Use the packet to support review. The reviewer should be able to see:

- What current screen is being changed.
- What problem the design solves.
- Which states are covered.
- Which proposal is recommended.
- What remains out of scope.

A design is approved only when the approval gate in the packet is complete:

- Reviewer decision.
- Approved frame node URL.
- Decision date.
- Open follow-ups returned to backlog.
- Out-of-scope notes for Codex.

Move or copy the selected design into the `Approved frame` slot. Do not ask Codex to implement any frame that is still exploratory.

### 7. Prepare the Codex Handoff

Open [05 Decisions + handoff](https://www.figma.com/design/vq5kF8QqALi49W0o6oeanq?node-id=65-2).

Move the work item to `Approved for Codex` only after the packet has:

- Approved Figma node URL.
- Screen ID and flow anchors.
- Affected route, files, or components if known.
- Acceptance criteria.
- State coverage matrix.
- Verification plan.
- Explicit out-of-scope notes.

Fill in the implementation brief sections:

- Routes/pages.
- Components.
- Server actions or APIs.
- Auth/session assumptions.
- Email templates or admin actions touched.
- Design tokens or classes to reuse.

Use this handoff prompt pattern:

```text
Implement the approved Figma frame for <Sxx>: <node URL>.
Use the current PGPZ codebase patterns and keep changes scoped to <route/component>.
Acceptance criteria: <paste from packet>.
Verify with <commands> and Brave/Playwright screenshots for <states>.
Do not change auth/admin/legal/email behavior except where this packet explicitly says to.
```

### 8. Review Codex Implementation Output

After Codex implements the approved design, review the result against the packet rather than judging it from memory.

Check:

- The changed screen matches the approved Figma intent.
- The implementation preserves required product behavior.
- The named states were verified.
- Desktop and mobile layouts are acceptable.
- Text fits and controls remain usable.
- No unrelated screens were changed.
- Any deviations are explained.

If a deviation is acceptable, record it in the traceability log. If not, return the work to `Implementing` with the exact correction needed.

### 9. Update Traceability

Before the work is considered shipped, add or complete a row in the traceability log on page 05.

Record:

- Screen ID.
- Approved Figma node.
- Branch or PR.
- Implemented capture.
- Decision notes.
- Ship date.

If follow-up work remains, create or update a backlog card on page 02 rather than hiding it in review comments.

## Readiness Checklists

### Ready for Figma Variants

- `Sxx` screen ID is selected.
- `Fxx` flow anchors are selected.
- Current screen capture exists.
- Problem statement is written.
- Target user/admin outcome is written.
- Required states are named.
- Constraints are listed.

### Ready for Review

- Current capture is visible in the packet.
- At least one proposal is complete enough to evaluate.
- State matrix is filled in.
- Open questions are visible.
- Out-of-scope items are explicit.
- Recommendation is clear.

### Approved for Codex

- One approved frame is selected.
- Approved frame node URL is recorded.
- Reviewer and decision date are recorded.
- Acceptance criteria are explicit.
- Routes, files, or components are listed where known.
- Verification states are named.
- Auth, admin, legal, email, and permission constraints are explicit.

### Ready to Ship

- Implementation was reviewed against the approved frame.
- Desktop and mobile captures were checked.
- Required states were checked.
- Relevant tests or build checks ran, or exceptions are documented.
- Traceability row is complete.
- Follow-up work is moved to backlog.

## Naming Conventions

Use these naming patterns in Figma:

```text
Sxx - screen name - redesign packet - YYYY-MM-DD
Sxx - screen name - proposal A
Sxx - screen name - proposal B
Sxx - screen name - approved
Sxx - screen name - implemented capture - YYYY-MM-DD
```

Use concise frame names that include the screen ID. Codex handoff is much more reliable when the approved frame, packet, backlog card, and trace row all share the same `Sxx` identifier.

## Scope Guidance

Prefer one of these scopes:

- One screen.
- One screen plus its loading/error states.
- One small flow slice, such as signup to email-sent.
- One admin action and its confirmation states.

Avoid these scopes:

- Multiple unrelated screens.
- Visual refreshes with no user outcome.
- Changes that mix UX, data model, and admin policy unless explicitly approved.
- Redesigns that require new email behavior without including the email trigger and template implications.

## When Designers Should Ask Codex for Help

Ask Codex to:

- Refresh current screenshots when the app has changed.
- Capture a missing state from the live app.
- Identify likely route, component, or API touchpoints.
- Turn an approved Figma frame into a focused implementation.
- Run desktop and mobile visual verification.
- Explain implementation constraints before review approval.

Do not ask Codex to implement until the packet is approved.

## Practical Example

For `S06 X proof verification`:

1. Select the `S06` backlog card on page 02.
2. Confirm related flow anchors: `F07-F09`.
3. Copy the `S06` current capture from page 08.
4. Duplicate the work packet template.
5. Rename it `S06 - X proof verification - redesign packet - 2026-06-15`.
6. Fill in the problem: users need clearer recovery when X search timing or pasted URL matching is ambiguous.
7. Fill in states: default, generated challenge, searching, not found, pasted URL error, verified, mobile.
8. Create Proposal A and Proposal B.
9. Review and select one approved frame.
10. Complete the approval gate and Codex handoff.
11. Move the item to `Approved for Codex` on page 05.
12. After implementation, verify screenshots and complete the trace row.

