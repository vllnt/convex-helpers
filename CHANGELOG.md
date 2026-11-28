# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-28

### Changed

- `./validators`: `validate` and `parse` reject arrays and class instances
  (`Date`, `Map`, ...) for `v.record(...)` validators, as Convex and
  `convex-helpers` 0.1.136 do. They were accepted, and `parse` turned an array
  into an object. The error reads
  `` Validator error for <path>: Expected `record`, got `Array` `` (`for <path>`
  is left out at the top level; the class name replaces `Array` for `Date`,
  `Map`, ...). Pass a plain object, such as `Object.fromEntries(map)`.
- `./validators` reads declared object fields as own properties only, as
  `convex-helpers` 0.1.136 does. An inherited value no longer satisfies a
  declared field, and an absent optional field named like an `Object.prototype`
  member (`constructor`, `toString`) is no longer read from the prototype.
  Declare every field the validator checks as an own property of the value.
- `engines.node` is now `>=20` (0.2.0 declared `>=18`): Node 20 is the lowest
  Node that the lowest supported `convex` (1.45.0) runs on. Node 18 is no longer
  supported; use Node 20 or newer.
- `./builders` and `./validators` parity baseline is now `convex-helpers`
  0.1.136 (`customFunctions` is unchanged since 0.1.124). Upstream now also
  treats inherited names such as `constructor` as unknown object fields, so that
  is no longer a difference; the `db` option remains refused. `NOTICE` names
  0.1.136 and now also credits the `CustomCtx` and `Registration` types.
- `package.json` `description` and `keywords` now name what the package does
  and its stack. `homepage` is now https://oss.vllnt.com/packages/convex-helpers.
- The tarball no longer ships
  [`docs/READINESS.md`](https://github.com/vllnt/convex-helpers/blob/main/docs/READINESS.md)
  (maintainer publication notes).
- The peer ranges are unchanged. The test suite was run with the lockfile
  versions; a consumer project installed the published canary and ran every
  entry against a real local Convex backend at both the newest (convex 1.51.0,
  `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7, Node 24) and the lowest
  (convex 1.45.0, `@modelcontextprotocol/sdk` 1.29.0, `zod` 4.3.6, Node 20)
  versions in range.
- Development dependencies: `convex` 1.51.0, `convex-test` 0.0.73, `vitest` and
  `@vitest/coverage-v8` 5.1.1, `@vllnt/typescript` 3.0.0 (with
  `exactOptionalPropertyTypes` left off so the published types do not change),
  pnpm 10.34.9.
- Tooling: every push to `main` touching the package or its shipped docs
  publishes a canary; the 7-day minimum release age moved to
  [`pnpm-workspace.yaml`](https://github.com/vllnt/convex-helpers/blob/main/pnpm-workspace.yaml),
  where pnpm 10 reads it.

### Added

- The npm package states that its bundled docs (`docs/API.md`, `README.md`,
  `CHANGELOG.md`, `llms.txt`) match the installed version, and `llms.txt` links
  to the shipped files.
- README for coding agents: when to use, install and quick start in the first
  40 lines, a table of every export, common tasks, every error text with its
  cause and fix, limits, compatibility and links; `llms.txt` carries the same
  summary. `docs/API.md` lists the exported types of each entry. Every export
  has a TSDoc summary.
- `docs/API.md` and the README now state the `createMCPServer` `name` and
  `version` defaults (`"convex-mcp"`, `"0.1.0"`: the MCP server's own version),
  every `CallContext` field, that `cursor: ""` returns the first page, that
  `pageSize` must be an integer, that resources are listed by
  `resources/templates/list`, which resource URI param validators work, and
  that `parseTrustedOrigin` accepts only canonical origins.
- Tests and CI: a README layout test, `pnpm check:package` (tarball contents and
  links) and `pnpm test:package` (imports and type-checks the packed tarball)
  run in CI and before publish.

### Fixed

- `./mcp`: a `v.int64()` arg sent as a malformed decimal string (`"12abc"`,
  `"1.5"`, `"1e3"`) now returns the documented
  `MCP error -32602: Input validation error: ... Expected a decimal 64-bit integer string`
  instead of a `Cannot convert ... to a BigInt` error, and
  `convertValidator(v.int64()).safeParse(...)` returns that issue instead of
  throwing.
- Docs: undeclared tool args, `_`-prefixed ones included, are dropped by the MCP
  SDK before hooks run; they are not rejected, as 0.2.0's
  `OnCallResult.extendArgs` doc said.
- Shipped docs and source comments no longer name repository-only files (proof
  scripts, tests, the vitest config, maintainer publication notes) without a
  GitHub link.

## [0.2.0] - 2026-11-26

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
  document the remaining minimatch tooling advisory in
  [`docs/READINESS.md`](https://github.com/vllnt/convex-helpers/blob/main/docs/READINESS.md).

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

- [`scripts/better-auth-proof.mjs`](https://github.com/vllnt/convex-helpers/blob/main/scripts/better-auth-proof.mjs)
  (repository only): local, cloud-free proof that real Better Auth sessions
  (anonymous plugin and email/password) issue JWTs whose issuer, subject and
  anonymous claims `./identity` accepts on a real Convex backend, and that
  tampered, foreign-issuer and expired tokens are rejected.
- `./builders` — `customQuery` / `customMutation` / `customAction` / `customCtx`
  with the signatures and runtime behaviour of
  `convex-helpers/server/customFunctions` 0.1.124, held by a convex-test parity
  test against that package.
- `./validators` — `validate` (`throw`, `allowUnknownFields`), `parse` and
  `doc`, matching `convex-helpers/validators` 0.1.124 (parity-tested). Two
  fail-closed differences: object fields are own properties only (inherited
  names such as `constructor` are unknown fields), and the `db` id-table option
  is refused.
- `NOTICE` — attribution for the convex-helpers (Apache-2.0) behaviour and types
  these entries follow.
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
