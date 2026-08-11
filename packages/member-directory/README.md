# `@pgpz/member-directory`

Neutral contracts for protected, opt-in member directories and vanity profile URLs.

The package owns slug validation, safe base DTOs, and index/key helpers. It does not resolve sessions, read environment variables, select an application's profile fields, or connect Community and Coalition data. Each app injects its own DynamoDB table and enforces its own membership and consent policy.

Member profile pages must authorize the viewer before resolving a slug, return only an allowlisted projection, and use private/no-store/noindex responses.

Checks: `npm test --workspace=@pgpz/member-directory` and `npm run typecheck --workspace=@pgpz/member-directory`.
