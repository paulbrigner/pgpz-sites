# Signing-secret rotation and Amplify compute-role cutover

This runbook replaces long-lived application AWS and SES SMTP credentials with
temporary credentials from a branch-level Amplify SSR Compute role. AWS SDK v3
clients intentionally omit `credentials`, which activates the
[default Node.js credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).
AWS documents that an
[Amplify SSR Compute role](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-SSR-compute-role.html)
provides temporary runtime credentials and recommends assigning it at branch
level rather than app level when preview branches exist.

## Enforced production invariants

- `BETTER_AUTH_SECRET` and `EMAIL_TRACKING_SECRET` are required and must each
  contain at least 32 UTF-8 bytes. The currently deployed 64-character tracking
  values satisfy this rule.
- `EMAIL_TRACKING_SECRET_PREVIOUS`, when present, must also contain at least 32
  bytes and must differ from the current value.
- Community's `SOCIAL_PROOF_AUTOVERIFY_SECRET` is required and must contain at
  least 32 bytes. Its optional previous value follows the same strength and
  distinctness rules and is accepted for endpoint authorization only.
- `EMAIL_TRANSPORT=ses` is mandatory. Production never falls back to SMTP.
- DynamoDB, S3, and SESv2 clients use the AWS SDK default provider chain. No
  application-specific access key is serialized into `.env.production`.
- The compute role is attached to the production `main` branch only, not as an
  Amplify app default. Community and Coalition use distinct roles.
- The role permits only the application's primary DynamoDB table and indexes,
  its isolated background-jobs table and indexes, send-only access to its
  background-jobs SQS queue, the configured policy-update S3 prefix, and `ses:SendEmail` plus
  `ses:SendRawEmail` for the selected SES identity and exact From address.
  Nodemailer's SESv2 transport generates a MIME message and AWS authorizes that
  raw-content path with `ses:SendRawEmail`. Coalition additionally receives the smaller
  action set used by its one-way Community entitlement synchronization.
  The role cannot receive from or delete messages in SQS and cannot access the
  sibling application's background-job resources. See
  `docs/durable-jobs-runbook.md` for the separately guarded infrastructure
  cutover.

Local and non-AWS development can explicitly use `EMAIL_TRANSPORT=smtp` with
the existing `EMAIL_SERVER_*` settings. Local AWS access uses an SSO/profile,
container role, or another standard provider-chain source.

## Review the role plan

The provisioner is dry-run-only unless both `--apply` and the confirmation
phrase are supplied. Start with a dry run for each application and review every
resource ARN:

```bash
node tooling/provision-amplify-compute-role.mjs \
  --application community \
  --account-id 860091316962 \
  --bucket COMMUNITY_BUCKET \
  --ses-identity-arn arn:aws:ses:us-east-1:860091316962:identity/pgpz.org \
  --from-address admin@pgpz.org

node tooling/provision-amplify-compute-role.mjs \
  --application coalition \
  --account-id 860091316962 \
  --bucket COALITION_BUCKET \
  --ses-identity-arn arn:aws:ses:us-east-1:860091316962:identity/pgpz.org \
  --from-address no-reply@coalition.pgpz.org
```

The default table names, production app IDs, and `main` branch are encoded in
`tooling/amplify-compute-role.mjs`. Override `--table` or `--prefix` only when
the corresponding production environment value differs. The script creates or
updates the role, replaces its inline policy idempotently, attaches the role
with `amplify update-branch --branch-name main`, and requires the branch readback
to equal the expected role ARN. It also fails closed if the role has any
managed policy or an inline policy other than its one expected policy; it never
silently deletes or accepts an unknown grant.

## Compute-role and SESv2 cutover

Complete Coalition first, verify it, and then repeat for Community. Do not
rotate tracking or authentication secrets during this cutover.
Keep Community's existing `X_BEARER_TOKEN` unchanged throughout this operation;
it is an external provider credential and is not replaced by the AWS role.

Both Amplify applications watch the monorepo's same `main` branch. A merge can
therefore release both applications unless auto-build is deliberately gated.
Never merge while an application that remains eligible to auto-build lacks
either its branch compute role or `EMAIL_TRANSPORT=ses`.
Freeze all unrelated `main` merges and releases from the moment Community
auto-build is disabled until both applications have passed their static-
credential-removal redeploys and Community auto-build has been restored. The
only releases during that window are the prescribed Coalition release and
Community/manual same-SHA releases below.

1. Record the deployed commit/job, current `main` branch compute-role ARN,
   current `enableAutoBuild` value, and the names—not values—of the current
   environment variables for both applications.
2. Before the Coalition-first release, disable Community `main` auto-build and
   require the readback to be `False`:

   ```bash
   aws amplify update-branch --app-id d2xb9ethk5a24j --branch-name main \
     --no-enable-auto-build --profile PROFILE --region us-east-1
   aws amplify get-branch --app-id d2xb9ethk5a24j --branch-name main \
     --query branch.enableAutoBuild --output text \
     --profile PROFILE --region us-east-1
   ```

   Do not merge if Community still reports `True`.
3. Confirm the table, bucket/prefix, verified SES identity, and exact envelope
   From address for Coalition. IAM `ses:FromAddress` must contain only
   `no-reply@coalition.pgpz.org`—not the display-name form stored in
   `EMAIL_FROM`. Run the dry-run command and review the policy.
4. Attach Coalition's compute role and set Coalition's
   `EMAIL_TRANSPORT=ses` before merging. Confirm the branch role readback and
   environment setting, then merge/release Coalition while Community remains
   ineligible for auto-build.
5. Require all of the following Coalition cutover gates:
   - Amplify build and SSR startup pass without missing-credential errors.
   - Better Auth magic-link request, callback, session read/write, and sign-out
     pass.
   - An admin test email is accepted by SESv2 and its email log records the SES
     message ID without rejection or pending recipients.
   - A policy-update object can be uploaded, read, copied into an immutable
     email materialization, listed, and deleted through the normal UI.
   - Coalition's one-way Community synchronization passes.
   - Runtime logs contain no `CredentialsProviderError`, `AccessDenied`, SES
     authorization failure, or unexpected SMTP connection attempt.
6. Only after Coalition passes, attach Community's compute role and set
   Community's `EMAIL_TRANSPORT=ses`. Confirm both readbacks, then manually
   start a Community release for the exact same `main` commit SHA that passed
   Coalition; do not merge another commit to trigger it. Apply the same gates,
   using `admin@pgpz.org` as Community's exact envelope From address.

   ```bash
   aws amplify start-job --app-id d2xb9ethk5a24j --branch-name main \
     --job-type RELEASE --commit-id SAME_HEAD_SHA \
     --commit-message "Release verified shared HEAD" \
     --profile PROFILE --region us-east-1
   ```

7. After each application's first set of gates passes, delete that
   application's static credential variables listed below and manually
   redeploy the same commit. Repeat its gates. Keep the previous release
   metadata until both apps pass independently. Keep the merge/release freeze
   and Community auto-build disablement in place throughout this cleanup.
8. After both static-credential-removal redeploys pass, restore Community
   `main` auto-build and require the readback to be `True`:

   ```bash
   aws amplify update-branch --app-id d2xb9ethk5a24j --branch-name main \
     --enable-auto-build --profile PROFILE --region us-east-1
   aws amplify get-branch --app-id d2xb9ethk5a24j --branch-name main \
     --query branch.enableAutoBuild --output text \
     --profile PROFILE --region us-east-1
   ```

For each application's role attachment, use the production SSO profile:

```bash
node tooling/provision-amplify-compute-role.mjs ... \
  --profile PROFILE \
  --apply --confirm ATTACH-MAIN-COMPUTE-ROLE
```

The pre-merge ordering is a deployment invariant: auto-build eligibility comes
only after the branch role and SES transport prerequisites, never before them.

## Environment keys to delete after the cutover gates pass

Delete these from both branded Amplify applications when present:

- `PGPZ_AWS_ACCESS_KEY_ID`
- `PGPZ_AWS_SECRET_ACCESS_KEY`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` if they were ever added at app
  level rather than supplied temporarily by Amplify
- `EMAIL_SERVER`
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_SERVER_SECURE`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

Community also has retired, unconsumed generation variables that can be
deleted in the same cleanup change:

- `POLICY_UPDATE_GENERATION_BASE_URL`
- `POLICY_UPDATE_GENERATION_MAX_TOKENS`
- `POLICY_UPDATE_GENERATION_MODEL`
- `POLICY_UPDATE_GENERATION_TIMEOUT_MS`
- `VENICE_API_KEY`

Keep `NEXTAUTH_TABLE`; it is the legacy name of the active application table,
not a NextAuth runtime dependency. Keep `EMAIL_TRACKING_SECRET`,
`BETTER_AUTH_SECRET`, `EMAIL_TRANSPORT`, table/bucket identifiers, sender
identity, and application-specific X credentials where applicable.

## Community autoverify-secret rotation

This rotation is independent of the email-tracking and compute-role changes.
It is intentionally app-first so the scheduled trigger can change without a
request-failure window:

1. Set the Community app's current autoverify secret to the new strong value
   and its previous secret to the trigger's existing value.
2. Deploy Community and verify the endpoint accepts requests signed with both
   values but rejects any third value.
3. Update the trigger's `SOCIAL_PROOF_AUTOVERIFY_SECRET` to the new value. The
   trigger validates that it is at least 32 bytes and emits only that current
   value.
4. Verify scheduled invocations and retries, then remove
   `SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS` from Community.

To roll back before step 4, restore the old trigger value and swap the app's
current/previous values. Only one previous key is supported; do not begin a
second rotation until the first retry window has closed.

## Compute-role rollback

Rollback before deleting static credentials by redeploying the previously
recorded commit; its clients will continue to use the still-present keys and
SMTP configuration. After static credentials have been deleted, restore those
environment values first and then redeploy the previous commit. The branch
compute role can remain attached during a code rollback because explicit old
client credentials take precedence, or it can be removed from `main` after the
old release is healthy. Do not delete the role until rollback verification is
complete.

A rollback is required if any cutover gate fails, SES delivery differs from the
recorded SMTP behavior, role permissions need to be broadened beyond observed
application actions, or either app requires another app's role. Correct the
policy or code in a separate change, re-run the dry run, and attempt the apps
one at a time again.

## Community X provider-token rotation

Rotate the X API bearer token as a separate provider-console operation after
the compute-role/SESv2 cutover is stable. This is required credential hygiene
because the prior private diagnostic output exposed the existing value; do not
combine it with Better Auth, email-tracking, or autoverify-secret rotation.

1. Create a replacement bearer token in the X provider console without
   revoking the existing token.
2. Update only Community's Amplify `X_BEARER_TOKEN`, deploy, and smoke the real
   X proof challenge/verification path plus the background autoverify path.
3. Confirm X API success and application telemetry, then revoke the old token
   in the provider console.
4. If verification fails before revocation, restore the old Amplify value. If
   it fails after revocation, repair or replace the new provider token; do not
   roll back unrelated AWS or signing-secret changes.

## Better Auth secret rotation

Better Auth accepts only one current `BETTER_AUTH_SECRET`; this repository does
not add dual-key session-cookie verification. A rotation therefore forces
existing users to sign in again. Better Auth magic-link token hashes are not
derived from this secret, but the complete authentication journey must still be
smoke-tested after rotation.

Rotate one application at a time only after the compute-role deployment, SESv2
mail verification, SMTP/static-key removal, and observation period are stable.
Do not overlap this operation with an email-ownership or identity migration.
Announce the forced login before changing the value, deploy, and verify a magic
link request, link consumption, new session, protected access, and sign-out.

Rollback to the old secret only when the new configuration is demonstrably
unusable. Sessions created during the attempted new-secret window will then
require another login. If the old value was exposed or intentionally retired,
do not restore it. Revoke the database sessions with the dedicated tool below
so a later rollback cannot resurrect sessions protected by that key, then
repair the new configuration instead. Do not use the identity-orphan repair
command for this operation.

The session-revocation tool is dry-run-only by default. It performs a consistent
paginated scan for exactly `type=BETTER_AUTH#better_auth_sessions`, reports the
count without printing session tokens, and never selects users, accounts, or
verification records. Apply mode requires both the literal confirmation phrase
and the exact table name; it deletes in bounded DynamoDB transactions whose
condition rechecks the exact record type, then scans again and fails unless the
count is zero.

```bash
# Dry run: record and review the count.
node tooling/revoke-better-auth-sessions.mjs \
  --table PGPZCommunityNextAuth --profile PROFILE --region us-east-1

# Apply only during the announced forced-login window.
node tooling/revoke-better-auth-sessions.mjs \
  --table PGPZCommunityNextAuth --profile PROFILE --region us-east-1 \
  --apply --confirm REVOKE-BETTER-AUTH-SESSIONS \
  --confirm-table PGPZCommunityNextAuth

# Required postcondition: rerun the dry run and confirm matchedCount is 0.
```

Use `PGPZCoalitionNextAuth` for Coalition and rotate/revoke one application at a
time. The tool cannot prevent a concurrent login from creating a new session;
run it in the announced cutover window and repeat the dry run/apply sequence
until zero before reopening normal authentication traffic.

## Email tracking-secret rotation

New signatures use an `h1.<key-id>.<hmac>` envelope. The key ID is a short hash
of the high-entropy secret and selects the current or previous verifier without
exposing the secret. Pre-envelope raw HMAC signatures remain verifiable.

1. Generate a new value of at least 32 random bytes; 64 hexadecimal characters
   is the established production shape.
2. In one Amplify environment update, move the old current value to
   `EMAIL_TRACKING_SECRET_PREVIOUS` and place the new value in
   `EMAIL_TRACKING_SECRET`.
3. Deploy. Confirm a newly generated tracked click and immutable asset URL use
   the new key, while saved URLs generated before deployment still work.
4. Keep the previous value for as long as historical email links must remain
   valid. Removing it intentionally retires all links signed only by that key.
5. Do not rotate again while the oldest required links depend on the previous
   slot; only one previous key is supported.

For rollback, swap the two values back: the restored old current key signs new
links, while the failed/new key remains the previous verifier for links emitted
during the attempted rotation. The previous key never signs new links or new
stored destination digests. Open-client fingerprints use the current key, so a
rotation can classify a returning reader as a new client after the cutover;
click and asset validity remains continuous.
