# X Monitor Core

This package is the pinned, framework-agnostic X Monitor read boundary used by
PGPZ Community. It owns public read contracts, URL serialization, and an
injected HTTP client. It does not own authentication, authorization, React UI,
PostgreSQL, AWS, collectors, Answer Mode, email, or scheduled jobs.

The source snapshot was vendored from
`paulbrigner/zodldashboard@c4c70db7e25f5fd01e9736ffa5fcbac9effe18f9`.
`vendor-manifest.json` records the source paths and hashes. Run
`npm run xmonitor:verify-vendor` from the monorepo root after any change.

Changes to the vendored source require an intentional source upgrade and a
manifest update; Community-specific behavior belongs in `apps/community`.
