# `@pgpz/background-jobs`

Pure contracts and deterministic helpers for the Community and Coalition durable-job systems. The package deliberately contains no database, queue, framework, or email-provider implementation so both applications and their workers can share the same state model.

The four supported job kinds are newsletter delivery, policy-update delivery, bulk invitations, and Coalition-to-Community synchronization. `live`, `validate_only`, and `smoke` modes are explicit on every job and task; callers remain responsible for enforcing the production recipient allowlist used by smoke jobs.

`delivery_unknown` requires review and is never automatically retryable. It represents work that may have reached an external provider before the worker lost its lease or acknowledgement, so an operator must reconcile it before taking any action that could duplicate a message. Reopening one requires an explicit duplicate-delivery acknowledgement and the exact task ID; the state machine permits that operator-only transition while keeping it out of normal retry eligibility.

The package also owns the storage-facing operational conventions shared by
both applications:

- `GSI1` lists jobs newest-first, while `GSI2` partitions parent jobs by
  status and tasks by parent-job/status. Reconciliation can therefore query
  only active work instead of walking completed history.
- Cursor helpers encode and validate versioned, index-bound DynamoDB keys.
  A cursor from one query shape cannot be replayed against another, and page
  sizes are capped at 100.
- Retention helpers keep parent summaries and idempotency claims for 180 days,
  per-recipient task records for 90 days, and recoverable audience manifests
  for 30 days. Active records renew their applicable expiration whenever
  their state advances.
