# Testing and Validation

Use focused checks while iterating and broaden validation according to the
change boundary. A passing unit test is not a substitute for an affected Next.js
production build, and a passing build is not proof of live deployment.

## Focused checks

```bash
# One package
npm run test --workspace=@pgpz/core
npm run typecheck --workspace=@pgpz/core

# One application
npm run test --workspace=apps/community
npm run typecheck:community
npm run build:community

# Repository contracts
npm run docs:verify
npm run parity:check
npm run boundaries:check
npm run history:verify
```

Use the workspace name from its `package.json`. Community and Coalition do not
define workspace-local `typecheck` scripts, so use the root aliases.

## Required validation by change

| Change | Required before handoff |
| --- | --- |
| Documentation only | `npm run docs:verify`, `git diff --check` |
| Pure package behavior | package test/typecheck, consumer tests as relevant, boundaries |
| Community-only | Community test, typecheck, build; parity if a classified path changed |
| Coalition-only | Coalition test, typecheck, build; parity if a classified path changed |
| Shared branded behavior | package checks, both app tests/typechecks/builds, parity, boundaries |
| Board | Board test, typecheck, build; relevant infrastructure contract tests |
| Reference | Reference test, typecheck, lint, build |
| Cross-workspace/dependency | `npm run check` and every affected app build |
| User-visible flow | above plus targeted Playwright or `npm run test:e2e` |
| Deployment/config/schema | above plus the named runbook's dry-run and live verification gates |

## Repository-wide gate

```bash
npm run check
```

This runs history verification, Community/Coalition parity, workspace boundary
checks, all workspace typechecks, all tests (including documentation
verification and operational tooling contracts), and workspace linters.

Builds are intentionally separate because they are slower and resource-heavy:

```bash
npm run build:community
npm run build:coalition
npm run build:reference
npm run build:board
```

Run only affected builds for a narrow change; run all four for shared build,
dependency, root configuration, or release changes. Run them sequentially on
constrained hosts to avoid Next.js worker/PID contention.

## Browser tests

```bash
npx playwright install chromium
npm run test:e2e
```

The standard Playwright configuration starts Community, Coalition, and Board on
ports 3201-3203 with isolated test-only values. It checks anonymous critical
journeys, mobile navigation, protected route behavior, accessibility, Board
privacy boundaries, and callback handling. It does not require production
credentials or send production email.

Set `PLAYWRIGHT_OUTPUT_DIR` when the default `output/playwright` path is not
writable. Keep browser artifacts out of agent context unless diagnosing a
specific failed journey.

## Operational contract tests

Root `test:*` scripts exercise guarded infrastructure plans and migrations
without mutating AWS. Use the corresponding runbook before any apply mode.
Examples include:

```bash
npm run test:amplify-custom-headers
npm run test:durable-jobs-infra
npm run test:board-backend-infra
npm run test:identity-integrity-tooling
npm run test:better-auth-user-index-tooling
npm run audit:production
```

Never reinterpret a successful dry-run contract test as confirmation that live
resources match it. Inspect the target account and deployed application.

## Completion evidence

Report the exact commands run, whether each passed, any intentionally skipped
integration/browser/live checks, and residual risks. Do not hide failures from
unrelated pre-existing work; identify them separately and preserve that work.
