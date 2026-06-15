import type { ConvexValidator } from "../types.js";

import type { CallContext, HookReturn, ToolDef } from "./types.js";

type ToolOptions = {
  args?: ConvexValidator;
  description?: string;
  onError?: (ctx: CallContext & { phase: "error" }) => HookReturn;
  tags?: Record<string, string>;
  timeout?: number;
};

export function query(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    args: options.args,
    description: options.description,
    onError: options.onError,
    ref,
    tags: options.tags,
    timeout: options.timeout,
    type: "query",
  };
}

export function mutation(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    args: options.args,
    description: options.description,
    onError: options.onError,
    ref,
    tags: options.tags,
    timeout: options.timeout,
    type: "mutation",
  };
}

export function action(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    args: options.args,
    description: options.description,
    onError: options.onError,
    ref,
    tags: options.tags,
    timeout: options.timeout,
    type: "action",
  };
}
