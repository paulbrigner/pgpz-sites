# `@pgpz/background-jobs`

Shared durable-job contracts and a dependency-injected runtime for Community
and Coalition. Each app configures a separate DynamoDB table, SQS queue,
recipient policy, administrator lookup, and internal authorization secret.

## Domain behavior

The package defines job/task states, deterministic idempotency, progress,
cursor/index contracts, retention, audience snapshots, retry eligibility, and
recipient normalization. Supported job kinds are newsletter delivery,
policy-update delivery, bulk invitations, and Coalition-to-Community sync.

Every job uses an explicit mode:

- `validate_only`: validate/render without delivery;
- `smoke`: one specifically authorized production recipient;
- `live`: the approved production audience.

`delivery_unknown` is never automatically retryable. It means delivery may have
reached the provider before acknowledgement was recorded; an operator must
reconcile it and explicitly accept duplicate-delivery risk before reopening it.

## Injected runtime

`configureBackgroundJobRuntime` binds the app's document client, table, queue,
configuration, recipient resolver, administrator policy, and clock. The runtime
then provides enqueue, staging/dispatch, claim/lease, completion, retry,
cancellation, pagination, projection, and reconciliation behavior.

The configuration is process-local and app-specific. Do not import one app's
configured runtime from another app or move environment/resource selection into
the package.

## Storage conventions

- `GSI1` lists jobs newest-first.
- `GSI2` partitions parent jobs by status and tasks by parent/status.
- Cursor payloads are versioned and query-bound; page size is capped at 100.
- Parent summaries/idempotency claims retain 180 days, recipient tasks 90 days,
  and recoverable audience manifests 30 days. Active records renew retention as
  their state advances.

## Validation and operations

```bash
npm run test --workspace=@pgpz/background-jobs
npm run typecheck --workspace=@pgpz/background-jobs
npm run test:durable-jobs-infra
```

Use `docs/durable-jobs-runbook.md` for infrastructure, release, monitoring,
reconciliation, DLQ, or rollback work. Package tests never authorize production
email or prove that live queues/tables match the contracts.
