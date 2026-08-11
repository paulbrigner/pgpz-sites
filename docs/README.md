# Documentation Index

Use this index to load the smallest reliable context for a task. Documents are
classified as **current**, **operational**, or **historical**. Current documents
describe the repository now. Operational runbooks are loaded only for their
specific workflow. Historical records and plans are evidence, not default
implementation guidance.

## Current architecture and development

| Document | Use it for |
| --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | Always-loaded agent rules and context routing |
| [`../README.md`](../README.md) | Repository orientation and commands |
| [`architecture.md`](architecture.md) | App/package ownership and dependency direction |
| [`local-dev.md`](local-dev.md) | Offline DynamoDB Local and MailHog development |
| [`testing.md`](testing.md) | Focused checks, builds, E2E, and final gates |
| [`x-monitor-community-integration.md`](x-monitor-community-integration.md) | Current Community X Monitor trust and config boundary |
| [`../apps/community/docs/social-proof-membership.md`](../apps/community/docs/social-proof-membership.md) | Current Community membership workflow |
| [`../apps/coalition/docs/manual-approval-membership.md`](../apps/coalition/docs/manual-approval-membership.md) | Current Coalition membership workflow |

## Operational runbooks

Read these only when the task touches the named production workflow. Re-check
live AWS/Amplify state before acting; resource state and credentials can drift.

| Document | Scope |
| --- | --- |
| [`better-auth-user-index-runbook.md`](better-auth-user-index-runbook.md) | GSI2 creation/backfill and auth adapter release |
| [`email-ownership-and-identity-reconciliation.md`](email-ownership-and-identity-reconciliation.md) | Email ownership claims, audit, and guarded repair |
| [`durable-jobs-runbook.md`](durable-jobs-runbook.md) | SQS/Lambda jobs infrastructure, cutover, monitoring, rollback |
| [`secrets-and-compute-role-cutover.md`](secrets-and-compute-role-cutover.md) | Signing-key rotation and Amplify compute-role changes |
| [`board-deployment.md`](board-deployment.md) | Board app, roles, tables, vault, audit, and provisioning |
| [`policy-update-email-asset-backfill.md`](policy-update-email-asset-backfill.md) | One-time policy-update email asset materialization |
| [`member-profile-slug-backfill.md`](member-profile-slug-backfill.md) | Coalition protected-profile slug migration and verification |

Production tooling is dry-run by default where supported. Do not use `--apply`,
update Amplify variables, send email, reconcile records, or deploy without the
runbook preflight and explicit authorization.

## Historical evidence and superseded plans

These documents preserve decisions, release evidence, and rollback baselines.
Do not load them for ordinary implementation work or treat their recorded state
as current.

| Document | Status |
| --- | --- |
| [`history-import.md`](history-import.md) | Immutable source-history baseline; verifier remains current |
| [`monorepo-migration-runbook.md`](monorepo-migration-runbook.md) | Completed migration/cutover procedure |
| [`cutover-2026-07-17.md`](cutover-2026-07-17.md) | Dated production cutover record |
| [`reference-application-plan.md`](reference-application-plan.md) | Original Reference design plan; current behavior is in its README |
| [`reference-deployment-2026-07-17.md`](reference-deployment-2026-07-17.md) | Dated Reference deployment evidence |
| [`plans/2026-08-06-board-governance-vault.md`](plans/2026-08-06-board-governance-vault.md) | Superseded initial Board vault plan |
| [`plans/2026-08-06-board-governance-vault-revised.md`](plans/2026-08-06-board-governance-vault-revised.md) | Accepted implementation plan; current operations are in Board docs |
| Community/Coalition `BETTER_AUTH_PARALLEL_MIGRATION.md` | Completed cutover contract retained for rollback history |

## Documentation maintenance

- Update the closest app/package README when ownership, exports, feature
  enablement, environment contracts, or checks change.
- Update `architecture.md` when workspaces or dependency direction change.
- Preserve historical facts; add a status note rather than rewriting the past.
- Keep generated artifacts and session logs out of the documentation map.
- Run `npm run docs:verify` to check internal links, workspace README coverage,
  documented root commands, and the size/required sections of `AGENTS.md`.
