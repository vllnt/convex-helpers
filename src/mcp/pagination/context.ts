import type { PaginationConfig } from "./types.js";

/** Create pagination context from config. Validates pageSize >= 1. */
export function createPaginationContext(config: PaginationConfig | undefined): {
  enabled: boolean;
  pageSize: number;
  secret: string;
  twoPhaseDiscovery: boolean;
} {
  if (!config) {
    return {
      enabled: false,
      pageSize: 0,
      secret: "",
      twoPhaseDiscovery: false,
    };
  }
  if (!Number.isInteger(config.pageSize) || config.pageSize < 1) {
    throw new Error("pagination.pageSize must be a positive integer >= 1");
  }
  return {
    enabled: true,
    pageSize: config.pageSize,
    secret: crypto.randomUUID(),
    twoPhaseDiscovery: config.twoPhaseDiscovery ?? false,
  };
}
