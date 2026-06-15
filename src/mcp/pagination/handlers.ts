import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { decodeCursor, encodeCursor } from "./cursor.js";
import type { ToolPage } from "./types.js";

type McpTool = {
  description?: string;
  inputSchema: Record<string, unknown>;
  name: string;
};

type ToolListFn = () => Promise<McpTool[]>;
type OrigHandler = (
  request: unknown,
  extra: unknown,
) => Promise<{ tools: McpTool[] }>;

/* v8 ignore start -- canary: only triggers if SDK removes tools/list handler */
function assertHandler(handler: OrigHandler | undefined): OrigHandler {
  if (!handler)
    throw new Error(
      "[convex-mcp] tools/list handler not found — SDK API may have changed.",
    );
  return handler;
}
/* v8 ignore stop */

export function getOriginalToolsList(mcpServer: McpServer): ToolListFn {
  type HandlerMap = Map<string, OrigHandler>;
  const handlers = (
    mcpServer.server as unknown as { _requestHandlers: HandlerMap }
  )._requestHandlers;
  const origHandler = assertHandler(handlers.get("tools/list"));

  return async (): Promise<McpTool[]> => {
    const result = await origHandler(
      { method: "tools/list", params: {} },
      { signal: new AbortController().signal },
    );
    return result.tools;
  };
}

async function paginateTools<T extends object>(
  tools: T[],
  method: string,
  pageSize: number,
  cursor: string,
  secret: string,
): Promise<ToolPage<T> | { error: string }> {
  let offset = 0;

  if (cursor !== "") {
    const decoded = await decodeCursor(cursor, method, secret);
    if ("error" in decoded) return { error: decoded.error };
    offset = decoded.offset;
  }

  /* v8 ignore start -- unreachable from public API: HMAC prevents crafting out-of-bounds cursors */
  if (offset >= tools.length && tools.length > 0)
    return { error: "invalid or expired cursor" };
  /* v8 ignore stop */

  const page = tools.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < tools.length;
  const nextCursor = hasMore
    ? await encodeCursor(method, offset + pageSize, secret)
    : undefined;

  return { nextCursor, tools: page };
}

export function registerPaginationHandlers(
  mcpServer: McpServer,
  getAllTools: ToolListFn,
  pageSize: number,
  secret: string,
): void {
  mcpServer.server.setRequestHandler(
    ListToolsRequestSchema,
    async (request) => {
      const cursor = request.params?.cursor;
      const allTools = await getAllTools();

      if (cursor === undefined) {
        return { tools: allTools };
      }

      const result = await paginateTools(
        allTools,
        "tools/list",
        pageSize,
        cursor,
        secret,
      );
      if ("error" in result) {
        throw new McpError(ErrorCode.InvalidParams, result.error);
      }
      return { nextCursor: result.nextCursor, tools: result.tools };
    },
  );
}

export function registerTwoPhaseHandlers(
  mcpServer: McpServer,
  getAllTools: ToolListFn,
  pageSize: number,
  secret: string,
): void {
  const listSummarySchema = z.object({
    method: z.literal("tools/list_summary"),
    params: z.object({ cursor: z.string().optional() }).optional(),
  });

  mcpServer.server.setRequestHandler(listSummarySchema, async (request) => {
    const allTools = await getAllTools();
    const summaries = allTools.map((t) => ({
      /* v8 ignore next -- both branches tested; v8 misreports ternary in .map() */
      description: t.description === undefined ? "" : t.description,
      name: t.name,
    }));

    const cursor = request.params?.cursor;
    if (cursor === undefined) {
      return { tools: summaries };
    }

    const result = await paginateTools(
      summaries,
      "tools/list_summary",
      pageSize,
      cursor,
      secret,
    );
    if ("error" in result) {
      throw new McpError(ErrorCode.InvalidParams, result.error);
    }
    return { nextCursor: result.nextCursor, tools: result.tools };
  });

  const describeSchema = z.object({
    method: z.literal("tools/describe"),
    params: z.object({ name: z.string().optional() }).optional(),
  });

  mcpServer.server.setRequestHandler(describeSchema, async (request) => {
    const name = request.params?.name;
    if (!name) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid params: 'name' is required",
      );
    }

    const allTools = await getAllTools();
    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid params: tool '${name}' not found`,
      );
    }

    return { tool };
  });
}
