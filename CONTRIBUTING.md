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
- `@vllnt/eslint-config` base — no convex-specific rules (type-B library, not a
  component)
- No `any` — use `unknown` + type guards
- Explicit return types on public APIs
- TSDoc on every exported function

## Pull Requests

- Target `main`
- One logical change per PR
- Include tests for new behavior or bug fixes
- Ensure all checks pass:
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Releases

Maintainers only. Every publish runs in `.github/workflows/publish.yml` with npm
trusted publishing and provenance; nothing is published from a local machine.

- Canary (`@canary`): pushes to `main` publish one when the `CANARY_ENABLED`
  repository variable is `true`; otherwise run the workflow manually on `main`.
- Stable (`@latest`): merge a PR that sets `package.json` `version` and adds a
  matching `## [X.Y.Z]` entry to `CHANGELOG.md`, then push the tag `vX.Y.Z` on
  that `main` commit. The workflow refuses a tag that is not on `main` or does
  not match both files.
- Release jobs require lint, typechecks, build and 100% coverage. Release notes
  are taken from the matching `CHANGELOG.md` entry and passed as a file, never
  interpolated into shell.
- If creating the GitHub release fails after npm publication, re-run the job: it
  skips an already-published version. Never republish an immutable version or
  move an existing tag.
- See [publication notes](docs/READINESS.md).

## Reporting Issues

Use [GitHub Issues](https://github.com/vllnt/convex-helpers/issues). For
security vulnerabilities, see [SECURITY.md](./SECURITY.md).
