# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Fail closed on thrown or stalled MCP authorization hooks; bound auth/lifecycle
  callbacks to 10 seconds and remove raw exception logging.
- Add optional host-configured `AuthCtx.trustedIssuer` enforcement before identity
  row callbacks, preserving the legacy single-issuer contract when omitted.
- Reject unsafe preview patterns, localhost paths/normalization and control characters;
  validate cookie origins instead of trusting a prefix.
- Bound retargeting to 1000 rows with sequential callbacks and failure short-circuiting.
- Remove release-note shell interpolation; gate stable dispatch to main and explicit
  `RELEASE_ENABLED=true`, and remove workflow-wide write/OIDC privileges.
- Patch development Handlebars and Vite/esbuild advisory paths; document the remaining
  deepmerge-ts tooling advisory in `docs/READINESS.md`.

- Convert MCP `int64` and `bytes` inputs to native Convex values and serialize native Convex
  results with lossless tagged JSON.
- Enforce resource argument validators before dispatch and reject unsafe mutation/action
  timeouts that could report failure while non-cancellable side effects continue.

### Changed

- Document actual shipped APIs and host-owned identity/merge/CSRF boundaries; identity
  integration fixtures now receive strict lint checks (legacy MCP fixtures remain excluded).

- Refresh all direct dependencies to their latest compatible releases for canary validation.
- Require `convex@^1.45.0` and update `convex-test` to `^0.0.56`.

### Added

- `./better-auth` — fail-closed trusted-origin parser + HTTPS cookie settings for `@convex-dev/better-auth` (does not import better-auth).
- `./identity` — `getOrCreateFromAuth` / `requireFromAuth` / `retargetRows` host-`ctx` glue for anonymous sessions and anonymous→identified upgrades.
- `./mcp` entry — expose Convex functions as MCP tools (`createMCPServer` + `query`/`mutation`/`action`/`resource`), default-deny auth, lifecycle hooks, validator→zod conversion, and optional HMAC-signed cursor pagination. Absorbed from `@vllnt/convex-mcp` (see ROADMAP `absorb-convex-mcp`). `@modelcontextprotocol/sdk` and `zod` are optional peer deps — the `./mcp` entry is tree-shakeable, so backend-only consumers pull neither. 100% test coverage retained (161 tests).

## [0.1.0] - 2026-06-13

### Added

- Scaffolded to fleet Universal standard (type-B helpers library)
- Seed root utilities: `asyncMap`, `pruneNull`, `nullThrows`, `NullDocumentError`
- 100% test coverage gate via vitest thresholds
- CI workflow, publish workflow, email-guard workflow
- Full docs set: README, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- `llms.txt` and `llms-full.txt` for AI agent discovery
