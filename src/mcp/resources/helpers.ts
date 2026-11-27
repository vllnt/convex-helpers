import type { ConvexValidator } from "../types.js";

import type { ResourceDef } from "./types.js";

type ResourceOptions = {
  args?: ConvexValidator;
  description?: string;
};

/**
 * Exposes a Convex query as an MCP resource. Resources run no lifecycle hooks:
 * authorize inside the query.
 *
 * @param ref - Convex query reference
 * @param options - `args` validator for URI parameters, `description`
 * @returns The resource definition to put in `ServerConfig.resources`
 */
export function resource(
  ref: unknown,
  options: ResourceOptions = {},
): ResourceDef {
  return {
    args: options.args,
    description: options.description,
    ref,
  };
}
