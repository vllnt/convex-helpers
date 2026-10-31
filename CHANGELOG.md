# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - Unreleased

### Fixed

- Fail closed on thrown or stalled MCP authorization hooks; bound auth/lifecycle
  callbacks to 10 seconds and remove raw exception logging.
- `./identity`: `AuthCtx.trustedIssuer` is required (non-empty string). Missing
  or empty configuration fails closed with `UNAUTHENTICATED`, and a mismatched
  issuer is rejected before any row callback, so a subject shared by two issuers
  can no longer map to one host row.
- `./mcp`: reject `_`-prefixed resource URI parameters (reserved for
  server-injected context, as for tools) so a resource caller cannot supply
  hook-style values.
- Reject unsafe preview patterns, localhost paths/normalization and control
  characters; validate cookie origins instead of trusting a prefix.
- Bound retargeting to 1000 rows with sequential callbacks and failure
  short-circuiting.
- Reject MCP query `timeout` values that are negative, `NaN`, infinite or above
  2147483647 ms; they previously fired immediately and failed the call.
- Patch development Handlebars, Vite/esbuild and deepmerge-ts advisory paths;
  document the remaining minimatch tooling advisory in `docs/READINESS.md`.

- Convert MCP `int64` and `bytes` inputs to native Convex values and serialize
  native Convex results with lossless tagged JSON.
- Enforce resource argument validators before dispatch and reject unsafe
  mutation/action timeouts that could report failure while non-cancellable side
  effects continue.

### Changed

- Tooling: SHA-pinned CI actions, least-privilege workflow permissions, and
  stable releases published only from a `vX.Y.Z` tag on `main` via npm trusted
  publishing with provenance. The `RELEASE_ENABLED` variable is no longer used.
- `./mcp`: document `CallContext.apiKey` as a sensitive credential and stop
  forwarding it in the `extendArgs` example.
- Document host-owned boundaries: resources run no lifecycle hooks, no
  body/stream/deadline caps, no `Origin` check, case-sensitive `Bearer` scheme,
  per-instance cursor secret, `retargetRows` trusting callback outcomes, and
  that Better Auth 1.7.12 wildcard origins can span `.`.
- Use pnpm 10 with a 7-day minimum release age for dependencies.

- Document actual shipped APIs and host-owned identity/merge/CSRF boundaries;
  identity integration fixtures now receive strict lint checks (legacy MCP
  fixtures remain excluded).

- Update development dependencies, including `convex-test` to `^0.0.65`.

### Added

- `./better-auth` — fail-closed trusted-origin parser + HTTPS cookie settings
  for `@convex-dev/better-auth` (does not import better-auth).
- `./identity` — `getOrCreateFromAuth` / `requireFromAuth` / `retargetRows`
  host-`ctx` glue for anonymous sessions and anonymous→identified upgrades.

## [0.1.0] - 2026-09-01

### Added

- `./mcp` entry — expose Convex functions as MCP tools (`createMCPServer` +
  `query`/`mutation`/`action`/`resource`), default-deny auth, lifecycle hooks,
  validator→zod conversion, and optional HMAC-signed cursor pagination. Absorbed
  from `@vllnt/convex-mcp` (see ROADMAP `absorb-convex-mcp`).
  `@modelcontextprotocol/sdk` and `zod` are optional peer deps — the `./mcp`
  entry is tree-shakeable, so backend-only consumers pull neither. 100% test
  coverage retained (161 tests).
- Scaffolded to fleet Universal standard (type-B helpers library)
- Seed root utilities: `asyncMap`, `pruneNull`, `nullThrows`,
  `NullDocumentError`
- 100% test coverage gate via vitest thresholds
- CI workflow, publish workflow, email-guard workflow
- Full docs set: README, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- `llms.txt` and `llms-full.txt` for AI agent discovery
