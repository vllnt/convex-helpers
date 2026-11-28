# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-27

### Fixed

- `./validators`: `validate` and `parse` reject arrays and class instances
  (`Date`, `Map`, ...) for `v.record(...)` validators, as Convex and
  `convex-helpers` 0.1.136 do. They were accepted, and `parse` turned an array
  into an object. The error reads `` Expected `record`, got `Array` ``.
- `./validators` reads declared object fields as own properties only, as
  `convex-helpers` 0.1.136 does. An inherited value no longer satisfies a
  declared field, and an absent optional field named like an `Object.prototype`
  member (`constructor`, `toString`) is no longer read from the prototype.
- Shipped docs and source comments no longer name repository-only files (proof
  scripts, tests, the vitest config, maintainer publication notes) without a
  GitHub link.

### Added

- The npm package now states that its bundled docs (`docs/API.md`, `README.md`,
  `CHANGELOG.md`, `llms.txt`) match the installed version: a "For coding agents"
  note in the README and `llms.txt`, relative `llms.txt` links to the shipped
  files, an Ecosystem link and a Related packages section. `docs/API.md` now
  lists the exported types of each entry.
- `pnpm check:package` (run by `pnpm lint`) fails when the tarball misses a
  required doc file or ships contributor or internal files; when a relative link
  or `#anchor` in any shipped Markdown doc does not resolve inside it (inline
  links with or without a title, reference definitions and HTML `href`/`src`;
  code is ignored); or when a shipped file names a repository file that is not
  packed. A test keeps `docs/API.md` in step with every entry's exports and
  checks that the docs name no internal type.
- README for coding agents: when to use, install and quick start in the first
  40 lines, a table of every export, common tasks, every error text with its
  cause and fix, limits, compatibility and links. `llms.txt` carries the same
  summary and links to the reference and the errors table. Every export has a
  TSDoc summary. A test checks the README layout, the export and error tables,
  links, the footer and the `llms.txt` Ecosystem block, and type-checks every
  README example against the built package.

### Changed

- `package.json` `description` and `keywords` now name what the package does
  and its stack.
- `./builders` and `./validators` parity baseline is now `convex-helpers`
  0.1.136 (`customFunctions` is unchanged since 0.1.124). Upstream now also
  treats inherited names such as `constructor` as unknown object fields, so that
  is no longer a difference; the `db` option remains refused.
- The tarball no longer ships
  [`docs/READINESS.md`](https://github.com/vllnt/convex-helpers/blob/main/docs/READINESS.md)
  (maintainer publication notes). `homepage` is now
  https://oss.vllnt.com/packages/convex-helpers.
- Tooling: every push to `main` touching the package publishes a canary (no
  repository-variable gate), and docs-only changes now trigger it.
- Tooling: the 7-day minimum release age now sits in
  [`pnpm-workspace.yaml`](https://github.com/vllnt/convex-helpers/blob/main/pnpm-workspace.yaml),
  where pnpm 10 reads it (the `package.json` `pnpm` field ignored it), and
  Renovate follows the same 7-day rule with `@vllnt/*` exempt.
- Development dependencies: `convex` 1.51.0, `convex-test` 0.0.73, `vitest` and
  `@vitest/coverage-v8` 5.1.1, `@vllnt/typescript` 3.0.0 (with
  `exactOptionalPropertyTypes` left off so the published types do not change),
  pnpm 10.34.9. The peer ranges are unchanged. CI tests with the lockfile
  versions (convex 1.51.0); the test suite and a packed-consumer type-check
  were also run by hand at `convex` 1.45.0, `@modelcontextprotocol/sdk` 1.29.0
  and `zod` 4.3.6.
- `engines.node` is now `>=20`, matching the `convex` peer's own requirement.

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
