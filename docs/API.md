# API Reference — @vllnt/convex-helpers

**Compatibility:** `convex@^1.45.0`; ESM-only.

**Availability:** on GitHub this reference describes `main`; the copy shipped at
`node_modules/@vllnt/convex-helpers/docs/API.md` describes the installed
version. `./better-auth`, `./identity`, `./builders` and `./validators` first
ship in `0.2.0`; `0.1.0` has only the root utilities and `./mcp`. See the
[install section](../README.md#install). Planned modules are not
exports.

This library provides pure functions and host-`ctx` glue utilities. It is a
type-B helpers library — not a sandboxed Convex component — and runs with the
host's `ctx`. No `app.use()` mounting required.

## Root utilities (shipped)

### asyncMap\<T, U\>(list, fn)

Applies an async function to every element of an array, returning results in
order.

```ts
import { asyncMap } from "@vllnt/convex-helpers";
import { v } from "convex/values";

import { query } from "./_generated/server";

export const getProjects = query({
  args: { ids: v.array(v.id("projects")) },
  handler: async (ctx, { ids }) =>
    asyncMap(ids, (id) => ctx.db.get("projects", id)),
});
```

| Param  | Type                                     | Description           |
| ------ | ---------------------------------------- | --------------------- |
| `list` | `T[]`                                    | Input array           |
| `fn`   | `(item: T, index: number) => Promise<U>` | Async mapper function |

**Returns:** `Promise<U[]>` — results in original order.

---

### pruneNull\<T\>(list)

Filters null and undefined values from an array.

```ts
import { asyncMap, pruneNull } from "@vllnt/convex-helpers";
import { v } from "convex/values";

import { query } from "./_generated/server";

export const getExistingProjects = query({
  args: { ids: v.array(v.id("projects")) },
  handler: async (ctx, { ids }) =>
    pruneNull(await asyncMap(ids, (id) => ctx.db.get("projects", id))),
});
```

| Param  | Type                         | Description                                       |
| ------ | ---------------------------- | ------------------------------------------------- |
| `list` | `(T \| null \| undefined)[]` | Input array potentially containing null/undefined |

**Returns:** `T[]` — all null and undefined values removed.

---

### nullThrows\<T\>(value, message?)

Asserts a value is non-null and non-undefined, throwing `NullDocumentError` if
it is.

```ts
import { nullThrows } from "@vllnt/convex-helpers";
import { v } from "convex/values";

import { query } from "./_generated/server";

export const getProject = query({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) =>
    nullThrows(await ctx.db.get("projects", id), `Project ${id} not found`),
});
```

| Param     | Type                     | Description          |
| --------- | ------------------------ | -------------------- |
| `value`   | `T \| null \| undefined` | Value to check       |
| `message` | `string` (optional)      | Custom error message |

**Returns:** `T` — the value, narrowed to exclude null and undefined.

**Throws:** `NullDocumentError` when value is null or undefined.

---

### NullDocumentError

Error thrown when a required document is null or undefined.

```ts
import { NullDocumentError, nullThrows } from "@vllnt/convex-helpers";
import { v } from "convex/values";

import { query } from "./_generated/server";

export const projectName = query({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    try {
      return nullThrows(await ctx.db.get("projects", id)).name;
    } catch (error) {
      if (error instanceof NullDocumentError) return null;
      throw error;
    }
  },
});
```

## MCP tools (`./mcp`)

Expose Convex queries, mutations, and actions to LLM agents over the Model
Context Protocol (Streamable HTTP). Import from `@vllnt/convex-helpers/mcp`.
Requires the optional peer dependencies `@modelcontextprotocol/sdk` and `zod` —
backend-only consumers that never import `./mcp` pull neither.

### createMCPServer(config)

Builds an MCP server. Returns `{ handler() }`, where `handler()` yields
`{ GET, POST }` request handlers (Web `Request` → `Response`) to mount on your
framework's route.

```ts
import { createMCPServer, query } from "@vllnt/convex-helpers/mcp";
import { v } from "convex/values";

import { api } from "@/convex/_generated/api";

const mcp = createMCPServer({
  auth: { validate: async (key) => key === process.env.MCP_API_KEY },
  tools: {
    list_projects: query(api.projects.list, {
      args: v.object({}),
      description: "List all projects",
    }),
  },
});

export const { GET, POST } = mcp.handler();
```

This is a Next.js route file such as `app/api/mcp/route.ts`; the `@/convex/...`
import assumes a `@/*` path alias to the project root.

Security boundaries (host-owned): resources do not run `onToolCall`/`before`
hooks (only tools do), so any valid bearer key reads every registered resource;
`_`-prefixed resource URI parameters are rejected. `CallContext.apiKey` is a
sensitive credential and must never be forwarded in args (inject a derived
principal via `extendArgs`). There are no body-size, stream or deadline caps
(`timeout` applies to queries only; `0` disables it), so cap them at the
platform or proxy. The endpoint does no `Origin` check, accepts only the
case-sensitive `Bearer ` scheme, and signs pagination cursors with a
per-instance secret. An `onResourceRead` hook is not provided.

`ServerConfig`:

| Field             | Type                          | Description                                                                                                                                                                                                                               |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`            | `AuthConfig`                  | **Required.** `validate(apiKey) => boolean` gates every request (default-deny — `createMCPServer` throws without it). Optional `convexToken(apiKey)` resolves a Convex auth token once per HTTP request, used only by the default client. |
| `tools`           | `Record<string, ToolDef>`     | Named tools built with `query`/`mutation`/`action`.                                                                                                                                                                                       |
| `resources`       | `Record<string, ResourceDef>` | Named resources built with `resource`.                                                                                                                                                                                                    |
| `convexUrl`       | `string`                      | Convex deployment URL. Defaults to `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL`.                                                                                                                                                               |
| `client`          | `ConvexClient`                | Inject a client (e.g. `convex-test`'s `t`) instead of a URL. Mutually exclusive with `auth.convexToken`.                                                                                                                                  |
| `hooks`           | `LifecycleHooks`              | `onToolCall(ctx)` fires `before`/`success`/`error`; `before` may `abort` or inject server-side args via `extendArgs`. When a tool sets `onError`, only `onError` runs in the error phase.                                                 |
| `name`, `version` | `string`                      | Server identity reported in the `initialize` response `serverInfo`. Defaults: `name` `"convex-mcp"`, `version` `"0.1.0"` (the MCP server's own version, not this package's).                                                              |
| `pagination`      | `PaginationConfig`            | Opt-in `tools/list` pagination — see below.                                                                                                                                                                                               |

### query / mutation / action

`query(ref, options)` / `mutation(ref, options)` / `action(ref, options)` wrap a
Convex function reference as a typed `ToolDef`.

| Option        | Type                                                                                        | Description                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`        | `ConvexValidator`                                                                           | A `v.object({...})` validator; converted to the tool's JSON-Schema input.                                                                                                         |
| `description` | `string`                                                                                    | Human/LLM-facing tool description.                                                                                                                                                |
| `tags`        | `Record<string, string>`                                                                    | Arbitrary metadata.                                                                                                                                                               |
| `timeout`     | `number`                                                                                    | Per-call timeout (ms, finite, 0 to 2147483647; 0 disables), supported only for queries. Mutation/action timeouts are rejected because their execution cannot be cancelled safely. |
| `onError`     | `(ctx) => OnCallResult \| undefined \| Promise<OnCallResult \| undefined> \| Promise<void>` | Per-tool error hook; when set, it runs in the error phase instead of `onToolCall`.                                                                                                |

### resource(ref, options)

Wraps a Convex query reference as an MCP resource
(`{ args?, description? }`). The key in `ServerConfig.resources` is registered
as a URI template, so resources appear in `resources/templates/list`, not in
`resources/list` (which returns no entries). URI parameters are parsed through
`args` before dispatch. Parameter names starting with `_` are rejected before
dispatch (reserved for server-injected context). Resources run no lifecycle hooks, so
authorize inside the backing function. JSON `int64` strings become `bigint`,
base64 `bytes` strings become `ArrayBuffer`, and native Convex results use
Convex's lossless tagged JSON encoding.

URI parameters are always strings. Declare each one with a validator that
accepts a string: `v.string()`, `v.id()`, a string literal (or a union of
them), `v.int64()` (converted to `bigint`) or `v.bytes()` (converted to
`ArrayBuffer`). A resource whose `args` use `v.float64()` or `v.boolean()` is
accepted by `createMCPServer`, but every read of it fails with
"Resource read failed"; parameters are not converted to numbers or booleans.

### Tool-list pagination

`PaginationConfig` opts `tools/list` into cursor pagination. `tools/list`
**without** a cursor always returns ALL tools (backward-compatible); pagination
activates only when the client sends a cursor. Send `cursor: ""` to get the
first page, then each `nextCursor` until none is returned.

| Field               | Type      | Description                                                                                                     |
| ------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `pageSize`          | `number`  | Tools per page; an integer ≥ 1, otherwise `createMCPServer` throws.                                             |
| `twoPhaseDiscovery` | `boolean` | Enables the non-standard `tools/list_summary` + `tools/describe` methods (custom agents only). Default `false`. |

Cursors are HMAC-signed per server instance and verified in constant time.

### Exported types

`AuthConfig`, `CallContext`, `ConvexClient`, `ConvexMCPServer` (the
`{ handler() }` return of `createMCPServer`), `ConvexValidator`, `FunctionType`
(`"query" | "mutation" | "action"`), `LifecycleHooks`, `OnCallResult`,
`PaginationConfig`, `ResourceDef`, `ServerConfig`, `ToolDef`, `ToolPage` and
`ToolSummary`.

`CallContext` fields:

| Field        | Description                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `phase`      | `"before"`, `"success"` or `"error"`.                                                                 |
| `requestId`  | ID of the HTTP request; also sent as the `X-Request-Id` response header.                              |
| `startedAt`  | `Date.now()` when the call started.                                                                   |
| `durationMs` | Milliseconds from `startedAt` until the Convex call returned or failed; set in `success` and `error`. |
| `toolName`   | The tool's key in `ServerConfig.tools`.                                                               |
| `toolDef`    | The tool definition without `ref` and `onError`.                                                      |
| `args`       | The validated request args (before `extendArgs` is merged).                                           |
| `result`     | The Convex result; set in `success`.                                                                  |
| `error`      | The thrown error; set in `error`.                                                                     |
| `apiKey`     | The raw bearer key. Sensitive: use it to authorize, never forward it in args, logs or responses.      |

### Validator utilities

| Export                           | Description                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| `convertValidator(validator)`    | Convert one `ConvexValidator` to a `zod` schema.                |
| `convexArgsToZod(argsValidator)` | Convert a `v.object()` args validator to a `zod` object schema. |
| `UnsupportedValidatorError`      | Thrown for validator kinds with no MCP/JSON-Schema mapping.     |

### Request behavior and error codes

| Condition                                                                 | Response                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Missing/malformed `Authorization: Bearer <key>`                           | `401` `{ error }`                                                                                                      |
| `auth.validate` returns false                                             | `401` `{ error: "Invalid API key." }`                                                                                  |
| `POST` whose `Content-Type` lacks `application/json` (checked after auth) | `415` JSON-RPC error `-32700`                                                                                          |
| Convex execution failure                                                  | Generic message by default; hooks see the real error and may explicitly return a public message. No raw error logging. |

Auth and lifecycle callbacks have a 10-second deadline per callback. Thrown or
stalled `before` hooks fail closed with `Tool call rejected`, without dispatch.
Thrown/stalled auth callbacks return a generic 401. Success/error hook failures
cannot undo completed execution and do not change its result. Deadlines stop
waiting, not execution: callbacks must avoid side effects. Hosts own
observability and must redact credentials, args and errors before logging.
Resource errors are masked and not logged. Mutation/action execution is not
timed out or cancelled.

Every response carries an `X-Request-Id` header.

## `./better-auth` (shipped)

Fail-closed origin parsing and HTTPS cookie attributes for
`@convex-dev/better-auth`. Does **not** import better-auth — the host still
calls `betterAuth({...})`.

| Function                                           | Contract                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseTrustedOrigin(origin, { previewPattern? }?)` | Canonical HTTPS origin or exact localhost/127.0.0.1 HTTP origin; otherwise undefined. Credentials, paths, query/hash, controls and arbitrary wildcards reject. |
| `trustedOriginsFromList(siteUrl, extra, options?)` | Parsed extras prefixed by a valid site origin; undefined when no extras survive. Invalid entries are discarded.                                                |
| `trustedOriginsFromCsv(siteUrl, csv, options?)`    | Same contract, comma-separated extras.                                                                                                                         |
| `cookieSettingsForSite(siteUrl)`                   | Valid HTTPS origin yields `advanced.useSecureCookies: true` plus HttpOnly, Secure, SameSite=None default attributes; otherwise undefined.                      |

An exact configured preview pattern must have the shape
`https://app-*-org.example.com`: one wildcard inside a prefixed/suffixed first
label and at least two fixed suffix labels. The host must trust all deployments
matched by Better Auth's wildcard semantics: per the Better Auth 1.7.12 source,
a `*` is matched without a path separator and can span `.`, so use a fixed
suffix only you control. These are syntax helpers, not proof of ownership or
CSRF protection. Returning undefined leaves host/provider defaults in effect; it is
not a deny-all trusted-origin configuration.

Origins must already be in canonical form: lowercase scheme and host, no
default port (`:443`, or `:80` for localhost), and an ASCII or punycode host
(`https://xn--bcher-kva.example`, not `https://bücher.example`). One trailing
`/` and surrounding spaces are allowed. Other spellings, such as
`https://Example.com` or `https://example.com:443`, return undefined, so
`trustedOriginsFromList` and `trustedOriginsFromCsv` leave them out.

Exported type: `CookieSettings` (the return of `cookieSettingsForSite`).

```ts
import {
  cookieSettingsForSite,
  trustedOriginsFromCsv,
} from "@vllnt/convex-helpers/better-auth";

const siteUrl = process.env.CONVEX_SITE_URL ?? "http://localhost:3211";

export const originOptions = {
  ...cookieSettingsForSite(siteUrl),
  trustedOrigins: trustedOriginsFromCsv(
    siteUrl,
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "",
  ),
};
```

## `./identity` (shipped)

Host-`ctx` identity-row callbacks, not an authentication provider or account
merge. Use a trusted single issuer: `subject` is issuer-local. Pass a
host-owned, non-empty `trustedIssuer` on `AuthCtx` (e.g.
`{ auth: ctx.auth, trustedIssuer: "https://issuer.example" }`); it is required.
Missing/empty configuration or a mismatched issuer claim fails closed with
`UNAUTHENTICATED` before lookup or insert. With one trusted issuer `subject` is
unique; hosts accepting several issuers must key rows on `tokenIdentifier` in
their own code. The host configures Better Auth and its anonymous plugin.
`isAnonymousIdentity(identity)` returns true only for a literal boolean
`isAnonymous: true` claim; false does not prove verification.

| Function                                       | Contract                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireIdentity(ctx)`                         | Identity or `UNAUTHENTICATED` ConvexError (also when `trustedIssuer` is unset).                                                                |
| `getFromAuth(ctx, lookup)`                     | Row plus claim-derived `isAnonymous`, or null for missing session/row.                                                                         |
| `requireFromAuth(ctx, lookup)`                 | Same row, or `USER_NOT_INITIALIZED` (also for missing session).                                                                                |
| `getOrCreateFromAuth(ctx, { lookup, insert })` | Lookup then insert if absent; both callbacks receive subject.                                                                                  |
| `retargetRows(rows, apply)`                    | At most 1000 rows, sequential callbacks returning `deleted`, `patched`, or `skipped`; returns counts. Oversized pages reject before callbacks. |
| `isAnonymousIdentity(identity)`                | `true` only for a literal boolean `isAnonymous: true` claim.                                                                                   |

Exported types: `AuthCtx` (`{ auth, trustedIssuer }`) and `AuthIdentity`.

Race-safe bootstrap requires the same Convex mutation transaction for indexed
lookup and insert, with every competing creator using that lookup. Remote calls
and actions do not provide uniqueness. Retargeting requires host authorization
of both identities, bounded pagination, conflict resolution and continuation.
`retargetRows` trusts the outcome each callback returns. Failures propagate
without starting later callbacks; rollback depends on the host transaction. The
host owns observability; helpers do not log identity data or tokens. The test
suite (run in CI) uses convex-test mocks, not real Better Auth or backend OCC.
Two manual scripts in the repository, run locally and not in CI, use a real
local Convex backend: one runs concurrent bootstrap mutations (indexed OCC), the
other signs in with real Better Auth and sends the issued JWTs to `./identity`
functions; see
[READINESS.md](https://github.com/vllnt/convex-helpers/blob/main/docs/READINESS.md#real-better-auth-loginjwt-proof).

```ts
import { nullThrows } from "@vllnt/convex-helpers";
import { getOrCreateFromAuth } from "@vllnt/convex-helpers/identity";

import { mutation } from "./_generated/server";

const trustedIssuer = process.env.CONVEX_SITE_URL ?? "";

export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getOrCreateFromAuth(
      { auth: ctx.auth, trustedIssuer },
      {
        insert: async (subject) => {
          const id = await ctx.db.insert("users", { subject });
          return nullThrows(await ctx.db.get("users", id));
        },
        lookup: (subject) =>
          ctx.db
            .query("users")
            .withIndex("by_subject", (q) => q.eq("subject", subject))
            .unique(),
      },
    );
    return user._id;
  },
});
```

## `./builders` (shipped)

Wrap a Convex function builder so every function made with it receives extra
`ctx` fields and, optionally, consumes extra args. Signatures and runtime
behaviour match `convex-helpers/server/customFunctions` 0.1.136; a parity test
runs both on the same convex-test backend.

| Export                                    | Contract                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customQuery(query, customization)`       | Returns a builder used like `query(...)`. Accepts `query`, `internalQuery` or `queryGeneric`.                                                                                                                                       |
| `customMutation(mutation, customization)` | Same for mutation builders.                                                                                                                                                                                                         |
| `customAction(action, customization)`     | Same for action builders.                                                                                                                                                                                                           |
| `customCtx(modifyCtx)`                    | Customization with no args: `modifyCtx(ctx, extra)` returns the ctx fields to add. `extra` holds the definition's keys other than `args`, `handler` and `returns`.                                                                  |
| `Customization`                           | `{ args, input }`. `args` (property validators) are merged into the function's args and taken out of the handler's args; `input(ctx, consumedArgs, extra)` returns `{ ctx, args, onSuccess? }`. `onSuccess` runs after the handler. |
| `CustomBuilder`, `CustomCtx<Builder>`     | Types of a custom builder and of the ctx its handlers receive.                                                                                                                                                                      |
| `CustomInput`, `Registration`             | Types of the `input` callback's return and of a registered function.                                                                                                                                                                |

When the customization consumes args, merging fails with an error when a
consumed arg and a function arg share a name but not a validator kind, when the
function's args validator is neither an object nor a union, or when the
function declares no args. Builders add no authorization of their own.

## `./validators` (shipped)

| Export                                 | Contract                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate(validator, value, options?)` | `true` when `value` matches (type guard). `options.throw` throws `ValidationError` on the first mismatch; `options.allowUnknownFields` accepts undeclared object fields. Undeclared fields whose value is `undefined` pass. |
| `parse(validator, value)`              | Validates with unknown fields allowed, throws `ValidationError` on mismatch, and returns a copy without undeclared fields (through arrays, records and unions).                                                             |
| `doc(schema, tableName)`               | The table's validator plus `_id` and `_creationTime`; union tables get them on every member. Throws for other validator kinds.                                                                                              |
| `ValidationError`                      | Has `expected`, `got` and an optional `path`; the message names `expected`, `got`, and `path` when set.                                                                                                                     |

Exported types: `AnyValidator`, `ValidateOptions`, `SystemFields` and
`AddFieldsToValidator`.

Behaviour matches `convex-helpers/validators` 0.1.136 for these exports, held by
a parity test. Declared object fields are looked up as own properties, so
inherited names (`constructor`, `toString`, `__proto__`) are unknown fields
(rejected by a strict `validate`, dropped by `parse`). Records accept only plain
objects: arrays and class instances such as `Date` or `Map` fail with
`` Expected `record` ``. One fail-closed difference: the `db` option (checking a
`v.id`'s table) is refused with an error instead of supported; `v.id` checks for
a string.

`ValidationError.expected` is always a string (upstream passes a literal's raw
value); messages are identical.

## Planned modules

The following modules are on the roadmap but not yet shipped. See
[ROADMAP.md](https://github.com/vllnt/convex-helpers/blob/main/ROADMAP.md) (in
the repository, not the package) for milestones and exit criteria.

| Module            | Status    | Description                                                                          |
| ----------------- | --------- | ------------------------------------------------------------------------------------ |
| `./errors`        | [planned] | `AppError(code)` + HTTP-status map + `toResponse()`                                  |
| `./auth`          | [planned] | provider-agnostic `getCurrentSubject(ctx)` (`requireIdentity` ships in `./identity`) |
| `./env`           | [planned] | `defineEnv(zodSchema)` cold-start validation                                         |
| `./tracing`       | [planned] | span emit + `traceparent` propagation                                                |
| `./testing`       | [planned] | `register(t)` + fixture factories + `withIdentity`                                   |
| `./relationships` | [planned] | `getOneFrom`/`getManyFrom`/`getManyVia`                                              |
| `./pagination`    | [planned] | `getPage`/`mergedStream`/`filter`                                                    |
| `./rls`           | [planned] | `RowLevelSecurity` reader/writer wrappers                                            |
| `./triggers`      | [planned] | atomic in-transaction denormalization / cascade delete                               |
| `./http`          | [planned] | `corsRouter`/`jsonResponse`/`resolveBearer`/hono adapter                             |
| `./react`         | [planned] | optional tree-shakeable front-end tooling layer                                      |

Also planned for shipped entries: composition helpers for `./builders`, and
`partial`/`typedV`/`literals` plus a zod bridge for `./validators`.
