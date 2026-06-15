/**
 * Opt-in pagination for `tools/list` and two-phase tool discovery.
 *
 * `pageSize` is required for all pagination features including `twoPhaseDiscovery`.
 * Must be >= 1. When enabled, `tools/list` without a cursor still returns ALL tools
 * (backwards-compatible). Cursor pagination activates only when the client sends a cursor.
 *
 * `twoPhaseDiscovery` enables non-standard custom MCP methods (`tools/list_summary`,
 * `tools/describe`). These are NOT part of the MCP spec — only custom agents that
 * explicitly call these methods will benefit.
 */
export type PaginationConfig = {
  /** Number of tools per page when client sends a cursor. Must be >= 1. */
  pageSize: number;
  /** Enable `tools/list_summary` + `tools/describe` custom methods. Default: false. */
  twoPhaseDiscovery?: boolean;
};

export type ToolSummary = {
  description: string;
  name: string;
};

export type ToolPage<T extends object> = {
  nextCursor?: string;
  tools: T[];
};
