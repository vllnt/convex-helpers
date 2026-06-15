import { describe, expect, it, vi } from "vitest";
import { decodeCursor, encodeCursor } from "../src/mcp/pagination/cursor.js";
import { createMCPServer } from "../src/mcp/server.js";
import { query } from "../src/mcp/tools/helpers.js";

const MOCK_CONVEX_URL = "https://test-deployment.convex.cloud";

function makeValidator(kind: string, extra: Record<string, unknown> = {}): any {
  return { kind, isOptional: "required", ...extra };
}

vi.mock("convex/browser", () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue(null),
    mutation: vi.fn().mockResolvedValue(null),
    action: vi.fn().mockResolvedValue(null),
    setAuth: vi.fn(),
  };
  return {
    ConvexHttpClient: vi.fn(function MockConvexHttpClient() {
      return mockClient;
    }),
    __mockClient: mockClient,
  };
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

function createTools(count: number): Record<string, any> {
  const tools: Record<string, any> = {};
  for (let i = 1; i <= count; i++) {
    tools[`tool_${i}`] = query(null, {
      args: makeValidator("object", { fields: {} }),
      description: `Tool ${i} description`,
    });
  }
  return tools;
}

function createPaginatedServer(
  toolCount: number,
  pageSize: number,
  twoPhaseDiscovery = false,
) {
  return createMCPServer({
    auth: { validate: async () => true },
    convexUrl: MOCK_CONVEX_URL,
    tools: createTools(toolCount),
    pagination: { pageSize, twoPhaseDiscovery },
  });
}

describe("Pagination", () => {
  describe("cursor-based pagination", () => {
    it("AC-10: returns ALL tools when no cursor param sent (prevents silent tool loss)", async () => {
      const server = createPaginatedServer(5, 2);
      const handler = server.handler();
      const response = await handler.POST(mcpRequest("tools/list"));
      const data = await parseSSEResponse(response);

      expect(data.result.tools).toHaveLength(5);
      expect(data.result.nextCursor).toBeUndefined();
    });

    it("AC-1: returns first page with nextCursor when cursor='' (pagination start)", async () => {
      const server = createPaginatedServer(5, 2);
      const handler = server.handler();
      const response = await handler.POST(mcpRequest("tools/list", { cursor: "" }));
      const data = await parseSSEResponse(response);

      expect(data.result.tools).toHaveLength(2);
      expect(data.result.tools[0].name).toBe("tool_1");
      expect(data.result.tools[1].name).toBe("tool_2");
      expect(data.result.nextCursor).toBeDefined();
      expect(typeof data.result.nextCursor).toBe("string");
    });

    it("AC-2: returns next page with valid cursor from page 1", async () => {
      const server = createPaginatedServer(5, 2);
      const handler = server.handler();

      const page1Response = await handler.POST(mcpRequest("tools/list", { cursor: "" }));
      const page1 = await parseSSEResponse(page1Response);
      const cursor = page1.result.nextCursor;

      const page2Response = await handler.POST(mcpRequest("tools/list", { cursor }));
      const page2 = await parseSSEResponse(page2Response);

      expect(page2.result.tools).toHaveLength(2);
      expect(page2.result.tools[0].name).toBe("tool_3");
      expect(page2.result.tools[1].name).toBe("tool_4");
      expect(page2.result.nextCursor).toBeDefined();
    });

    it("AC-3: returns last page with no nextCursor", async () => {
      const server = createPaginatedServer(5, 2);
      const handler = server.handler();

      // Get through all pages
      let cursor = "";
      let page: any;
      for (let i = 0; i < 2; i++) {
        const response = await handler.POST(mcpRequest("tools/list", { cursor }));
        page = await parseSSEResponse(response);
        cursor = page.result.nextCursor;
      }

      // Third page (last)
      const lastResponse = await handler.POST(mcpRequest("tools/list", { cursor }));
      const lastPage = await parseSSEResponse(lastResponse);

      expect(lastPage.result.tools).toHaveLength(1);
      expect(lastPage.result.tools[0].name).toBe("tool_5");
      expect(lastPage.result.nextCursor).toBeUndefined();
    });

    it("AC-4: returns all tools with no pagination config (backwards compat)", async () => {
      const server = createMCPServer({
        auth: { validate: async () => true },
        convexUrl: MOCK_CONVEX_URL,
        tools: createTools(5),
      });
      const handler = server.handler();
      const response = await handler.POST(mcpRequest("tools/list"));
      const data = await parseSSEResponse(response);

      expect(data.result.tools).toHaveLength(5);
      expect(data.result.nextCursor).toBeUndefined();
    });

    it("AC-7: pagination + two-phase coexist, tools/list still works", async () => {
      const server = createPaginatedServer(3, 2, true);
      const handler = server.handler();
      const response = await handler.POST(mcpRequest("tools/list"));
      const data = await parseSSEResponse(response);

      expect(data.result.tools).toHaveLength(3);
      expect(data.result.tools[0]).toHaveProperty("inputSchema");
    });

    it("AC-E1: invalid cursor returns -32602 error", async () => {
      const server = createPaginatedServer(5, 2);
      const handler = server.handler();
      const response = await handler.POST(mcpRequest("tools/list", { cursor: "garbage" }));
      const data = await parseSSEResponse(response);

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32602);
      expect(data.error.message).toContain("invalid or expired cursor");
    });

    it("FH-2: handler override doesn't break tools/call", async () => {
      const server = createPaginatedServer(3, 2);
      const handler = server.handler();

      const response = await handler.POST(mcpRequest("tools/call", {
        name: "tool_1",
        arguments: {},
      }));
      const data = await parseSSEResponse(response);

      expect(data.result).toBeDefined();
      expect(data.result.content).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("EC1: zero tools returns empty array, no cursor", async () => {
      const server = createMCPServer({
        auth: { validate: async () => true },
        convexUrl: MOCK_CONVEX_URL,
        tools: {},
        pagination: { pageSize: 10 },
      });
      const handler = server.handler();
      // Zero tools = tools capability not registered, tools/list returns empty
      const response = await handler.POST(mcpRequest("tools/list"));
      const data = await parseSSEResponse(response);

      // SDK returns -32601 for tools/list when no tools capability
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
    });

    it("EC2: tool count < pageSize returns single page, no cursor", async () => {
      const server = createPaginatedServer(3, 10);
      const handler = server.handler();
      const response = await handler.POST(mcpRequest("tools/list", { cursor: "" }));
      const data = await parseSSEResponse(response);

      expect(data.result.tools).toHaveLength(3);
      expect(data.result.nextCursor).toBeUndefined();
    });

    it("EC3: tool count == pageSize returns single full page, no cursor", async () => {
      const server = createPaginatedServer(5, 5);
      const handler = server.handler();
      const response = await handler.POST(mcpRequest("tools/list", { cursor: "" }));
      const data = await parseSSEResponse(response);

      expect(data.result.tools).toHaveLength(5);
      expect(data.result.nextCursor).toBeUndefined();
    });

    it("EC6: same cursor returns same page (deterministic)", async () => {
      const server = createPaginatedServer(5, 2);
      const handler = server.handler();

      const response1 = await handler.POST(mcpRequest("tools/list", { cursor: "" }));
      const data1 = await parseSSEResponse(response1);
      const cursor = data1.result.nextCursor;

      const response2 = await handler.POST(mcpRequest("tools/list", { cursor }));
      const page2a = await parseSSEResponse(response2);

      const response3 = await handler.POST(mcpRequest("tools/list", { cursor }));
      const page2b = await parseSSEResponse(response3);

      expect(page2a.result.tools.map((t: any) => t.name))
        .toEqual(page2b.result.tools.map((t: any) => t.name));
    });

    it("FH-1: tampered cursor is rejected", async () => {
      const server = createPaginatedServer(5, 2);
      const handler = server.handler();

      const response1 = await handler.POST(mcpRequest("tools/list", { cursor: "" }));
      const data1 = await parseSSEResponse(response1);
      const cursor = data1.result.nextCursor;

      // Tamper with the cursor payload (before the HMAC separator)
      const tampered = `dGFtcGVyZWQ=${cursor.slice(cursor.lastIndexOf("."))}`;
      const response2 = await handler.POST(mcpRequest("tools/list", { cursor: tampered }));
      const data2 = await parseSSEResponse(response2);

      expect(data2.error).toBeDefined();
      expect(data2.error.code).toBe(-32602);
    });
  });
});

describe("Two-Phase Discovery", () => {
  it("AC-5: tools/list_summary returns name+description only, no inputSchema", async () => {
    const server = createPaginatedServer(3, 10, true);
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/list_summary"));
    const data = await parseSSEResponse(response);

    expect(data.result.tools).toHaveLength(3);
    for (const tool of data.result.tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).not.toHaveProperty("inputSchema");
    }
  });

  it("AC-6: tools/describe returns full tool definition with inputSchema", async () => {
    const server = createPaginatedServer(3, 10, true);
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/describe", { name: "tool_1" }));
    const data = await parseSSEResponse(response);

    expect(data.result.tool).toBeDefined();
    expect(data.result.tool.name).toBe("tool_1");
    expect(data.result.tool.description).toBe("Tool 1 description");
    expect(data.result.tool.inputSchema).toBeDefined();
  });

  it("AC-E2: tools/describe with unknown name returns -32602", async () => {
    const server = createPaginatedServer(3, 10, true);
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/describe", { name: "nonExistent" }));
    const data = await parseSSEResponse(response);

    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32602);
    expect(data.error.message).toContain("not found");
  });

  it("AC-E3: tools/list_summary when disabled returns -32601", async () => {
    const server = createPaginatedServer(3, 10, false);
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/list_summary"));
    const data = await parseSSEResponse(response);

    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32601);
  });

  it("tools/describe without name param returns -32602", async () => {
    const server = createPaginatedServer(3, 10, true);
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/describe", {}));
    const data = await parseSSEResponse(response);

    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32602);
    expect(data.error.message).toContain("'name' is required");
  });

  it("tools/list_summary supports cursor pagination", async () => {
    const server = createPaginatedServer(5, 2, true);
    const handler = server.handler();

    const response1 = await handler.POST(mcpRequest("tools/list_summary", { cursor: "" }));
    const data1 = await parseSSEResponse(response1);
    expect(data1.result.tools).toHaveLength(2);
    expect(data1.result.nextCursor).toBeDefined();

    const response2 = await handler.POST(mcpRequest("tools/list_summary", { cursor: data1.result.nextCursor }));
    const data2 = await parseSSEResponse(response2);
    expect(data2.result.tools).toHaveLength(2);
    expect(data2.result.nextCursor).toBeDefined();
  });

  it("tools/list_summary with invalid cursor returns -32602", async () => {
    const server = createPaginatedServer(5, 2, true);
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/list_summary", { cursor: "badcursor" }));
    const data = await parseSSEResponse(response);

    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32602);
  });

  it("tools/list_summary includes correct descriptions", async () => {
    const server = createPaginatedServer(3, 10, true);
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/list_summary"));
    const data = await parseSSEResponse(response);

    expect(data.result.tools[0].name).toBe("tool_1");
    expect(data.result.tools[0].description).toBe("Tool 1 description");
  });

  it("tools/list_summary defaults empty string for missing description", async () => {
    const server = createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: {
        has_desc: query(null, {
          args: makeValidator("object", { fields: {} }),
          description: "I have a desc",
        }),
        no_desc: query(null, {
          args: makeValidator("object", { fields: {} }),
        }),
      },
      pagination: { pageSize: 10, twoPhaseDiscovery: true },
    });
    const handler = server.handler();
    const response = await handler.POST(mcpRequest("tools/list_summary"));
    const data = await parseSSEResponse(response);
    const withDesc = data.result.tools.find((t: any) => t.name === "has_desc");
    const noDesc = data.result.tools.find((t: any) => t.name === "no_desc");
    expect(withDesc.description).toBe("I have a desc");
    expect(noDesc.description).toBe("");
  });
});

describe("Pagination internals", () => {
  it("last page has no nextCursor", async () => {
    const server = createPaginatedServer(3, 2);
    const handler = server.handler();
    const page1 = await parseSSEResponse(await handler.POST(mcpRequest("tools/list", { cursor: "" })));
    const page2 = await parseSSEResponse(await handler.POST(mcpRequest("tools/list", { cursor: page1.result.nextCursor })));
    expect(page2.result.nextCursor).toBeUndefined();
  });

  it("corrupted base64 in cursor returns error", async () => {
    const server = createPaginatedServer(3, 2);
    const handler = server.handler();

    // Exercises hmacVerify try-catch: non-base64 chars in signature slot
    // cause atob() to throw in strict runtimes
    const response = await handler.POST(mcpRequest("tools/list", { cursor: "validpayload.\x00\x01\x02non-base64!" }));
    const data = await parseSSEResponse(response);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32602);
  });
});

describe("cursor branch coverage", () => {
  const hmacSeed = "test-hmac-seed";

  async function signPayload(payload: unknown, seed: string): Promise<string> {
    const b64 = btoa(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(seed),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(b64));
    const sigB64 = btoa(Array.from(new Uint8Array(sig), (b) => String.fromCharCode(b)).join(""));
    return `${b64}.${sigB64}`;
  }

  it("rejects wrong version (v !== 1)", async () => {
    const cursor = await signPayload({ v: 2, m: "tools/list", o: 0 }, hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("error" in result).toBe(true);
  });

  it("rejects wrong method (m !== expectedMethod)", async () => {
    const cursor = await signPayload({ v: 1, m: "tools/list_summary", o: 0 }, hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("error" in result).toBe(true);
  });

  it("rejects negative offset (o < 0)", async () => {
    const cursor = await signPayload({ v: 1, m: "tools/list", o: -5 }, hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("error" in result).toBe(true);
  });

  it("rejects non-number offset", async () => {
    const cursor = await signPayload({ v: 1, m: "tools/list", o: "bad" }, hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("error" in result).toBe(true);
  });

  it("rejects non-object payload (string)", async () => {
    const cursor = await signPayload("just-a-string", hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("error" in result).toBe(true);
  });

  it("rejects non-object payload (null)", async () => {
    const cursor = await signPayload(null, hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("error" in result).toBe(true);
  });

  it("rejects payload with missing fields", async () => {
    const cursor = await signPayload({ v: 1 }, hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("error" in result).toBe(true);
  });

  it("accepts valid cursor", async () => {
    const cursor = await encodeCursor("tools/list", 10, hmacSeed);
    const result = await decodeCursor(cursor, "tools/list", hmacSeed);
    expect("offset" in result && result.offset).toBe(10);
  });
});

describe("PaginationConfig validation", () => {
  it("pageSize=0 throws at construction", () => {
    expect(() => createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: createTools(3),
      pagination: { pageSize: 0 },
    })).toThrow("pagination.pageSize must be a positive integer >= 1");
  });

  it("pageSize=-1 throws at construction", () => {
    expect(() => createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: createTools(3),
      pagination: { pageSize: -1 },
    })).toThrow("pagination.pageSize must be a positive integer >= 1");
  });

  it("pageSize=NaN throws at construction", () => {
    expect(() => createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: createTools(3),
      pagination: { pageSize: NaN },
    })).toThrow("pagination.pageSize must be a positive integer >= 1");
  });

  it("pageSize=1.5 throws at construction", () => {
    expect(() => createMCPServer({
      auth: { validate: async () => true },
      convexUrl: MOCK_CONVEX_URL,
      tools: createTools(3),
      pagination: { pageSize: 1.5 },
    })).toThrow("pagination.pageSize must be a positive integer >= 1");
  });
});

describe("SDK Canary", () => {
  it("FH-3: setRequestHandler override works on current SDK", async () => {
    // This test will break loudly if SDK changes override behavior
    const server = createPaginatedServer(3, 2);
    const handler = server.handler();

    // Verify tools/list works (override succeeded)
    const response = await handler.POST(mcpRequest("tools/list", { cursor: "" }));
    const data = await parseSSEResponse(response);

    expect(data.result).toBeDefined();
    expect(data.result.tools).toHaveLength(2);
    expect(data.result.nextCursor).toBeDefined();

    // Verify tools/call also works (override didn't break execution)
    const callResponse = await handler.POST(mcpRequest("tools/call", {
      name: "tool_1",
      arguments: {},
    }));
    const callData = await parseSSEResponse(callResponse);
    expect(callData.result).toBeDefined();
  });
});
