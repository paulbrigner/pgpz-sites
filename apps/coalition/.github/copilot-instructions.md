# Copilot Instructions

- Project: Next.js 15 app deployed via AWS Amplify for `coalition.pgpz.org`.
- Purpose: Selective PGPZ Coalition workspace for Zcash ecosystem partners coordinating crypto policy resources, messaging, and Washington, DC policy campaigns.
- Auth/session: NextAuth v4 email magic links with DynamoDB adapter. Runtime configuration is in `lib/config.ts`; do not commit secrets.
- Membership model: Manual approval only. Users request coalition access from `app/home-client.tsx`; admins approve through `POST /api/admin/members/manual-approval`.
- No social approval path: Do not add or reintroduce X/Twitter proof, wallet, NFT, Unlock, or on-chain membership gates unless explicitly requested.
- Data: The DynamoDB table defaults to `PGPZCoalitionNextAuth` and uses the same `pk`/`sk` plus `GSI1` schema as the community app.
- Profile data: Signup/profile fields are first name, last name, email, and optional LinkedIn URL.
- Admin surface: Admin pages under `app/admin` and components in `components/admin` handle roster views, manual approvals, welcome emails, and sensitive data masking.
- Styling: Keep Zcash gold as the primary accent while using the coalition green/teal palette in `app/globals.css`.
- Builds: Use Node 22, `npm test`, and `npm run build`. Amplify pipeline is defined in `amplify.yml`.
