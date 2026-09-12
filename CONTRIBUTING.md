# Contributing to @vllnt/convex-helpers

Thanks for your interest in contributing!

## Development Setup

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Testing

Tests use [vitest](https://vitest.dev) with the node environment:

```bash
pnpm test          # single run
pnpm test:watch    # watch mode
pnpm test:coverage # coverage report (must be 100%)
```

## Code Style

- Prettier + ESLint (run `pnpm lint` before submitting)
- `@vllnt/eslint-config` base — no convex-specific rules (type-B library, not a component)
- No `any` — use `unknown` + type guards
- Explicit return types on public APIs
- TSDoc on every exported function

## Pull Requests

- Target `main`
- One logical change per PR
- Include tests for new behavior or bug fixes
- Ensure all checks pass: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Releases

Maintainers only:

- `.github/workflows/publish.yml` stable `workflow_dispatch` runs only on `main`
  with repository variable `RELEASE_ENABLED=true`; the default is disabled.
  It publishes only the current reviewed package version. Version changes must
  arrive through a signed, reviewed PR; the workflow never bumps or commits to main.
  Canary publishing separately requires `CANARY_ENABLED=true`.
- Release jobs require lint, typechecks, build and 100% coverage. Release notes are
  passed as a file, never interpolated into shell source.
- Publish runs are queued, not cancelled when another run starts. npm publication
  precedes tagging and GitHub release creation. If tagging/release creation fails,
  inspect npm's published artifact and the reviewed SHA, then recover metadata for
  that exact revision. Do not republish an immutable version, move an existing tag,
  or blindly rerun publishing. A failed npm publish creates no tag.
- See [publication blockers](docs/READINESS.md) before enabling any release.

## Reporting Issues

Use [GitHub Issues](https://github.com/vllnt/convex-helpers/issues). For security vulnerabilities,
see [SECURITY.md](./SECURITY.md).
