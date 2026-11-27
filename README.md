# @vllnt/convex-helpers

TypeScript helpers for Convex backends: custom function builders, runtime
validators, auth identity rows, Better Auth origins and an MCP tool server.

## For coding agents

Docs for the installed version ship in the package: `README.md`, `docs/API.md`,
`CHANGELOG.md` and `llms.txt`. Types are in `dist/`, source in `src/`.

## When to use

- Use it for Convex function builders with shared `ctx` fields (`./builders`)
  and runtime checks against `v.*` validators (`./validators`).
- Use it to map the signed-in identity to a host user row (`./identity`).
- Use it for `@convex-dev/better-auth` origins and cookies (`./better-auth`), or
  to serve Convex functions as MCP tools over Streamable HTTP (`./mcp`).
- Do not use it for state such as rate limits, idempotency or API keys: use a
  `@convex-dev/*` or `@vllnt/convex-*` component.
- Do not use it for relationships, RLS or triggers: use `convex-helpers`.

## Install

```bash
pnpm add @vllnt/convex-helpers convex
```

## Quick start

```ts
import { asyncMap, pruneNull } from "@vllnt/convex-helpers";
import { v } from "convex/values";
import { query } from "./_generated/server";

export const getProjects = query({
  args: { ids: v.array(v.id("projects")) },
  handler: async (ctx, { ids }) =>
    pruneNull(await asyncMap(ids, (id) => ctx.db.get("projects", id))),
});
```

Put this in a Convex functions file such as `convex/projects.ts`. It returns the
projects that exist, in the order of `ids`.
`nullThrows(await ctx.db.get("projects", id))` returns one document or throws
`NullDocumentError`. `./mcp` also needs its optional peers:
`pnpm add @modelcontextprotocol/sdk zod`.

[![npm version](https://img.shields.io/npm/v/@vllnt/convex-helpers.svg)](https://www.npmjs.com/package/@vllnt/convex-helpers)
[![CI](https://github.com/vllnt/convex-helpers/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-helpers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@vllnt/convex-helpers.svg)](./LICENSE)

## API

Every public export. Each name links to its section of the
[API reference](./docs/API.md).

| Export                                                           | Entry           | Summary                                                                              |
| ---------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| [`asyncMap`](./docs/API.md#asyncmapt-ulist-fn)                   | `.`             | Maps an array with an async function; results keep input order.                      |
| [`pruneNull`](./docs/API.md#prunenulltlist)                      | `.`             | Removes `null` and `undefined` from an array.                                        |
| [`nullThrows`](./docs/API.md#nullthrowstvalue-message)           | `.`             | Returns the value, or throws `NullDocumentError` when it is `null` or `undefined`.   |
| [`NullDocumentError`](./docs/API.md#nulldocumenterror)           | `.`             | Error class thrown by `nullThrows`.                                                  |
| [`customQuery`](./docs/API.md#builders-shipped)                  | `./builders`    | Wraps a query builder so its functions get extra `ctx` fields and consumed args.     |
| [`customMutation`](./docs/API.md#builders-shipped)               | `./builders`    | Same for mutation builders.                                                          |
| [`customAction`](./docs/API.md#builders-shipped)                 | `./builders`    | Same for action builders.                                                            |
| [`customCtx`](./docs/API.md#builders-shipped)                    | `./builders`    | Customization that adds `ctx` fields and consumes no args.                           |
| [`Customization`](./docs/API.md#builders-shipped)                | `./builders`    | Type: `{ args, input }` passed to a custom builder.                                  |
| [`CustomInput`](./docs/API.md#builders-shipped)                  | `./builders`    | Type: what `input` returns (`ctx`, `args`, optional `onSuccess`).                    |
| [`CustomBuilder`](./docs/API.md#builders-shipped)                | `./builders`    | Type: a builder made by `customQuery`, `customMutation` or `customAction`.           |
| [`CustomCtx`](./docs/API.md#builders-shipped)                    | `./builders`    | Type: the `ctx` a custom builder's handlers receive.                                 |
| [`Registration`](./docs/API.md#builders-shipped)                 | `./builders`    | Type: the registered function a custom builder returns.                              |
| [`validate`](./docs/API.md#validators-shipped)                   | `./validators`  | Checks a value against a Convex validator; type guard, or throws with `throw: true`. |
| [`parse`](./docs/API.md#validators-shipped)                      | `./validators`  | Validates and returns a copy without undeclared object fields.                       |
| [`doc`](./docs/API.md#validators-shipped)                        | `./validators`  | Validator for a whole table document: table fields plus `_id` and `_creationTime`.   |
| [`ValidationError`](./docs/API.md#validators-shipped)            | `./validators`  | Error with `expected`, `got` and optional `path`.                                    |
| [`AnyValidator`](./docs/API.md#validators-shipped)               | `./validators`  | Type: any Convex validator.                                                          |
| [`ValidateOptions`](./docs/API.md#validators-shipped)            | `./validators`  | Type: `{ throw?, allowUnknownFields? }`.                                             |
| [`SystemFields`](./docs/API.md#validators-shipped)               | `./validators`  | Type: the `_id` and `_creationTime` validators of a table.                           |
| [`AddFieldsToValidator`](./docs/API.md#validators-shipped)       | `./validators`  | Type: the validator `doc` returns.                                                   |
| [`requireIdentity`](./docs/API.md#identity-shipped)              | `./identity`    | Returns the signed-in identity from the trusted issuer, or throws `UNAUTHENTICATED`. |
| [`getFromAuth`](./docs/API.md#identity-shipped)                  | `./identity`    | Looks up the host row for the identity; `null` when signed out or missing.           |
| [`requireFromAuth`](./docs/API.md#identity-shipped)              | `./identity`    | Like `getFromAuth`, but throws `USER_NOT_INITIALIZED` instead of returning `null`.   |
| [`getOrCreateFromAuth`](./docs/API.md#identity-shipped)          | `./identity`    | Looks up the host row for the identity, or inserts it.                               |
| [`retargetRows`](./docs/API.md#identity-shipped)                 | `./identity`    | Runs a callback on at most 1000 rows in sequence and counts the outcomes.            |
| [`isAnonymousIdentity`](./docs/API.md#identity-shipped)          | `./identity`    | `true` only for a literal `isAnonymous: true` claim.                                 |
| [`AuthCtx`](./docs/API.md#identity-shipped)                      | `./identity`    | Type: `{ auth, trustedIssuer }`, the context these helpers take.                     |
| [`AuthIdentity`](./docs/API.md#identity-shipped)                 | `./identity`    | Type: the identity fields these helpers read.                                        |
| [`parseTrustedOrigin`](./docs/API.md#better-auth-shipped)        | `./better-auth` | Parses one origin; `undefined` when it is not a safe origin.                         |
| [`trustedOriginsFromList`](./docs/API.md#better-auth-shipped)    | `./better-auth` | Site origin plus valid extra origins; `undefined` when no extra survives.            |
| [`trustedOriginsFromCsv`](./docs/API.md#better-auth-shipped)     | `./better-auth` | Same, with the extra origins as one comma-separated string.                          |
| [`cookieSettingsForSite`](./docs/API.md#better-auth-shipped)     | `./better-auth` | Secure cross-site cookie options for an HTTPS site; otherwise `undefined`.           |
| [`CookieSettings`](./docs/API.md#better-auth-shipped)            | `./better-auth` | Type: what `cookieSettingsForSite` returns.                                          |
| [`createMCPServer`](./docs/API.md#createmcpserverconfig)         | `./mcp`         | Builds the MCP server; `handler()` returns Web `GET` and `POST` handlers.            |
| [`query`](./docs/API.md#query--mutation--action)                 | `./mcp`         | Exposes a Convex query as an MCP tool.                                               |
| [`mutation`](./docs/API.md#query--mutation--action)              | `./mcp`         | Exposes a Convex mutation as an MCP tool.                                            |
| [`action`](./docs/API.md#query--mutation--action)                | `./mcp`         | Exposes a Convex action as an MCP tool.                                              |
| [`resource`](./docs/API.md#resourceref-options)                  | `./mcp`         | Exposes a Convex query as an MCP resource.                                           |
| [`convertValidator`](./docs/API.md#validator-utilities)          | `./mcp`         | Converts one Convex validator to a zod schema.                                       |
| [`convexArgsToZod`](./docs/API.md#validator-utilities)           | `./mcp`         | Converts a `v.object()` args validator to a zod object schema.                       |
| [`UnsupportedValidatorError`](./docs/API.md#validator-utilities) | `./mcp`         | Error for a validator kind with no zod mapping.                                      |
| [`ServerConfig`](./docs/API.md#createmcpserverconfig)            | `./mcp`         | Type: options of `createMCPServer`.                                                  |
| [`AuthConfig`](./docs/API.md#createmcpserverconfig)              | `./mcp`         | Type: `{ validate, convexToken? }` bearer-key auth.                                  |
| [`ConvexClient`](./docs/API.md#createmcpserverconfig)            | `./mcp`         | Type: the Convex client interface the server calls.                                  |
| [`ConvexMCPServer`](./docs/API.md#exported-types)                | `./mcp`         | Type: what `createMCPServer` returns.                                                |
| [`ToolDef`](./docs/API.md#query--mutation--action)               | `./mcp`         | Type: a tool built by `query`, `mutation` or `action`.                               |
| [`ResourceDef`](./docs/API.md#resourceref-options)               | `./mcp`         | Type: a resource built by `resource`.                                                |
| [`ConvexValidator`](./docs/API.md#exported-types)                | `./mcp`         | Type: the validator shape the schema conversion reads.                               |
| [`FunctionType`](./docs/API.md#exported-types)                   | `./mcp`         | Type: `"query" \| "mutation" \| "action"`.                                           |
| [`CallContext`](./docs/API.md#exported-types)                    | `./mcp`         | Type: what a lifecycle hook receives for one tool call.                              |
| [`LifecycleHooks`](./docs/API.md#exported-types)                 | `./mcp`         | Type: `{ onToolCall? }`.                                                             |
| [`OnCallResult`](./docs/API.md#exported-types)                   | `./mcp`         | Type: what a hook may return (`abort`, `errorMessage`, `extendArgs`, `message`).     |
| [`PaginationConfig`](./docs/API.md#tool-list-pagination)         | `./mcp`         | Type: `{ pageSize, twoPhaseDiscovery? }`.                                            |
| [`ToolPage`](./docs/API.md#tool-list-pagination)                 | `./mcp`         | Type: one page of tools with an optional `nextCursor`.                               |
| [`ToolSummary`](./docs/API.md#tool-list-pagination)              | `./mcp`         | Type: name and description of one tool.                                              |

## Common tasks

### Add the signed-in user to every query

Needs a `users` table with a `by_subject` index on `subject`. `trustedIssuer` is
the issuer your auth provider writes into tokens; it comes from host
configuration, never from request args.

```ts
import { customCtx, customQuery } from "@vllnt/convex-helpers/builders";
import { requireFromAuth } from "@vllnt/convex-helpers/identity";

import { query } from "./_generated/server";

const trustedIssuer = process.env.CONVEX_SITE_URL ?? "";

export const userQuery = customQuery(
  query,
  customCtx(async (ctx) => ({
    user: await requireFromAuth({ auth: ctx.auth, trustedIssuer }, (subject) =>
      ctx.db
        .query("users")
        .withIndex("by_subject", (q) => q.eq("subject", subject))
        .unique(),
    ),
  })),
);

export const me = userQuery({
  args: {},
  handler: async (ctx) => ({
    id: ctx.user._id,
    anonymous: ctx.user.isAnonymous,
  }),
});
```

### Create the user row on first sign-in

Run lookup and insert in the same mutation so two calls cannot create two rows.

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

### Validate untrusted JSON

```ts
import { parse, ValidationError } from "@vllnt/convex-helpers/validators";
import { v } from "convex/values";

const payload = v.object({ name: v.string(), tags: v.array(v.string()) });

export function readPayload(raw: string): { name: string; tags: string[] } {
  try {
    return parse(payload, JSON.parse(raw));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new Error(
        `Bad payload at ${error.path ?? "root"}: ${error.message}`,
      );
    }
    throw error;
  }
}
```

`parse` drops fields the validator does not declare. `validate(payload, value)`
returns a boolean instead.

### Configure Better Auth origins and cookies

Spread the result into the options you pass to `betterAuth({ ... })`.

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

### Serve Convex functions as MCP tools

A Next.js App Router route (`app/api/mcp/route.ts`) that calls the deployment at
`CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL`.

```ts
import { createMCPServer, mutation, query } from "@vllnt/convex-helpers/mcp";
import { v } from "convex/values";

import { api } from "@/convex/_generated/api";

const server = createMCPServer({
  auth: { validate: async (key) => key === process.env.MCP_API_KEY },
  tools: {
    create_project: mutation(api.projects.create, {
      args: v.object({ name: v.string() }),
      description: "Create a project",
    }),
    list_projects: query(api.projects.list, {
      args: v.object({}),
      description: "List all projects",
    }),
  },
});

export const { GET, POST } = server.handler();
```

Clients send `Authorization: Bearer <key>`. To give each key its own Convex
identity, set `auth.convexToken`. Tool calls can be checked or changed in
`hooks.onToolCall` (see [`./mcp`](./docs/API.md#mcp-tools-mcp)).

## Errors and fixes

Every error text the package throws or returns. `<x>` marks a value filled in at
run time.

| Error (code or message)                                                                                                                                  | Where                                    | Cause                                                                                                                 | Fix                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `NullDocumentError`: `Expected a non-null document`                                                                                                      | `nullThrows`                             | The value is `null` or `undefined` and no message was passed.                                                         | Check the id, or catch `NullDocumentError`. Pass a message to say what was missing.                                       |
| `Cannot intersect validators with different kinds: <a> and <b>`                                                                                          | `./builders`, at definition              | A consumed arg and a function arg have the same name but different validator kinds.                                   | Rename one of the args, or give both the same validator.                                                                  |
| `Cannot add arguments to a validator that is not an object or union.`                                                                                    | `./builders`, at definition              | The function's `args` is a validator that is neither an object nor a union.                                           | Use an object of validators or `v.object(...)` for `args`.                                                                |
| `If you're using a custom function with arguments for the input customization, you must declare the arguments for the function too.`                     | `./builders`, at definition              | The customization consumes args and the function declares no `args`.                                                  | Add `args` to the function definition, even `args: {}`.                                                                   |
| `ValidationError`: `` Validator error for <path>: Expected `<kind>`, got `<type>` ``                                                                     | `validate` with `throw: true`, `parse`   | The value does not match the validator. `for <path>` is left out at the top level.                                    | Fix the value or the validator; read `error.expected`, `error.got` and `error.path`.                                      |
| `ValidationError`: `` Validator error for <path>: Expected `nothing`, got `<type>` `` | `validate` with `throw: true` | The object has a field the validator does not declare. | Pass `allowUnknownFields: true`, use `parse` to drop the field, or declare it. |
| `validate: the db option is not supported`                                                                                                               | `validate`                               | The `db` option of `convex-helpers` was passed.                                                                       | Remove `db`; check an id's table with `ctx.db.normalizeId(table, id)`.                                                    |
| `No matching member in union`                                                                                                                            | `parse`                                  | Internal check; `parse` validates the union first, so it is not expected.                                             | Report it as a bug with the validator and value.                                                                          |
| `Only object and union validators are supported for documents`                                                                                           | `doc`                                    | The table's validator is neither an object nor a union.                                                               | Define the table with `v.object(...)` or `v.union(...)` of objects.                                                       |
| `UNAUTHENTICATED`: `Trusted issuer is not configured.`                                                                                                   | `./identity`                             | `trustedIssuer` is missing or empty.                                                                                  | Pass a non-empty `trustedIssuer` from host configuration.                                                                 |
| `UNAUTHENTICATED`: `Untrusted issuer.`                                                                                                                   | `./identity`                             | The token's issuer differs from `trustedIssuer`.                                                                      | Set `trustedIssuer` to the issuer your auth provider writes into tokens.                                                  |
| `UNAUTHENTICATED`: `Sign-in required.`                                                                                                                   | `requireIdentity`, `getOrCreateFromAuth` | No signed-in identity.                                                                                                | Sign in first; on the client, wait until Convex auth is ready.                                                            |
| `USER_NOT_INITIALIZED`: `User not initialized — the auth session may still be settling.`                                                                 | `requireFromAuth`                        | Signed out, or the host row does not exist yet.                                                                       | Create the row with `getOrCreateFromAuth` in a mutation, then retry.                                                      |
| `RangeError`: `retargetRows accepts at most 1000 rows per page`                                                                                          | `retargetRows`                           | More than 1000 rows were passed.                                                                                      | Read rows in pages of at most 1000 and call once per page.                                                                |
| `Auth is required. Provide auth.validate to createMCPServer(). This package enforces default-deny — no open MCP endpoints.`                              | `createMCPServer`                        | `auth.validate` is missing.                                                                                           | Pass `auth: { validate }`.                                                                                                |
| `Cannot use both 'client' and 'auth.convexToken'. When providing a custom client, handle auth token propagation in your client implementation directly.` | `createMCPServer`                        | Both `client` and `auth.convexToken` were set.                                                                        | Set one of them; with `client`, set the auth token on that client.                                                        |
| `Convex URL not found. Set CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable, or pass convexUrl or client to createMCPServer().`                 | `createMCPServer`                        | No `convexUrl`, no `client` and neither environment variable is set.                                                  | Set `CONVEX_URL`, or pass `convexUrl` or `client`.                                                                        |
| `Convex URL not found after configuration validation.`                                                                                                   | `./mcp`, per request                     | Internal check after the one above; not expected.                                                                     | Report it as a bug.                                                                                                       |
| `Tool "<name>" cannot set a timeout on <type>: Convex execution cannot be cancelled safely`                                                              | `createMCPServer`                        | A `mutation` or `action` tool has `timeout`.                                                                          | Remove `timeout`; only `query` tools take one.                                                                            |
| `Tool "<name>" timeout must be a finite number of milliseconds between 0 and <max>`                                                                      | `createMCPServer`                        | `timeout` is negative, `NaN`, infinite or above 2147483647.                                                           | Use a whole number of milliseconds in range; `0` means no timeout.                                                        |
| `pagination.pageSize must be a positive integer >= 1`                                                                                                    | `createMCPServer`                        | `pagination.pageSize` is not an integer of at least 1.                                                                | Set `pageSize` to an integer of 1 or more.                                                                                |
| `UnsupportedValidatorError`: `Unsupported Convex validator kind: "<kind>". This may be from a newer version of Convex.`                                  | `createMCPServer`, `convertValidator`    | A tool or resource `args` uses a validator with no zod mapping. `<kind>` is one of the rows below or an unknown kind. | Change the args validator to supported kinds.                                                                             |
| `literal (unsupported value type)`                                                                                                                       | `<kind>` above                           | `v.literal` of a value that is not a string, number, bigint or boolean.                                               | Use a supported literal type.                                                                                             |
| `array (missing element)`, `union (missing members)`, `union (missing member)`, `record (missing key or value)`, `record (invalid value validator)`      | `<kind>` above                           | A malformed validator object, not built with `v.*`.                                                                   | Build validators with `v.*` from `convex/values`.                                                                         |
| `record key must be string or id, got "<kind>"`                                                                                                          | `<kind>` above                           | `v.record` keys that are not `v.string()` or `v.id(...)`.                                                             | Use `v.string()` or `v.id(...)` keys.                                                                                     |
| `Convex function args must be a v.object() validator`                                                                                                    | `convexArgsToZod`, `createMCPServer`     | A tool's `args` is not `v.object(...)`.                                                                               | Wrap the args in `v.object({ ... })`.                                                                                     |
| `Expected at least 2 elements`                                                                                                                           | `convertValidator`                       | Internal check; not expected.                                                                                         | Report it as a bug with the validator.                                                                                    |
| `[convex-mcp] tools/list handler not found — SDK API may have changed.`                                                                                  | `./mcp` with `pagination`, per request   | The installed `@modelcontextprotocol/sdk` changed its internals.                                                      | Install a version in the peer range `^1.29.0`; report it if that version fails.                                           |
| HTTP 401 `{ error: "Missing or malformed API key. Use Authorization: Bearer <key>." }`                                                                   | MCP endpoint                             | No `Authorization` header, or not the exact `Bearer ` prefix.                                                         | Send `Authorization: Bearer <key>` (case-sensitive scheme).                                                               |
| HTTP 401 `{ error: "Invalid API key." }`                                                                                                                 | MCP endpoint                             | `auth.validate` returned `false`.                                                                                     | Use a key that `auth.validate` accepts.                                                                                   |
| HTTP 401 `{ error: "Authentication failed." }`                                                                                                           | MCP endpoint                             | `auth.validate` or `auth.convexToken` threw or took over 10 seconds.                                                  | Fix the callback; make it return within 10 seconds.                                                                       |
| `Policy callback timed out`                                                                                                                              | MCP auth and hooks                       | A callback took over 10 seconds. Not sent to clients: they get the 401 above or `Tool call rejected`.                 | Make the callback return within 10 seconds.                                                                               |
| HTTP 415, JSON-RPC `-32700` `Unsupported Media Type: expected application/json`                                                                          | MCP endpoint, `POST`                     | The `Content-Type` is not `application/json`.                                                                         | Send `Content-Type: application/json`.                                                                                    |
| `Reserved arg keys not allowed in request: <keys>. Keys starting with "_" are reserved for framework-injected context.`                                  | tool result (`isError`)                  | The caller sent args whose names start with `_`.                                                                      | Rename the args; only `extendArgs` in a hook may add `_` keys.                                                            |
| `Tool call rejected`                                                                                                                                     | tool result (`isError`)                  | A `before` hook returned `abort` without `errorMessage`, threw, or timed out.                                         | Check the hook's rules; return `errorMessage` to send a specific text.                                                    |
| `Function execution failed`                                                                                                                              | tool result (`isError`)                  | The Convex function threw, or a query passed its `timeout`. The real error goes to hooks only.                        | Read `ctx.error` in the `error` phase of `onToolCall` or in the tool's `onError`; return `message` to send a public text. |
| `Tool execution timed out`                                                                                                                               | `ctx.error` in hooks                     | A `query` tool passed its `timeout`. Clients get `Function execution failed`.                                         | Raise `timeout`, or make the query faster.                                                                                |
| `Unknown function type: <type>`                                                                                                                          | `ctx.error` in hooks                     | A `ToolDef` was built by hand with a wrong `type`.                                                                    | Build tools with `query`, `mutation` or `action`.                                                                         |
| `Resource read failed`                                                                                                                                   | resource read                            | The read threw: bad or `_`-prefixed URI parameters, or a Convex error.                                                | Check the URI parameters against the resource's `args` and the backing query.                                             |
| `Reserved resource parameter`                                                                                                                            | resource read                            | A URI parameter starts with `_`. Clients get `Resource read failed`.                                                  | Rename the parameter.                                                                                                     |
| JSON-RPC `-32602` `invalid or expired cursor`                                                                                                            | `tools/list` with `pagination`           | The cursor was changed, or comes from another server instance or before a restart.                                    | List again without a cursor.                                                                                              |
| JSON-RPC `-32602` `Invalid params: 'name' is required`                                                                                                   | `tools/describe`                         | No `name` param.                                                                                                      | Send the tool name.                                                                                                       |
| JSON-RPC `-32602` `Invalid params: tool '<name>' not found`                                                                                              | `tools/describe`                         | No tool has that name.                                                                                                | Use a name from `tools/list_summary`.                                                                                     |

## Limits and gotchas

- This is not a Convex component: no tables, no `app.use()`. It runs with the
  host's `ctx`.
- `./identity` needs a single trusted issuer (`subject` is only unique per
  issuer). A host that accepts several issuers keys rows on `tokenIdentifier` in
  its own code.
- `getOrCreateFromAuth` creates one row only when lookup and insert run in the
  same mutation with an indexed lookup that every writer uses. Actions and
  remote callbacks give no such guarantee.
- `retargetRows` takes at most 1000 rows, runs callbacks one at a time, stops at
  the first failure and counts the outcome each callback returns. It is not an
  account merge: the host authorizes both identities and resolves conflicts.
- `isAnonymous` is `true` only for a literal `true` claim; `false` does not
  prove a verified account.
- `./better-auth` checks origin syntax, not who owns a deployment. A
  `previewPattern` wildcard can match across `.` in Better Auth 1.7.12, so use a
  fixed suffix only you can register. When no extra origin survives the list
  helpers return `undefined` and Better Auth keeps its defaults. SameSite=None
  cookies are not CSRF protection.
- `./validators` refuses the `db` option (`v.id` checks for a string), matches
  object fields as own properties only, and rejects arrays and class instances
  for `v.record`.
- `./builders` adds no authorization: the `input` you write decides who may
  call.
- `./mcp`: resources run no `onToolCall` hooks, so any valid key reads every
  resource; authorize inside the backing query. No body, stream or deadline
  caps: set them at the platform or proxy. `timeout` applies to queries only. No
  `Origin` check. Cursors are signed per server instance. Auth and hook
  callbacks stop being awaited after 10 seconds but are not cancelled. Never
  forward `CallContext.apiKey` in args. The library logs nothing.
- `tools/list` without a cursor returns every tool, even with `pagination` set.
- Modules marked planned in the
  [roadmap](https://github.com/vllnt/convex-helpers/blob/main/ROADMAP.md) are
  not exported.

## Compatibility

- `convex` `^1.45.0` (peer). The tests pass at 1.45.0 and 1.51.0.
- `./mcp` only: `@modelcontextprotocol/sdk` `^1.29.0` and `zod` `^4.3.6`
  (optional peers). Other entries import neither.
- ESM only, no CommonJS build. Node.js 18 or later. Type declarations ship in
  `dist/`.
- `./mcp` uses Web `Request`/`Response` and Web Crypto (`crypto.randomUUID`,
  `crypto.subtle`).
- `./builders` and `./validators` follow `convex-helpers` 0.1.136.
- `./better-auth`, `./identity`, `./builders` and `./validators` first ship in
  0.2.0; 0.1.0 has the root utilities and `./mcp` only.
- Moving from the deprecated
  [`@vllnt/convex-mcp`](https://www.npmjs.com/package/@vllnt/convex-mcp): import
  from `@vllnt/convex-helpers/mcp` and install `@modelcontextprotocol/sdk` and
  `zod` yourself (regular dependencies there, optional peers here). The legacy
  package also ships CommonJS; this one is ESM only.
- On GitHub this README describes `main`; the copy in each npm version describes
  that version. Builds of `main` go to the `canary` dist-tag, which moves: pin
  the exact version.

## Testing

```bash
pnpm test
pnpm test:coverage
```

Tests use [vitest](https://vitest.dev) with the node environment. 100% coverage
is enforced via the repository's vitest coverage thresholds. Identity
integration tests use **convex-test mocks**. Two local scripts in the repository
(not in the npm package) run against a real anonymous Convex backend (no cloud
account):
[`scripts/local-identity-proof.mjs`](https://github.com/vllnt/convex-helpers/blob/main/scripts/local-identity-proof.mjs)
(16 concurrent bootstrap mutations with a synthetic identity, one row; tests
indexed OCC, not login) and
[`scripts/better-auth-proof.mjs`](https://github.com/vllnt/convex-helpers/blob/main/scripts/better-auth-proof.mjs)
(real Better Auth sign-in, anonymous and email/password, then the issued JWTs
sent to Convex functions that use `./identity` and `./better-auth`; see
[docs/READINESS.md](https://github.com/vllnt/convex-helpers/blob/main/docs/READINESS.md#real-better-auth-loginjwt-proof)
for versions and assertions). Consuming apps must verify their own auth
integration independently.

## Security

- [Security policy and private reporting](https://github.com/vllnt/convex-helpers/blob/main/SECURITY.md)
- [Issues](https://github.com/vllnt/convex-helpers/issues) for non-sensitive
  bugs

## Related packages

- [`convex-helpers`](https://www.npmjs.com/package/convex-helpers) — the
  official helpers. `./builders` and `./validators` follow its signatures, and
  a parity test runs both packages on the same convex-test backend.
- [`@convex-dev/better-auth`](https://www.npmjs.com/package/@convex-dev/better-auth)
  — the Better Auth component. `./better-auth` builds the origin and cookie
  options passed to it; the repository's Better Auth proof script runs both.
- [`@vllnt/eslint-config`](https://oss.vllnt.com/packages/eslint-config) — the
  lint rules this repository's code is checked with (development only).
- [`@vllnt/typescript`](https://oss.vllnt.com/packages/typescript) — the
  TypeScript compiler settings this package is built with (development only).

## Contributing

See
[CONTRIBUTING.md](https://github.com/vllnt/convex-helpers/blob/main/CONTRIBUTING.md)
for development setup, code style, and PR guidelines.

## Links

- Docs and changelog: [oss.vllnt.com/packages/convex-helpers](https://oss.vllnt.com/packages/convex-helpers) · [release feed](https://oss.vllnt.com/packages/convex-helpers/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/convex-helpers) · [issues](https://github.com/vllnt/convex-helpers/issues) · [npm](https://www.npmjs.com/package/@vllnt/convex-helpers)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)

## License

[MIT](./LICENSE)

---

Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/convex-helpers) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)
