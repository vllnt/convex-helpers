import { runInNewContext } from "node:vm";

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import * as theirs from "convex-helpers/validators";
import { describe, expect, it } from "vitest";

import type { AnyValidator, ValidateOptions } from "./validators.js";
import * as ours from "./validators.js";

class Point {
  x = 1;
}

const namelessPrototype = Object.create(Object.prototype, {
  constructor: { value: { name: "" } },
}) as object;
const nameless = Object.create(namelessPrototype) as object;
const futureKind = {
  isOptional: "required",
  kind: "future",
} as unknown as AnyValidator;

const user = v.object({
  name: v.string(),
  nick: v.optional(v.string()),
  tags: v.array(v.string()),
});

const shape = v.union(
  v.object({ kind: v.literal("circle"), r: v.number() }),
  v.object({ kind: v.literal("square"), side: v.number() }),
);

const loose = v.union(
  v.object({ a: v.string() }),
  v.object({ a: v.string(), b: v.number() }),
);

const corpus: [string, AnyValidator, unknown][] = [
  ["string ok", v.string(), "s"],
  ["string bad", v.string(), 1],
  ["number ok", v.number(), 1.5],
  ["number bad", v.number(), "1"],
  ["int64 ok", v.int64(), 1n],
  ["int64 bad", v.int64(), 1],
  ["boolean bad", v.boolean(), 0],
  ["null ok", v.null(), null],
  ["null bad", v.null(), undefined],
  ["bytes ok", v.bytes(), new ArrayBuffer(2)],
  ["bytes bad", v.bytes(), "AA=="],
  ["any", v.any(), { anything: [1] }],
  ["id ok", v.id("users"), "abc"],
  ["id bad", v.id("users"), 3],
  ["literal ok", v.literal("a"), "a"],
  ["literal string bad", v.literal("a"), "b"],
  ["literal number bad", v.literal(2), 3],
  ["literal object bad", v.literal("a"), { a: 1 }],
  ["literal null bad", v.literal(true), null],
  ["optional missing", v.optional(v.string()), undefined],
  ["required missing", v.string(), undefined],
  ["array ok", v.array(v.number()), [1, 2]],
  ["array element bad", v.array(v.number()), [1, "2"]],
  ["array not array", v.array(v.number()), { 0: 1 }],
  ["nested array bad", v.array(v.array(v.string())), [["a"], [2]]],
  ["object ok", user, { name: "n", tags: [] }],
  ["object optional present", user, { name: "n", nick: "x", tags: ["a"] }],
  ["object field bad", user, { name: 1, tags: [] }],
  ["object nested bad", user, { name: "n", tags: ["a", 2] }],
  ["object unknown field", user, { extra: 1, name: "n", tags: [] }],
  ["object undefined extra", user, { extra: undefined, name: "n", tags: [] }],
  ["object null", user, null],
  ["object string", user, "user"],
  ["object class instance", v.object({ x: v.number() }), new Point()],
  ["object nameless prototype", v.object({}), nameless],
  [
    "object null prototype",
    v.object({ x: v.number() }),
    Object.assign(Object.create(null) as object, { x: 1 }),
  ],
  [
    "object other realm",
    v.object({ x: v.number() }),
    runInNewContext("({ x: 1 })") as unknown,
  ],
  [
    "object optional field named constructor, absent",
    v.object({ constructor: v.optional(v.string()) }),
    JSON.parse("{}") as unknown,
  ],
  [
    "object optional field named toString, absent",
    v.object({ toString: v.optional(v.string()) }),
    {},
  ],
  [
    "object required field named toString, absent",
    v.object({ toString: v.any() }),
    {},
  ],
  [
    "object optional field named __proto__, absent",
    v.object({ ["__proto__"]: v.optional(v.string()) }),
    {},
  ],
  [
    "object inherited declared field",
    v.object({ name: v.string() }),
    Object.create({ name: "x" }) as unknown,
  ],
  [
    "object deep path",
    v.object({ a: v.object({ b: v.array(v.object({ c: v.string() })) }) }),
    { a: { b: [{ c: 1 }] } },
  ],
  ["union first", shape, { kind: "circle", r: 1 }],
  ["union second", shape, { kind: "square", side: 2 }],
  ["union none", shape, { kind: "triangle" }],
  ["union scalar none", v.union(v.string(), v.number()), true],
  ["union unknown field", shape, { kind: "circle", r: 1, x: 2 }],
  ["union loose", loose, { a: "x", b: 1, c: true }],
  ["record ok", v.record(v.string(), v.number()), { a: 1, b: undefined }],
  ["record value bad", v.record(v.string(), v.number()), { a: "1" }],
  [
    "record key bad",
    v.record(v.union(v.literal("a"), v.literal("b")), v.number()),
    { c: 1 },
  ],
  ["record not object", v.record(v.string(), v.number()), null],
  ["record array", v.record(v.string(), v.number()), [1, 2]],
  ["record empty array", v.record(v.string(), v.number()), []],
  ["record Date", v.record(v.string(), v.number()), new Date(0)],
  ["record Map", v.record(v.string(), v.number()), new Map([["a", 1]])],
  ["record class instance", v.record(v.string(), v.number()), new Point()],
  ["record nameless prototype", v.record(v.string(), v.number()), nameless],
  [
    "record null prototype",
    v.record(v.string(), v.number()),
    Object.assign(Object.create(null) as object, { a: 1 }),
  ],
  [
    "record other realm",
    v.record(v.string(), v.number()),
    runInNewContext("({ a: 1 })") as unknown,
  ],
  ["unknown kind", futureKind, 1],
  // eslint-disable-next-line no-sparse-arrays -- a hole must fail like `undefined`
  ["sparse array", v.array(v.string()), [, "a"]],
  ["unfilled array", v.array(v.number()), Array.from<unknown>({ length: 2 })],
  ["holey array", v.array(v.number()), Array.from({ length: 2 })],
  [
    "record nested",
    v.record(v.string(), user),
    { u: { extra: 1, name: "n", tags: [] } },
  ],
];

const optionSets: ValidateOptions[] = [
  {},
  { throw: true },
  { allowUnknownFields: true },
  { allowUnknownFields: true, throw: true },
];

function describeExpected(expected: unknown): string | undefined {
  return expected === undefined ? undefined : String(expected);
}

function run(fn: () => unknown): unknown {
  try {
    return { value: fn() };
  } catch (error) {
    if (!(error instanceof Error)) return { thrown: String(error) };
    const fields = error as Partial<ours.ValidationError>;
    return {
      error: `${error.name}: ${error.message}`,
      // Upstream passes a literal's raw value; ours stores it as a string.
      expected: describeExpected(fields.expected),
      got: fields.got,
      path: fields.path,
    };
  }
}

describe("validators parity with convex-helpers 0.1.136", () => {
  it.each(corpus)("%s", (_name, validator, value) => {
    const compare = (options?: ValidateOptions) => {
      expect(run(() => ours.validate(validator, value, options))).toStrictEqual(
        run(() => theirs.validate(validator, value, options)),
      );
    };
    compare();
    optionSets.forEach(compare);
    expect(run(() => ours.parse(validator, value))).toStrictEqual(
      run(() => theirs.parse(validator, value)),
    );
  });

  const schema = defineSchema({
    events: defineTable(
      v.union(
        v.object({ kind: v.literal("a"), n: v.number() }),
        v.object({ kind: v.literal("b") }),
      ),
    ),
    users: defineTable({ name: v.string() }),
  });

  it.each(["events", "users"] as const)(
    "doc adds system fields to the %s table",
    (table) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- the parity reference
      const upstream = theirs.doc(schema, table);
      expect(ours.doc(schema, table)).toStrictEqual(upstream);
      // Same field order too, so generated validators serialize identically.
      expect(JSON.stringify(ours.doc(schema, table))).toBe(
        JSON.stringify(upstream),
      );
    },
  );

  it("doc validates whole documents", () => {
    const userDocument = ours.doc(schema, "users");
    expect(
      ours.validate(userDocument, { _creationTime: 1, _id: "x", name: "n" }),
    ).toBe(true);
    expect(ours.validate(userDocument, { name: "n" })).toBe(false);
  });

  it("doc rejects tables that are neither objects nor unions", () => {
    const odd = { tables: { odd: { validator: v.string() } } } as never;
    expect(run(() => ours.doc(odd, "odd"))).toStrictEqual(
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- the parity reference
      run(() => theirs.doc(odd, "odd")),
    );
    expect(() => ours.doc(odd, "odd")).toThrow(
      "Only object and union validators are supported for documents",
    );
  });

  it("parse strips unknown fields recursively", () => {
    expect(
      ours.parse(v.record(v.string(), user), {
        u: { extra: 1, name: "n", nick: undefined, tags: ["t"] },
      }),
    ).toStrictEqual({ u: { name: "n", tags: ["t"] } });
  });

  it("rejects arrays and class instances for records", () => {
    const counts = v.record(v.string(), v.number());
    expect(ours.validate(counts, [1, 2])).toBe(false);
    expect(ours.validate(counts, new Date(0))).toBe(false);
    expect(() => ours.parse(counts, [1, 2])).toThrow(
      "Validator error: Expected `record`, got `Array`",
    );
    expect(() => ours.validate(counts, new Map(), { throw: true })).toThrow(
      "Validator error: Expected `record`, got `Map`",
    );
  });

  it("treats inherited names as unknown fields", () => {
    const named = v.object({ a: v.string() });
    const withConstructor = { a: "x", constructor: 1 };
    expect(theirs.validate(named, withConstructor)).toBe(false);
    expect(ours.validate(named, withConstructor)).toBe(false);
    const polluted = JSON.parse(
      '{"a":"x","__proto__":{"polluted":1}}',
    ) as unknown;
    const parsed = ours.parse(named, polluted);
    expect(parsed).toStrictEqual({ a: "x" });
    expect(Object.hasOwn(parsed, "__proto__")).toBe(false);
    expect((parsed as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("reads declared fields as own properties only", () => {
    const named = v.object({ constructor: v.optional(v.string()) });
    const empty = JSON.parse("{}") as unknown;
    expect(ours.validate(named, empty)).toBe(true);
    expect(ours.parse(named, empty)).toStrictEqual({});
    expect(ours.validate(v.object({ toString: v.any() }), {})).toBe(false);
    const inherited = Object.create({ name: "x" }) as unknown;
    expect(ours.validate(v.object({ name: v.string() }), inherited)).toBe(
      false,
    );
    expect(() => ours.parse(v.object({ name: v.string() }), inherited)).toThrow(
      "Validator error for name: Expected `string`, got `undefined`",
    );
  });

  it("refuses the unsupported db option", () => {
    const options = { db: {} } as unknown as ours.ValidateOptions;
    expect(() => ours.validate(v.id("users"), "x", options)).toThrow(
      "validate: the db option is not supported",
    );
  });

  it("ValidationError carries expected, got and path", () => {
    const error = new ours.ValidationError("string", "number", "a.b");
    expect(error).toMatchObject({
      expected: "string",
      got: "number",
      message: "Validator error for a.b: Expected `string`, got `number`",
      name: "ValidationError",
      path: "a.b",
    });
    expect(new ours.ValidationError("x", "y", "").message).toBe(
      "Validator error: Expected `x`, got `y`",
    );
  });
});
