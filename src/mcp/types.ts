export type ConvexValidator = {
  element?: ConvexValidator;
  fields?: Record<string, ConvexValidator>;
  isOptional: "optional" | "required";
  key?: ConvexValidator;
  kind: string;
  members?: ConvexValidator[];
  tableName?: string;
  value?: unknown;
};

/**
 * Injectable Convex client interface. Compatible with both ConvexHttpClient
 * (production) and convex-test's `t` (testing).
 *
 * Uses `any` for functionRef because Convex's FunctionReference is a complex
 * generic that cannot be expressed without importing convex internals.
 */
export type ConvexClient = {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  action(functionRef: any, ...arguments_: any[]): Promise<any>;
  mutation(functionRef: any, ...arguments_: any[]): Promise<any>;
  query(functionRef: any, ...arguments_: any[]): Promise<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
};

export type AuthConfig = {
  convexToken?: (
    apiKey: string,
  ) => Promise<string | undefined> | string | undefined;
  validate: (apiKey: string) => boolean | Promise<boolean>;
};

import type { PaginationConfig } from "./pagination/types.js";
import type { ResourceDef } from "./resources/types.js";
import type { LifecycleHooks, ToolDef } from "./tools/types.js";

export type { PaginationConfig, ResourceDef, ToolDef };

export type ServerConfig = {
  auth: AuthConfig;
  client?: ConvexClient;
  convexUrl?: string;
  hooks?: LifecycleHooks;
  name?: string;
  pagination?: PaginationConfig;
  resources?: Record<string, ResourceDef>;
  tools?: Record<string, ToolDef>;
  version?: string;
};

export type ConvexMCPServer = {
  handler: () => {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
};

export { type ToolPage, type ToolSummary } from "./pagination/types.js";
export {
  type CallContext,
  type FunctionType,
  type LifecycleHooks,
  type OnCallResult,
} from "./tools/types.js";
