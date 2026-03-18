# Changelog

## 0.3.2

### Bug Fixes

- Fix build hanging on resolvers with many modifiers by only iterating the minimal set of resolver inputs (default + one per modifier context) instead of the full cartesian product of all permutations.

## 0.3.1

### Bug Fixes

- Fix fatal error when tokens exist only in non-default modifier contexts (e.g. `typography.heading.display` defined in `sites` but not in the default `global` context). These tokens are now skipped with a warning instead of crashing the build.
