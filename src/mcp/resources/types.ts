import type { ConvexValidator } from "../types.js";

/** A Convex query exposed as an MCP resource; build it with `resource()`. */
export type ResourceDef = {
  args?: ConvexValidator;
  description?: string;
  ref: unknown;
};
