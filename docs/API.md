# API Reference — @vllnt/convex-helpers

**Compatibility:** `convex@^1.36.1`

This library provides pure functions and host-`ctx` glue utilities. It is a type-B helpers library
— not a sandboxed Convex component — and runs with the host's `ctx`. No `app.use()` mounting
required.

## Root utilities (shipped)

### asyncMap\<T, U\>(list, fn)

Applies an async function to every element of an array, returning results in order.

```ts
import { asyncMap } from "@vllnt/convex-helpers";

const docs = await asyncMap(ids, (id) => ctx.db.get(id));
```

| Param | Type | Description |
|-------|------|-------------|
| `list` | `T[]` | Input array |
| `fn` | `(item: T, index: number) => Promise<U>` | Async mapper function |

**Returns:** `Promise<U[]>` — results in original order.

---

### pruneNull\<T\>(list)

Filters null and undefined values from an array.

```ts
import { asyncMap, pruneNull } from "@vllnt/convex-helpers";

const docs = pruneNull(await asyncMap(ids, (id) => ctx.db.get(id)));
```

| Param | Type | Description |
|-------|------|-------------|
| `list` | `(T \| null \| undefined)[]` | Input array potentially containing null/undefined |

**Returns:** `T[]` — all null and undefined values removed.

---

### nullThrows\<T\>(value, message?)

Asserts a value is non-null and non-undefined, throwing `NullDocumentError` if it is.

```ts
import { nullThrows } from "@vllnt/convex-helpers";

const doc = nullThrows(await ctx.db.get(id), `Document ${id} not found`);
```

| Param | Type | Description |
|-------|------|-------------|
| `value` | `T \| null \| undefined` | Value to check |
| `message` | `string` (optional) | Custom error message |

**Returns:** `T` — the value, narrowed to exclude null and undefined.

**Throws:** `NullDocumentError` when value is null or undefined.

---

### NullDocumentError

Error thrown when a required document is null or undefined.

```ts
import { NullDocumentError } from "@vllnt/convex-helpers";

try {
  const doc = nullThrows(await ctx.db.get(id));
} catch (e) {
  if (e instanceof NullDocumentError) {
    // handle missing document
  }
}
```

## MCP tools (`./mcp`)

Expose Convex queries, mutations, and actions to LLM agents over the Model Context Protocol
(Streamable HTTP). Import from `@vllnt/convex-helpers/mcp`. Requires the optional peer dependencies
`@modelcontextprotocol/sdk` and `zod` — backend-only consumers that never import `./mcp` pull
neither.

### createMCPServer(config)

Builds an MCP server. Returns `{ handler() }`, where `handler()` yields `{ GET, POST }` request
handlers (Web `Request` → `Response`) to mount on your framework's route.

```ts
import { createMCPServer, query } from "@vllnt/convex-helpers/mcp";

export const mcp = createMCPServer({
  auth: { validate: async (key) => key === process.env.MCP_API_KEY },
  tools: { list: query(api.tasks.list, { args: v.object({}), description: "List tasks" }) },
});
export const { GET, POST } = mcp.handler();
```

`ServerConfig`:

| Field | Type | Description |
|-------|------|-------------|
| `auth` | `AuthConfig` | **Required.** `validate(apiKey) => boolean` gates every request (default-deny — `createMCPServer` throws without it). Optional `convexToken(apiKey)` resolves a Convex auth token per call. |
| `tools` | `Record<string, ToolDef>` | Named tools built with `query`/`mutation`/`action`. |
| `resources` | `Record<string, ResourceDef>` | Named resources built with `resource`. |
| `convexUrl` | `string` | Convex deployment URL. Defaults to `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL`. |
| `client` | `ConvexClient` | Inject a client (e.g. `convex-test`'s `t`) instead of a URL. Mutually exclusive with `auth.convexToken`. |
| `hooks` | `LifecycleHooks` | `onToolCall(ctx)` fires `before`/`success`/`error`; `before` may `abort` or inject server-side args via `extendArgs`. |
| `name`, `version` | `string` | Server identity advertised over MCP. |
| `pagination` | `PaginationConfig` | Opt-in `tools/list` pagination — see below. |

### query / mutation / action

`query(ref, options)` / `mutation(ref, options)` / `action(ref, options)` wrap a Convex function
reference as a typed `ToolDef`.

| Option | Type | Description |
|--------|------|-------------|
| `args` | `ConvexValidator` | A `v.object({...})` validator; converted to the tool's JSON-Schema input. |
| `description` | `string` | Human/LLM-facing tool description. |
| `tags` | `Record<string, string>` | Arbitrary metadata. |
| `timeout` | `number` | Per-call timeout (ms). |
| `onError` | `(ctx) => HookReturn` | Per-tool error hook. |

### resource(ref, options)

Wraps a Convex function reference as an MCP resource (`{ args?, description? }`).

### Pagination

`PaginationConfig` opts `tools/list` into cursor pagination. `tools/list` **without** a cursor always
returns ALL tools (backward-compatible); pagination activates only when the client sends a cursor.

| Field | Type | Description |
|-------|------|-------------|
| `pageSize` | `number` | Tools per page (≥ 1). |
| `twoPhaseDiscovery` | `boolean` | Enables the non-standard `tools/list_summary` + `tools/describe` methods (custom agents only). Default `false`. |

Cursors are HMAC-signed per server instance and verified in constant time.

### Validator utilities

| Export | Description |
|--------|-------------|
| `convertValidator(validator)` | Convert one `ConvexValidator` to a `zod` schema. |
| `convexArgsToZod(argsValidator)` | Convert a `v.object()` args validator to a `zod` object schema. |
| `UnsupportedValidatorError` | Thrown for validator kinds with no MCP/JSON-Schema mapping. |

### Request behavior & error codes

| Condition | Response |
|-----------|----------|
| Missing/malformed `Authorization: Bearer <key>` | `401` `{ error }` |
| `auth.validate` returns false | `401` `{ error: "Invalid API key." }` |
| `POST` without `application/json` | `415` JSON-RPC error `-32700` |
| Convex execution failure | Generic message to the client (internal Convex errors never leak); the `onToolCall`/`onError` hooks see the real error. |

Every response carries an `X-Request-Id` header.

## Planned modules

The following modules are on the roadmap but not yet shipped. See [ROADMAP.md](../ROADMAP.md) for
milestones and exit criteria.

| Module | Status | Description |
|--------|--------|-------------|
| `./builders` | [planned] | `customQuery`/`customMutation`/`customAction`/`customCtx` + composition |
| `./errors` | [planned] | `AppError(code)` + HTTP-status map + `toResponse()` |
| `./auth` | [planned] | `requireIdentity(ctx)` / `getCurrentSubject(ctx)` over `ctx.auth` |
| `./env` | [planned] | `defineEnv(zodSchema)` cold-start validation |
| `./tracing` | [planned] | span emit + `traceparent` propagation |
| `./testing` | [planned] | `register(t)` + fixture factories + `withIdentity` |
| `./relationships` | [planned] | `getOneFrom`/`getManyFrom`/`getManyVia` + `asyncMap` |
| `./validators` | [planned] | `partial`/`typedV`/`doc`/`literals` + zod bridge |
| `./pagination` | [planned] | `getPage`/`mergedStream`/`filter` |
| `./rls` | [planned] | `RowLevelSecurity` reader/writer wrappers |
| `./triggers` | [planned] | atomic in-transaction denormalization / cascade delete |
| `./http` | [planned] | `corsRouter`/`jsonResponse`/`resolveBearer`/hono adapter |
| `./react` | [planned] | optional tree-shakeable front-end tooling layer |
