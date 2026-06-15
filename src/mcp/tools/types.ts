import type { ConvexValidator } from "../types.js";

export type FunctionType = "action" | "mutation" | "query";

export type HookResult = OnCallResult | undefined;
export type HookReturn = HookResult | Promise<HookResult> | Promise<void>;

export type ToolDef = {
  args?: ConvexValidator;
  description?: string;
  onError?: (ctx: CallContext & { phase: "error" }) => HookReturn;
  ref: unknown;
  tags?: Record<string, string>;
  timeout?: number;
  type: FunctionType;
};

export type CallContext = {
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
   * (e.g., `_mcp_apiKey`, `_request_id`). Request args containing `_`-prefixed
   * keys are rejected before the hook runs, so this prefix is safe for
   * server-side context injection (auth, tracing, multi-tenancy, audit, etc.).
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
   *     return {
   *       extendArgs: {
   *         _mcp_apiKey: apiKey,
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

export type LifecycleHooks = {
  onToolCall?: (ctx: CallContext) => HookReturn;
};
