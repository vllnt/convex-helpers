import { v } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { createMCPServer } from "../src/mcp/server.js";
import { action, mutation, query } from "../src/mcp/tools/helpers.js";
import type { ConvexClient } from "../src/mcp/types.js";
import { api } from "./convex/_generated/api.js";
import schema from "./convex/schema.js";

const modules = import.meta.glob("./convex/**/*.ts");

function createConvexTestClient(t: any): ConvexClient {
  return {
    query: (ref: any, args?: any) => t.query(ref, args ?? {}),
    mutation: (ref: any, args?: any) => t.mutation(ref, args ?? {}),
    action: (ref: any, args?: any) => t.action(ref, args ?? {}),
  };
}

function mcpRequest(method: string, params: Record<string, unknown> = {}, id: number = 1) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": "Bearer test-key",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

async function parseSSEResponse(response: Response): Promise<any> {
  const text = await response.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`No data line in SSE response: ${text}`);
  return JSON.parse(dataLine.slice(6));
}

describe("E2E: convex-mcp with convex-test", () => {
  it("lists tools with correct JSON Schema from real Convex validators", async () => {
    const t = convexTest(schema, modules);

    const server = createMCPServer({
      auth: { validate: async () => true },
      client: createConvexTestClient(t),
      tools: {
        list_tasks: query(api.tasks.list, {
          args: v.object({ status: v.optional(v.union(v.literal("todo"), v.literal("done"))) }),
          description: "List tasks",
        }),
        create_task: mutation(api.tasks.create, {
          args: v.object({
            title: v.string(),
            status: v.union(v.literal("todo"), v.literal("done")),
            assignee: v.optional(v.string()),
          }),
          description: "Create a task",
        }),
      },
    });

    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/list"));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    const tools = data.result.tools;
    expect(tools).toHaveLength(2);

    const createTool = tools.find((t: any) => t.name === "create_task");
    expect(createTool.description).toBe("Create a task");
    expect(createTool.inputSchema.properties.title).toEqual({ type: "string" });
    expect(createTool.inputSchema.properties.status).toHaveProperty("enum");
    expect(createTool.inputSchema.properties.status.enum).toEqual(["todo", "done"]);
  });

  it("creates a task via mutation and reads it back via query", async () => {
    const t = convexTest(schema, modules);

    const server = createMCPServer({
      auth: { validate: async () => true },
      client: createConvexTestClient(t),
      tools: {
        create_task: mutation(api.tasks.create, {
          args: v.object({
            title: v.string(),
            status: v.union(v.literal("todo"), v.literal("done")),
          }),
          description: "Create a task",
        }),
        list_tasks: query(api.tasks.list, {
          args: v.object({}),
          description: "List tasks",
        }),
      },
    });

    const handler = server.handler();

    const createResponse = await handler.POST(mcpRequest("tools/call", {
      name: "create_task",
      arguments: { title: "Write tests", status: "todo" },
    }));
    expect(createResponse.status).toBe(200);
    const createData = await parseSSEResponse(createResponse);
    expect(createData.result.isError).toBeUndefined();
    const taskId = JSON.parse(createData.result.content[0].text);
    expect(taskId).toBeTruthy();

    const listResponse = await handler.POST(mcpRequest("tools/call", {
      name: "list_tasks",
      arguments: {},
    }, 2));
    expect(listResponse.status).toBe(200);
    const listData = await parseSSEResponse(listResponse);
    const tasks = JSON.parse(listData.result.content[0].text);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Write tests");
    expect(tasks[0].status).toBe("todo");
  });

  it("mutation modifies real DB state", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", { title: "Existing task", status: "todo" });
    });

    const server = createMCPServer({
      auth: { validate: async () => true },
      client: createConvexTestClient(t),
      tools: {
        list_tasks: query(api.tasks.list, {
          args: v.object({ status: v.optional(v.union(v.literal("todo"), v.literal("done"))) }),
          description: "List tasks",
        }),
        mark_done: mutation(api.tasks.markDone, {
          args: v.object({ id: v.id("tasks") }),
          description: "Mark task as done",
        }),
      },
    });

    const handler = server.handler();

    const listResponse = await handler.POST(mcpRequest("tools/call", {
      name: "list_tasks",
      arguments: {},
    }));
    const tasks = JSON.parse((await parseSSEResponse(listResponse)).result.content[0].text);
    expect(tasks).toHaveLength(1);
    const taskId = tasks[0]._id;

    const markResponse = await handler.POST(mcpRequest("tools/call", {
      name: "mark_done",
      arguments: { id: taskId },
    }, 2));
    expect(markResponse.status).toBe(200);
    const updated = JSON.parse((await parseSSEResponse(markResponse)).result.content[0].text);
    expect(updated.status).toBe("done");

    const verifyResponse = await handler.POST(mcpRequest("tools/call", {
      name: "list_tasks",
      arguments: { status: "done" },
    }, 3));
    const doneTasks = JSON.parse((await parseSSEResponse(verifyResponse)).result.content[0].text);
    expect(doneTasks).toHaveLength(1);
    expect(doneTasks[0].title).toBe("Existing task");
  });

  it("action calls real Convex functions internally", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", { title: "Task 1", status: "todo" });
      await ctx.db.insert("tasks", { title: "Task 2", status: "todo" });
      await ctx.db.insert("tasks", { title: "Task 3", status: "done" });
    });

    const server = createMCPServer({
      auth: { validate: async () => true },
      client: createConvexTestClient(t),
      tools: {
        count_by_status: action(api.tasks.countByStatus, {
          args: v.object({ status: v.union(v.literal("todo"), v.literal("done")) }),
          description: "Count tasks by status",
        }),
      },
    });

    const handler = server.handler();

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "count_by_status",
      arguments: { status: "todo" },
    }));
    expect(response.status).toBe(200);
    const data = await parseSSEResponse(response);
    const result = JSON.parse(data.result.content[0].text);
    expect(result.status).toBe("todo");
    expect(result.count).toBe(2);
  });

  it("returns error for invalid arguments (Zod validates before Convex)", async () => {
    const t = convexTest(schema, modules);

    const server = createMCPServer({
      auth: { validate: async () => true },
      client: createConvexTestClient(t),
      tools: {
        create_task: mutation(api.tasks.create, {
          args: v.object({
            title: v.string(),
            status: v.union(v.literal("todo"), v.literal("done")),
          }),
          description: "Create a task",
        }),
      },
    });

    const handler = server.handler();

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "create_task",
      arguments: { title: 123, status: "invalid" },
    }));
    expect(response.status).toBe(200);
    const data = await parseSSEResponse(response);
    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toContain("validation");
  });

  it("full CRUD lifecycle through MCP", async () => {
    const t = convexTest(schema, modules);

    const server = createMCPServer({
      auth: { validate: async () => true },
      client: createConvexTestClient(t),
      tools: {
        create: mutation(api.tasks.create, {
          args: v.object({ title: v.string(), status: v.union(v.literal("todo"), v.literal("done")) }),
          description: "Create",
        }),
        list: query(api.tasks.list, {
          args: v.object({}),
          description: "List",
        }),
        mark_done: mutation(api.tasks.markDone, {
          args: v.object({ id: v.id("tasks") }),
          description: "Mark done",
        }),
        delete: mutation(api.tasks.deleteTask, {
          args: v.object({ id: v.id("tasks") }),
          description: "Delete",
        }),
      },
    });

    const handler = server.handler();
    let reqId = 0;
    const call = async (name: string, args: Record<string, unknown>) => {
      reqId++;
      const res = await handler.POST(mcpRequest("tools/call", { name, arguments: args }, reqId));
      return JSON.parse((await parseSSEResponse(res)).result.content[0].text);
    };

    const id = await call("create", { title: "CRUD test", status: "todo" });
    expect(id).toBeTruthy();

    let tasks = await call("list", {});
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("CRUD test");

    const updated = await call("mark_done", { id });
    expect(updated.status).toBe("done");

    const deleted = await call("delete", { id });
    expect(deleted.deleted).toBe(true);

    tasks = await call("list", {});
    expect(tasks).toHaveLength(0);
  });
});
