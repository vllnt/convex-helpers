import { v } from "convex/values";

import type * as builders from "../../../src/builders.js";
import { action, mutation, query } from "../_generated/server.js";

type Builders = typeof builders;

function subjectCases({ customCtx, customQuery }: Builders) {
  const subjectQuery = customQuery(
    query,
    customCtx(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      return { subject: identity?.subject ?? "anonymous" };
    }),
  );
  return {
    bareSubject: subjectQuery((ctx) => ctx.subject),
    subject: subjectQuery({
      args: { prefix: v.string() },
      handler: (ctx, { prefix }) => `${prefix}${ctx.subject}`,
      returns: v.string(),
    }),
  };
}

function taggedCase({ customMutation }: Builders) {
  const taggedMutation = customMutation(mutation, {
    args: { tag: v.string() },
    input: (_ctx, { tag }, extra: { kind?: string }) => ({
      args: { label: `${tag}:${extra.kind ?? "none"}` },
      ctx: { tag },
      onSuccess: async ({ args, ctx, result }) => {
        const keys = Object.keys(args).sort().join(",");
        await ctx.db.insert("tasks", {
          status: "done",
          title: `after:${String(result)}:${keys}`,
        });
      },
    }),
  });
  return taggedMutation({
    args: { title: v.string() },
    handler: (ctx, arguments_) => {
      const keys = Object.keys(arguments_).sort().join(",");
      return `${ctx.tag}|${arguments_.label}|${arguments_.title}|${keys}`;
    },
    kind: "extra",
  });
}

function kindCase({ customCtx, customMutation }: Builders) {
  const kindMutation = customMutation(
    mutation,
    customCtx((_ctx, extra: { kind?: string }) => ({
      kind: extra.kind ?? "none",
    })),
  );
  return kindMutation({
    args: { name: v.optional(v.string()) },
    handler: (ctx, { name }) => ({ kind: ctx.kind, name: name ?? "none" }),
    kind: "artist",
  });
}

function keyedCase({ customAction }: Builders) {
  const keyedAction = customAction(action, {
    args: {},
    input: () => ({ args: {}, ctx: { key: "k" } }),
  });
  return keyedAction({
    args: { n: v.number() },
    handler: (ctx, { n }) => `${ctx.key}${String(n)}`,
  });
}

/**
 * Builds the same functions with one builders implementation, so the parity
 * test can run `@vllnt/convex-helpers/builders` and `convex-helpers` side by side.
 */
export function defineCases(impl: Builders): Record<string, unknown> {
  return {
    ...subjectCases(impl),
    keyed: keyedCase(impl),
    kind: kindCase(impl),
    tagged: taggedCase(impl),
  };
}
