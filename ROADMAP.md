# Roadmap — @vllnt/convex-helpers

> The host-`ctx` / pure-function complement of the vllnt Convex component fleet — every cross-cutting Convex boilerplate that needs no sandboxed state, with stateful concerns deferred to components.

**Now:** foundation
**Last updated:** 2026-06-13

> **Design (first principles):** a helper may hold only PURE functions or host-`ctx` glue;
> the instant a capability needs its own sandboxed state (a table, a cron, isolation) it is a
> **component**, not a helper. So this library is the COMPLEMENT of the component fleet — not a
> clone of the official `convex-helpers` (a pre-component grab-bag, half of which has since
> graduated into `@convex-dev/*` components we are required to consume, not rebuild). The edge is
> the gap-fillers official ignores; stateful concerns are Non-goals (see bottom).

## foundation [ACTIVE]

**Goal:** Stand up the type-B package at the Universal standard with the function-boundary builder every other primitive composes onto.
**Exit criteria:** `@vllnt/convex-helpers` builds, lints, and typechecks green at 100% coverage; `./builders` is published; the package is named `@vllnt/convex-helpers` (not the stub `@vllnt/convex`).

- [ ] foundation.1 Scaffold the type-B package structure to the Universal standard (#1, #2)
- [ ] foundation.2 Reconcile the package name `@vllnt/convex` → `@vllnt/convex-helpers` (README, `package.json`, exports map)
- [ ] foundation.3 Ship `./builders` — `customQuery`/`customMutation`/`customAction`/`customCtx` + composition (#3)
- [ ] foundation.4 Wire the 100% E2E coverage gate + `ci.yml` (Universal standard)

## dx-gap-fillers [PLANNED]

**Goal:** Ship the five host-`ctx` primitives the official `convex-helpers` has no answer for — the library's differentiation.
**Exit criteria:** errors, auth-glue, env, tracing, and test factories each ship with happy + ≥1 adversarial E2E at 100% coverage, and each names a real consumer.

- [ ] dx-gap-fillers.1 `./errors` — `AppError(code)` + HTTP-status map + `toResponse()`; the `code` survives the `ConvexError` wire boundary (#4)
- [ ] dx-gap-fillers.2 `./auth` — provider-agnostic `requireIdentity(ctx)` / `getCurrentSubject(ctx)` over `ctx.auth` (zero-config across ≥2 auth providers)
- [ ] dx-gap-fillers.3 `./env` — `defineEnv(zodSchema)` cold-start validation with named missing/invalid-var errors
- [ ] dx-gap-fillers.4 `./tracing` — span emit + `traceparent` propagation through `ctx.runQuery`/`runMutation`/`scheduler`, over `@vllnt/logger`; logs-first → PostHog/Axiom/Datadog (Convex has no native OTLP)
- [ ] dx-gap-fillers.5 `./testing` — `register(t)` + fixture factories (`defineFactory`) + `withIdentity`

## table-stakes [PLANNED]

**Goal:** Match-or-beat the official `convex-helpers` surface for the remaining host-`ctx` primitives so adopting ours never regresses ergonomics.
**Exit criteria:** relationships, validators+zod, query-shaping, RLS, triggers, and HTTP all ship at 100% coverage; the filter-undersizes-page bug (convex-helpers #864) has a passing regression test.

- [ ] table-stakes.1 `./relationships` — `getOneFrom`/`getManyFrom`/`getManyVia` + `asyncMap` (query count O(1) in batch size, not O(N))
- [ ] table-stakes.2 `./validators` + `./zod` — `partial`/`typedV`/`doc`/`literals` + the zod↔convex bridge (one source, zero validator↔type drift)
- [ ] table-stakes.3 `./pagination` `./stream` `./filter` — `getPage`/`mergedStream`/`filter`; **beat:** filter never undersizes a page (regression test vs #864) (#5)
- [ ] table-stakes.4 `./rls` — `RowLevelSecurity` reader/writer wrappers + a pure `requireRole` guard
- [ ] table-stakes.5 `./triggers` — atomic in-transaction denormalization / cascade delete
- [ ] table-stakes.6 `./http` — `corsRouter`/`jsonResponse`/`resolveBearer`/hono adapter; error → status via `./errors` (#6)

## react-tooling [PLANNED]

**Goal:** Ship the optional, tree-shakeable `./react` client layer so a backend-only consumer pulls zero React.
**Exit criteria:** `./react` exports useQuery-with-status, the query cache, session hooks, and an optimistic-from-mutation helper; render-tested in jsdom; coverage-included at 100%; `react`/`convex/react` are optional peer deps.

- [ ] react-tooling.1 `./react` — `useQuery`-with-status + `makeUseQueryWithStatus`
- [ ] react-tooling.2 Query cache provider + hooks (kills remount loading flicker)
- [ ] react-tooling.3 Session hooks — `useSessionQuery`/`useSessionMutation`/`useSessionAction` + `SessionProvider`
- [ ] react-tooling.4 Optimistic-update helper that infers from the mutation handler (**beat:** no duplicated server logic)
- [ ] react-tooling.5 jsdom render tests + `coverage.include` at 100% (backend pulls zero React)

## first-release [PLANNED]

**Goal:** Publish `@vllnt/convex-helpers` 0.1.0 with full docs and a real second consumer.
**Exit criteria:** 0.1.0 on npm via OIDC `publish.yml` (provenance, no `NPM_TOKEN`); README + llms document the host-`ctx`-complement scope and the `@vllnt/logger` boundary; ≥2 real backends consume it end-to-end (Rule of Three).

- [ ] first-release.1 Docs — README + `llms.txt`/`llms-full.txt`: the host-`ctx`-complement scope, the `@vllnt/logger` boundary (logging vs tracing), and the component-deferral table
- [ ] first-release.2 Wire into ≥2 real backends (a `vllnt` app + an `anthm-fr` game) end-to-end
- [ ] first-release.3 Publish 0.1.0 via the standard OIDC `publish.yml`

## Non-goals — deferred to components (dependency policy)

Explicitly NOT in this library — each needs its own sandboxed state, so it is a component; consume it, never rebuild it here:

- Rate limiting → `@convex-dev/rate-limiter`
- Migrations → `@convex-dev/migrations`
- Action retries / durable jobs → `@convex-dev/action-retrier` · `@convex-dev/workflow` · `@convex-dev/workpool`
- Aggregates / counts → `@convex-dev/aggregate` · `@convex-dev/sharded-counter`
- Idempotency / webhook exactly-once → `@vllnt/convex-idempotency`
- Feature flags → `@vllnt/convex-flags`
- Stored RBAC → `@vllnt/convex-permissions` (a pure `requireRole` guard stays here — see table-stakes.4)
- Structured logging (pure) → `@vllnt/logger` (`/convex` + `/posthog`) — consumed by `./tracing`, never re-implemented

## Later

- CLI parity with official `convex-helpers` — `ts-api-spec` / `open-api-spec` generators (only on a real consumer ask)
- Standard Schema interop (`toStandardSchema`) once the ecosystem demand is real
- `compareValues` helper if a host needs index-order comparison in JS
