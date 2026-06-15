/**
 * Tests for hook-driven request context propagation (issues #16 + #17).
 *
 * - extendArgs: hook injects server-resolved context into dispatched args.
 * - Reserved `_` prefix: framework rejects client-supplied `_*` keys to
 *   prevent caller spoofing of server-injected fields.
 * - Schema stripping: `_*` fields are removed from the published JSON Schema
 *   so MCP clients neither see nor pass them.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMCPServer } from "../src/mcp/server.js";
import { action, mutation, query } from "../src/mcp/tools/helpers.js";
import type { CallContext, ConvexValidator } from "../src/mcp/types.js";

const MOCK_CONVEX_URL = "https://test-deployment.convex.cloud";

function makeValidator(kind: string, extra: Partial<ConvexValidator> = {}): ConvexValidator {
  return { kind, isOptional: "required", ...extra } satisfies ConvexValidator;
}

vi.mock("convex/browser", () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ ok: true }),
    mutation: vi.fn().mockResolvedValue({ ok: true }),
    action: vi.fn().mockResolvedValue({ ok: true }),
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
  const mod = (await import("convex/browser")) as unknown as {
    __mockClient: {
      query: ReturnType<typeof vi.fn>;
      mutation: ReturnType<typeof vi.fn>;
      action: ReturnType<typeof vi.fn>;
      setAuth: ReturnType<typeof vi.fn>;
    };
  };
  return mod.__mockClient;
}

beforeEach(async () => {
  const mockClient = await getMockClient();
  mockClient.query.mockReset().mockResolvedValue({ ok: true });
  mockClient.mutation.mockReset().mockResolvedValue({ ok: true });
  mockClient.action.mockReset().mockResolvedValue({ ok: true });
  mockClient.setAuth.mockReset();
});

function mcpRequest(method: string, params: Record<string, unknown> = {}, id: number = 1) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer test-key",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

async function parseSSE(response: Response): Promise<{ result?: { isError?: boolean; content: { text: string }[] } }> {
  const text = await response.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`No data line in SSE response: ${text}`);
  return JSON.parse(dataLine.slice(6));
}

describe("context propagation: extendArgs", () => {
  it("merges hook-supplied extendArgs into dispatched args (query)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async ({ phase, apiKey }) => {
          if (phase !== "before") return;
          return { extendArgs: { _mcp_apiKey: apiKey, _mcp_scope: "read" } };
        },
      },
      tools: {
        list: query(null, {
          args: makeValidator("object", {
            fields: {
              userArg: makeValidator("string"),
              _mcp_apiKey: makeValidator("string"),
              _mcp_scope: makeValidator("string"),
            },
          }),
          description: "List",
        }),
      },
    });

    const mockClient = await getMockClient();
    const response = await server
      .handler()
      .POST(mcpRequest("tools/call", { name: "list", arguments: { userArg: "hello" } }));
    await response.text();

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(null, {
      userArg: "hello",
      _mcp_apiKey: "test-key",
      _mcp_scope: "read",
    });
  });

  it("merges extendArgs for mutations and actions too", async () => {
    const mockClient = await getMockClient();

    const buildServer = (toolType: "query" | "mutation" | "action") =>
      createMCPServer({
        auth: { validate: async () => true },
        convexUrl: MOCK_CONVEX_URL,
        hooks: {
          onToolCall: async ({ phase }) => {
            if (phase !== "before") return;
            return { extendArgs: { _injected: "ctx" } };
          },
        },
        tools: {
          tool: (toolType === "query" ? query : toolType === "mutation" ? mutation : action)(null, {
            args: makeValidator("object", {
              fields: { x: makeValidator("string"), _injected: makeValidator("string") },
            }),
            description: "tool",
          }),
        },
      });

    for (const t of ["query", "mutation", "action"] as const) {
      mockClient[t].mockClear();
      const server = buildServer(t);
      await server.handler().POST(mcpRequest("tools/call", { name: "tool", arguments: { x: "v" } })).then((r) => r.text());
      expect(mockClient[t]).toHaveBeenCalledWith(null, { x: "v", _injected: "ctx" });
    }
  });

  it("extendArgs takes precedence over request args on key collision (server-side wins)", async () => {
    // Note: only possible when the colliding key does NOT start with `_` (those
    // are rejected upfront). Hook-wins matters for non-reserved keys when a
    // consumer chooses to override request data — uncommon but supported.
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async ({ phase }) => {
          if (phase !== "before") return;
          return { extendArgs: { tenantId: "server-resolved" } };
        },
      },
      tools: {
        list: query(null, {
          args: makeValidator("object", { fields: { tenantId: makeValidator("string") } }),
          description: "list",
        }),
      },
    });

    const mockClient = await getMockClient();
    await server
      .handler()
      .POST(mcpRequest("tools/call", { name: "list", arguments: { tenantId: "client-supplied" } }))
      .then((r) => r.text());

    expect(mockClient.query).toHaveBeenCalledWith(null, { tenantId: "server-resolved" });
  });

  it("undefined / empty extendArgs is a no-op", async () => {
    const cases: Array<{ label: string; extendArgs: Record<string, unknown> | undefined }> = [
      { label: "undefined", extendArgs: undefined },
      { label: "empty", extendArgs: {} },
    ];

    for (const { extendArgs } of cases) {
      const mockClient = await getMockClient();
      mockClient.query.mockClear();

      const server = createMCPServer({
        auth: { validate: async () => true },
        convexUrl: MOCK_CONVEX_URL,
        hooks: {
          onToolCall: async ({ phase }) => {
            if (phase !== "before") return;
            return extendArgs === undefined ? undefined : { extendArgs };
          },
        },
        tools: {
          list: query(null, {
            args: makeValidator("object", { fields: { x: makeValidator("string") } }),
            description: "list",
          }),
        },
      });

      await server
        .handler()
        .POST(mcpRequest("tools/call", { name: "list", arguments: { x: "v" } }))
        .then((r) => r.text());

      expect(mockClient.query).toHaveBeenCalledWith(null, { x: "v" });
    }
  });

  it("abort wins over extendArgs — dispatch never happens", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async ({ phase }) => {
          if (phase !== "before") return;
          return { abort: true, errorMessage: "blocked", extendArgs: { _x: "ignored" } };
        },
      },
      tools: {
        list: query(null, {
          args: makeValidator("object", { fields: {} }),
          description: "list",
        }),
      },
    });

    const mockClient = await getMockClient();
    const data = await parseSSE(
      await server.handler().POST(mcpRequest("tools/call", { name: "list", arguments: {} })),
    );
    expect(data.result?.isError).toBe(true);
    expect(data.result?.content[0]?.text).toBe("blocked");
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("error and success phases ignore extendArgs (only `before` honors it)", async () => {
    const seen: CallContext[] = [];
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async (ctx) => {
          seen.push({ ...ctx });
          // Returning extendArgs from non-before phases is allowed but ignored.
          return { extendArgs: { _phase: ctx.phase } };
        },
      },
      tools: {
        list: query(null, {
          args: makeValidator("object", { fields: {} }),
          description: "list",
        }),
      },
    });

    const mockClient = await getMockClient();
    await server
      .handler()
      .POST(mcpRequest("tools/call", { name: "list", arguments: {} }))
      .then((r) => r.text());

    // Hook fired in "before" + "success"; only "before" affected dispatch.
    const phases = seen.map((c) => c.phase);
    expect(phases).toContain("before");
    expect(phases).toContain("success");
    expect(mockClient.query).toHaveBeenCalledWith(null, { _phase: "before" });
  });
});

describe("context propagation: reserved `_` prefix rejection", () => {
  /**
   * Defense in depth: there are two layers that prevent caller-supplied `_*` args.
   *
   *  1. Schema layer — `_*` keys are stripped from the published JSON Schema
   *     (covered by the "schema stripping" suite). The MCP SDK then rejects
   *     unknown args at JSON-RPC parse time, BEFORE our handler runs.
   *  2. Handler layer — even if a caller bypasses the SDK and reaches our
   *     handler with `_*` keys (custom transport, bypassed validation), the
   *     framework rejects with a clear "Reserved arg keys not allowed"
   *     message. This is what these tests cover by invoking the registered
   *     tool callback directly.
   */
  it("handler rejects `_*` args before hook runs (defense-in-depth)", async () => {
    const { registerTools, prepareTools } = await import("../src/mcp/tools/register.js");
    type ToolHandler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

    const mockClient = await getMockClient();
    const hookSpy = vi.fn();
    const captured: { handler?: ToolHandler } = {};
    const fakeServer = {
      tool: (_name: string, _desc: string, _shape: unknown, h: ToolHandler) => {
        captured.handler = h;
      },
    };

    const prepared = prepareTools({
      list: query(null, {
        args: makeValidator("object", { fields: { _mcp_apiKey: makeValidator("string") } }),
        description: "list",
      }),
    });
    registerTools(
      fakeServer as unknown as Parameters<typeof registerTools>[0],
      mockClient as unknown as Parameters<typeof registerTools>[1],
      prepared,
      { onToolCall: async (ctx) => { hookSpy(ctx.phase); } },
      "test-request-id",
      "test-key",
    );

    const handler = captured.handler;
    if (!handler) throw new Error("registerTools did not register a handler");
    const result = await handler({ _mcp_apiKey: "spoofed" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Reserved arg keys not allowed");
    expect(result.content[0]?.text).toContain("_mcp_apiKey");
    expect(hookSpy).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("handler error message lists every reserved key supplied", async () => {
    const { registerTools, prepareTools } = await import("../src/mcp/tools/register.js");
    type ToolHandler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

    const mockClient = await getMockClient();
    const captured: { handler?: ToolHandler } = {};
    const fakeServer = {
      tool: (_name: string, _desc: string, _shape: unknown, h: ToolHandler) => {
        captured.handler = h;
      },
    };

    const prepared = prepareTools({
      list: query(null, { args: makeValidator("object", { fields: {} }), description: "list" }),
    });
    registerTools(
      fakeServer as unknown as Parameters<typeof registerTools>[0],
      mockClient as unknown as Parameters<typeof registerTools>[1],
      prepared,
      undefined,
      "test-request-id",
      "test-key",
    );

    const handler = captured.handler;
    if (!handler) throw new Error("registerTools did not register a handler");
    const result = await handler({ _a: 1, _b: 2, ok: 3 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("_a");
    expect(result.content[0]?.text).toContain("_b");
    expect(result.content[0]?.text).not.toMatch(/\bok\b/);
  });

  it("MCP SDK schema-strip (layer 1): client-supplied `_*` keys never reach the dispatched action", async () => {
    // The MCP SDK validates request args against the published JSON Schema.
    // Since `prepareTools` strips `_*` from the published shape, the SDK's
    // Zod validator silently drops `_*` keys from incoming args (Zod default
    // strip mode). The dispatched call therefore never carries the spoofed
    // value — which is exactly the security property we want.
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async ({ phase }) => {
          if (phase !== "before") return;
          return { extendArgs: { _mcp_apiKey: "server-validated" } };
        },
      },
      tools: {
        list: query(null, {
          args: makeValidator("object", {
            fields: {
              userArg: makeValidator("string"),
              _mcp_apiKey: makeValidator("string"),
            },
          }),
          description: "list",
        }),
      },
    });

    const mockClient = await getMockClient();
    await server
      .handler()
      .POST(
        mcpRequest("tools/call", {
          name: "list",
          arguments: { userArg: "v", _mcp_apiKey: "spoofed" },
        }),
      )
      .then((r) => r.text());

    // The dispatched args contain ONLY the server-validated value.
    // The spoofed `_mcp_apiKey: "spoofed"` was stripped by the SDK before
    // our handler ran, then the hook injected the trusted value.
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(null, {
      userArg: "v",
      _mcp_apiKey: "server-validated",
    });
  });

  it("hook-supplied `_*` keys via extendArgs bypass the reject (server is trusted)", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      hooks: {
        onToolCall: async ({ phase }) => {
          if (phase !== "before") return;
          return { extendArgs: { _mcp_apiKey: "server-injected" } };
        },
      },
      tools: {
        list: query(null, {
          args: makeValidator("object", {
            fields: { x: makeValidator("string"), _mcp_apiKey: makeValidator("string") },
          }),
          description: "list",
        }),
      },
    });

    const mockClient = await getMockClient();
    await server
      .handler()
      .POST(mcpRequest("tools/call", { name: "list", arguments: { x: "v" } }))
      .then((r) => r.text());

    expect(mockClient.query).toHaveBeenCalledWith(null, { x: "v", _mcp_apiKey: "server-injected" });
  });

  it("only top-level keys are rejected — nested `_*` keys pass through unchanged", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        list: query(null, {
          args: makeValidator("object", {
            fields: {
              payload: makeValidator("object", {
                fields: { _internal: makeValidator("string") },
              }),
            },
          }),
          description: "list",
        }),
      },
    });

    const mockClient = await getMockClient();
    await server
      .handler()
      .POST(
        mcpRequest("tools/call", {
          name: "list",
          arguments: { payload: { _internal: "client-data" } },
        }),
      )
      .then((r) => r.text());

    // Top-level reject doesn't recurse — nested `_internal` is consumer territory.
    expect(mockClient.query).toHaveBeenCalledWith(null, { payload: { _internal: "client-data" } });
  });
});

describe("context propagation: schema stripping", () => {
  it("strips `_*` keys from published tool inputSchema", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        list: query(null, {
          args: makeValidator("object", {
            fields: {
              userArg: makeValidator("string"),
              _mcp_apiKey: makeValidator("string"),
              _mcp_scope: makeValidator("string"),
            },
          }),
          description: "list",
        }),
      },
    });

    const data = await parseSSE(await server.handler().POST(mcpRequest("tools/list", {})));
    const text = data.result?.content?.[0]?.text;
    const parsed = text ? JSON.parse(text) : (data.result as unknown as { tools: { name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }[] });
    const tools = (parsed as { tools?: unknown[] }).tools ?? (data.result as unknown as { tools: { name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }[] }).tools;
    const listTool = (tools as { name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }[]).find((t) => t.name === "list");
    expect(listTool).toBeDefined();
    expect(Object.keys(listTool?.inputSchema.properties ?? {})).toEqual(["userArg"]);
    expect(listTool?.inputSchema.required ?? []).toEqual(["userArg"]);
  });
});

describe("findToolsWithReservedArgs", () => {
  it("returns tools whose top-level args contain reserved `_*` keys", async () => {
    const { findToolsWithReservedArgs } = await import("../src/mcp/tools/register.js");
    const result = findToolsWithReservedArgs({
      hasReserved: query(null, {
        args: makeValidator("object", {
          fields: { _mcp_apiKey: makeValidator("string"), userArg: makeValidator("string") },
        }),
        description: "with reserved",
      }),
      noReserved: query(null, {
        args: makeValidator("object", { fields: { userArg: makeValidator("string") } }),
        description: "no reserved",
      }),
      noArgs: query(null, { description: "no args" }),
      nonObjectArgs: query(null, {
        args: makeValidator("string"),
        description: "non-object args",
      }),
      emptyFields: query(null, {
        args: makeValidator("object"),
        description: "no fields",
      }),
    });

    expect(Array.from(result.entries())).toEqual([["hasReserved", ["_mcp_apiKey"]]]);
  });
});

describe("construction-time warn for unhooked `_*` args", () => {
  it("warns when tools declare `_*` args but no onToolCall hook is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      createMCPServer({
        auth: { validate: async () => true },
        convexUrl: MOCK_CONVEX_URL,
        tools: {
          tool1: query(null, {
            args: makeValidator("object", { fields: { _mcp_apiKey: makeValidator("string") } }),
            description: "tool1",
          }),
          tool2: query(null, {
            args: makeValidator("object", {
              fields: {
                _mcp_tenantId: makeValidator("string"),
                _mcp_scope: makeValidator("string"),
                userArg: makeValidator("string"),
              },
            }),
            description: "tool2",
          }),
        },
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = warnSpy.mock.calls[0]?.[0];
      expect(message).toContain("no onToolCall hook is configured");
      expect(message).toContain("tool1 (_mcp_apiKey)");
      expect(message).toContain("tool2 (_mcp_tenantId, _mcp_scope)");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not warn when an onToolCall hook is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      createMCPServer({
        auth: { validate: async () => true },
        convexUrl: MOCK_CONVEX_URL,
        hooks: { onToolCall: async () => undefined },
        tools: {
          tool1: query(null, {
            args: makeValidator("object", { fields: { _mcp_apiKey: makeValidator("string") } }),
            description: "tool1",
          }),
        },
      });

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not warn when no tools declare `_*` args", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      createMCPServer({
        auth: { validate: async () => true },
        convexUrl: MOCK_CONVEX_URL,
        tools: {
          tool1: query(null, {
            args: makeValidator("object", { fields: { userArg: makeValidator("string") } }),
            description: "tool1",
          }),
        },
      });

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("reserved-key reject logging", () => {
  it("logs a structured warn line when handler-layer reject fires", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { registerTools, prepareTools } = await import("../src/mcp/tools/register.js");
      type ToolHandler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

      const mockClient = await getMockClient();
      const captured: { handler?: ToolHandler } = {};
      const fakeServer = {
        tool: (_name: string, _desc: string, _shape: unknown, h: ToolHandler) => {
          captured.handler = h;
        },
      };

      const prepared = prepareTools({
        list: query(null, {
          args: makeValidator("object", { fields: { _mcp_apiKey: makeValidator("string") } }),
          description: "list",
        }),
      });
      registerTools(
        fakeServer as unknown as Parameters<typeof registerTools>[0],
        mockClient as unknown as Parameters<typeof registerTools>[1],
        prepared,
        undefined,
        "rid-42",
        undefined,
      );

      const handler = captured.handler;
      if (!handler) throw new Error("registerTools did not register a handler");
      await handler({ _mcp_apiKey: "spoofed", _mcp_scope: "x" });

      expect(warnSpy).toHaveBeenCalledWith(
        "[convex-mcp] reserved-key reject",
        expect.objectContaining({
          requestId: "rid-42",
          tool: "list",
          keys: ["_mcp_apiKey", "_mcp_scope"],
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
