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
