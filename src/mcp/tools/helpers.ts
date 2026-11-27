import type { ConvexValidator } from "../types.js";

import type { CallContext, HookReturn, ToolDef } from "./types.js";

type ToolOptions = {
  args?: ConvexValidator;
  description?: string;
  onError?: (ctx: CallContext & { phase: "error" }) => HookReturn;
  tags?: Record<string, string>;
  timeout?: number;
};

/**
 * Exposes a Convex query as an MCP tool.
 *
 * @param ref - Convex function reference, e.g. `api.tasks.list`
 * @param options - `args` validator, `description`, `tags`, `timeout` (ms), `onError`
 * @returns The tool definition to put in `ServerConfig.tools`
 */
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

/**
 * Exposes a Convex mutation as an MCP tool. Setting `timeout` throws at server creation.
 *
 * @param ref - Convex function reference, e.g. `api.tasks.create`
 * @param options - `args` validator, `description`, `tags`, `onError`
 * @returns The tool definition to put in `ServerConfig.tools`
 */
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

/**
 * Exposes a Convex action as an MCP tool. Setting `timeout` throws at server creation.
 *
 * @param ref - Convex function reference, e.g. `api.tasks.sync`
 * @param options - `args` validator, `description`, `tags`, `onError`
 * @returns The tool definition to put in `ServerConfig.tools`
 */
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
