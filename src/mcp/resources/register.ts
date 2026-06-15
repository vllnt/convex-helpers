import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ConvexClient } from "../types.js";

import type { ResourceDef } from "./types.js";

type PreparedResource = {
  description: string | undefined;
  resourceDef: ResourceDef;
  template: ResourceTemplate;
  uriPattern: string;
};

export function prepareResources(
  resources: Record<string, ResourceDef>,
): PreparedResource[] {
  return Object.entries(resources).map(([uriPattern, resourceDef]) => ({
    description: resourceDef.description,
    resourceDef,
    template: new ResourceTemplate(uriPattern, { list: undefined }),
    uriPattern,
  }));
}

export function registerResources(
  mcpServer: McpServer,
  client: ConvexClient,
  resources: PreparedResource[],
): void {
  for (const { description, resourceDef, template, uriPattern } of resources) {
    mcpServer.resource(
      uriPattern,
      template,
      {
        description,
        mimeType: "application/json",
      },
      async (uri, parameters: Record<string, unknown>) => {
        try {
          const result = await client.query(resourceDef.ref, parameters);
          return {
            contents: [
              {
                mimeType: "application/json",
                text: JSON.stringify(result ?? null, null, 2),
                uri: uri.href,
              },
            ],
          };
        } catch (error) {
          console.error("[convex-mcp] resource read failed", {
            error,
            resource: uriPattern,
          });
          // Mask the raw Convex error from the client (parity with the tool
          // handler); the real error is logged server-side above.
          throw new Error("Resource read failed");
        }
      },
    );
  }
}
