import type { ConvexValidator } from "../types.js";

/** Kind of Convex function a tool calls. */
export type FunctionType = "action" | "mutation" | "query";

export type HookResult = OnCallResult | undefined;
export type HookReturn = HookResult | Promise<HookResult> | Promise<void>;

/** A Convex function exposed as an MCP tool; build it with `query()`, `mutation()` or `action()`. */
export type ToolDef = {
  args?: ConvexValidator;
  description?: string;
  onError?: (ctx: CallContext & { phase: "error" }) => HookReturn;
  ref: unknown;
  tags?: Record<string, string>;
  timeout?: number;
  type: FunctionType;
};

/** What lifecycle hooks receive for one tool call, in the `before`, `success` or `error` phase. */
export type CallContext = {
  /**
   * Raw bearer credential. Sensitive: use it only to validate the caller, and
   * never forward it into function args, logs or responses. Inject a derived
   * principal or scope via `extendArgs` instead.
   */
  apiKey: string | undefined;
  args: Record<string, unknown>;
  durationMs?: number;
  error?: unknown;
  phase: "before" | "error" | "success";
  requestId: string;
  result?: unknown;
  startedAt: number;
  toolDef: Omit<ToolDef, "onError" | "ref">;
  toolName: string;
};

/** What a lifecycle hook may return: abort the call, inject server-side args, or set the public error message. */
export type OnCallResult = {
  /** Set true to abort execution. Only checked during "before" phase. */
  abort?: boolean;
  /** Custom error message when aborting (before phase). Default: "Tool call rejected" */
  errorMessage?: string;
  /**
   * Server-resolved key/value pairs merged into the dispatched function's args
   * before the Convex call. Only honored during the "before" phase.
   *
   * On key collision, hook-supplied values take precedence over request args
   * (server-side wins).
   *
   * Convention: keys MUST use the framework-reserved underscore prefix
   * (e.g., `_mcp_principal`, `_request_id`). Request args never carry
   * `_`-prefixed keys to the hook: the MCP SDK drops undeclared args and the
   * handler rejects any that remain, so this prefix is safe for server-side
   * context injection (auth, tracing, multi-tenancy, audit, etc.).
   *
   * Empty objects and undefined are no-ops (no allocation, no merge).
   *
   * @example
   * ```ts
   * hooks: {
   *   onToolCall: async ({ apiKey, phase }) => {
   *     if (phase !== "before") return;
   *     const validated = await validateKey(apiKey);
   *     if (!validated.valid) return { abort: true, errorMessage: "Invalid key" };
   *     // Never forward the raw `apiKey`: args can be logged by Convex.
   *     return {
   *       extendArgs: {
   *         _mcp_principal: validated.principalId,
   *         _mcp_scopes: validated.scopes,
   *       },
   *     };
   *   },
   * }
   * ```
   */
  extendArgs?: Record<string, unknown>;
  /** Custom error message on failure (error phase). Default: "Function execution failed" */
  message?: string;
};

/**
 * Server-wide hooks; `onToolCall` runs before each tool call and after it
 * succeeds or fails. When a tool sets `onError`, only `onError` runs in the
 * error phase, not `onToolCall`.
 */
export type LifecycleHooks = {
  onToolCall?: (ctx: CallContext) => HookReturn;
};
