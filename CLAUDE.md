<!-- convex-ai-start -->
This package provides [Convex](https://convex.dev) helpers for use in Convex backends — it is a
library, not a Convex deployment of its own (no `convex/` app directory, no `app.use()` mount, no
generated `example/` harness).

When writing or reviewing Convex code that consumes these helpers, follow the official Convex
guidelines at <https://docs.convex.dev> — they override what you may have learned from training data.
<!-- convex-ai-end -->

# @vllnt/convex-helpers

Typed host-side helpers for Convex backends — builders, errors, validators, relationships,
pagination, HTTP, env, and observability.

A type-B helpers library (not a sandboxed Convex component) following the vllnt Component Standard
(see the `convex-components` hub `.claude/rules/component-standard.md`). `CLAUDE.md` is a verbatim
mirror of this file.

## Architecture

```
src/
├── index.ts           # root exports: asyncMap, pruneNull, nullThrows, NullDocumentError
└── mcp/               # ./mcp entry — expose Convex functions as MCP tools (absorbed from @vllnt/convex-mcp)
    ├── index.ts       # public API barrel
    ├── server.ts      # createMCPServer + GET/POST Streamable-HTTP handler
    ├── auth.ts        # Bearer key extraction + default-deny validation
    ├── validators.ts  # Convex validator → zod schema conversion
    ├── types.ts       # public types (ServerConfig, ToolDef, CallContext, ...)
    ├── tools/         # query/mutation/action wrappers + registration + lifecycle hooks
    ├── resources/     # resource wrapper + registration
    └── pagination/    # HMAC-signed cursor + two-phase discovery
```

Planned future layout (see ROADMAP.md):

```
src/
├── index.ts           # root exports (pure utils)
├── builders/          # customQuery / customMutation / customAction / customCtx
├── errors/            # AppError + HTTP-status map + toResponse()
├── auth/              # requireIdentity / getCurrentSubject
├── env/               # defineEnv(zodSchema)
├── tracing/           # span emit + traceparent propagation
├── testing/           # register(t) + fixture factories + withIdentity
├── relationships/     # getOneFrom / getManyFrom / getManyVia
├── validators/        # partial / typedV / doc / literals + zod bridge
├── pagination/        # getPage / mergedStream / filter
├── rls/               # RowLevelSecurity reader/writer wrappers
├── triggers/          # atomic denormalization / cascade delete
├── http/              # corsRouter / jsonResponse / resolveBearer / hono adapter
└── react/             # optional tree-shakeable front-end hooks (./react entry)
```

## Ownership boundary

- **This library owns:** pure functions + host-`ctx` glue utilities (no sandboxed tables, no
  `app.use()` mounting). Runs with the host's `ctx`; the host installs and imports directly.
- **Host owns:** data, auth, domain, application logic. This library never owns tables or
  cross-request state — stateful concerns belong in `@convex-dev/*` or `@vllnt/convex-*` components.
- **Logging:** delegated to `@vllnt/logger` — this library adds a ctx-bound tracing layer on top
  (see `./tracing`, planned).

## Key design decisions

1. **Type-B helper library (not a sandboxed Convex component)** — runs with the host's `ctx`, can
   touch host tables; the host installs and imports directly. No `defineComponent`, no
   `app.use()`, no own tables.
2. **Complements — does not clone — the official `convex-helpers` package**; defers all stateful
   concerns to `@convex-dev/*` or `@vllnt/convex-*` components per the dependency policy. The edge
   is the gap-fillers official ignores.
3. **Logging is delegated to `@vllnt/logger`**; this library provides a thin ctx-bound tracing
   wrapper, not its own logger. `./tracing` emits spans + propagates `traceparent` via `@vllnt/logger`
   (logs-first → PostHog/Axiom/Datadog).
4. **Host-`ctx`/pure split is the irreducible design law:** pure utilities (zero deps, zero ctx)
   live in root exports; ctx-bound glue is namespaced separately (e.g. `./builders`, `./auth`).
5. **100% test coverage enforced** on all owned logic via vitest thresholds; live-backend
   integration is the consuming app's E2E.
6. **Agnostic on auth, domain, and vendor** — only depends on official `@convex-dev/*` and
   `@vllnt/*` packages per the fleet dependency policy.
7. **`./mcp` is an optional, tree-shakeable entry** absorbed from `@vllnt/convex-mcp` (the
   `absorb-convex-mcp` migration). It is host-`ctx` library glue with no sandboxed tables — exactly
   why it belongs in this type-B library rather than a separate repo. `@modelcontextprotocol/sdk` +
   `zod` are OPTIONAL peer deps so backend-only consumers pull zero MCP code. The source was ported
   verbatim and held at 100% coverage; a scoped `src/mcp/**` eslint override exempts the proven
   protocol/JSON-RPC/Web-Crypto code from opinionated style rules (each exemption justified inline in
   `eslint.config.js`). Follow-up: migrate the MCP SDK `tool()`/`resource()` calls to
   `registerTool`/`registerResource`.

## Docs sync (MANDATORY)

When any of these change, update the matching docs in the SAME commit (then `pnpm generate:llms`):

| Changed | Update |
|---------|--------|
| Public API (exports, args, returns) | README usage + API table, docs/API.md, llms.txt + llms-full.txt |
| convex peer range | llms.txt context paragraph + docs/API.md Compatibility line + README |
| New utility added | README Features + Usage, docs/API.md, llms.txt index, regenerate llms-full.txt |
| New `exports` entry / peer dep | README, docs/API.md, llms, `package.json` exports + peer deps |
| Version | CHANGELOG.md entry |

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
```
