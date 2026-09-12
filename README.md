<!-- Badges -->
[![npm version](https://img.shields.io/npm/v/@vllnt/convex-helpers.svg)](https://www.npmjs.com/package/@vllnt/convex-helpers)
[![CI](https://github.com/vllnt/convex-helpers/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-helpers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@vllnt/convex-helpers.svg)](./LICENSE)

# @vllnt/convex-helpers

Typed Convex host-side utilities, trusted-origin and cookie configuration helpers,
identity-row glue, and optional MCP tools.

```ts
import { asyncMap, pruneNull, nullThrows } from "@vllnt/convex-helpers";

const docs = pruneNull(await asyncMap(ids, (id) => ctx.db.get(id)));
const doc = nullThrows(await ctx.db.get(id), `Document ${id} not found`);
```

A helpers library (not a sandboxed Convex component): pure functions and host-`ctx` glue that run with
the host's `ctx` — no own tables, no `app.use()` mounting. Stateful concerns (rate limiting,
idempotency, flags) belong in `@convex-dev/*` or `@vllnt/convex-*` components.

See [ROADMAP.md](./ROADMAP.md) for the planned module surface.

## Features

- `asyncMap` — parallel async map that preserves order
- `pruneNull` — filter null/undefined from arrays
- `nullThrows` — non-null assertion with typed `NullDocumentError`
- `./better-auth` — fail-closed trusted origins + HTTPS cookies for better-auth
- `./identity` — identity-row lookup/bootstrap and bounded row-callback counting
- `./mcp` — expose Convex functions as MCP tools (`createMCPServer` + `query`/`mutation`/`action`/`resource`), default-deny auth, optional cursor pagination
- [planned] `./builders` — `customQuery`/`customMutation`/`customAction`/`customCtx`
- [planned] `./errors` — typed `AppError` + HTTP-status map
- [planned] `./env` — `defineEnv(zodSchema)` cold-start validation
- [planned] `./tracing` — span emit + `traceparent` propagation via `@vllnt/logger`
- [planned] `./testing` — fixture factories + `withIdentity`
- [planned] `./relationships`, `./validators`, `./pagination`, `./rls`, `./triggers`, `./http`
- [planned] `./react` — optional tree-shakeable front-end hooks layer

## Installation

```bash
pnpm add @vllnt/convex-helpers
```

`convex` is a peer dependency:

```bash
pnpm add convex
```

## Usage

```ts
import { asyncMap, pruneNull, nullThrows } from "@vllnt/convex-helpers";

// Parallel fetch with null filtering
const docs = pruneNull(await asyncMap(ids, (id) => ctx.db.get(id)));

// Non-null assertion
const doc = nullThrows(await ctx.db.get(id), `Document ${id} not found`);
```

### MCP tools — `./mcp`

Expose Convex functions to LLM agents over the Model Context Protocol. The `./mcp` entry is
tree-shakeable — backend-only consumers pull zero MCP code. It needs two optional peer deps:

```bash
pnpm add @modelcontextprotocol/sdk zod
```

```ts
import { createMCPServer, query, mutation } from "@vllnt/convex-helpers/mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: { validate: async (key) => key === process.env.MCP_API_KEY },
  tools: {
    list_projects: query(api.projects.list, { args: v.object({}), description: "List all projects" }),
    create_project: mutation(api.projects.create, {
      args: v.object({ name: v.string() }),
      description: "Create a project",
    }),
  },
});

// Mount the route handler (e.g. Next.js App Router)
export const { GET, POST } = mcp.handler();
```

MCP auth and lifecycle callbacks have a 10-second deadline per callback. A thrown
or timed-out `before` hook denies dispatch with a generic message. Auth failures
also deny access generically. Success/error hooks cannot undo completed dispatch.
Timeouts stop waiting, not the host callback; callbacks must avoid side effects.
Raw errors are not logged by the library; hosts may observe hook context and must
redact errors, arguments and credentials before logging. Resource failures are
masked without raw logging.

### Better-auth origins — `./better-auth`

Fail-closed trusted-origin parsing and HTTPS cookie attributes. Does **not** import
`better-auth` — the host still calls `betterAuth({...})`.

```ts
import {
  cookieSettingsForSite,
  trustedOriginsFromCsv,
} from "@vllnt/convex-helpers/better-auth";

const trustedOrigins = trustedOriginsFromCsv(
  process.env.CONVEX_SITE_URL ?? "http://localhost:3211",
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "",
);
```

`parseTrustedOrigin` rejects credentials, paths, query/hash, controls and arbitrary
wildcards. HTTP is allowed only for exact localhost/127.0.0.1 origins. An explicit
`previewPattern` permits only HTTPS patterns shaped like
`https://app-*-org.example.com` (one wildcard inside a prefixed/suffixed first label).
The host must trust **every** deployment matched by its auth provider's wildcard
semantics; syntax validation does not establish deployment ownership.
Invalid extras are discarded; if none survive, the list helpers return `undefined`,
so the host omits `trustedOrigins` and retains Better Auth defaults. They do not
validate the host's entire auth configuration. `cookieSettingsForSite(siteUrl)`
returns secure, HttpOnly, SameSite=None attributes for a valid HTTPS origin only;
it does not replace CSRF/origin protection and is for hosts requiring cross-site cookies.

### Identity — `./identity`

Map `ctx.auth.getUserIdentity()` to a host row. The host must configure a trusted
single issuer (subjects are issuer-local). To enforce it locally, pass
`{ auth: ctx.auth, trustedIssuer: "https://your-trusted-issuer.example" }` as the
helper context. A mismatched or missing issuer rejects before lookup/insert. The
issuer must be host configuration, never a request argument. Omitting it preserves
compatibility and relies on the host's single-issuer auth configuration.
Provide callbacks bound to the same
Convex mutation transaction, including the indexed lookup, for race-safe bootstrap.
Every competing creator must use the same lookup. Actions or remote callbacks are
not race-safe. `isAnonymous` reflects only a literal `true` JWT claim; missing/false
claims do not prove a verified or identified account.

`retargetRows(rows, apply)` processes at most 1000 rows sequentially, counts
`patched`/`deleted`/`skipped`, and propagates failures without starting later rows.
The host supplies bounded pages, authorization for both identities, conflict rules,
continuation, transaction/rollback and logging. It is **not** a secure account merge.
These helpers neither construct `betterAuth` nor install its anonymous plugin.

```ts
import { getOrCreateFromAuth, retargetRows } from "@vllnt/convex-helpers/identity";

const user = await getOrCreateFromAuth(ctx, {
  lookup: (subject) =>
    ctx.db.query("users").withIndex("by_betterauth_id", (q) =>
      q.eq("betterAuthId", subject),
    ).unique(),
  insert: async (subject) => {
    const id = await ctx.db.insert("users", { betterAuthId: subject });
    return (await ctx.db.get(id))!;
  },
});
```

Migrating from `@vllnt/convex-mcp`? Change the import to `@vllnt/convex-helpers/mcp` — the API is
identical. See [docs/API.md](./docs/API.md#mcp-tools-mcp) for the full `./mcp` reference.

## API Reference

See [docs/API.md](./docs/API.md) for full API reference with signatures and examples.

## Testing

```bash
pnpm test
pnpm test:coverage   # must reach 100%
```

Tests use [vitest](https://vitest.dev) with the node environment. 100% coverage is enforced via
`vitest.config.mts` thresholds. Identity integration tests use **convex-test mocks**;
they do not prove real Better Auth sessions or anonymous plugin integration.
The separate `scripts/local-identity-proof.mjs` passed 16 concurrent real local-backend
bootstrap mutations with an injected synthetic identity (one row); this tests indexed
OCC, not login. Consuming apps must verify their actual auth integration independently.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X
@bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet —
[vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

[MIT](./LICENSE)
