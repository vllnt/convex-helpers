import { describe, expect, it } from "vitest";

import { asyncMap, NullDocumentError, nullThrows, pruneNull } from "./index.js";

describe("asyncMap", () => {
  it("returns empty array for empty input", async () => {
    const result = await asyncMap([], (x: number) => Promise.resolve(x * 2));
    expect(result).toEqual([]);
  });

  it("maps a single element", async () => {
    const result = await asyncMap([1], (x) => Promise.resolve(x * 2));
    expect(result).toEqual([2]);
  });

  it("maps multiple elements in order", async () => {
    const result = await asyncMap([1, 2, 3], (x) => Promise.resolve(x * 2));
    expect(result).toEqual([2, 4, 6]);
  });

  it("passes index to mapper", async () => {
    const result = await asyncMap(
      ["a", "b", "c"],
      async (item, index) => `${String(index)}:${item}`,
    );
    expect(result).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("resolves all promises and returns results in order", async () => {
    const result = await asyncMap([10, 20, 30], (x) => Promise.resolve(x * 3));
    expect(result).toEqual([30, 60, 90]);
  });
});

describe("pruneNull", () => {
  it("returns empty array for empty input", () => {
    expect(pruneNull([])).toEqual([]);
  });

  it("removes all nulls", () => {
    const nullValue: null = null;
    expect(pruneNull([nullValue, nullValue])).toEqual([]);
  });

  it("removes all undefineds", () => {
    expect(pruneNull([undefined, undefined])).toEqual([]);
  });

  it("removes mixed null and undefined", () => {
    const nullValue: null = null;
    expect(pruneNull([nullValue, undefined, nullValue])).toEqual([]);
  });

  it("keeps all non-null values", () => {
    expect(pruneNull([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("filters mixed array of values and nulls", () => {
    const nullValue: null = null;
    expect(pruneNull([1, nullValue, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it("works with strings", () => {
    const nullValue: null = null;
    expect(pruneNull(["a", nullValue, "b"])).toEqual(["a", "b"]);
  });

  it("works with objects", () => {
    const object = { id: 1 };
    const nullValue: null = null;
    expect(pruneNull([object, nullValue])).toEqual([object]);
  });

  it("preserves falsy non-null values (0, false, empty string)", () => {
    const nullValue: null = null;
    expect(pruneNull([0, false, "", nullValue, undefined])).toEqual([
      0,
      false,
      "",
    ]);
  });
});

describe("NullDocumentError", () => {
  it("is an instance of Error", () => {
    const error = new NullDocumentError();
    expect(error).toBeInstanceOf(Error);
  });

  it("has name NullDocumentError", () => {
    const error = new NullDocumentError();
    expect(error.name).toBe("NullDocumentError");
  });

  it("uses default message when none provided", () => {
    const error = new NullDocumentError();
    expect(error.message).toBe("Expected a non-null document");
  });

  it("uses custom message when provided", () => {
    const error = new NullDocumentError("custom message");
    expect(error.message).toBe("custom message");
  });
});

describe("nullThrows", () => {
  it("returns the value when non-null", () => {
    expect(nullThrows(42)).toBe(42);
  });

  it("returns the value when truthy string", () => {
    expect(nullThrows("hello")).toBe("hello");
  });

  it("returns 0 (falsy but non-null)", () => {
    expect(nullThrows(0)).toBe(0);
  });

  it("returns false (falsy but non-null)", () => {
    expect(nullThrows(false)).toBe(false);
  });

  it("returns empty string (falsy but non-null)", () => {
    expect(nullThrows("")).toBe("");
  });

  it("returns objects", () => {
    const object = { id: 1 };
    expect(nullThrows(object)).toBe(object);
  });

  it("throws NullDocumentError when value is null", () => {
    const nullValue: null = null;
    expect(() => {
      nullThrows(nullValue);
    }).toThrow(NullDocumentError);
  });

  it("throws NullDocumentError when value is undefined", () => {
    expect(() => {
      nullThrows(undefined);
    }).toThrow(NullDocumentError);
  });

  it("throws with default message when no message supplied", () => {
    const nullValue: null = null;
    expect(() => {
      nullThrows(nullValue);
    }).toThrow("Expected a non-null document");
  });

  it("throws with custom message when supplied", () => {
    const nullValue: null = null;
    expect(() => {
      nullThrows(nullValue, "doc 123 not found");
    }).toThrow("doc 123 not found");
  });

  it("throws with custom message for undefined", () => {
    expect(() => {
      nullThrows(undefined, "missing doc");
    }).toThrow("missing doc");
  });
});
