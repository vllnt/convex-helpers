import type { ConvexValidator } from "../types.js";

export type ResourceDef = {
  args?: ConvexValidator;
  description?: string;
  ref: unknown;
};
