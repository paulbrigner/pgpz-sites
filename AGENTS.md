# PGPZ Sites Agent Guide

This file is the compact, always-loaded contract for coding agents working from
the repository root. Do not preload every document or scan the whole tree.
Load the smallest task-specific context described below, inspect the live code,
and expand only when evidence requires it.

## First minute

1. Run `git status --short --branch`. The worktree may contain user or agent
   changes; never discard or rewrite unrelated work.
2. Read the task-relevant row in the context map below.
3. Inspect the named app/package manifests and call sites before proposing or
   editing code. Documentation is a map, not proof that runtime state is current.
4. Classify the requested behavior before implementation:
   - **shared feature**: neutral contract or behavior used by multiple apps;
   - **app-specific feature**: branding, membership, authorization, data,
     infrastructure, routes, or policy owned by one app.
5. State and preserve that boundary. Never make Community and Coalition share
   member data, sessions, tables, secrets, authorization, or release controls.

## Context map

| Task | Read first | Then inspect |
| --- | --- | --- |
| Broad orientation or cross-cutting change | `README.md`, `docs/architecture.md` | affected `package.json` files and imports |
| Community behavior | `apps/community/README.md` | `apps/community/config`, routes, tests, then consumed packages |
| Coalition behavior | `apps/coalition/README.md` | `apps/coalition/config`, routes, tests, then consumed packages |
| Board portal | `apps/board/README.md`, `docs/board-deployment.md` | Board auth/config plus `@pgpz/audit-log` and `@pgpz/document-vault` as relevant |
| Reference app | `apps/reference/README.md` | `apps/reference/config` and route-surface tests |
| Shared package | that package's `README.md` and `package.json` | exports, consumers, tests, app adapters |
| Auth or identity | `packages/auth-dynamodb/README.md`, `docs/better-auth-user-index-runbook.md` | app auth/session code; add identity reconciliation only for email ownership |
| Email or background jobs | relevant email package READMEs, `packages/background-jobs/README.md` | `docs/durable-jobs-runbook.md` only for infrastructure/release work |
| Local development | `docs/local-dev.md` | `.env.local.example`, `docker-compose.yml`, seed scripts |
| Testing or release gates | `docs/testing.md` | root scripts, app package scripts, CI/build config |
| Deployment or production operations | `docs/README.md` current-runbook table | live AWS/Amplify state before any mutation |
| Historical investigation | `docs/README.md` historical table | dated record or plan explicitly requested |

Do not load `docs/plans/`, dated cutover records, migration plans, generated
`output/`, `phase7-logs/`, `.next/`, or `storybook-static/` for ordinary coding
tasks. They are evidence or artifacts, not current architecture.

## Repository invariants

- The four apps deploy independently. Community, Coalition, Board, and
  Reference own separate configuration and security boundaries.
- Community and Coalition have parallel code, but parity is intentional only
  where recorded by `tooling/parity/manifest.json`. Do not copy changes blindly.
- Shared packages must remain application-neutral and dependency-injected.
  Packages may not import from `apps/*` or use an app's `@/` alias.
- Apps may consume packages but may not import another app.
- Every workspace declares its direct dependencies. Root hoisting is not a
  dependency declaration.
- `@pgpz/core` is client-safe; `@pgpz/core/server` is server-only. Preserve
  server/client export boundaries in every package that offers them.
- Feature switches are registered centrally but enabled by each app. A shared
  implementation does not imply shared enablement.
- Production AWS clients use the default credential chain and app-specific
  Amplify compute roles. Never add static production credentials to source,
  environment examples, logs, or generated artifacts.
- Schema, queue, email, identity, and retention changes require their guarded
  runbook. Dry-run defaults and exact confirmation gates are safety controls.

## Change workflow

- Use `rg`/`rg --files` and targeted reads. Exclude generated folders.
- Prefer extraction when behavior is truly neutral and duplicated. Keep thin
  app adapters for auth, policy, branding, environment, AWS clients, and routes.
- For a shared Community/Coalition change, inspect both implementations and
  classify each touched path. Update the parity manifest only after deciding
  whether the result is exact-copy, variant, intentional divergence, or shared.
- Add or update tests at the package contract and each affected app adapter.
- Keep existing worktree changes intact. Stage/commit only when explicitly asked.
- Never claim a deployment, migration, or production state from documentation;
  verify the live system in the current task.

## Independent PR review

Every PR, including documentation-only changes, requires review by a separate
agent before recommending, enabling, or performing a merge. This is an agent
workflow requirement alongside the validation matrix and CI; it does not
configure GitHub enforcement or authorize commits, pushes, merges, or deployments.

1. **Prepare the review.** Complete implementation and scope-appropriate checks.
   Record the PR URL, target branch, and immutable base and head commit SHAs.
   Delegate to a reviewer that did not author the change, with fresh context
   and no inherited implementation conversation (`fork_turns: "none"` when
   using the sub-agent tool). Supply the user's requirements and accepted
   clarifications, applicable repository guidance, the revisions to compare,
   and validation results, including failures and skipped checks.
2. **Review independently.** The reviewer inspects the diff, relevant callers,
   contracts, and tests against the requirements. Check correctness,
   regressions, security/privacy, architecture, deployment implications, and
   missing coverage. Preserve app isolation and intentional parity boundaries.
   Scale depth to the change; distinguish defects from optional improvements.
   The reviewer must not edit source, switch the shared worktree, commit, push,
   merge, deploy, or send production email. Inspect pinned revisions or use an
   isolated checkout for checks that would interfere with the author's work.
3. **Return evidence.** Report reviewed base/head SHAs, scope, checks performed,
   limitations, and findings with severity, file/line references, impact, and
   supporting evidence. Mark each finding as merge-blocking or advisory, and
   give an explicit outcome: ready, changes required, or incomplete. Confirmed
   consequential correctness, regression, security/privacy, or deployment
   defects block merging. A timeout, unavailable reviewer, partial review, or
   silence is incomplete, never a passing review.
4. **Resolve findings.** The author validates findings, fixes confirmed defects,
   and reruns affected checks. Return fixes and reasoned responses to the
   reviewer for verification; do not dismiss blocking findings unilaterally.
   Bring unresolved disagreements or proposed acceptance of a blocking risk
   to the user. Record advisory items and their disposition without expanding
   implementation scope automatically.
5. **Verify the final revisions.** After any head or target-base change, have
   the reviewer inspect the updated revisions and affected interactions before
   declaring the PR ready. Immediately before enabling or performing a merge,
   verify the live PR still matches the reviewed base/head SHAs, required checks
   pass, and no blocking findings remain unresolved. If a revision changes,
   repeat this step; do not bypass it with auto-merge or a direct push.
6. **Report readiness.** Include the reviewer identity, final reviewed SHAs,
   findings and resolutions, validation results, and remaining limitations in
   the handoff. Keep this evidence in the task; include it on the PR when
   authorized. If independent review cannot finish, complete other authorized
   work and report the merge blocker without claiming readiness.

## Validation matrix

Run the narrowest checks while iterating, then the required final gate:

| Scope | Minimum final validation |
| --- | --- |
| Docs only | `npm run docs:verify`, `git diff --check` |
| One package | package test + typecheck, `npm run boundaries:check` |
| One app | app test + typecheck + build |
| Shared Community/Coalition behavior | both app tests/builds, package checks, `npm run parity:check` |
| Cross-workspace or release-sensitive | `npm run check`, affected builds, and relevant runbook tests |
| Browser-visible behavior | above plus targeted Playwright; use `npm run test:e2e` for the standard critical journeys |

`npm run check` is the repository-wide gate: history, parity, boundaries,
typechecks, tests, documentation verification, and lint. See `docs/testing.md`
for focused commands and when builds or browser tests are additionally required.

## Deployment safeguards

- Root `amplify.yml` is authoritative for monorepo builds.
- A root `customHttp.yml` is monorepo-wide and must include a nonempty block for
  every Amplify `appRoot`. Prefer app-specific Amplify settings when headers are
  not genuinely shared. Run `npm run test:amplify-custom-headers` after changes.
- Keep app environment maps, domains, IAM roles, tables, buckets, and secrets
  isolated. Fetch current branch-level Amplify variables before changing them.
- Do not send production email during tests. Use `validate_only`, an approved
  single-recipient smoke mode, or local MailHog as documented.
- Do not mutate AWS, deploy, reconcile data, or run migration `--apply` modes
  without explicit authorization and the relevant runbook's preflight.

## Documentation contract

- `README.md` and `docs/architecture.md` describe current repository behavior.
- App and package READMEs describe current ownership, entry points, and checks.
- `docs/README.md` labels operational versus historical material.
- Historical records must keep their facts; add status notes instead of
  rewriting them as current instructions.
- When behavior, commands, workspaces, exports, or safety boundaries change,
  update the nearest README and run `npm run docs:verify`.
