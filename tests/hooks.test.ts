import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMCPServer } from "../src/mcp/server.js";
import { mutation, query } from "../src/mcp/tools/helpers.js";
import type { CallContext } from "../src/mcp/types.js";

const MOCK_CONVEX_URL = "https://test-deployment.convex.cloud";

function makeValidator(kind: string, extra: Record<string, unknown> = {}): any {
  return { kind, isOptional: "required", ...extra };
}

vi.mock("convex/browser", () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ id: "1", name: "Test" }),
    mutation: vi.fn().mockResolvedValue({ id: "2" }),
    action: vi.fn().mockResolvedValue("action-result"),
    setAuth: vi.fn(),
  };
  return {
    ConvexHttpClient: vi.fn(function MockConvexHttpClient() {
      return mockClient;
    }),
    __mockClient: mockClient,
  };
});

async function getMockClient() {
  const mod = await import("convex/browser") as any;
  return mod.__mockClient;
}

beforeEach(async () => {
  const mockClient = await getMockClient();
  mockClient.query.mockReset().mockResolvedValue({ id: "1", name: "Test" });
  mockClient.mutation.mockReset().mockResolvedValue({ id: "2" });
  mockClient.action.mockReset().mockResolvedValue("action-result");
  mockClient.setAuth.mockReset();
});

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

function createHookCollector() {
  const calls: CallContext[] = [];
  const hook = async (ctx: CallContext) => { calls.push({ ...ctx }); };
  return { calls, hook };
}

describe("lifecycle hooks", () => {
  it("onToolCall fires with correct context for before + success phases (AC-1, AC-2)", async () => {
    const { calls, hook } = createHookCollector();
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: { onToolCall: hook },
      tools: {
        list: query(null, { args: makeValidator("object", { fields: {} }), description: "List" }),
      },
    });

    const response = await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} }));
    await response.text();

    const before = calls.find((c) => c.phase === "before");
    expect(before).toBeDefined();
    if (!before) {
      throw new Error("Expected before hook call");
    }
    expect(before.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(before.toolName).toBe("list");
    expect(before.apiKey).toBe("test-key");
    expect(before.startedAt).toBeGreaterThan(0);

    const success = calls.find((c) => c.phase === "success");
    expect(success).toBeDefined();
    if (!success) {
      throw new Error("Expected success hook call");
    }
    expect(success.result).toEqual({ id: "1", name: "Test" });
    expect(success.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("onToolCall abort prevents execution (AC-2)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async (ctx) => {
          if (ctx.phase === "before") return { abort: true, errorMessage: "Rate limit exceeded" };
        },
      },
      tools: {
        list: query(null, { args: makeValidator("object", { fields: {} }), description: "List" }),
      },
    });

    const mockClient = await getMockClient();
    const response = await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} }));
    const data = await parseSSEResponse(response);

    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toBe("Rate limit exceeded");
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("onToolCall abort uses default message when errorMessage not provided", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async (ctx) => {
          if (ctx.phase === "before") return { abort: true };
        },
      },
      tools: {
        list: query(null, { args: makeValidator("object", { fields: {} }), description: "List" }),
      },
    });

    const data = await parseSSEResponse(
      await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} })),
    );
    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toBe("Tool call rejected");
  });

  it("onToolCall error phase with custom message (AC-3)", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockRejectedValueOnce(new Error("DB down"));

    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async (ctx) => {
          if (ctx.phase === "error") return { message: "Service temporarily unavailable" };
        },
      },
      tools: {
        list: query(null, { args: makeValidator("object", { fields: {} }), description: "List" }),
      },
    });

    const data = await parseSSEResponse(
      await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} })),
    );
    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toBe("Service temporarily unavailable");
  });

  it("per-tool onError overrides server hook (AC-4)", async () => {
    const mockClient = await getMockClient();
    mockClient.mutation.mockRejectedValueOnce(new Error("Conflict"));
    const serverHookCalled = vi.fn();

    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async (ctx) => {
          if (ctx.phase === "error") { serverHookCalled(); return { message: "Server-level error" }; }
        },
      },
      tools: {
        create: mutation(null, {
          args: makeValidator("object", { fields: { name: makeValidator("string") } }),
          description: "Create",
          onError: async () => ({ message: "Project creation failed. Try again." }),
        }),
      },
    });

    const data = await parseSSEResponse(
      await server.handler().POST(mcpRequest("tools/call", { name: "create", arguments: { name: "test" } })),
    );
    expect(data.result.content[0].text).toBe("Project creation failed. Try again.");
    expect(serverHookCalled).not.toHaveBeenCalled();
  });

  it("per-tool onError can return undefined and fall back to generic message", async () => {
    const mockClient = await getMockClient();
    mockClient.mutation.mockRejectedValueOnce(new Error("Conflict"));

    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        create: mutation(null, {
          args: makeValidator("object", { fields: { name: makeValidator("string") } }),
          description: "Create",
          onError: async () => undefined,
        }),
      },
    });

    const data = await parseSSEResponse(
      await server.handler().POST(mcpRequest("tools/call", { name: "create", arguments: { name: "test" } })),
    );
    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toBe("Function execution failed");
  });

  it("tags accessible in hook context (AC-5)", async () => {
    const { calls, hook } = createHookCollector();
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: { onToolCall: hook },
      tools: {
        list: query(null, {
          args: makeValidator("object", { fields: {} }),
          description: "List",
          tags: { tier: "premium", feature: "projects" },
        }),
      },
    });

    const response = await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} }));
    await response.text();

    const before = calls.find((c) => c.phase === "before");
    expect(before).toBeDefined();
    if (!before) {
      throw new Error("Expected before hook call");
    }
    expect(before.toolDef.tags).toEqual({ tier: "premium", feature: "projects" });
  });

  it("timeout-enabled tool call succeeds when resolved in time", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        fast: query(null, { args: makeValidator("object", { fields: {} }), description: "Fast", timeout: 50 }),
      },
    });

    const data = await parseSSEResponse(
      await server.handler().POST(mcpRequest("tools/call", { name: "fast", arguments: {} })),
    );
    expect(data.result.isError).toBeUndefined();
    expect(JSON.parse(data.result.content[0].text)).toEqual({ id: "1", name: "Test" });
  });

  it("timeout aborts long-running tool call (AC-6)", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));

    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        slow: query(null, { args: makeValidator("object", { fields: {} }), description: "Slow", timeout: 50 }),
      },
    });

    const data = await parseSSEResponse(
      await server.handler().POST(mcpRequest("tools/call", { name: "slow", arguments: {} })),
    );
    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toBe("Function execution failed");
  });

  it("X-Request-Id header on POST response (AC-7)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: { list: query(null, { description: "List" }) },
    });

    const response = await server.handler().POST(mcpRequest("tools/list"));
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("X-Request-Id header on GET response (AC-7)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {},
    });

    const response = await server.handler().GET(new Request("http://localhost/mcp", {
      headers: { "Authorization": "Bearer test-key" },
    }));
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("X-Request-Id on 401 response", async () => {
    const server = createMCPServer({
      auth: { validate: async () => false },
      convexUrl: MOCK_CONVEX_URL,
      tools: {},
    });

    const response = await server.handler().POST(mcpRequest("tools/list"));
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("hook error does not crash server (AC-E1)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: { onToolCall: async () => { throw new Error("Hook exploded"); } },
      tools: {
        list: query(null, { args: makeValidator("object", { fields: {} }), description: "List" }),
      },
    });

    const response = await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} }));
    expect(response.status).toBe(200);
    const data = await parseSSEResponse(response);
    expect(data.result.content[0].text).toBeDefined();
  });

  it("no hooks = existing behavior unchanged (AC-E2)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        list: query(null, { args: makeValidator("object", { fields: {} }), description: "List" }),
      },
    });

    const data = await parseSSEResponse(
      await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} })),
    );
    expect(data.result.isError).toBeUndefined();
    expect(JSON.parse(data.result.content[0].text)).toEqual({ id: "1", name: "Test" });
  });

  it("phases fire in order: before → success", async () => {
    const { calls, hook } = createHookCollector();
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: { onToolCall: hook },
      tools: {
        list: query(null, { args: makeValidator("object", { fields: {} }), description: "List" }),
      },
    });

    const response = await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} }));
    await response.text();

    expect(calls.map((c) => c.phase)).toEqual(["before", "success"]);
  });
});
