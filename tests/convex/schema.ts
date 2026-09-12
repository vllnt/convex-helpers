import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    assignee: v.optional(v.string()),
    status: v.union(v.literal("done"), v.literal("todo")),
    title: v.string(),
  }),
  users: defineTable({
    betterAuthId: v.string(),
  }).index("by_betterauth_id", ["betterAuthId"]),
});
