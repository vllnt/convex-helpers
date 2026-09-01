import { describe, expect, it } from "vitest";
import { stringifyConvex } from "../src/mcp/serialization.js";

describe("stringifyConvex", () => {
  it("preserves native bigint and bytes with Convex tagged JSON", () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(JSON.parse(stringifyConvex({ count: 42n, bytes }))).toEqual({
      count: { $integer: "KgAAAAAAAAA=" },
      bytes: { $bytes: "AQID" },
    });
  });

  it("normalizes undefined to null", () => {
    expect(stringifyConvex(undefined)).toBe("null");
  });
});
