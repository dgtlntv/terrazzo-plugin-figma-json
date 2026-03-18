# Changelog

## 0.3.1

### Bug Fixes

- Fix fatal error when tokens exist only in non-default modifier contexts (e.g. `typography.heading.display` defined in `sites` but not in the default `global` context). These tokens are now skipped with a warning instead of crashing the build.
