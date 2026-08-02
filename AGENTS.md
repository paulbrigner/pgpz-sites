# PGPZ Sites

## Amplify custom headers

- A repository `customHttp.yml` is monorepo-wide. It must stay at the repository root,
  contain a nonempty header block for every `appRoot` in the root `amplify.yml`, and
  overrides app-level Amplify Hosting header settings. A Community-only entry blocks
  Coalition and Reference after their builds.
- For truly app-specific headers, configure that Amplify app and leave the root file
  absent. Run `npm run test:amplify-custom-headers` after changing either deployment
  document; the guard enforces exact `appRoot` coverage and rejects empty stubs.
