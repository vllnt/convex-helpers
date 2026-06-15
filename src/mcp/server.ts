import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ConvexHttpClient } from "convex/browser";

import { validateRequest } from "./auth.js";
import { createPaginationContext } from "./pagination/context.js";
import {
  getOriginalToolsList,
  registerPaginationHandlers,
  registerTwoPhaseHandlers,
} from "./pagination/handlers.js";
import { prepareResources, registerResources } from "./resources/register.js";
import {
  findToolsWithReservedArgs as findToolsWithReservedArguments,
  prepareTools,
  registerTools,
} from "./tools/register.js";
import type { ConvexClient, ConvexMCPServer, ServerConfig } from "./types.js";

function createDefaultClient(
  convexUrl: string,
  convexToken?: string,
): ConvexClient {
  const client = new ConvexHttpClient(convexUrl);
  if (convexToken) {
    client.setAuth(convexToken);
  }
  return client;
}

function addRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function createMCPServer(config: ServerConfig): ConvexMCPServer {
  if (!config.auth?.validate) {
    throw new Error(
      "Auth is required. Provide auth.validate to createMCPServer(). " +
        "This package enforces default-deny — no open MCP endpoints.",
    );
  }

  const injectedClient = config.client;

  if (injectedClient && config.auth.convexToken) {
    throw new Error(
      "Cannot use both 'client' and 'auth.convexToken'. When providing a custom client, " +
        "handle auth token propagation in your client implementation directly.",
    );
  }

  let resolvedConvexUrl: string | undefined;
  if (!injectedClient) {
    resolvedConvexUrl =
      config.convexUrl ??
      process.env.CONVEX_URL ??
      process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!resolvedConvexUrl) {
      throw new Error(
        "Convex URL not found. Set CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable, " +
          "or pass convexUrl or client to createMCPServer().",
      );
    }
  }

  const serverName = config.name ?? "convex-mcp";
  const serverVersion = config.version ?? "0.1.0";
  const hooks = config.hooks;

  const prepared = prepareTools(config.tools ?? {});
  const preparedRes = prepareResources(config.resources ?? {});
  const paginationCtx = createPaginationContext(config.pagination);

  if (!hooks?.onToolCall) {
    const stripped = findToolsWithReservedArguments(config.tools ?? {});
    if (stripped.size > 0) {
      const summary = [...stripped.entries()]
        .map(([tool, keys]) => `${tool} (${keys.join(", ")})`)
        .join("; ");
      console.warn(
        `[convex-mcp] tools declare reserved \`_*\` args but no onToolCall hook is configured. ` +
          `These args are stripped from the published schema and will never be injected, ` +
          `so every dispatched call will fail Convex validation. ` +
          `Configure hooks.onToolCall to inject them via extendArgs. Affected tools: ${summary}`,
      );
    }
  }

  function createServerAndTransport(
    requestId: string,
    convexToken?: string,
    apiKey?: string,
  ): {
    mcpServer: McpServer;
    transport: WebStandardStreamableHTTPServerTransport;
  } {
    const mcpServer = new McpServer({
      name: serverName,
      version: serverVersion,
    });

    let client: ConvexClient;
    if (injectedClient) {
      client = injectedClient;
    } else {
      /* v8 ignore start -- configuration validation guarantees a URL when no client is injected */
      if (!resolvedConvexUrl)
        throw new Error("Convex URL not found after configuration validation.");
      /* v8 ignore stop */
      client = createDefaultClient(resolvedConvexUrl, convexToken);
    }

    registerTools(mcpServer, client, prepared, hooks, requestId, apiKey);
    registerResources(mcpServer, client, preparedRes);

    // CRITICAL: Override MUST happen AFTER registerTools() — McpServer's lazy-init
    // registers the default tools/list handler on the first tool() call.
    // Overriding before would cause assertCanSetRequestHandler to throw.
    const hasTools = prepared.length > 0;
    if (hasTools && paginationCtx.enabled) {
      const getAllTools = getOriginalToolsList(mcpServer);
      registerPaginationHandlers(
        mcpServer,
        getAllTools,
        paginationCtx.pageSize,
        paginationCtx.secret,
      );
      if (paginationCtx.twoPhaseDiscovery) {
        registerTwoPhaseHandlers(
          mcpServer,
          getAllTools,
          paginationCtx.pageSize,
          paginationCtx.secret,
        );
      }
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    return { mcpServer, transport };
  }

  return {
    handler() {
      return {
        async GET(request: Request): Promise<Response> {
          const requestId = crypto.randomUUID();
          const authResult = await validateRequest(request, config.auth);
          if (!authResult.valid)
            return addRequestId(authResult.response, requestId);

          const { mcpServer, transport } = createServerAndTransport(
            requestId,
            authResult.convexToken,
            authResult.apiKey,
          );
          await mcpServer.connect(transport);
          const response = await transport.handleRequest(request);
          return addRequestId(response, requestId);
        },
        async POST(request: Request): Promise<Response> {
          const requestId = crypto.randomUUID();
          const authResult = await validateRequest(request, config.auth);
          if (!authResult.valid)
            return addRequestId(authResult.response, requestId);

          const contentType = request.headers.get("content-type");
          if (!contentType?.includes("application/json")) {
            return addRequestId(
              new Response(
                JSON.stringify({
                  error: {
                    code: -32_700,
                    message:
                      "Unsupported Media Type: expected application/json",
                  },
                  id: null,
                  jsonrpc: "2.0",
                }),
                {
                  headers: { "Content-Type": "application/json" },
                  status: 415,
                },
              ),
              requestId,
            );
          }

          const { mcpServer, transport } = createServerAndTransport(
            requestId,
            authResult.convexToken,
            authResult.apiKey,
          );
          await mcpServer.connect(transport);
          const response = await transport.handleRequest(request);
          return addRequestId(response, requestId);
        },
      };
    },
  };
}
