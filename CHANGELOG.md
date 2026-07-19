# Changelog

## 0.3.3

### Bug Fixes

- Fix no output being emitted for resolvers without modifiers. The transform step skipped the empty default permutation (`{}`), which is the only permutation such resolvers produce, so no transforms were ever registered and the build emitted no files. The empty-input skip guard has been removed — `resolver.apply({})` is valid and returns the base token set. Empty token documents are now handled by an early return when the base token set is empty.
- Guard `resolver.listPermutations()` calls with optional chaining; newer `@terrazzo/parser` versions leave it undefined when the permutation count exceeds the configured limit.

### Chores

- Update dependencies: `@terrazzo/cli` and `@terrazzo/parser` 2.4.0, `colorjs.io` 0.7, `typescript` 7, `vitest` 4.1, `rolldown` 1.2, `@biomejs/biome` 2.5 (config migrated), `@types/node` 26.
- Migrate tooling to pnpm 11 (`packageManager` field and explicit `allowBuilds` for esbuild).

## 0.3.2

### Bug Fixes

- Fix build hanging on resolvers with many modifiers by only iterating the minimal set of resolver inputs (default + one per modifier context) instead of the full cartesian product of all permutations.

## 0.3.1

### Bug Fixes

- Fix fatal error when tokens exist only in non-default modifier contexts (e.g. `typography.heading.display` defined in `sites` but not in the default `global` context). These tokens are now skipped with a warning instead of crashing the build.
