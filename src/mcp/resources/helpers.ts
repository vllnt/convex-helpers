import type { ConvexValidator } from "../types.js";

import type { ResourceDef } from "./types.js";

type ResourceOptions = {
  args?: ConvexValidator;
  description?: string;
};

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
