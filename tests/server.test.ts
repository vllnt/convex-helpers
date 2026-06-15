import { beforeEach, describe, expect, it, vi } from "vitest";
import { resource } from "../src/mcp/resources/helpers.js";
import { createMCPServer } from "../src/mcp/server.js";
import { action, mutation, query } from "../src/mcp/tools/helpers.js";

const MOCK_CONVEX_URL = "https://test-deployment.convex.cloud";

function makeValidator(kind: string, extra: Record<string, unknown> = {}): any {
  return { kind, isOptional: "required", ...extra };
}

vi.mock("convex/browser", () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ id: "1", name: "Test Project" }),
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

function createTestServer(overrides: Record<string, unknown> = {}) {
  return createMCPServer({
    auth: { validate: async () => true },
    convexUrl: MOCK_CONVEX_URL,
    tools: {
      list_projects: query(null, {
        args: makeValidator("object", { fields: {} }),
        description: "List all projects",
      }),
      create_project: mutation(null, {
        args: makeValidator("object", {
          fields: { name: makeValidator("string") },
        }),
        description: "Create a project",
      }),
      run_task: action(null, {
        args: makeValidator("object", {
          fields: { taskId: makeValidator("string") },
        }),
        description: "Run a task",
      }),
    },
    resources: {
      "space://{id}": resource(null, {
        args: makeValidator("object", {
          fields: { id: makeValidator("id", { tableName: "spaces" }) },
        }),
        description: "Get a space",
      }),
    },
    ...overrides,
  });
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

beforeEach(async () => {
  const mockClient = await getMockClient();
  mockClient.query.mockReset().mockResolvedValue({ id: "1", name: "Test Project" });
  mockClient.mutation.mockReset().mockResolvedValue({ id: "2" });
  mockClient.action.mockReset().mockResolvedValue("action-result");
  mockClient.setAuth.mockReset();
});

describe("createMCPServer", () => {
  it("throws without auth config (AC-9)", () => {
    expect(() =>
      createMCPServer({
        auth: undefined as any,
        convexUrl: MOCK_CONVEX_URL,
      }),
    ).toThrow("Auth is required");
  });

  it("throws without auth.validate (AC-9)", () => {
    expect(() =>
      createMCPServer({
        auth: {} as any,
        convexUrl: MOCK_CONVEX_URL,
      }),
    ).toThrow("Auth is required");
  });

  it("throws without convex URL", () => {
    const origConvex = process.env.CONVEX_URL;
    const origNext = process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.CONVEX_URL;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    try {
      expect(() =>
        createMCPServer({
          auth: { validate: async () => true },
        }),
      ).toThrow("Convex URL");
    } finally {
      if (origConvex) process.env.CONVEX_URL = origConvex;
      if (origNext) process.env.NEXT_PUBLIC_CONVEX_URL = origNext;
    }
  });

  it("creates server and handler", () => {
    const server = createTestServer();
    const handler = server.handler();
    expect(handler.GET).toBeTypeOf("function");
    expect(handler.POST).toBeTypeOf("function");
  });
});

describe("handler", () => {
  it("returns 401 without API key (AC-E3)", async () => {
    const server = createTestServer();
    const handler = server.handler();

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const response = await handler.POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 401 with invalid API key (AC-E3)", async () => {
    const server = createMCPServer({
      auth: { validate: async (key) => key === "valid-key" },
      convexUrl: MOCK_CONVEX_URL,
    });
    const handler = server.handler();

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer wrong-key",
      },
      body: "{}",
    });

    const response = await handler.POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 415 for wrong Content-Type (AC-E4)", async () => {
    const server = createTestServer();
    const handler = server.handler();

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Authorization": "Bearer test-key",
        "Content-Type": "text/plain",
      },
      body: "not json",
    });

    const response = await handler.POST(request);
    expect(response.status).toBe(415);
  });

  it("lists tools via tools/list (AC-1)", async () => {
    const server = createTestServer();
    const handler = server.handler();

    const response = await handler.POST(mcpRequest("tools/list"));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    expect(data.result.tools).toHaveLength(3);

    const toolNames = data.result.tools.map((t: any) => t.name).sort();
    expect(toolNames).toEqual(["create_project", "list_projects", "run_task"]);

    const listTool = data.result.tools.find((t: any) => t.name === "list_projects");
    expect(listTool.description).toBe("List all projects");
  });

  it("calls query tool via ConvexHttpClient.query (AC-2, AC-6)", async () => {
    const server = createTestServer();
    const handler = server.handler();
    const mockClient = await getMockClient();

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "list_projects",
      arguments: {},
    }));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    expect(data.result.content[0].type).toBe("text");
    expect(mockClient.query).toHaveBeenCalled();
  });

  it("calls mutation tool via ConvexHttpClient.mutation (AC-6)", async () => {
    const server = createTestServer();
    const handler = server.handler();
    const mockClient = await getMockClient();

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "create_project",
      arguments: { name: "New Project" },
    }));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    expect(data.result.content[0].type).toBe("text");
    expect(mockClient.mutation).toHaveBeenCalled();
  });

  it("calls action tool via ConvexHttpClient.action (AC-6)", async () => {
    const server = createTestServer();
    const handler = server.handler();
    const mockClient = await getMockClient();

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "run_task",
      arguments: { taskId: "task123" },
    }));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    expect(data.result.content[0].type).toBe("text");
    expect(mockClient.action).toHaveBeenCalled();
  });

  it("returns generic error when Convex throws (AC-E2)", async () => {
    const server = createTestServer();
    const handler = server.handler();
    const mockClient = await getMockClient();
    mockClient.query.mockRejectedValueOnce(new Error("Email already registered: user@corp.com"));

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "list_projects",
      arguments: {},
    }));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    expect(data.result.content[0].text).toBe("Function execution failed");
    expect(data.result.content[0].text).not.toContain("user@corp.com");
    expect(data.result.isError).toBe(true);
  });
});

describe("GET handler", () => {
  it("returns 401 without API key", async () => {
    const server = createTestServer();
    const handler = server.handler();

    const request = new Request("http://localhost/mcp", {
      method: "GET",
    });

    const response = await handler.GET(request);
    expect(response.status).toBe(401);
  });

  it("accepts valid auth and delegates to transport", async () => {
    const server = createTestServer();
    const handler = server.handler();

    const request = new Request("http://localhost/mcp", {
      method: "GET",
      headers: {
        "Authorization": "Bearer test-key",
        "Accept": "application/json, text/event-stream",
      },
    });

    const response = await handler.GET(request);
    expect([200, 405]).toContain(response.status);
  });
});

describe("resource read", () => {
  it("returns resource content on successful read", async () => {
    const server = createTestServer();
    const handler = server.handler();
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ id: "space1", name: "My Space" });

    const response = await handler.POST(mcpRequest("resources/read", {
      uri: "space://space1",
    }));
    expect(response.status).toBe(200);
  });

  it("returns error when resource read fails", async () => {
    const server = createTestServer();
    const handler = server.handler();
    const mockClient = await getMockClient();
    mockClient.query.mockRejectedValueOnce(new Error("DB connection failed"));

    const response = await handler.POST(mcpRequest("resources/read", {
      uri: "space://space1",
    }));
    expect(response.status).toBe(200);
    const data = await parseSSEResponse(response);
    expect(data.error ?? data.result?.isError).toBeTruthy();
    // The raw Convex error message must be masked from the client.
    expect(JSON.stringify(data)).not.toContain("DB connection failed");
  });
});

describe("edge cases", () => {
  it("handles unknown tool type at runtime", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        bad_tool: {
          ref: null,
          type: "invalid" as any,
          args: makeValidator("object", { fields: {} }),
          description: "Bad tool",
        },
      },
    });
    const handler = server.handler();

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "bad_tool",
      arguments: {},
    }));
    expect(response.status).toBe(200);
    const data = await parseSSEResponse(response);
    expect(data.result.isError).toBe(true);
    expect(data.result.content[0].text).toBe("Function execution failed");
  });

  it("handles tool with no description (falls back to empty string)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        no_desc: query(null, { args: makeValidator("object", { fields: {} }) }),
      },
    });

    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/list"));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    const tool = data.result.tools.find((t: any) => t.name === "no_desc");
    expect(tool.description).toBe("");
  });

  it("handles tool returning undefined result (coerced to null)", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce(undefined);

    const server = createTestServer();
    const handler = server.handler();

    const response = await handler.POST(mcpRequest("tools/call", {
      name: "list_projects",
      arguments: {},
    }));
    expect(response.status).toBe(200);

    const data = await parseSSEResponse(response);
    expect(data.result.content[0].text).toBe("null");
  });

  it("handles resource returning undefined result (coerced to null)", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce(undefined);

    const server = createTestServer();
    const handler = server.handler();

    const response = await handler.POST(mcpRequest("resources/read", {
      uri: "space://space1",
    }));
    expect(response.status).toBe(200);
  });

  it("rejects non-Bearer auth scheme", async () => {
    const server = createTestServer();
    const handler = server.handler();

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic dXNlcjpwYXNz",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    const response = await handler.POST(request);
    expect(response.status).toBe(401);
  });
});

describe("auth with convexToken", () => {
  it("sets auth on ConvexHttpClient when convexToken provided", async () => {
    const server = createMCPServer({
      auth: {
        validate: async () => true,
        convexToken: async () => "convex-jwt-token",
      },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        test: query(null, { description: "Test" }),
      },
    });

    const handler = server.handler();
    const mockClient = await getMockClient();

    await handler.POST(mcpRequest("tools/list"));
    expect(mockClient.setAuth).toHaveBeenCalledWith("convex-jwt-token");
  });

  it("does NOT call setAuth when convexToken returns undefined", async () => {
    const server = createMCPServer({
      auth: {
        validate: async () => true,
        convexToken: async () => undefined,
      },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        test: query(null, { description: "Test" }),
      },
    });

    const handler = server.handler();
    const mockClient = await getMockClient();

    await handler.POST(mcpRequest("tools/list"));
    expect(mockClient.setAuth).not.toHaveBeenCalled();
  });

  it("throws when both client and convexToken are provided", () => {
    expect(() =>
      createMCPServer({
        auth: {
          validate: async () => true,
          convexToken: async () => "token",
        },
        client: {
          query: async () => null,
          mutation: async () => null,
          action: async () => null,
        },
      }),
    ).toThrow("Cannot use both 'client' and 'auth.convexToken'");
  });
});
