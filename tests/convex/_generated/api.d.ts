import type { FunctionReference } from "convex/server";

export declare const api: {
  tasks: {
    list: FunctionReference<"query", "public", { status?: "todo" | "done" }, any>;
    get: FunctionReference<"query", "public", { id: string }, any>;
    create: FunctionReference<"mutation", "public", { title: string; status: "todo" | "done"; assignee?: string }, any>;
    markDone: FunctionReference<"mutation", "public", { id: string }, any>;
    deleteTask: FunctionReference<"mutation", "public", { id: string }, any>;
    countByStatus: FunctionReference<"action", "public", { status: "todo" | "done" }, any>;
  };
};

export declare const internal: Record<string, never>;
