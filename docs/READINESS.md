# Publication remediation evidence

Status: **not publication-ready**: an independent review is done (2026-10-31, no
critical or high findings) and its fixes are applied, but real Better Auth
login/JWT integration proof is still missing.

## Repairs and checks

- Origin preview allowlisting no longer bypasses scheme/credential/path
  validation. Wildcards require an exact explicitly configured HTTPS pattern
  with a single prefixed/suffixed wildcard label and fixed DNS suffix. Host
  deployment ownership remains a prerequisite.
- Local HTTP rejects paths and URL normalization; controls reject before
  trimming.
- Cookies require a validated HTTPS origin. SameSite=None remains opt-in host
  policy.
- Retarget callbacks execute sequentially, stop on error and reject pages over
  1000 before side effects. Host authorization and transaction boundaries remain
  mandatory.
- MCP before-hook throws/timeouts deny dispatch generically. Auth and lifecycle
  callbacks have 10-second deadlines; underlying host work is not cancelled.
- Raw tool/resource errors and attacker-controlled reserved keys are not logged.
  Host hooks own observability/redaction; explicit hook-returned messages are
  public.
- `AuthCtx.trustedIssuer` is required; missing/empty configuration and
  mismatched issuer claims fail closed before row callbacks.
- README/API/llms describe actual shipped surfaces and conditional bootstrap
  safety.
- Release notes are passed via a file, not interpolated shell source. Stable
  release runs only from a `vX.Y.Z` tag on main that matches `package.json` and
  `CHANGELOG.md`; default workflow permissions are read-only.

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

Coverage at the remediation checkpoint: 204 tests (including a real-clock policy
timeout), 100% statements, branches, functions and lines. Strict lint now
includes identity integration tests and schema; legacy MCP integration fixtures
remain excluded, explicitly rather than all tests. Typechecks now include host
wrappers. Packed runtime imports of all four entries passed, and packed API
TypeScript checks passed using
`tsc --ignoreConfig --noEmit --strict --skipLibCheck --module NodeNext --target ES2022`
against the installed local tarball. No publish command was executed.

## Independent review (2026-10-31)

A read-only source review found no critical or high issues. Outcome:

| Finding                                                                                                 | Result                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Subject-only lookups share a row across issuers (medium)                                                | Fixed: `trustedIssuer` required, fail closed. Regression tests in `identity.e2e.test.ts`. |
| Optional `trustedIssuer` accepts any issuer (medium)                                                    | Fixed with the above.                                                                     |
| Resources skip `onToolCall`/`before` hooks (medium)                                                     | Documented; an `onResourceRead` hook would be a future minor.                             |
| `timeout: 0` means no timeout (low)                                                                     | Documented, unchanged.                                                                    |
| Example injects the raw bearer into args (low)                                                          | Fixed: example injects a derived principal; `apiKey` documented as sensitive.             |
| Resources accept `_`-prefixed params (low)                                                              | Fixed: rejected before dispatch. Regression test in `server.test.ts`.                     |
| No body, stream or deadline caps (low)                                                                  | Documented as a host/platform duty.                                                       |
| Preview wildcard depends on Better Auth matcher (plausible)                                             | Checked in Better Auth 1.7.12 source: `*` can span `.`. Documented; pattern shape tested. |
| SameSite=None, cursor secret, no Origin check, Bearer case, `isAnonymous`, `retargetRows` outcome (low) | Documented; no behavior change.                                                           |

Review limits: source reading only. Real login/JWT behavior was not exercised.

## Dependency reachability

Development-only advisories (Handlebars, esbuild, deepmerge-ts) are fixed with
scoped overrides in `package.json` (`handlebars@<4.7.10`,
`deepmerge-ts@<8.0.0`); other overrides were dropped once the lockfile resolved
the same versions without them.

Remaining: `minimatch` (3.x and 10.x, moderate,
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)),
reached only through `@vllnt/eslint-config` lint tooling. The fix is minimatch
11, a major outside those packages' ranges, so no override is applied. Not
imported by package runtime. `pnpm audit --prod` reports zero advisories; this
is not proof for a host's independently installed optional peers. Convex CLI's
esbuild 0.27.0 is outside the reported vulnerable range (>=0.27.3 <0.28.1).

## Unverified conditions

- Real Better Auth session/anonymous plugin integration remains unverified.
  Local OCC proof passed with a synthetic identity, not a real signed-in
  session.
- Blocks publication: no test signs in through a real Better Auth session
  (including the anonymous plugin) and sends its JWT to a Convex backend, so the
  issuer/subject claims the helpers rely on are untested against real tokens.
- No publishing, merging, tagging, visibility changes or production access
  performed.

## Real local backend proof

Executed
`HOME=$(mktemp -d /tmp/helpers-home.XXXXXX) CONVEX_AGENT_MODE=anonymous node scripts/local-identity-proof.mjs`
through a managed process with declared 3340/3341 ports. Convex CLI 1.45.0
configured an anonymous local backend, created CLI-owned bindings in a temporary
fixture, deployed the indexed mutation and ran 16 simultaneous HTTP mutations.
All returned the same row ID; a separate query found exactly one row. Exit
status 0. No cloud account, production deployment or hand-edited generated
files. Identity injection was synthetic and cannot prove Better Auth login or
JWT integration. The retained script reproduces this evidence. Stable publishing
is tag-driven and uses reviewed current versions only.
