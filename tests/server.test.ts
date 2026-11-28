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

  it("reports name and version defaults or the configured values in serverInfo", async () => {
    const initialize = {
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
      protocolVersion: "2025-06-18",
    };
    const defaults = await parseSSEResponse(
      await createTestServer().handler().POST(mcpRequest("initialize", initialize)),
    );
    expect(defaults.result.serverInfo).toMatchObject({ name: "convex-mcp", version: "0.1.0" });

    const custom = await parseSSEResponse(
      await createTestServer({ name: "tasks-mcp", version: "2.3.4" })
        .handler()
        .POST(mcpRequest("initialize", initialize)),
    );
    expect(custom.result.serverInfo).toMatchObject({ name: "tasks-mcp", version: "2.3.4" });
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

  it("returns 401 when auth.validate never settles within 10 seconds", async () => {
    vi.useFakeTimers();
    try {
      const validate = vi.fn(() => new Promise<boolean>(() => {}));
      const handler = createTestServer({ auth: { validate } }).handler();
      let settled = false;
      const pending = handler.POST(mcpRequest("tools/list")).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const response = await pending;
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Authentication failed." });
      expect(validate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
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

  it("returns the documented -32602 input error for malformed int64 strings", async () => {
    const server = createTestServer({
      tools: {
        count: query(null, {
          args: makeValidator("object", {
            fields: { value: makeValidator("int64") },
          }),
        }),
      },
    });
    const handler = server.handler();
    const mockClient = await getMockClient();

    for (const value of ["12abc", "1.5", "0x10", "1e3"]) {
      const response = await handler.POST(mcpRequest("tools/call", {
        name: "count",
        arguments: { value },
      }));
      const data = await parseSSEResponse(response);
      expect(data.result.isError).toBe(true);
      const text: string = data.result.content[0].text;
      expect(text).toMatch(/^MCP error -32602: Input validation error/u);
      expect(text).toContain("Expected a decimal 64-bit integer string");
      expect(text).not.toContain("BigInt");
    }
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("keeps tool float64 and boolean args strict: strings are rejected, numbers and booleans pass", async () => {
    const handler = createTestServer({
      tools: {
        measure: query(null, {
          args: makeValidator("object", {
            fields: { on: makeValidator("boolean"), size: makeValidator("float64") },
          }),
        }),
      },
    }).handler();
    const mockClient = await getMockClient();

    for (const arguments_ of [{ on: true, size: "1.5" }, { on: "true", size: 1.5 }]) {
      const data = await parseSSEResponse(await handler.POST(mcpRequest("tools/call", {
        name: "measure",
        arguments: arguments_,
      })));
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(
        /^MCP error -32602: Input validation error: Invalid arguments for tool measure: /u,
      );
    }
    expect(mockClient.query).not.toHaveBeenCalled();

    const ok = await parseSSEResponse(await handler.POST(mcpRequest("tools/call", {
      name: "measure",
      arguments: { on: false, size: 1.5 },
    })));
    expect(ok.result.isError).toBeUndefined();
    expect(mockClient.query).toHaveBeenLastCalledWith(null, { on: false, size: 1.5 });
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

describe("resource listing", () => {
  it("lists resources as URI templates, not in resources/list", async () => {
    const handler = createTestServer().handler();

    const listed = await parseSSEResponse(await handler.POST(mcpRequest("resources/list")));
    expect(listed.result.resources).toEqual([]);

    const templates = await parseSSEResponse(
      await handler.POST(mcpRequest("resources/templates/list")),
    );
    expect(templates.result.resourceTemplates).toEqual([
      expect.objectContaining({
        description: "Get a space",
        mimeType: "application/json",
        uriTemplate: "space://{id}",
      }),
    ]);
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

  it("validates and transforms URI parameters before dispatch", async () => {
    const server = createTestServer({
      resources: {
        "counter://{value}": resource(null, {
          args: makeValidator("object", {
            fields: { value: makeValidator("int64") },
          }),
        }),
      },
    });
    const handler = server.handler();
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ value: 42n });

    const response = await handler.POST(mcpRequest("resources/read", {
      uri: "counter://42",
    }));
    expect(response.status).toBe(200);
    expect(mockClient.query).toHaveBeenLastCalledWith(null, { value: 42n });
    const data = await parseSSEResponse(response);
    expect(JSON.parse(data.result.contents[0].text)).toEqual({
      value: { $integer: "KgAAAAAAAAA=" },
    });
  });

  it("dispatches resources without an args validator", async () => {
    const server = createTestServer({
      resources: { "health://status": resource(null) },
    });
    const handler = server.handler();
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce("ok");

    const response = await handler.POST(mcpRequest("resources/read", {
      uri: "health://status",
    }));
    expect(response.status).toBe(200);
    expect(mockClient.query).toHaveBeenLastCalledWith(null, {});
  });

  it("rejects reserved underscore parameters before dispatch", async () => {
    const mockClient = await getMockClient();
    const cases = [
      {
        resources: { "doc://{id}/{_mcp_role}": resource(null) },
        uri: "doc://1/admin",
      },
      {
        resources: { "doc://{id}{?_mcp_role}": resource(null) },
        uri: "doc://1?_mcp_role=admin",
      },
      {
        resources: {
          "doc://{id}/{_mcp_role}": resource(null, {
            args: makeValidator("object", {
              fields: {
                _mcp_role: makeValidator("string"),
                id: makeValidator("string"),
              },
            }),
          }),
        },
        uri: "doc://1/admin",
      },
    ];
    for (const { resources, uri } of cases) {
      mockClient.query.mockClear();
      const handler = createTestServer({ resources }).handler();
      const response = await handler.POST(mcpRequest("resources/read", { uri }));
      const data = await parseSSEResponse(response);
      expect(data.error ?? data.result?.isError).toBeTruthy();
      expect(JSON.stringify(data)).not.toContain("admin");
      expect(mockClient.query).not.toHaveBeenCalled();
    }
  });

  function readResource(handler: ReturnType<ReturnType<typeof createTestServer>["handler"]>, uri: string) {
    return handler.POST(mcpRequest("resources/read", { uri })).then(parseSSEResponse);
  }

  function inputError(template: string, message: string): string {
    return `MCP error -32602: Input validation error: Invalid arguments for resource ${template}: ${message}`;
  }

  it("converts v.float64() URI params from decimal text before dispatch", async () => {
    const handler = createTestServer({
      resources: {
        "num://{value}": resource(null, {
          args: makeValidator("object", { fields: { value: makeValidator("float64") } }),
        }),
      },
    }).handler();
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValue({ ok: true });

    for (const [text, value] of [["1.5", 1.5], ["-1.5", -1.5], ["2e3", 2000], ["0.25", 0.25], ["1", 1], ["-0", -0], ["1E-2", 0.01], ["1e+2", 100]] as const) {
      const data = await readResource(handler, `num://${text}`);
      expect(data.error).toBeUndefined();
      expect(JSON.parse(data.result.contents[0].text)).toEqual({ ok: true });
      expect(mockClient.query).toHaveBeenLastCalledWith(null, { value });
    }
  });

  it("converts v.boolean() URI params from true/false before dispatch", async () => {
    const handler = createTestServer({
      resources: {
        "flag://{on}": resource(null, {
          args: makeValidator("object", { fields: { on: makeValidator("boolean") } }),
        }),
      },
    }).handler();
    const mockClient = await getMockClient();

    for (const [text, on] of [["true", true], ["false", false]] as const) {
      const data = await readResource(handler, `flag://${text}`);
      expect(data.result.contents).toHaveLength(1);
      expect(mockClient.query).toHaveBeenLastCalledWith(null, { on });
    }
  });

  it("converts an optional v.float64() param when present and accepts it absent", async () => {
    const args = makeValidator("object", {
      fields: {
        id: makeValidator("string"),
        limit: makeValidator("float64", { isOptional: "optional" }),
      },
    });
    const handler = createTestServer({
      resources: {
        "page://{id}{?limit}": resource(null, { args }),
        "first://{id}": resource(null, { args }),
      },
    }).handler();
    const mockClient = await getMockClient();

    expect((await readResource(handler, "page://a?limit=2.5")).result.contents).toHaveLength(1);
    expect(mockClient.query).toHaveBeenLastCalledWith(null, { id: "a", limit: 2.5 });
    expect((await readResource(handler, "first://a")).result.contents).toHaveLength(1);
    expect(mockClient.query).toHaveBeenLastCalledWith(null, { id: "a" });
  });

  it("returns the -32602 input error for malformed float64 and boolean text", async () => {
    const handler = createTestServer({
      resources: {
        "num://x{?value}": resource(null, {
          args: makeValidator("object", { fields: { value: makeValidator("float64") } }),
        }),
        "flag://{on}": resource(null, {
          args: makeValidator("object", { fields: { on: makeValidator("boolean") } }),
        }),
      },
    }).handler();
    const mockClient = await getMockClient();

    for (const text of ["%201", "0x10", "NaN", "Infinity", "-Infinity", "1e400", "1,5", "+1", "1.", ".5", "1e", "abc"]) {
      const data = await readResource(handler, `num://x?value=${text}`);
      expect(data.error).toEqual({
        code: -32602,
        message: inputError("num://x{?value}", "Expected a decimal number at value"),
      });
    }
    for (const text of ["1", "0", "True", "FALSE", "yes", "%20true"]) {
      const data = await readResource(handler, `flag://${text}`);
      expect(data.error).toEqual({
        code: -32602,
        message: inputError("flag://{on}", "Expected true or false at on"),
      });
    }
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("returns the -32602 input error for int64, bytes, literal and array params that fail args", async () => {
    const handler = createTestServer({
      resources: {
        "counter://{value}": resource(null, {
          args: makeValidator("object", { fields: { value: makeValidator("int64") } }),
        }),
        "blob://{data}": resource(null, {
          args: makeValidator("object", { fields: { data: makeValidator("bytes") } }),
        }),
        "mode://{mode}": resource(null, {
          args: makeValidator("object", { fields: { mode: makeValidator("literal", { value: "fast" }) } }),
        }),
        "list://{ids*}": resource(null, {
          args: makeValidator("object", {
            fields: { ids: makeValidator("array", { element: makeValidator("int64") }) },
          }),
        }),
      },
    }).handler();
    const mockClient = await getMockClient();

    expect((await readResource(handler, "counter://12abc")).error).toEqual({
      code: -32602,
      message: inputError("counter://{value}", "Expected a decimal 64-bit integer string at value"),
    });
    expect((await readResource(handler, "counter://9223372036854775808")).error).toEqual({
      code: -32602,
      message: inputError("counter://{value}", "Integer is outside the signed 64-bit range at value"),
    });
    expect((await readResource(handler, "blob://!!!")).error).toEqual({
      code: -32602,
      message: inputError("blob://{data}", "Expected base64-encoded binary data at data"),
    });
    const literal = await readResource(handler, "mode://slow");
    expect(literal.error.code).toBe(-32602);
    expect(literal.error.message).toMatch(/^MCP error -32602: Input validation error: Invalid arguments for resource mode:\/\/\{mode\}: .* at mode$/u);
    expect((await readResource(handler, "list://1,x")).error).toEqual({
      code: -32602,
      message: inputError("list://{ids*}", "Expected a decimal 64-bit integer string at ids[1]"),
    });
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("does not convert float64 or boolean members inside a union param", async () => {
    const handler = createTestServer({
      resources: {
        "mode://{mode}": resource(null, {
          args: makeValidator("object", {
            fields: {
              mode: makeValidator("union", {
                members: [makeValidator("boolean"), makeValidator("literal", { value: "auto" })],
              }),
            },
          }),
        }),
      },
    }).handler();
    const mockClient = await getMockClient();

    expect((await readResource(handler, "mode://auto")).result.contents).toHaveLength(1);
    expect(mockClient.query).toHaveBeenLastCalledWith(null, { mode: "auto" });
    mockClient.query.mockClear();
    const data = await readResource(handler, "mode://true");
    expect(data.error.code).toBe(-32602);
    expect(data.error.message).toMatch(/^MCP error -32602: Input validation error: Invalid arguments for resource mode:\/\/\{mode\}: .* at mode$/u);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("dispatches a resource whose v.object() args declare no fields", async () => {
    const handler = createTestServer({
      resources: { "health://{check}": resource(null, { args: makeValidator("object") }) },
    }).handler();
    const mockClient = await getMockClient();

    expect((await readResource(handler, "health://db")).result.contents).toHaveLength(1);
    expect(mockClient.query).toHaveBeenLastCalledWith(null, {});
  });

  it("keeps the generic Resource read failed for a Convex error and a reserved param", async () => {
    const handler = createTestServer({
      resources: {
        "num://{value}": resource(null, {
          args: makeValidator("object", { fields: { value: makeValidator("float64") } }),
        }),
        "doc://{id}/{_flag}": resource(null, {
          args: makeValidator("object", {
            fields: { _flag: makeValidator("boolean"), id: makeValidator("string") },
          }),
        }),
      },
    }).handler();
    const mockClient = await getMockClient();
    mockClient.query.mockRejectedValueOnce(new Error("secret-token-123 leaked"));

    const convexError = await readResource(handler, "num://1.5");
    expect(convexError.error).toEqual({ code: -32603, message: "Resource read failed" });
    expect(mockClient.query).toHaveBeenLastCalledWith(null, { value: 1.5 });

    mockClient.query.mockClear();
    for (const uri of ["doc://1/true", "doc://1/notabool"]) {
      const reserved = await readResource(handler, uri);
      expect(reserved.error).toEqual({ code: -32603, message: "Resource read failed" });
    }
    expect(mockClient.query).not.toHaveBeenCalled();
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
