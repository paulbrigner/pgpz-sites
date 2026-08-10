# `@pgpz/ui`

Brand-neutral React primitives shared by PGPZ applications. The package owns
reusable visual behavior and admin-shell presentation, not site identity,
authorization, data fetching, navigation policy, or runtime configuration.

## Entry point

- `@pgpz/ui` exports primitives such as buttons, badges, tabs, dialogs,
  skeletons, sensitive-data presentation, and admin shell components.

React and React DOM are peer dependencies. Consumers own their theme tokens,
Tailwind source registration, route composition, and authorization checks.
Shared admin components accept content and behavior through props rather than
importing app aliases or app-owned clients.

## Consumers and validation

Community, Coalition, Board, Reference, and `@pgpz/email-admin-ui` consume this
package. A shared presentation change must be checked in every affected app;
Community/Coalition wrappers may also be parity-classified.

```bash
npm run test --workspace=@pgpz/ui
npm run typecheck --workspace=@pgpz/ui
npm run boundaries:check
```
