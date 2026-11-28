import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ConvexValidator } from "../types.js";
import { convexArgsToZod } from "../validators.js";

// Optional `-`, digits, optional fraction, optional exponent: "1", "-1.5", "2e3".
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/u;

const decimalText = z
  .string()
  .refine(
    (value) => DECIMAL_PATTERN.test(value) && Number.isFinite(Number(value)),
    "Expected a decimal number",
  )
  .transform(Number);

const booleanText = z
  .string()
  .refine(
    (value) => value === "true" || value === "false",
    "Expected true or false",
  )
  .transform((value) => value === "true");

function textSchema(kind: string): undefined | z.ZodTypeAny {
  if (kind === "float64") return decimalText;
  if (kind === "boolean") return booleanText;
  return undefined;
}

/**
 * Builds the schema for resource URI params, which always arrive as strings.
 * Same as `convexArgsToZod`, except top-level `v.float64()` and `v.boolean()`
 * fields accept decimal text and `"true"`/`"false"` and convert them. Fields
 * inside unions, arrays or objects are not converted.
 */
export function resourceArgsToZod(
  argumentsValidator: ConvexValidator,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schema = convexArgsToZod(argumentsValidator);
  const overrides: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(argumentsValidator.fields ?? {})) {
    const text = textSchema(field.kind);
    if (text) {
      overrides[key] = field.isOptional === "optional" ? text.optional() : text;
    }
  }
  return schema.extend(overrides);
}

// Same text as the SDK's tool input errors: "<message> at <path>" per issue.
// Params are always an object, so every issue has a path starting with a key.
function issueText({ message, path }: z.core.$ZodIssue): string {
  const location = path
    .map((segment) =>
      typeof segment === "number"
        ? `[${String(segment)}]`
        : `.${String(segment)}`,
    )
    .join("")
    .slice(1);
  return `${message} at ${location}`;
}

/**
 * Parses URI params with the resource's schema.
 *
 * @throws {McpError} `InvalidParams` with the SDK's tool input error format
 *   when the params fail the schema; the text holds only zod messages about
 *   the caller's own params.
 */
export function parseResourceParams(
  uriPattern: string,
  schema: undefined | z.ZodTypeAny,
  parameters: Record<string, unknown>,
): unknown {
  if (!schema) return parameters;
  const result = schema.safeParse(parameters);
  if (result.success) return result.data;
  throw new McpError(
    ErrorCode.InvalidParams,
    `Input validation error: Invalid arguments for resource ${uriPattern}: ${result.error.issues.map(issueText).join("\n")}`,
  );
}
