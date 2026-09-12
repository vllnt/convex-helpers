# Publication remediation evidence

Status: **not publication-ready** pending independent review and real integration proof.

## Repairs and checks

- Origin preview allowlisting no longer bypasses scheme/credential/path validation.
  Wildcards require an exact explicitly configured HTTPS pattern with a single
  prefixed/suffixed wildcard label and fixed DNS suffix. Host deployment ownership
  remains a prerequisite.
- Local HTTP rejects paths and URL normalization; controls reject before trimming.
- Cookies require a validated HTTPS origin. SameSite=None remains opt-in host policy.
- Retarget callbacks execute sequentially, stop on error and reject pages over 1000
  before side effects. Host authorization and transaction boundaries remain mandatory.
- MCP before-hook throws/timeouts deny dispatch generically. Auth and lifecycle
  callbacks have 10-second deadlines; underlying host work is not cancelled.
- Raw tool/resource errors and attacker-controlled reserved keys are not logged.
  Host hooks own observability/redaction; explicit hook-returned messages are public.
- Optional host-configured `AuthCtx.trustedIssuer` rejects missing/mismatched issuer
  claims before row callbacks. Legacy omission requires host single-issuer config.
- README/API/llms describe actual shipped surfaces and conditional bootstrap safety.
- Release notes are passed via a file, not interpolated shell source. Stable release
  requires main plus `RELEASE_ENABLED=true`; default workflow permissions are read-only.

Commands executed from this repository:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm typecheck
pnpm test:coverage
pnpm audit --json
pnpm audit --prod --json
```

Coverage at the remediation checkpoint: 204 tests (including a real-clock policy timeout), 100% statements, branches,
functions and lines. Strict lint now includes identity integration tests and schema;
legacy MCP integration fixtures remain excluded, explicitly rather than all tests.
Typechecks now include host wrappers. Packed runtime imports of all four entries
passed, and packed API TypeScript checks passed using `tsc --ignoreConfig --noEmit
--strict --skipLibCheck --module NodeNext --target ES2022` against the installed
local tarball. No publish command was executed. Independent review is required before pushing the signed remediation commit.

## Dependency reachability

The initial full audit returned 10 advisories: 8 Handlebars advisories (including
critical), esbuild (low), and deepmerge-ts (high). Handlebars is development-only
through eslint-plugin-boundaries; pinned compatible 4.7.9. Vite is development-only
through Vitest; updated to 7.3.6 with compatible esbuild 0.28.1.

Remaining blocker: `@vllnt/eslint-config@2.0.0` →
`eslint-plugin-functional@9.0.5` → `deepmerge-ts@7.1.6`,
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
The fix requires deepmerge-ts >=8 (outside the upstream dependency range); even
eslint-plugin-functional 10 still requests ^7.1.5. No forced major override was
used. Reachable during development lint/config merging, not imported by package
runtime. Upstream toolchain owner must adopt/verify the major update.
`pnpm audit --prod --json` reported zero advisories; this is not proof for a host's
independently installed optional peers. Convex CLI's esbuild 0.27.0 is outside the
reported vulnerable range (>=0.27.3 <0.28.1).

## Unverified conditions

- Real Better Auth session/anonymous plugin integration remains unverified.
  Local OCC proof passed with a synthetic identity, not a real signed-in session.
- No independent current-target security review/verification completed in this slice.
- No publishing, merging, tagging, visibility changes or production access performed.

## Real local backend proof

Executed `HOME=$(mktemp -d /tmp/helpers-home.XXXXXX) CONVEX_AGENT_MODE=anonymous node scripts/local-identity-proof.mjs`
through a managed process with declared 3340/3341 ports. Convex CLI 1.45.0 configured
an anonymous local backend, created CLI-owned bindings in a temporary fixture,
deployed the indexed mutation and ran 16 simultaneous HTTP mutations. All returned
the same row ID; a separate query found exactly one row. Exit status 0. No cloud
account, production deployment or hand-edited generated files. Identity injection
was synthetic and cannot prove Better Auth login or JWT integration. The retained
script reproduces this evidence. Stable publishing now uses reviewed current
versions only, with npm publication before tags and documented metadata recovery.
