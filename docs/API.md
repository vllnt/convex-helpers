# API Reference — @vllnt/convex-helpers

**Compatibility:** `convex@^1.45.0`

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
| `timeout` | `number` | Per-call timeout (ms), supported only for queries. Mutation/action timeouts are rejected because their execution cannot be cancelled safely. |
| `onError` | `(ctx) => HookReturn` | Per-tool error hook. |

### resource(ref, options)

Wraps a Convex function reference as an MCP resource (`{ args?, description? }`). URI parameters are parsed through `args` before dispatch. JSON `int64` strings become `bigint`, base64 `bytes` strings become `ArrayBuffer`, and native Convex results use Convex's lossless tagged JSON encoding.

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
| Convex execution failure | Generic message by default; hooks see the real error and may explicitly return a public message. No raw error logging. |

Auth and lifecycle callbacks have a 10-second deadline per callback. Thrown or
stalled `before` hooks fail closed with `Tool call rejected`, without dispatch.
Thrown/stalled auth callbacks return a generic 401. Success/error hook failures
cannot undo completed execution and do not change its result. Deadlines stop
waiting, not execution: callbacks must avoid side effects. Hosts own observability
and must redact credentials, args and errors before logging. Resource errors are
masked and not logged. Mutation/action execution is not timed out or cancelled.

Every response carries an `X-Request-Id` header.


## `./better-auth` (shipped)

Fail-closed origin parsing and HTTPS cookie attributes for `@convex-dev/better-auth`.
Does **not** import better-auth — the host still calls `betterAuth({...})`.

| Function | Contract |
| --- | --- |
| `parseTrustedOrigin(origin, { previewPattern? }?)` | Canonical HTTPS origin or exact localhost/127.0.0.1 HTTP origin; otherwise undefined. Credentials, paths, query/hash, controls and arbitrary wildcards reject. |
| `trustedOriginsFromList(siteUrl, extra, options?)` | Parsed extras prefixed by a valid site origin; undefined when no extras survive. Invalid entries are discarded. |
| `trustedOriginsFromCsv(siteUrl, csv, options?)` | Same contract, comma-separated extras. |
| `cookieSettingsForSite(siteUrl)` | Valid HTTPS origin yields `advanced.useSecureCookies: true` plus HttpOnly, Secure, SameSite=None default attributes; otherwise undefined. |

An exact configured preview pattern must have the shape
`https://app-*-org.example.com`: one wildcard inside a prefixed/suffixed first
label and at least two fixed suffix labels. The host must trust all deployments
matched by Better Auth's wildcard semantics. These are syntax helpers, not proof
of ownership or CSRF protection. Returning undefined leaves host/provider defaults
in effect; it is not a deny-all trusted-origin configuration.

```ts
import {
  cookieSettingsForSite,
  trustedOriginsFromCsv,
} from "@vllnt/convex-helpers/better-auth";
```

## `./identity` (shipped)

Host-`ctx` identity-row callbacks, not an authentication provider or account merge.
Use a trusted single issuer: `subject` is issuer-local. Pass a host-owned
`trustedIssuer` on `AuthCtx` (e.g. `{ auth: ctx.auth, trustedIssuer: "https://issuer.example" }`)
to reject missing/mismatched issuer claims before lookup or insert. Omission retains
the legacy host-configured single-issuer contract; it does not namespace subjects. The host configures Better
Auth and its anonymous plugin. `isAnonymousIdentity(identity)` returns true only
for a literal boolean `isAnonymous: true` claim; false does not prove verification.

| Function | Contract |
| --- | --- |
| `requireIdentity(ctx)` | Identity or `UNAUTHENTICATED` ConvexError. |
| `getFromAuth(ctx, lookup)` | Row plus claim-derived `isAnonymous`, or null for missing session/row. |
| `requireFromAuth(ctx, lookup)` | Same row, or `USER_NOT_INITIALIZED` (also for missing session). |
| `getOrCreateFromAuth(ctx, { lookup, insert })` | Lookup then insert if absent; both callbacks receive subject. |
| `retargetRows(rows, apply)` | At most 1000 rows, sequential callbacks returning `deleted`, `patched`, or `skipped`; returns counts. Oversized pages reject before callbacks. |

Race-safe bootstrap requires the same Convex mutation transaction for indexed
lookup and insert, with every competing creator using that lookup. Remote calls
and actions do not provide uniqueness. Retargeting requires host authorization of
both identities, bounded pagination, conflict resolution and continuation. Failures
propagate without starting later callbacks; rollback depends on the host transaction.
The host owns observability; helpers do not log identity data or tokens.
Tests are convex-test mock integration, not real Better Auth or backend OCC proof.

```ts
import { getOrCreateFromAuth, retargetRows } from "@vllnt/convex-helpers/identity";

const user = await getOrCreateFromAuth(ctx, {
  lookup: (subject) => ctx.db.query("users").withIndex("by_betterauth_id", q => q.eq("betterAuthId", subject)).unique(),
  insert: async (subject) => {
    const id = await ctx.db.insert("users", { betterAuthId: subject });
    return (await ctx.db.get(id))!;
  },
});
```

## Planned modules

The following modules are on the roadmap but not yet shipped. See [ROADMAP.md](../ROADMAP.md) for
milestones and exit criteria.

| Module | Status | Description |
|--------|--------|-------------|
| `./builders` | [planned] | `customQuery`/`customMutation`/`customAction`/`customCtx` + composition |
| `./errors` | [planned] | `AppError(code)` + HTTP-status map + `toResponse()` |
| `./auth` | shipped as `./identity` | see `./identity` |
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
