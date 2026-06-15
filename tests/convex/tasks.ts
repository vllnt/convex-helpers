import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

export const list = query({
  args: { status: v.optional(v.union(v.literal("todo"), v.literal("done"))) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .filter((q) => q.eq(q.field("status"), args.status))
        .collect();
    }
    return await ctx.db.query("tasks").collect();
  },
});

export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    status: v.union(v.literal("todo"), v.literal("done")),
    assignee: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", args);
  },
});

export const markDone = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "done" as const });
    return await ctx.db.get(args.id);
  },
});

export const deleteTask = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});

export const countByStatus = action({
  args: { status: v.union(v.literal("todo"), v.literal("done")) },
  handler: async (ctx, args) => {
    const { api } = await import("./_generated/api");
    const tasks = await ctx.runQuery(api.tasks.list, { status: args.status });
    return { status: args.status, count: tasks.length };
  },
});
