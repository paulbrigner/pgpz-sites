# Email ownership and identity reconciliation

Community and Coalition use one durable item per normalized email to prevent
eventually consistent GSI lookups from allowing duplicate identities:

```text
pk = sk = EMAIL_OWNERSHIP#<normalized-email>
type = EMAIL_OWNERSHIP
email = <normalized-email>
appUserId = <optional application USER id>
betterAuthUserId = <optional Better Auth user id>
```

The two owner IDs are intentionally independent. Existing application users may
not yet have a Better Auth identity, and a legitimate application user and
Better Auth user may have different IDs. A claim is invalid only when it names
an owner inconsistent with the identity records for that normalized email, or
when multiple application users or multiple Better Auth users share that email.

## Safe migration order

Do not run Community and Coalition writes concurrently. Complete and verify one
site before applying the next.

1. Deploy the claim-aware runtime first. It atomically maintains claims for new
   Better Auth users, application users, invitations, Coalition-to-Community
   creation, email changes, and account deletion. Missing claims remain
   tolerated only as a compatibility bridge for legacy records.
2. Dry-run Community, review every count, and stop if `collisions`, `invalid`,
   or `failed` is nonzero:

   ```sh
   npm run migrate:email-ownership -- --app community --profile YOUR_PROFILE
   ```

   Apply mode repeats this preflight and performs no writes at all if any
   collision or invalid identity record is present.

3. Apply Community, then immediately rerun the dry-run. The second run must
   report `planned: 0`; preexisting complete claims appear as
   `alreadyClaimed`:

   ```sh
   npm run migrate:email-ownership -- --app community --profile YOUR_PROFILE --apply
   npm run migrate:email-ownership -- --app community --profile YOUR_PROFILE
   ```

4. Repeat the same dry-run, apply, and idempotence check for Coalition:

   ```sh
   npm run migrate:email-ownership -- --app coalition --profile YOUR_PROFILE
   npm run migrate:email-ownership -- --app coalition --profile YOUR_PROFILE --apply
   npm run migrate:email-ownership -- --app coalition --profile YOUR_PROFILE
   ```

5. Run the read-only reconciliation audit against each app:

   ```sh
   npm run audit:identity-integrity -- --app community --profile YOUR_PROFILE
   npm run audit:identity-integrity -- --app coalition --profile YOUR_PROFILE
   ```

   The audit exits `2` while any error or critical finding remains. A
   Better-Auth-only user is warning-only because it can be transient before
   first session resolution, so that finding alone exits `0`.

6. Review manual-only findings before considering repair. Better-Auth-only
   users are flagged because they may be transient before first session
   resolution; app-only users are legitimate. Orphaned accounts, sessions,
   verifications, ambiguous duplicate emails, and orphan claims are never
   deleted or reassigned automatically. If all proposed repairs are
   unambiguous claim/index metadata corrections, run one app at a time with the
   explicit guard and then repeat the read-only audit:

   ```sh
   npm run audit:identity-integrity -- --app community --profile YOUR_PROFILE --repair --confirm REPAIR-UNAMBIGUOUS
   npm run audit:identity-integrity -- --app community --profile YOUR_PROFILE
   ```

The tools log normalized-email fingerprints rather than addresses. They scan
only the selected table and have no cross-app `all` apply mode.

## Concurrency and rollback limits

- Do not run the backfill and reconciliation repair simultaneously. Both can
  update the same claim or GSI metadata.
- Do not run repair while an application deployment or another identity
  migration is in progress. Runtime transactions fail closed if an identity
  changes after the audit snapshot.
- The auditor's repair mode performs only conditional updates and claim
  transactions. It contains no delete operation. Manual orphan cleanup requires
  a separately reviewed plan with an explicit canonical owner.
- Claims are inert to the previous runtime, so an emergency code rollback does
  not prevent sign-in. However, the previous runtime does not maintain claims;
  minimize the rollback window and rerun both backfill dry-runs and audits after
  rolling forward.
- A backfill collision is a stop condition, not an instruction to merge users.
  Resolve ownership manually, then restart at the dry-run step.

## Verification

Run the tooling tests without AWS access:

```sh
npm run test:identity-integrity-tooling
```

The runtime regression suites additionally cover normalized-email collisions,
claim races, differing legitimate identity IDs, app-only users, email moves,
invited-user creation, Coalition-to-Community creation, and account deletion.
