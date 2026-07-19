# Durable background-jobs runbook

This runbook covers the production infrastructure and cutover for Community
and Coalition newsletters, policy-update sends, Coalition bulk invitations,
and Coalition-to-Community synchronization. Each application has an isolated
CloudFormation stack, job table, queue, dead-letter queue, bridge worker,
reconciler, and alarm set. Neither Amplify compute role can read, write, or
enqueue work for the sibling application.

## Runtime design and invariants

- The application writes the parent job and its immutable recipient/work
  snapshot to its dedicated on-demand DynamoDB table before queue dispatch.
  `GSI1` supports newest-first job history. `GSI2` partitions parent jobs by
  status and tasks by parent-job/status, so reconciliation and incident review
  do not scan completed history. Point-in-time
  recovery, deletion protection, server-side encryption, TTL, stack
  termination protection, and resource-retention policies are enabled.
- The application can only send messages to its own encrypted Standard SQS
  queue. The Amplify role cannot receive or delete messages. After five failed
  receives, SQS moves a message to the encrypted 14-day DLQ.
- A Node.js 22 Lambda consumes one SQS record per invocation and forwards its
  JSON body unchanged to
  `/api/internal/background-jobs/process`. It supplies the SQS message ID and
  receive count as headers, authenticates with a bearer secret, and reports
  partial batch failures so SQS retains failed work.
- Bridge and reconciler Lambdas emit one-line JSON telemetry with schema
  version, application, component, event, timestamp, duration, status code,
  SQS message ID/receive count, and job/task IDs where available. Logs never
  include a recipient, email body, bearer secret, or endpoint response body.
  A log metric and alarm cover record-level bridge failures because Lambda's
  native `Errors` metric does not count a successful partial-batch response.
- A separate Node.js 22 Lambda calls
  `/api/internal/background-jobs/reconcile` every five minutes. It has no
  DynamoDB, SQS, or SES permission; the application performs reconciliation
  with its normal least-privilege compute role.
- `InternalSecret` is a CloudFormation `NoEcho` parameter and must be the same
  32-or-more-byte value as the application's
  `BACKGROUND_JOBS_INTERNAL_SECRET`. Use a different secret for Community and
  Coalition. Never print either value in a plan, log, ticket, or commit.
- `WorkersEnabled` defaults to `false`. It controls both the SQS event source
  and scheduled reconciler, providing an infrastructure-level cutover and
  rollback switch independent of the application release.
- The application flag `BACKGROUND_JOBS_ENABLED=true` gates application-side
  enqueue and processing. A `validate_only` job exercises snapshotting,
  dispatch, authentication, leases, state transitions, and reconciliation but
  must never call SES or mutate invitation/synchronization delivery state.

## Absolute production email-test policy

Production smoke tests may target only these two administrators:

- `paul@paulbrigner.com`
- `div@accrediv.com`

This restriction applies to every newsletter, policy update, invitation,
retry, redrive, and test utility. Never use `all_active`, `all_members`,
`outstanding`, or another bulk audience for a production test. Even a
`validate_only` smoke should snapshot only Paul and Div so the test also proves
the audience boundary. Use `example.test` addresses and mocked transports in
automated tests. Infrastructure validation sends no email.

## Resource names

| Application | Stack | Job table | Queue | DLQ |
| --- | --- | --- | --- | --- |
| Community | `PgpzCommunityBackgroundJobs` | `PGPZCommunityBackgroundJobs` | `pgpz-community-background-jobs` | `pgpz-community-background-jobs-dlq` |
| Coalition | `PgpzCoalitionBackgroundJobs` | `PGPZCoalitionBackgroundJobs` | `pgpz-coalition-background-jobs` | `pgpz-coalition-background-jobs-dlq` |

The application origins are pinned to `https://community.pgpz.org` and
`https://coalition.pgpz.org`. This prevents an infrastructure parameter mistake
from forwarding the internal bearer secret to another origin.

## Index, pagination, and retention policy

The jobs table uses these access patterns:

| Index | Partition key | Sort key | Purpose |
| --- | --- | --- | --- |
| `GSI1` | `BACKGROUND_JOB` | `<createdAt>#<jobId>` | Recent jobs, newest first |
| `GSI2` | `BACKGROUND_JOB_STATUS#<status>` | `<updatedAt>#<jobId>` | Jobs in a specific operational state |
| `GSI2` | `BACKGROUND_JOB#<jobId>#TASK_STATUS#<status>` | `<updatedAt>#<taskId>` | Tasks in a specific state within one job |

Admin job queries accept a bounded `limit` and opaque `cursor`; a status
filter is bound into the cursor and cannot be changed between pages. Job task
pages use `includeTasks=true`, `taskLimit`, `taskCursor`, and optional
`taskStatus`. The normal admin UI may continue to request the first page, while
operators and future UI work can traverse large histories without causing the
server to drain every DynamoDB page.

TTL is a data-minimization and cost-control mechanism, not an exact deletion
schedule. DynamoDB may remove expired items later than their `expires` value.
For records created or advanced by this release, the enforced policy is:

| Record | Retention |
| --- | ---: |
| Parent job summary | 180 days |
| Idempotency claim | 180 days |
| Per-recipient task/result | 90 days |
| Recoverable audience manifest | 30 days |

Active job and task expirations are renewed when state advances. Job summaries
outlive recipient-level details intentionally, preserving aggregate audit and
failure counts while removing email-address-bearing snapshots sooner. PITR is
for disaster recovery and does not extend the supported operational retention
contract.

This policy is forward-applied: terminal records written by an earlier release
are not rewritten automatically and may retain their prior expiration for up
to 180 days. Require an exact empty-table check at the initial cutover, or
record the grandfathered count and use a separately reviewed conditional TTL
backfill if shortening those existing records is required.

## Review and validate without changing AWS

The provisioner is nonmutating by default and prints the complete template and
resource plan without requiring the internal secret:

```bash
node tooling/provision-durable-jobs.mjs \
  --application community \
  --account-id 860091316962

node tooling/provision-durable-jobs.mjs \
  --application coalition \
  --account-id 860091316962
```

Review both plans for the exact table and queue names, canonical URL, IAM
actions, both table indexes, queue redrive, alarms, and `WorkersEnabled=false`.
If updating a previously created stack that has only `GSI1`, keep both worker
switches disabled while CloudFormation adds `GSI2`, and require DynamoDB to
report the table and both indexes as `ACTIVE` before deploying code that
queries status partitions. Before disabling the old workers, freeze new job
creation and require the queue to be empty with no nonterminal jobs; existing
records without `GSI2PK`/`GSI2SK` are not automatically discoverable through
the new status index. If any legacy job remains active, either let the old
worker/reconciler drain it first or run a reviewed one-time backfill of its
status keys before cutover. Then ask AWS to
validate each template. `--validate-only` calls only
`cloudformation validate-template`; it does not create a change set or mutate a
resource, and it is distinct from an application job whose mode is
`validate_only`.

```bash
node tooling/provision-durable-jobs.mjs \
  --application community \
  --account-id 860091316962 \
  --profile pgpcommunity \
  --validate-only

node tooling/provision-durable-jobs.mjs \
  --application coalition \
  --account-id 860091316962 \
  --profile pgpcommunity \
  --validate-only
```

Run the local structural tests as a separate gate:

```bash
node --test \
  tooling/durable-jobs-cloudformation.test.mjs \
  tooling/amplify-compute-role.test.mjs
```

## Provision with workers disabled

Freeze bulk email and membership-admin actions during this cutover. Create a
different strong value for each application in an approved secret store, load
only the current application's value into the local environment, and deploy
with workers disabled. The apply path requires both `--apply` and the exact
application-specific confirmation phrase. It verifies the AWS account,
deploys CloudFormation, enables stack termination protection, and checks the
table and queue outputs. It never prints the secret.

```bash
export BACKGROUND_JOBS_INTERNAL_SECRET='value-loaded-from-the-secret-store'

node tooling/provision-durable-jobs.mjs \
  --application community \
  --account-id 860091316962 \
  --profile pgpcommunity \
  --workers-enabled false \
  --apply \
  --confirm PROVISION-COMMUNITY-BACKGROUND-JOBS
```

Repeat with Coalition's distinct secret and
`PROVISION-COALITION-BACKGROUND-JOBS`. Add
`--alarm-topic-arn arn:aws:sns:us-east-1:860091316962:TOPIC` when an approved
operations topic is available. The alarms still exist without a topic, but
they will not notify anyone until actions are configured.

After both stacks exist, re-run
`tooling/provision-amplify-compute-role.mjs` for each app using its existing
bucket, SES identity, and exact envelope sender inputs. Its deterministic
policy now adds only that application's job table/indexes and
`sqs:SendMessage`/`sqs:SendMessageBatch` on that application's queue. Review
the dry run before the guarded role update, then confirm no receive/delete
actions and no sibling background-job ARN are present.

## Application environment and release order

Set these Amplify application environment variables independently for each
application. The `main` branch consumes them on its next build:

- `BACKGROUND_JOBS_ENABLED=false` for the first code deployment.
- `BACKGROUND_JOBS_TABLE` from the stack's `JobsTableName` output.
- `BACKGROUND_JOBS_QUEUE_URL` from the stack's `QueueUrl` output.
- `BACKGROUND_JOBS_INTERNAL_SECRET` to the same per-app value supplied to that
  stack's `InternalSecret` parameter.
- `BACKGROUND_JOB_SMOKE_ALLOWLIST=paul@paulbrigner.com,div@accrediv.com`.
  The server also hard-limits this setting to those addresses and revalidates
  that the selected recipient is a current active administrator before send.

Preserve the complete existing environment map when updating Amplify; an
`update-app` call replaces the map rather than merging a single key. The
guarded configuration tool performs that read/merge/write safely. It validates
the AWS caller, pinned Amplify app and production `main` branch, protected
CloudFormation stack, table, and queue. It writes the complete update through a
mode-`0600` temporary file, verifies the resulting full map, and reports no
environment values. It does not call `start-job`, deploy CloudFormation, call
SES, or invoke an application endpoint.

Load only the current application's stack secret into the environment, then
run the default AWS read-only dry run with jobs disabled:

```bash
export BACKGROUND_JOBS_INTERNAL_SECRET='value-loaded-from-the-secret-store'

node tooling/configure-amplify-durable-jobs.mjs \
  --application community \
  --account-id 860091316962 \
  --profile pgpcommunity \
  --enabled false
```

Review the safe summary, then use the exact application-specific confirmation:

```bash
node tooling/configure-amplify-durable-jobs.mjs \
  --application community \
  --account-id 860091316962 \
  --profile pgpcommunity \
  --enabled false \
  --apply \
  --confirm CONFIGURE-COMMUNITY-BACKGROUND-JOBS
```

Repeat with Coalition's distinct secret and
`CONFIGURE-COALITION-BACKGROUND-JOBS`. To enable application-side jobs later,
rerun the dry run and guarded apply with `--enabled true`; this environment
change still does not start a build. Start and verify the release as a separate
explicit step. Do not place either secret in `.env.example`, source control,
command output, command-line arguments, or a shared shell transcript. Run the
tool during the documented administrative freeze because Amplify does not
offer a conditional environment-map update if another operator changes the app
between the read and write.

Cut over one application at a time, Coalition first and Community second:

1. Confirm the new stack has `WorkersEnabled=false`, its DLQ is empty, and the
   application compute role contains only its own job resources.
2. Deploy the application code with `BACKGROUND_JOBS_ENABLED=false`. Verify
   login, admin access, ordinary non-bulk functions, and that no job can be
   enqueued.
3. Set `BACKGROUND_JOBS_ENABLED=true` and redeploy the same commit. Do not
   enable the infrastructure workers yet. Confirm the authenticated internal
   routes reject a missing, malformed, or sibling application's bearer secret.
4. Enable the workers by applying the same stack again with
   `--workers-enabled true` and the same secret and confirmation phrase.
5. Create one application-mode `validate_only` job whose explicit audience is
   Paul and Div only. Require a completed job, expected recipient counts, no
   SES message IDs, no email-log delivery records, and no invitation or sync
   delivery mutation.
6. If a real delivery smoke is required, create one individual `smoke` job
   addressed only to Paul or only to Div. The smoke contract permits exactly
   one allowlisted recipient per job. Require exactly one terminal recipient
   record and one accepted SES message ID, no duplicate tracking ID, and no
   other recipient snapshot or email log. Testing both admins is optional and
   must use two separate jobs.
7. Exercise one deliberately failed mocked/non-production message before the
   production release, or use a `validate_only` fault-injection path, to verify
   retry accounting and reconciliation without addressing a registered user.
8. Confirm the five alarms are `OK`, the live queue and DLQ are empty, logs
   contain no secret or message body, and the admin job-progress UI matches the
   table totals. Only then unfreeze normal bulk operations for that application
   and proceed to the sibling application.

The production smoke does not authorize a newsletter, policy update, or bulk
invitation to the whole membership. If the UI cannot select exactly Paul and
Div, stop and add a bounded smoke path; do not approximate with a bulk audience.

## Monitoring, retries, and DLQ handling

The stack creates alarms for a visible DLQ message, a live-queue message older
than ten minutes, bridge Lambda errors, bridge delivery-failure metrics, and
reconciler Lambda errors. Treat a DLQ alarm as an operational incident, not as
permission to replay every message.

1. Pause the affected admin workflow and record the job ID, recipient/work ID,
   SQS message ID, receive count, and latest application state. Never record
   the bearer secret or full email body.
2. Determine whether the recipient/work item is definitely unsent, definitely
   complete, or delivery-uncertain. A timeout after SES acceptance is
   delivery-uncertain and must not be blindly resent.
3. Use application reconciliation first. It should repair lost dispatch for
   safe, undispatched work and preserve terminal/idempotency records.
4. Retry only a specifically selected safe item through the authenticated
   admin retry action. During cutover testing, its recipient must still be Paul
   or Div.
5. Redrive a DLQ message only after correlating it to the durable table record
   and proving the operation is idempotent. Never purge the live queue or DLQ
   as a troubleshooting shortcut.

## Rollback

If processing, audience boundaries, state counts, IAM isolation, or delivery
idempotency differ from the expected result, stop the cutover before any broad
audience is enabled.

1. Reapply the affected stack with `--workers-enabled false`. This disables new
   SQS Lambda invocations and the schedule while retaining both queues and all
   durable records. Allow any already-running invocation to finish, then
   verify Lambda concurrency returns to zero.
2. Keep administrators from initiating bulk actions. Do not immediately set
   `BACKGROUND_JOBS_ENABLED=false` if a controlled drain or repair is needed:
   that application flag also gates worker processing. With the event source
   disabled, inspect and reconcile the preserved records first.
3. When no in-flight processing remains, choose the rollback that matches the
   recorded release contract. For an operational pause, set
   `BACKGROUND_JOBS_ENABLED=false`, redeploy the same commit, and leave the
   infrastructure workers disabled. For this `GSI2` release, the immediately
   previous application release is the `GSI1` durable-jobs implementation,
   not a synchronous implementation: deploy that release while both gates are
   disabled, verify its routes and preserved records, then set
   `BACKGROUND_JOBS_ENABLED=true` and redeploy it before reapplying the stack
   with `--workers-enabled true`. The retained `GSI2` is harmless to the
   `GSI1` release. Keep bulk actions frozen until the selected rollback is
   fully verified, and never assume an older release's processing contract.
4. Do not delete the stack, table, queue, DLQ, or secret. Retention, deletion
   protection, and termination protection intentionally preserve forensic and
   recovery state. Fix code or data separately, then repeat dry run,
   `--validate-only`, Paul/Div-only validation, and the one-app-at-a-time
   cutover.

No rollback or recovery step may send a test email to a registered user other
than Paul or Div.
