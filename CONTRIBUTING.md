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

- Preferred: use `.github/workflows/publish.yml` with `workflow_dispatch` for patch/minor/major
  releases.

## Reporting Issues

Use [GitHub Issues](https://github.com/vllnt/convex-helpers/issues). For security vulnerabilities,
see [SECURITY.md](./SECURITY.md).
