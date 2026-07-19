# Policy-update email asset backfill

Run this one-time migration before deploying the public email-asset route that
requires immutable materializations. The utility reads published policy-update
uploads through `GSI1`, selects only valid local image paths referenced by their
sections, and defaults to a write-free dry-run. It uses the standard AWS SDK
credential chain; `--profile` only selects an existing local profile and no
credentials are stored in the repository.

From the repository root, audit each application first:

```sh
npm run migrate:policy-update-email-assets -- --app community --profile YOUR_PROFILE
npm run migrate:policy-update-email-assets -- --app coalition --profile YOUR_PROFILE
```

Confirm the dry-run counts, then apply to one application at a time:

```sh
npm run migrate:policy-update-email-assets -- --app community --profile YOUR_PROFILE --apply
npm run migrate:policy-update-email-assets -- --app coalition --profile YOUR_PROFILE --apply
```

For a nonstandard target, replace `--app` with both `--table TABLE_NAME` and
`--region AWS_REGION`. Re-running is safe: uploads with a materialization pointer
are skipped, and the final pointer update is conditional on the upload remaining
published, unmaterialized, and unchanged since its last consistent read.

An apply exits nonzero and emits a content-free `orphan` report if a copy or
materialization record was created but the final conditional update lost a race.
The report includes the generated materialization UUID and a short upload-key
fingerprint, which is enough to locate the materialization record for deliberate
cleanup; the utility never overwrites the winner or deletes possible evidence.
