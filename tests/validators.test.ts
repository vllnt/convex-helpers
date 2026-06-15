import { describe, expect, it } from "vitest";
import { z } from "zod";
import { convertValidator, convexArgsToZod, UnsupportedValidatorError } from "../src/mcp/validators.js";

function makeValidator(kind: string, extra: Record<string, unknown> = {}): any {
  return { kind, isOptional: "required", ...extra };
}

function makeOptionalValidator(kind: string, extra: Record<string, unknown> = {}): any {
  return { kind, isOptional: "optional", ...extra };
}

describe("convertValidator", () => {
  it("converts string", () => {
    const schema = convertValidator(makeValidator("string"));
    expect(schema.parse("hello")).toBe("hello");
    expect(() => schema.parse(123)).toThrow();
  });

  it("converts float64 (number)", () => {
    const schema = convertValidator(makeValidator("float64"));
    expect(schema.parse(42.5)).toBe(42.5);
    expect(() => schema.parse("hello")).toThrow();
  });

  it("converts boolean", () => {
    const schema = convertValidator(makeValidator("boolean"));
    expect(schema.parse(true)).toBe(true);
    expect(() => schema.parse("true")).toThrow();
  });

  it("converts null", () => {
    const schema = convertValidator(makeValidator("null"));
    expect(schema.parse(null)).toBe(null);
    expect(() => schema.parse(undefined)).toThrow();
  });

  it("converts int64 to string with description", () => {
    const schema = convertValidator(makeValidator("int64"));
    expect(schema.parse("12345")).toBe("12345");
    expect(schema.description).toContain("64-bit integer");
  });

  it("converts bytes to string with description", () => {
    const schema = convertValidator(makeValidator("bytes"));
    expect(schema.parse("base64data")).toBe("base64data");
    expect(schema.description).toContain("base64");
  });

  it("converts id with table name description (AC-10)", () => {
    const schema = convertValidator(makeValidator("id", { tableName: "spaces" }));
    expect(schema.parse("abc123")).toBe("abc123");
    expect(schema.description).toContain("Convex document ID");
    expect(schema.description).toContain("spaces");
  });

  it("converts id without table name", () => {
    const schema = convertValidator(makeValidator("id"));
    expect(schema.description).toContain("Convex document ID");
  });

  it("converts literal string", () => {
    const schema = convertValidator(makeValidator("literal", { value: "hello" }));
    expect(schema.parse("hello")).toBe("hello");
    expect(() => schema.parse("world")).toThrow();
  });

  it("converts literal number", () => {
    const schema = convertValidator(makeValidator("literal", { value: 42 }));
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse(43)).toThrow();
  });

  it("converts array", () => {
    const schema = convertValidator(makeValidator("array", {
      element: makeValidator("string"),
    }));
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => schema.parse([1, 2])).toThrow();
  });

  it("converts object", () => {
    const schema = convertValidator(makeValidator("object", {
      fields: {
        name: makeValidator("string"),
        age: makeValidator("float64"),
      },
    }));
    expect(schema.parse({ name: "Alice", age: 30 })).toEqual({ name: "Alice", age: 30 });
    expect(() => schema.parse({ name: 123 })).toThrow();
  });

  it("converts object with optional fields", () => {
    const schema = convertValidator(makeValidator("object", {
      fields: {
        name: makeValidator("string"),
        desc: makeOptionalValidator("string"),
      },
    }));
    expect(schema.parse({ name: "Alice" })).toEqual({ name: "Alice" });
    expect(schema.parse({ name: "Alice", desc: "Hi" })).toEqual({ name: "Alice", desc: "Hi" });
  });

  it("converts nested objects", () => {
    const schema = convertValidator(makeValidator("object", {
      fields: {
        nested: makeValidator("object", {
          fields: {
            deep: makeValidator("array", {
              element: makeValidator("string"),
            }),
          },
        }),
      },
    }));
    expect(schema.parse({ nested: { deep: ["a", "b"] } })).toEqual({ nested: { deep: ["a", "b"] } });
  });

  it("converts union of literals to enum (AC-11)", () => {
    const schema = convertValidator(makeValidator("union", {
      members: [
        makeValidator("literal", { value: "a" }),
        makeValidator("literal", { value: "b" }),
        makeValidator("literal", { value: "c" }),
      ],
    }));
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse("b")).toBe("b");
    expect(() => schema.parse("d")).toThrow();

    const jsonSchema = z.toJSONSchema(schema);
    expect(jsonSchema).toHaveProperty("enum");
    expect((jsonSchema as any).enum).toEqual(["a", "b", "c"]);
  });

  it("converts union of numeric literals to z.union of z.literal (not z.enum)", () => {
    const schema = convertValidator(makeValidator("union", {
      members: [
        makeValidator("literal", { value: 1 }),
        makeValidator("literal", { value: 2 }),
        makeValidator("literal", { value: 3 }),
      ],
    }));
    expect(schema.parse(1)).toBe(1);
    expect(schema.parse(2)).toBe(2);
    expect(() => schema.parse(4)).toThrow();
    expect(() => schema.parse("1")).toThrow();
  });

  it("converts mixed union", () => {
    const schema = convertValidator(makeValidator("union", {
      members: [
        makeValidator("string"),
        makeValidator("float64"),
      ],
    }));
    expect(schema.parse("hello")).toBe("hello");
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse(true)).toThrow();
  });

  it("converts record", () => {
    const schema = convertValidator(makeValidator("record", {
      key: makeValidator("string"),
      value: makeValidator("float64"),
    }));
    expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(() => schema.parse({ a: "not a number" })).toThrow();
  });

  it("converts any", () => {
    const schema = convertValidator(makeValidator("any"));
    expect(schema.parse("anything")).toBe("anything");
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse(null)).toBe(null);
  });

  it("converts optional validators", () => {
    const schema = convertValidator(makeOptionalValidator("string"));
    expect(schema.parse("hello")).toBe("hello");
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it("throws UnsupportedValidatorError for unknown kinds (AC-13)", () => {
    expect(() => convertValidator(makeValidator("futureType"))).toThrow(UnsupportedValidatorError);
    expect(() => convertValidator(makeValidator("futureType"))).toThrow("futureType");
  });

  it("throws on array with missing element", () => {
    expect(() => convertValidator(makeValidator("array"))).toThrow(UnsupportedValidatorError);
  });

  it("throws on union with missing members", () => {
    expect(() => convertValidator(makeValidator("union", { members: [] }))).toThrow(UnsupportedValidatorError);
  });

  it("throws on record with missing key/value", () => {
    expect(() => convertValidator(makeValidator("record"))).toThrow(UnsupportedValidatorError);
    expect(() => convertValidator(makeValidator("record", { key: makeValidator("string") }))).toThrow(UnsupportedValidatorError);
  });

  it("throws on record with non-string key", () => {
    expect(() => convertValidator(makeValidator("record", {
      key: makeValidator("float64"),
      value: makeValidator("string"),
    }))).toThrow('record key must be string or id, got "float64"');
  });

  it("throws on record with invalid value validator", () => {
    expect(() => convertValidator(makeValidator("record", {
      key: makeValidator("string"),
      value: "not-a-validator",
    }))).toThrow("record (invalid value validator)");
  });

  it("throws on literal with unsupported value type", () => {
    expect(() => convertValidator(makeValidator("literal", { value: undefined }))).toThrow("literal (unsupported value type)");
    expect(() => convertValidator(makeValidator("literal", { value: { nested: true } }))).toThrow("literal (unsupported value type)");
  });

  it("handles object with no fields (returns empty object schema)", () => {
    const schema = convertValidator(makeValidator("object"));
    expect(schema.parse({})).toEqual({});
  });

  it("handles single-member union", () => {
    const schema = convertValidator(makeValidator("union", {
      members: [makeValidator("string")],
    }));
    expect(schema.parse("hello")).toBe("hello");
  });
});

describe("convexArgsToZod", () => {
  it("converts object validator to Zod object", () => {
    const zodSchema = convexArgsToZod(makeValidator("object", {
      fields: {
        name: makeValidator("string"),
        count: makeValidator("float64"),
      },
    }));
    expect(zodSchema.parse({ name: "test", count: 5 })).toEqual({ name: "test", count: 5 });
  });

  it("handles empty object", () => {
    const zodSchema = convexArgsToZod(makeValidator("object", { fields: {} }));
    expect(zodSchema.parse({})).toEqual({});
  });

  it("handles object with no fields property", () => {
    const zodSchema = convexArgsToZod(makeValidator("object"));
    expect(zodSchema.parse({})).toEqual({});
  });

  it("throws on non-object validator", () => {
    expect(() => convexArgsToZod(makeValidator("string"))).toThrow("v.object()");
  });
});
