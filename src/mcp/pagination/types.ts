/**
 * Opt-in pagination for `tools/list` and two-phase tool discovery.
 *
 * `pageSize` is required for all pagination features including `twoPhaseDiscovery`.
 * Must be an integer >= 1. When enabled, `tools/list` without a cursor still returns ALL tools
 * (backwards-compatible). Cursor pagination activates only when the client sends a cursor;
 * send `cursor: ""` for the first page.
 *
 * `twoPhaseDiscovery` enables non-standard custom MCP methods (`tools/list_summary`,
 * `tools/describe`). These are NOT part of the MCP spec — only custom agents that
 * explicitly call these methods will benefit.
 */
export type PaginationConfig = {
  /** Number of tools per page when client sends a cursor. Must be an integer >= 1. */
  pageSize: number;
  /** Enable `tools/list_summary` + `tools/describe` custom methods. Default: false. */
  twoPhaseDiscovery?: boolean;
};

/** Name and description of one tool, as returned by `tools/list_summary`. */
export type ToolSummary = {
  description: string;
  name: string;
};

/** One page of a paginated tool list; `nextCursor` is set while more pages remain. */
export type ToolPage<T extends object> = {
  nextCursor?: string;
  tools: T[];
};
