import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

import type { ConvexClient } from "../types.js";
import { convexArgsToZod as convexArgumentsToZod } from "../validators.js";

import type {
  CallContext,
  LifecycleHooks,
  OnCallResult,
  ToolDef,
} from "./types.js";

type PreparedTool = {
  description: string;
  name: string;
  toolDef: ToolDef;
  zodShape: Record<string, z.ZodTypeAny>;
};

/**
 * Underscore-prefixed arg keys are reserved for framework-injected context.
 *
 * - Request args containing `_*` keys are rejected before hook invocation.
 * - Tool-level Convex validators MAY declare `_*` fields so the action
 *   handler receives server-injected values; these are stripped from the
 *   published JSON Schema so MCP clients neither see nor pass them.
 */
function isReservedKey(key: string): boolean {
  return key.startsWith("_");
}

function stripReservedFromShape(
  shape: Record<string, z.ZodTypeAny>,
): Record<string, z.ZodTypeAny> {
  const filtered: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(shape)) {
    if (!isReservedKey(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function prepareTools(tools: Record<string, ToolDef>): PreparedTool[] {
  return Object.entries(tools).map(([name, toolDef]) => {
    const zodSchema = toolDef.args
      ? convexArgumentsToZod(toolDef.args)
      : undefined;
    const fullShape = zodSchema?.shape ?? {};
    return {
      description: toolDef.description ?? "",
      name,
      toolDef,
      zodShape: stripReservedFromShape(fullShape),
    };
  });
}

/**
 * Returns tools whose top-level args contain reserved `_*` keys.
 *
 * Used by `createMCPServer` at construction to surface a footgun: a tool that
 * declares `_*` args without an `onToolCall` hook will have those args stripped
 * from the published schema and never injected, so every dispatched call will
 * fail Convex's own validator with "missing required arg".
 */
export function findToolsWithReservedArgs(
  tools: Record<string, ToolDef>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [name, toolDef] of Object.entries(tools)) {
    if (toolDef.args?.kind !== "object" || !toolDef.args.fields) continue;
    const reserved = Object.keys(toolDef.args.fields).filter(isReservedKey);
    if (reserved.length > 0) result.set(name, reserved);
  }
  return result;
}

async function invokeHook(
  hooks: LifecycleHooks | undefined,
  ctx: CallContext,
  toolDef: ToolDef,
): Promise<OnCallResult | undefined> {
  try {
    if (ctx.phase === "error" && toolDef.onError) {
      const result = await toolDef.onError(
        ctx as CallContext & { phase: "error" },
      );
      return result ?? undefined;
    }
    if (hooks?.onToolCall) {
      const result = await hooks.onToolCall(ctx);
      return result ?? undefined;
    }
    return;
  } catch (hookError) {
    console.error("[convex-mcp] hook error (swallowed)", {
      error: hookError,
      phase: ctx.phase,
      requestId: ctx.requestId,
      tool: ctx.toolName,
    });
    return;
  }
}

function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs) return promise;

  let handle: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => {
      clearTimeout(handle);
    }),
    new Promise<never>((_, reject) => {
      handle = setTimeout(() => {
        reject(new Error("Tool execution timed out"));
      }, timeoutMs);
    }),
  ]);
}

export function registerTools(
  mcpServer: McpServer,
  client: ConvexClient,
  tools: PreparedTool[],
  hooks: LifecycleHooks | undefined,
  requestId: string,
  apiKey: string | undefined,
): void {
  for (const { description, name, toolDef, zodShape } of tools) {
    mcpServer.tool(
      name,
      description,
      zodShape,
      async (arguments_: Record<string, unknown>) => {
        const startedAt = Date.now();
        const { onError: _onError, ref: _ref, ...safeDef } = toolDef;

        const reservedKeys = Object.keys(arguments_).filter(isReservedKey);
        if (reservedKeys.length > 0) {
          console.warn("[convex-mcp] reserved-key reject", {
            keys: reservedKeys,
            requestId,
            tool: name,
          });
          return {
            content: [
              {
                text:
                  `Reserved arg keys not allowed in request: ${reservedKeys.join(", ")}. ` +
                  `Keys starting with "_" are reserved for framework-injected context.`,
                type: "text" as const,
              },
            ],
            isError: true,
          };
        }

        const baseCtx = {
          apiKey,
          args: arguments_,
          requestId,
          startedAt,
          toolDef: safeDef,
          toolName: name,
        };

        const beforeCtx: CallContext = { ...baseCtx, phase: "before" };
        const beforeResult = await invokeHook(hooks, beforeCtx, toolDef);
        if (beforeResult?.abort) {
          return {
            content: [
              {
                text: beforeResult.errorMessage ?? "Tool call rejected",
                type: "text" as const,
              },
            ],
            isError: true,
          };
        }

        const dispatchArguments =
          beforeResult?.extendArgs &&
          Object.keys(beforeResult.extendArgs).length > 0
            ? { ...arguments_, ...beforeResult.extendArgs }
            : arguments_;

        try {
          const callPromise = (async () => {
            switch (toolDef.type) {
              case "query":
                return await client.query(toolDef.ref, dispatchArguments);
              case "mutation":
                return await client.mutation(toolDef.ref, dispatchArguments);
              case "action":
                return await client.action(toolDef.ref, dispatchArguments);
              default:
                throw new Error(
                  `Unknown function type: ${String(toolDef.type)}`,
                );
            }
          })();

          const result = await executeWithTimeout(callPromise, toolDef.timeout);
          const durationMs = Date.now() - startedAt;

          const successCtx: CallContext = {
            ...baseCtx,
            durationMs,
            phase: "success",
            result,
          };
          await invokeHook(hooks, successCtx, toolDef);

          return {
            content: [
              {
                text: JSON.stringify(result ?? null, null, 2),
                type: "text" as const,
              },
            ],
          };
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const errorCtx: CallContext = {
            ...baseCtx,
            durationMs,
            error,
            phase: "error",
          };

          const errorResult = await invokeHook(hooks, errorCtx, toolDef);
          const errorMessage =
            errorResult?.message ?? "Function execution failed";

          console.error("[convex-mcp] tool execution failed", {
            durationMs,
            error,
            requestId,
            tool: name,
          });

          return {
            content: [{ text: errorMessage, type: "text" as const }],
            isError: true,
          };
        }
      },
    );
  }
}
