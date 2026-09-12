<!-- Badges -->
[![npm version](https://img.shields.io/npm/v/@vllnt/convex-helpers.svg)](https://www.npmjs.com/package/@vllnt/convex-helpers)
[![CI](https://github.com/vllnt/convex-helpers/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-helpers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@vllnt/convex-helpers.svg)](./LICENSE)

# @vllnt/convex-helpers

Typed host-side helpers for Convex backends — builders, errors, validators, relationships,
pagination, HTTP, env, and observability.

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
- `./identity` — `getOrCreateFromAuth` / `retargetRows` (anonymous bootstrap + upgrade)
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

### Identity — `./identity`

Map `ctx.auth.getUserIdentity()` to a host row, and retarget rows when anonymous
upgrades to identified.

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
`vitest.config.mts` thresholds.

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
