import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { stringifyConvex } from "../serialization.js";
import type { ConvexClient } from "../types.js";
import { convexArgsToZod } from "../validators.js";

import type { ResourceDef } from "./types.js";

type PreparedResource = {
  argsSchema: ReturnType<typeof convexArgsToZod> | undefined;
  description: string | undefined;
  resourceDef: ResourceDef;
  template: ResourceTemplate;
  uriPattern: string;
};

export function prepareResources(
  resources: Record<string, ResourceDef>,
): PreparedResource[] {
  return Object.entries(resources).map(([uriPattern, resourceDef]) => ({
    argsSchema: resourceDef.args
      ? convexArgsToZod(resourceDef.args)
      : undefined,
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
  for (const {
    argsSchema,
    description,
    resourceDef,
    template,
    uriPattern,
  } of resources) {
    mcpServer.resource(
      uriPattern,
      template,
      {
        description,
        mimeType: "application/json",
      },
      async (uri, parameters: Record<string, unknown>) => {
        try {
          const validatedParameters =
            argsSchema?.parse(parameters) ?? parameters;
          const result = await client.query(
            resourceDef.ref,
            validatedParameters,
          );
          return {
            contents: [
              {
                mimeType: "application/json",
                text: stringifyConvex(result),
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
