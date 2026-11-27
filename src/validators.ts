/**
 * @module @vllnt/convex-helpers/validators
 * Runtime checks against Convex validators, and whole-document validators
 * for schema tables.
 *
 * Adapted, with changes, from `convex-helpers/validators` 0.1.136
 * (Apache-2.0, see NOTICE): same behaviour for these functions, which the
 * repository's parity tests check side by side, plus one fail-closed
 * difference: the runtime check throws on the `db` option, which checks a
 * `v.id`'s table, instead of supporting it. The `AddFieldsToValidator` type
 * follows upstream's.
 */

import type {
  DataModelFromSchemaDefinition,
  SchemaDefinition,
  TableNamesInDataModel,
} from "convex/server";
import type {
  GenericId,
  Infer,
  ObjectType,
  PropertyValidators,
  Validator,
  VFloat64,
  VId,
  VObject,
} from "convex/values";
import { v } from "convex/values";

/* eslint-disable @typescript-eslint/no-explicit-any -- Convex's own validator constraints are `Validator<any, any, any>` */
/** Any Convex validator. */
export type AnyValidator = Validator<any, any, any>;
type AnySchema = SchemaDefinition<any, boolean>;
/* eslint-enable @typescript-eslint/no-explicit-any */

type Expand<TObject> =
  TObject extends Record<string, unknown>
    ? { [Key in keyof TObject]: TObject[Key] }
    : never;

/** Options for the runtime check. */
export type ValidateOptions = {
  /** Accept object fields the validator does not declare. */
  allowUnknownFields?: boolean;
  /** Throw a {@link ValidationError} instead of returning `false`. */
  throw?: boolean;
};

/** Thrown on a mismatch when called with `throw: true`, and by {@link parse}. */
export class ValidationError extends Error {
  /**
   * @param expected - The expected kind or literal value
   * @param got - What the value held instead
   * @param path - Path of the failing value inside the checked value
   */
  constructor(
    public expected: string,
    public got: string,
    public path?: string,
  ) {
    const where = path === undefined || path === "" ? "" : ` for ${path}`;
    super(`Validator error${where}: Expected \`${expected}\`, got \`${got}\``);
    this.name = "ValidationError";
  }
}

type Walk = ValidateOptions & { path?: string };

/** What a failed check expected and, when set, what to report it got. */
type Failure = { expected: string; got?: string };

type Kind = AnyValidator["kind"];

type Checker<TKind extends Kind> = (
  validator: Extract<AnyValidator, { kind: TKind }>,
  value: unknown,
  walk: Walk,
) => Failure | undefined;

function joinPath(path: string | undefined, key: string): string {
  return path === undefined || path === "" ? key : `${path}.${key}`;
}

function describeValue(value: unknown): string {
  return value === null ? "null" : typeof value;
}

/** The first failure `check` returns over `items`, checking in order and stopping there. */
function firstFailure<TItem>(
  items: readonly TItem[],
  check: (item: TItem, index: number) => Failure | undefined,
): Failure | undefined {
  let failure: Failure | undefined;
  items.some((item, index) => {
    failure = check(item, index);
    return failure !== undefined;
  });
  return failure;
}

function plainObjectFailure(value: object): Failure | undefined {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === null || prototype === Object.prototype) return undefined;
  const name = (prototype as { constructor?: { name?: unknown } }).constructor
    ?.name;
  // Objects from another realm (a Node.js `vm` context) are still plain.
  if (name === "Object") return undefined;
  return {
    expected: typeof name === "string" && name !== "" ? name : "object",
  };
}

function primitive<TKind extends Kind>(
  test: (value: unknown) => boolean,
  expected?: string,
): Checker<TKind> {
  return (validator, value) =>
    test(value) ? undefined : { expected: expected ?? validator.kind };
}

const accept = (): undefined => undefined;

function walkValue(
  validator: AnyValidator,
  value: unknown,
  walk: Walk,
): boolean {
  const failure = check(validator, value, walk);
  if (failure === undefined) return true;
  if (walk.throw === true) {
    throw new ValidationError(
      failure.expected,
      failure.got ?? describeValue(value),
      walk.path,
    );
  }
  return false;
}

const checkArray: Checker<"array"> = (validator, value, walk) => {
  if (!Array.isArray(value)) return { expected: "array" };
  // Array.from turns holes into `undefined`, so every slot of a sparse array
  // goes through the element check.
  return firstFailure([...(value as unknown[])], (element, index) =>
    walkValue(validator.element, element, {
      ...walk,
      path: `${walk.path ?? ""}[${String(index)}]`,
    })
      ? undefined
      : { expected: validator.element.kind },
  );
};

const checkLiteral: Checker<"literal"> = (validator, value) => {
  if (value === validator.value) return;
  const scalar = ["bigint", "boolean", "number", "string"].includes(
    typeof value,
  );
  return {
    expected: String(validator.value),
    ...(scalar ? { got: `"${String(value)}"` } : {}),
  };
};

function unknownFieldFailure(
  fields: Record<string, AnyValidator | undefined>,
  record: Record<string, unknown>,
  walk: Walk,
): Failure | undefined {
  const unknown = Object.entries(record).find(
    ([key, item]) => !Object.hasOwn(fields, key) && item !== undefined,
  );
  if (unknown === undefined) return undefined;
  const [key, item] = unknown;
  if (walk.throw === true) {
    throw new ValidationError("nothing", typeof item, joinPath(walk.path, key));
  }
  return { expected: "object" };
}

const checkObject: Checker<"object"> = (validator, value, walk) => {
  if (typeof value !== "object" || value === null)
    return { expected: "object" };
  const notPlain = plainObjectFailure(value);
  if (notPlain) return notPlain;
  const record = value as Record<string, unknown>;
  const fields: Record<string, AnyValidator> = validator.fields;
  const fieldFailure = firstFailure(Object.entries(fields), ([key, field]) =>
    walkValue(field, record[key], { ...walk, path: joinPath(walk.path, key) })
      ? undefined
      : { expected: "object" },
  );
  if (fieldFailure !== undefined || walk.allowUnknownFields === true) {
    return fieldFailure;
  }
  return unknownFieldFailure(fields, record, walk);
};

const checkUnion: Checker<"union"> = (validator, value, walk) => {
  const members: AnyValidator[] = validator.members;
  const errors: ValidationError[] = [];
  const matched = members.some((member) => {
    try {
      return walkValue(member, value, walk);
    } catch (error) {
      // walkValue throws ValidationError and nothing else.
      errors.push(error as ValidationError);
      return false;
    }
  });
  if (matched) return;
  // With `throw: true`, report the last member's error, as convex-helpers does.
  const last = errors.at(-1);
  if (last !== undefined) throw last;
  return { expected: "union" };
};

const checkRecord: Checker<"record"> = (validator, value, walk) => {
  if (typeof value !== "object" || value === null)
    return { expected: "record" };
  // Arrays and class instances (Date, Map, ...) are not records, as in Convex.
  // For a record, the non-plain object's constructor name is what it got.
  const notPlain = plainObjectFailure(value);
  if (notPlain) return { expected: "record", got: notPlain.expected };
  const keyValidator: AnyValidator = validator.key;
  const entryValidator: AnyValidator = validator.value;
  return firstFailure(Object.entries(value), ([key, entry]) => {
    // The wire format drops `undefined` entries, so they pass.
    if (entry === undefined) return;
    const entryWalk = { ...walk, path: joinPath(walk.path, key) };
    if (!walkValue(keyValidator, key, entryWalk)) {
      return { expected: keyValidator.kind };
    }
    return walkValue(entryValidator, entry, entryWalk)
      ? undefined
      : { expected: entryValidator.kind };
  });
};

const checkers: { [TKind in Kind]: Checker<TKind> } = {
  any: accept,
  array: checkArray,
  boolean: primitive((value) => typeof value === "boolean"),
  bytes: primitive((value) => value instanceof ArrayBuffer),
  commitTs: accept,
  float64: primitive((value) => typeof value === "number", "number"),
  function: accept,
  id: primitive((value) => typeof value === "string"),
  int64: primitive((value) => typeof value === "bigint", "bigint"),
  literal: checkLiteral,
  null: primitive((value) => value === null),
  object: checkObject,
  record: checkRecord,
  string: primitive((value) => typeof value === "string"),
  union: checkUnion,
};

function check(
  validator: AnyValidator,
  value: unknown,
  walk: Walk,
): Failure | undefined {
  if (value === undefined) {
    return validator.isOptional === "optional"
      ? undefined
      : { expected: validator.kind };
  }
  // Kinds this module does not know (from a newer Convex) accept any value.
  const checker = checkers[validator.kind] as Checker<Kind> | undefined;
  return checker === undefined ? undefined : checker(validator, value, walk);
}

// eslint-disable-next-line write-good-comments/write-good-comments -- the example calls the public function by its name
/**
 * Checks a value against a Convex validator at runtime.
 *
 * @param validator - Any Convex validator (`v.*`)
 * @param value - The value to check
 * @param options - `throw` to throw instead of returning `false`;
 *   `allowUnknownFields` to accept object fields the validator does not declare
 * @returns Whether the value matches; narrows the value's type
 * @throws {ValidationError} With `throw: true`, on the first mismatch
 * @example
 * if (validate(policyValidator, reply, { throw: true })) use(reply);
 */
export function validate<TValidator extends AnyValidator>(
  validator: TValidator,
  value: unknown,
  options?: ValidateOptions,
): value is TValidator["type"] {
  if (options !== undefined && "db" in options) {
    throw new Error("validate: the db option is not supported");
  }
  return walkValue(validator, value, {
    ...(options?.allowUnknownFields === undefined
      ? {}
      : { allowUnknownFields: options.allowUnknownFields }),
    ...(options?.throw === undefined ? {} : { throw: options.throw }),
  });
}

function stripEntries(
  value: unknown,
  fieldFor: (key: string) => AnyValidator | undefined,
): Record<string, unknown> {
  const kept = Object.entries(value as object).flatMap(([key, item]) => {
    const field = fieldFor(key);
    return field === undefined || item === undefined
      ? []
      : [[key, stripUnknownFields(field, item)] as const];
  });
  return Object.fromEntries(kept);
}

function stripUnknownFields(validator: AnyValidator, value: unknown): unknown {
  if (value === undefined) return value;
  if (validator.kind === "array") {
    const element: AnyValidator = validator.element;
    return (value as unknown[]).map((item) =>
      stripUnknownFields(element, item),
    );
  }
  if (validator.kind === "object") {
    const fields: Record<string, AnyValidator | undefined> = validator.fields;
    return stripEntries(value, (key) =>
      Object.hasOwn(fields, key) ? fields[key] : undefined,
    );
  }
  if (validator.kind === "record") {
    const entryValidator: AnyValidator = validator.value;
    return stripEntries(value, () => entryValidator);
  }
  if (validator.kind === "union") {
    const members: AnyValidator[] = validator.members;
    // Prefer a member with no undeclared fields, then any member that matches.
    const member =
      members.find((candidate) => validate(candidate, value)) ??
      members.find((candidate) =>
        validate(candidate, value, { allowUnknownFields: true }),
      );
    /* v8 ignore start -- parse() validated the union first, so one member matches */
    if (member === undefined) throw new Error("No matching member in union");
    /* v8 ignore stop */
    return stripUnknownFields(member, value);
  }
  return value;
}

/**
 * Validates a value and returns a copy without the object fields the validator
 * does not declare (recursively, through arrays, records and unions).
 *
 * @param validator - Any Convex validator (`v.*`)
 * @param value - The value to parse
 * @returns The value with undeclared fields removed
 * @throws {ValidationError} When the value does not match
 * @example
 * const seed = parse(seedValidator, JSON.parse(raw));
 */
export function parse<TValidator extends AnyValidator>(
  validator: TValidator,
  value: unknown,
): Infer<TValidator> {
  validate(validator, value, { allowUnknownFields: true, throw: true });
  return stripUnknownFields(validator, value);
}

/** The `_id` and `_creationTime` validators of a table's documents. */
export type SystemFields<TTableName extends string> = {
  _creationTime: VFloat64;
  _id: VId<GenericId<TTableName>>;
};

/** The validator {@link doc} returns: the table validator plus `TFields`. */
export type AddFieldsToValidator<
  TValidator extends AnyValidator,
  TFields extends PropertyValidators,
> =
  TValidator extends VObject<infer TType, infer TObjectFields, infer TOptional>
    ? VObject<
        Expand<ObjectType<TFields> & TType>,
        Expand<TFields & TObjectFields>,
        TOptional
      >
    : Validator<
        Expand<ObjectType<TFields> & TValidator["type"]>,
        TValidator["isOptional"],
        {
          [TProperty in keyof TFields & string]:
            `${TProperty}.${TFields[TProperty]["fieldPaths"]}` | TProperty;
        }[keyof TFields & string] &
          string &
          TValidator["fieldPaths"]
      >;

function withSystemFields(
  validator: AnyValidator,
  system: PropertyValidators,
): AnyValidator {
  if (validator.kind === "object") {
    return v.object({ ...validator.fields, ...system });
  }
  if (validator.kind !== "union") {
    throw new Error(
      "Only object and union validators are supported for documents",
    );
  }
  const members: AnyValidator[] = validator.members;
  return v.union(...members.map((member) => withSystemFields(member, system)));
}

/**
 * Builds the validator for a whole document of a schema table: the table's
 * validator plus `_id` and `_creationTime`. A union table gets the system
 * fields on every member.
 *
 * @param schema - The `defineSchema(...)` result
 * @param tableName - A table of that schema
 * @returns An object (or union of objects) validator for the table's documents
 * @throws {Error} When the table validator is neither an object nor a union
 * @example
 * returns: v.array(doc(schema, "users"))
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- public name kept from convex-helpers, so imports change their path and nothing else
export function doc<
  TSchema extends AnySchema,
  TTableName extends TableNamesInDataModel<
    DataModelFromSchemaDefinition<TSchema>
  >,
>(
  schema: TSchema,
  tableName: TTableName,
): AddFieldsToValidator<
  TSchema["tables"][TTableName]["validator"],
  SystemFields<TTableName>
> {
  // Same field order as convex-helpers: `_id` first.
  // eslint-disable-next-line perfectionist/sort-objects -- keeps upstream's field order in the generated validator
  const system = { _id: v.id(tableName), _creationTime: v.number() };
  const tables = schema.tables as Record<string, { validator: AnyValidator }>;
  return withSystemFields(
    (tables[tableName] as { validator: AnyValidator }).validator,
    system,
  ) as AddFieldsToValidator<
    TSchema["tables"][TTableName]["validator"],
    SystemFields<TTableName>
  >;
}
