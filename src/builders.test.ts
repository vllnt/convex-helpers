import {
  internalMutationGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import * as theirs from "convex-helpers/server/customFunctions";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as ours from "./builders.js";

type Captured = {
  args?: { json: unknown };
  handler: (ctx: object, arguments_: object) => Promise<unknown>;
  returns?: unknown;
};

/** A stand-in Convex builder that hands back the definition it receives. */
const capture = ((definition: Captured) =>
  definition) as unknown as typeof queryGeneric;

function outcome(run: () => unknown): unknown {
  try {
    const result = run() as Captured;
    return { args: result.args?.json, returns: result.returns };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

const implementations = { ours, theirs: theirs as unknown as typeof ours };

describe("builders argument merging (parity with convex-helpers 0.1.136)", () => {
  const cases: [string, (impl: typeof ours) => unknown][] = [
    [
      "different kinds",
      (impl) =>
        impl.customQuery(capture, {
          args: { a: v.number() },
          input: () => ({ args: {}, ctx: {} }),
        })({ args: { a: v.string() }, handler: () => null }),
    ],
    [
      "function args are a union",
      (impl) =>
        impl.customQuery(capture, {
          args: { tag: v.string() },
          input: () => ({ args: {}, ctx: {} }),
        })({
          args: v.union(
            v.object({ a: v.string() }),
            v.object({ b: v.number() }),
          ),
          handler: () => null,
        }),
    ],
    [
      "function args are not an object",
      (impl) =>
        impl.customQuery(capture, {
          args: { tag: v.string() },
          input: () => ({ args: {}, ctx: {} }),
        })({ args: v.string() as never, handler: () => null }),
    ],
    [
      "input args without function args",
      (impl) =>
        impl.customQuery(capture, {
          args: { tag: v.string() },
          input: () => ({ args: {}, ctx: {} }),
        })({ handler: () => null }),
    ],
    [
      "optional and required intersect",
      (impl) =>
        impl.customQuery(capture, {
          args: { a: v.string(), b: v.optional(v.string()) },
          input: () => ({ args: {}, ctx: {} }),
        })({
          args: { a: v.optional(v.string()), b: v.string() },
          handler: () => null,
          returns: v.null(),
        }),
    ],
    [
      "property validators without input args",
      (impl) =>
        impl.customQuery(
          capture,
          impl.customCtx(() => ({})),
        )({
          args: { a: v.string() },
          handler: () => null,
        }),
    ],
    [
      "both optional keep the function's validator",
      (impl) =>
        impl.customQuery(capture, {
          args: { a: v.optional(v.literal("input")) },
          input: () => ({ args: {}, ctx: {} }),
        })({ args: { a: v.optional(v.literal("fn")) }, handler: () => null }),
    ],
  ];

  it.each(cases)("%s", (_name, build) => {
    const results = Object.fromEntries(
      Object.entries(implementations).map(([key, impl]) => [
        key,
        outcome(() => build(impl)),
      ]),
    );
    expect(results.ours).toStrictEqual(results.theirs);
  });

  it("passes all args to input when the customization takes none", async () => {
    const seen: unknown[] = [];
    const definition = ours.customQuery(capture, {
      args: {},
      input: (_ctx, arguments_) => {
        seen.push(arguments_);
        return { args: { added: 1 }, ctx: { extra: true } };
      },
    })((ctx: object, arguments_: object) => ({
      args: arguments_,
      ctx,
    })) as unknown as Captured;
    const result = await definition.handler({ base: 1 }, { a: 1 });
    expect(seen).toStrictEqual([{ a: 1 }]);
    expect(result).toStrictEqual({
      args: { a: 1, added: 1 },
      ctx: { base: 1, extra: true },
    });
  });
});

describe("builders types (parity with convex-helpers 0.1.136)", () => {
  const user = { id: "u" };

  it("{ args: {}, input } adds ctx fields", () => {
    const oursQuery = ours.customQuery(queryGeneric, {
      args: {},
      input: async () => ({ args: {}, ctx: { user } }),
    });
    const theirsQuery = theirs.customQuery(queryGeneric, {
      args: {},
      input: async () => ({ args: {}, ctx: { user } }),
    });
    expectTypeOf(
      oursQuery({
        args: { a: v.string() },
        handler: (ctx, { a }) => `${ctx.user.id}${a}`,
        returns: v.string(),
      }),
    ).toEqualTypeOf(
      theirsQuery({
        args: { a: v.string() },
        handler: (ctx, { a }) => `${ctx.user.id}${a}`,
        returns: v.string(),
      }),
    );
    expectTypeOf(oursQuery((ctx) => ctx.user)).toEqualTypeOf(
      theirsQuery((ctx) => ctx.user),
    );
  });

  it("customCtx(...) adds ctx fields and sees typed extras", () => {
    const oursMutation = ours.customMutation(
      internalMutationGeneric,
      ours.customCtx(async (_ctx, extra: { name?: string }) => ({
        name: extra.name ?? "",
      })),
    );
    const theirsMutation = theirs.customMutation(
      internalMutationGeneric,
      theirs.customCtx(async (_ctx, extra: { name?: string }) => ({
        name: extra.name ?? "",
      })),
    );
    expectTypeOf(
      oursMutation({
        args: { n: v.number() },
        handler: (ctx, { n }) => ctx.name.length + n,
      }),
    ).toEqualTypeOf(
      theirsMutation({
        args: { n: v.number() },
        handler: (ctx, { n }) => ctx.name.length + n,
      }),
    );
  });

  it("consumed args leave the handler and stay in the registered args", () => {
    const oursMutation = ours.customMutation(mutationGeneric, {
      args: { tag: v.string() },
      input: (_ctx, { tag }) => ({ args: { label: tag }, ctx: {} }),
    });
    const theirsMutation = theirs.customMutation(mutationGeneric, {
      args: { tag: v.string() },
      input: (_ctx, { tag }) => ({ args: { label: tag }, ctx: {} }),
    });
    const oursRegistered = oursMutation({
      args: { title: v.string() },
      handler: (_ctx, { label, title }) => `${label}${title}`,
    });
    expectTypeOf(oursRegistered).toEqualTypeOf(
      theirsMutation({
        args: { title: v.string() },
        handler: (_ctx, { label, title }) => `${label}${title}`,
      }),
    );
  });
});
