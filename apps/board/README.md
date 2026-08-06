# PGPZ Board

Private portal for the PGPZ Board of Directors at `https://board.pgpz.org`.

Every route except `/signin` and the Better Auth API is gated by the
authenticated portal layout. Access requires **both** a provisioned account
and an email on the `BOARD_MEMBER_EMAILS` allowlist; an empty allowlist locks
everyone out. Self-registration is disabled, the site refuses search indexing
at every layer, and outbound email is not wired up.

Administrator status is independently granted by `BOARD_ADMIN_EMAILS`, which
must be a subset of the member roster. Administrators receive an enforced
server-only `/admin` surface; no browser-based account mutation API is exposed.

Staff access is separate: the Executive Director (staff, not a director) is
granted portal access and administrator privileges through
`BOARD_EXECUTIVE_DIRECTOR_EMAILS`, which must be disjoint from
`BOARD_MEMBER_EMAILS`. The dashboard shows their distinctive "Executive
Director" role instead of a director badge.

## Local development

```bash
# from the repository root
npm run dev:board
```

Open http://localhost:3000. With no `BOARD_MEMBER_EMAILS` configured every
account is treated as off-roster, which is the safe default.

## Running the checks

```bash
npm run typecheck:board
npm run test --workspace=apps/board
npm run build:board
```

## Provisioning directors

Accounts are created by the board administrator with the provisioning script:

```bash
REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZBoardNextAuth \
  npx tsx scripts/provision-board-member.ts director@example.org --name "Director Name"
```

The script generates a random 24-character password, prints it once, and asks
you to deliver it privately. Rerunning it for the same email rotates the
password hash **and revokes the director's existing sessions by default**
(`--keep-sessions` keeps them; `--dry-run` previews the plan and revocation
count). It refuses to provision email addresses that are not on
`BOARD_MEMBER_EMAILS` (or `BOARD_EXECUTIVE_DIRECTOR_EMAILS` for staff) when
those variables are set.

## Environment

See `.env.example`. Deployment details, the DynamoDB table schema, the IAM
role, and the Amplify app setup are documented in
`docs/board-deployment.md`.
