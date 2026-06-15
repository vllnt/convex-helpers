import { z } from "zod";

import type { ConvexValidator } from "./types.js";

export class UnsupportedValidatorError extends Error {
  constructor(kind: string) {
    super(
      `Unsupported Convex validator kind: "${kind}". This may be from a newer version of Convex.`,
    );
    this.name = "UnsupportedValidatorError";
  }
}

function isConvexValidator(value: unknown): value is ConvexValidator {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "isOptional" in value
  );
}

function isLiteralValue(
  value: unknown,
): value is boolean | null | number | string {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" || value === null;
}

function isAllStringLiteralUnion(
  members: ConvexValidator[],
): members is (ConvexValidator & { value: string })[] {
  return (
    members.length > 1 &&
    members.every((m) => m.kind === "literal" && typeof m.value === "string")
  );
}

function hasAtLeastTwo<T>(array: T[]): array is [T, T, ...T[]] {
  return array.length >= 2;
}

// Callers guarantee arr.length >= 2 (pre-checked by isAllStringLiteralUnion or length === 1 early return)
function asTuple<T>(array: T[]): [T, T, ...T[]] {
  /* v8 ignore start -- callers guarantee length >= 2 */
  if (!hasAtLeastTwo(array)) throw new Error("Expected at least 2 elements");
  /* v8 ignore stop */
  return array;
}

function convertKind(validator: ConvexValidator): z.ZodTypeAny {
  switch (validator.kind) {
    case "string":
      return z.string();

    case "float64":
      return z.number();

    case "boolean":
      return z.boolean();

    case "null":
      return z.null();

    case "int64":
      return z
        .string()
        .describe(
          "64-bit integer as string (BigInt — JSON cannot represent bigint)",
        );

    case "bytes":
      return z.string().describe("Binary data as base64-encoded string");

    case "id":
      return z
        .string()
        .describe(
          validator.tableName
            ? `Convex document ID for table '${validator.tableName}'`
            : "Convex document ID",
        );

    case "literal":
      if (!isLiteralValue(validator.value)) {
        throw new UnsupportedValidatorError("literal (unsupported value type)");
      }
      return z.literal(validator.value);

    case "array":
      if (!validator.element) {
        throw new UnsupportedValidatorError("array (missing element)");
      }
      return z.array(convertValidator(validator.element));

    case "object": {
      if (!validator.fields) {
        return z.object({});
      }
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, field] of Object.entries(validator.fields)) {
        shape[key] = convertValidator(field);
      }
      return z.object(shape);
    }

    case "union": {
      if (!validator.members || validator.members.length === 0) {
        throw new UnsupportedValidatorError("union (missing members)");
      }
      if (isAllStringLiteralUnion(validator.members)) {
        const values = validator.members.map((m) => m.value);
        return z.enum(asTuple(values));
      }
      const converted = validator.members.map((m) => convertValidator(m));
      if (converted.length === 1) {
        const [single] = converted;
        /* v8 ignore start -- impossible after converted.length === 1; needed for noUncheckedIndexedAccess */
        if (!single)
          throw new UnsupportedValidatorError("union (missing member)");
        /* v8 ignore stop */
        return single;
      }
      return z.union(asTuple(converted));
    }

    case "record": {
      if (!validator.key || !validator.value) {
        throw new UnsupportedValidatorError("record (missing key or value)");
      }
      const keyKind = validator.key.kind;
      if (keyKind !== "string" && keyKind !== "id") {
        throw new UnsupportedValidatorError(
          `record key must be string or id, got "${keyKind}"`,
        );
      }
      const valueValidator = validator.value;
      if (!isConvexValidator(valueValidator)) {
        throw new UnsupportedValidatorError("record (invalid value validator)");
      }
      // Key kind validated as "string" | "id" above — always maps to z.string()
      return z.record(z.string(), convertValidator(valueValidator));
    }

    case "any":
      return z.any();

    default:
      throw new UnsupportedValidatorError(validator.kind);
  }
}

export function convertValidator(validator: ConvexValidator): z.ZodTypeAny {
  const base = convertKind(validator);
  if (validator.isOptional === "optional") {
    return base.optional();
  }
  return base;
}

export function convexArgsToZod(
  argumentsValidator: ConvexValidator,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (argumentsValidator.kind !== "object") {
    throw new Error("Convex function args must be a v.object() validator");
  }
  if (!argumentsValidator.fields) {
    return z.object({});
  }
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(argumentsValidator.fields)) {
    shape[key] = convertValidator(field);
  }
  return z.object(shape);
}
