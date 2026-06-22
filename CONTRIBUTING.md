# Contributing

## Branches and Commits

Use short branches such as `feat/pool-polish`, `fix/petal-replay`, or
`chore/ci-gates`. Commit messages should use Conventional Commits.

## Definition of Done

Run the full local gate before opening a PR:

```bash
pnpm install --frozen-lockfile
pnpm --filter shared build
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm build
```

Bug fixes need regression tests. New shared logic should be tested in
`packages/shared`.

## Adding a Socket Action

1. Add or update shared event/types in `packages/shared`.
2. Add a zod schema in `apps/server/src/socket/socketSchemas.ts` when the action
   changes event payload shape.
3. Parse at the server boundary before touching state.
4. Keep wallet changes server-authoritative through `UserService`.
5. Emit stable error codes and user-safe messages.
6. Reconcile client optimism using authoritative server totals or request IDs.
