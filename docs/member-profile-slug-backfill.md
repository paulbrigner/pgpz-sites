# Coalition member-profile slug backfill

This operational runbook creates protected vanity-profile records for existing
active Coalition members who already opted into the member directory. It never
changes `memberDirectoryOptIn`, never derives a slug from email, and never joins
Community and Coalition data.

## Safety contract

- The tool is read-only unless both `--apply` and the exact confirmation phrase
  are supplied.
- Verify the current AWS account, Coalition table, region, Amplify branch, and
  rollback commit before applying. `--app coalition` currently selects
  `PGPZCoalitionNextAuth` in `us-east-1`; confirm that against live state.
- Do not apply while another membership migration or deployment is running.
- Logs contain counts and hashed user identifiers, not email addresses.
- Pending, invited, inactive, and deactivated accounts retain their saved
  preference but do not reserve a slug. Activation or a later guarded run can
  create it after they become active members.

## Dry run

```bash
npm run migrate:member-profile-slugs -- --app coalition --profile PROFILE
```

Review `optedIn`, `alreadyAssigned`, `planned`, `notActive`, `conflicts`,
`invalid`, and `conditionalRaces`. Resolve every conflict or invalid active
record before applying.

## Apply

```bash
npm run migrate:member-profile-slugs -- \
  --app coalition \
  --profile PROFILE \
  --apply \
  --confirm BACKFILL-COALITION-MEMBER-PROFILE-SLUGS
```

The write transaction conditionally creates the app-local slug claim and safe
member-facing projection, then attaches the slug to the still-active, still
opted-in user. A concurrent profile change causes a reported conditional race,
not a partial write.

## Verification and rollback

Rerun the dry run. `planned`, `conflicts`, `invalid`, and `conditionalRaces`
must be zero for active opted-in members. With two active test members, verify
the directory link and direct `/members/[slug]` route, then verify signed-out,
inactive-member, opted-out, and deactivated access all fail closed.

The migration is additive and older application code ignores its records.
Rollback the application to the recorded compatibility commit if necessary;
do not delete profile or claim records during an incident. Use the owner opt-out
or deactivation path to remove access immediately.
