/**
 * @module @vllnt/convex-helpers/builders
 * Wrap Convex `query` / `mutation` / `action` builders so every function made
 * with them gets extra `ctx` fields (and optionally consumes extra args), e.g.
 * an authenticated user resolved once in a shared `input`.
 *
 * Adapted, with changes, from `convex-helpers/server/customFunctions` 0.1.136
 * (Apache-2.0, see NOTICE): same signatures and runtime behaviour for
 * `customQuery`, `customMutation`, `customAction` and `customCtx`; the
 * `CustomBuilder`, `CustomCtx`, `Customization` and `Registration` types
 * follow upstream's.
 * Unlike upstream, a customization must supply both `args` and `input` (the
 * types already require them). The repository's parity tests run both side
 * by side.
 */

import type {
  ActionBuilder,
  ArgsArrayForOptionalValidator,
  ArgsArrayToObject,
  DefaultArgsForOptionalValidator,
  DefaultFunctionArgs,
  FunctionVisibility,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
  ReturnValueForOptionalValidator,
} from "convex/server";
import type {
  GenericValidator,
  ObjectType,
  PropertyValidators,
  Validator,
} from "convex/values";
import { asObjectValidator, v } from "convex/values";

/* eslint-disable @typescript-eslint/no-explicit-any -- the public convex-helpers signatures constrain on Record<string, any> and Validator<any, any, any> */
type AnyRecord = Record<string, any>;
type AnyValidator = Validator<any, any, any>;

/** What a customization's `input` returns. */
export type CustomInput<TCtx, TCustomCtx, TCustomMadeArguments> = {
  args: TCustomMadeArguments;
  ctx: TCustomCtx;
  /** Runs after the handler succeeds, with the original ctx and args. */
  onSuccess?: (outcome: {
    args: Record<string, unknown>;
    ctx: TCtx;
    result: unknown;
  }) => Promise<void> | void;
};

/**
 * How a custom builder changes each function: the `args` it consumes (taken
 * out of the handler's args) and an `input` that returns ctx fields and args
 * to add.
 */
export type Customization<
  TCtx extends AnyRecord,
  TCustomArgumentsValidator extends PropertyValidators,
  TCustomCtx extends AnyRecord,
  TCustomMadeArguments extends AnyRecord,
  TExtraArguments extends AnyRecord = AnyRecord,
> = {
  args: TCustomArgumentsValidator;
  input: (
    ctx: TCtx,
    arguments_: ObjectType<TCustomArgumentsValidator>,
    extra: TExtraArguments,
  ) =>
    | CustomInput<TCtx, TCustomCtx, TCustomMadeArguments>
    | Promise<CustomInput<TCtx, TCustomCtx, TCustomMadeArguments>>;
};

/**
 * Builds a customization that adds ctx fields and leaves args alone.
 * `modifyCtx` receives the original ctx and the definition's extra properties
 * (all keys but `args`, `handler` and `returns`).
 *
 * @param modifyCtx - Returns the ctx fields to add (may be async)
 * @returns A customization for {@link customQuery}, {@link customMutation} or {@link customAction}
 * @example
 * const authQuery = customQuery(query, customCtx(async (ctx) => ({ user: await requireUser(ctx) })));
 */
export function customCtx<
  TInCtx extends AnyRecord,
  TOutCtx extends AnyRecord,
  TExtraArguments extends AnyRecord = AnyRecord,
>(
  modifyCtx: (
    original: TInCtx,
    extra: TExtraArguments,
  ) => Promise<TOutCtx> | TOutCtx,
): Customization<
  TInCtx,
  Record<string, never>,
  TOutCtx,
  Record<string, never>,
  TExtraArguments
> {
  return {
    args: {},
    input: async (ctx, _ignored, extra) => ({
      args: {},
      ctx: await modifyCtx(ctx, extra),
    }),
  };
}

type Expand<TObject extends AnyRecord> = {
  [Key in keyof TObject]: TObject[Key];
};

type Overwrite<TBase, TPatch> = keyof TPatch extends never
  ? TBase
  : Omit<TBase, keyof TPatch> & TPatch;

type ArgumentsForHandlerType<
  TOneOrZeroArguments extends [] | [AnyRecord],
  TCustomMadeArguments extends AnyRecord,
> =
  TCustomMadeArguments extends Record<string, never>
    ? TOneOrZeroArguments
    : TOneOrZeroArguments extends [infer TArguments extends AnyRecord]
      ? [Expand<TArguments & TCustomMadeArguments>]
      : [TCustomMadeArguments];

/** The registered function type a custom builder returns. */
export type Registration<
  TFunctionType extends "action" | "mutation" | "query",
  TVisibility extends FunctionVisibility,
  TArguments extends DefaultFunctionArgs,
  TOutput,
> = {
  action: RegisteredAction<TVisibility, TArguments, TOutput>;
  mutation: RegisteredMutation<TVisibility, TArguments, TOutput>;
  query: RegisteredQuery<TVisibility, TArguments, TOutput>;
}[TFunctionType];

/** A function builder made by {@link customQuery}, {@link customMutation} or {@link customAction}. */
export type CustomBuilder<
  TFunctionType extends "action" | "mutation" | "query",
  TCustomArgumentsValidator extends PropertyValidators,
  TCustomCtx extends AnyRecord,
  TCustomMadeArguments extends AnyRecord,
  TInputCtx,
  TVisibility extends FunctionVisibility,
  TExtraArguments extends AnyRecord,
> = <
  /* eslint-disable @typescript-eslint/no-invalid-void-type -- `void` means "no validator", as in convex/server's ArgsArrayForOptionalValidator */
  TArgumentsValidator extends
    PropertyValidators | Validator<any, any, any> | void,
  TReturnsValidator extends GenericValidator | PropertyValidators | void,
  /* eslint-enable @typescript-eslint/no-invalid-void-type */
  TReturnValue extends ReturnValueForOptionalValidator<TReturnsValidator> = any,
  TOneOrZeroArguments extends
    ArgsArrayForOptionalValidator<TArgumentsValidator> =
    DefaultArgsForOptionalValidator<TArgumentsValidator>,
>(
  function_:
    | ((
        ctx: Overwrite<TInputCtx, TCustomCtx>,
        ...arguments_: ArgumentsForHandlerType<
          TOneOrZeroArguments,
          TCustomMadeArguments
        >
      ) => TReturnValue)
    | ({
        args?: TArgumentsValidator;
        handler: (
          ctx: Overwrite<TInputCtx, TCustomCtx>,
          ...arguments_: ArgumentsForHandlerType<
            TOneOrZeroArguments,
            TCustomMadeArguments
          >
        ) => TReturnValue;
        returns?: TReturnsValidator;
      } & {
        [
          Key in keyof TExtraArguments as Key extends
            "args" | "handler" | "returns"
            ? never
            : Key
        ]: TExtraArguments[Key];
      }),
) => Registration<
  TFunctionType,
  TVisibility,
  ArgsArrayToObject<
    TCustomArgumentsValidator extends Record<string, never>
      ? TOneOrZeroArguments
      : TOneOrZeroArguments extends [infer TArguments extends AnyRecord]
        ? [Expand<ObjectType<TCustomArgumentsValidator> & TArguments>]
        : [ObjectType<TCustomArgumentsValidator>]
  >,
  TReturnValue
>;

/** The ctx type a custom builder's handlers receive. */
export type CustomCtx<TBuilder> =
  TBuilder extends CustomBuilder<
    any,
    any,
    infer TCustom,
    any,
    infer TInputCtx,
    any,
    any
  >
    ? Overwrite<TInputCtx, TCustom>
    : never;
/* eslint-enable @typescript-eslint/no-explicit-any */

type AnyCustomization = Customization<
  AnyRecord,
  PropertyValidators,
  AnyRecord,
  AnyRecord
>;

type Handler = (ctx: AnyRecord, arguments_: AnyRecord) => unknown;

type FunctionDefinition =
  | (AnyRecord & {
      args?: AnyValidator | PropertyValidators;
      handler: Handler;
      returns?: unknown;
    })
  | Handler;

function mergeFields(
  fields: PropertyValidators,
  added: PropertyValidators,
): PropertyValidators {
  return Object.entries(added).reduce<Record<string, GenericValidator>>(
    (merged, [key, validator]) => {
      const existing = merged[key];
      if (existing === undefined) return { ...merged, [key]: validator };
      if (existing.kind !== validator.kind) {
        throw new Error(
          `Cannot intersect validators with different kinds: ${existing.kind} and ${validator.kind}`,
        );
      }
      // Keep the required side when one side is optional; else keep the function's.
      return existing.isOptional === "optional" &&
        validator.isOptional !== "optional"
        ? { ...merged, [key]: validator }
        : merged;
    },
    { ...fields },
  );
}

function addInputArguments(
  functionArguments: AnyValidator | PropertyValidators,
  inputArguments: PropertyValidators,
): AnyValidator {
  const validator: AnyValidator = asObjectValidator(functionArguments);
  if (Object.keys(inputArguments).length === 0) return validator;
  if (validator.kind === "object") {
    return v.object(mergeFields(validator.fields, inputArguments));
  }
  if (validator.kind === "union") {
    return v.union(
      ...validator.members.map((member: AnyValidator) =>
        addInputArguments(member, inputArguments),
      ),
    );
  }
  throw new Error(
    "Cannot add arguments to a validator that is not an object or union.",
  );
}

function splitKeys(
  source: AnyRecord,
  keys: string[],
): { picked: AnyRecord; rest: AnyRecord } {
  const entries = Object.entries(source);
  return {
    picked: Object.fromEntries(entries.filter(([key]) => keys.includes(key))),
    rest: Object.fromEntries(entries.filter(([key]) => !keys.includes(key))),
  };
}

function wrapHandler(options: {
  customization: AnyCustomization;
  extra: AnyRecord;
  handler: Handler;
  splitArgs: boolean;
}): Handler {
  const { customization, extra, handler, splitArgs } = options;
  const inputKeys = Object.keys(customization.args);
  return async (ctx, allArguments) => {
    const { picked, rest } = splitArgs
      ? splitKeys(allArguments, inputKeys)
      : { picked: allArguments, rest: allArguments };
    const added = await customization.input(ctx, picked, extra);
    const result = await handler(
      { ...ctx, ...added.ctx },
      { ...rest, ...added.args },
    );
    if (added.onSuccess) await added.onSuccess({ args: rest, ctx, result });
    return result;
  };
}

function assertNoInputArguments(customization: AnyCustomization): void {
  if (Object.keys(customization.args).length > 0) {
    throw new Error(
      "If you're using a custom function with arguments for the input " +
        "customization, you must declare the arguments for the function too.",
    );
  }
}

function customFunctionBuilder(
  builder: (definition: AnyRecord) => unknown,
  customization: AnyCustomization,
): (definition: FunctionDefinition) => unknown {
  return (definition) => {
    // A bare function is its own handler, with no args validator or extras.
    const {
      args,
      handler = definition as Handler,
      returns,
      ...extra
    } = definition as Partial<Exclude<FunctionDefinition, Handler>>;
    if (args) {
      return builder({
        args: addInputArguments(args, customization.args),
        handler: wrapHandler({
          customization,
          extra,
          handler,
          splitArgs: true,
        }),
        returns,
      });
    }
    assertNoInputArguments(customization);
    return builder({
      handler: wrapHandler({ customization, extra, handler, splitArgs: false }),
      returns,
    });
  };
}

/**
 * Wraps a query builder (`query`, `internalQuery`, `queryGeneric`) with a
 * customization.
 *
 * @param query - The Convex query builder to wrap
 * @param customization - `{ args, input }`, or `customCtx(...)`
 * @returns A builder used like `query({ args, returns, handler })`
 * @example
 * export const userQuery = customQuery(query, customCtx(async (ctx) => ({ user: await requireUser(ctx) })));
 */
export function customQuery<
  TCustomArgumentsValidator extends PropertyValidators,
  TCustomCtx extends AnyRecord,
  TCustomMadeArguments extends AnyRecord,
  TVisibility extends FunctionVisibility,
  TDataModel extends GenericDataModel,
  TExtraArguments extends AnyRecord = object,
>(
  query: QueryBuilder<TDataModel, TVisibility>,
  customization: Customization<
    GenericQueryCtx<TDataModel>,
    TCustomArgumentsValidator,
    TCustomCtx,
    TCustomMadeArguments,
    TExtraArguments
  >,
): CustomBuilder<
  "query",
  TCustomArgumentsValidator,
  TCustomCtx,
  TCustomMadeArguments,
  GenericQueryCtx<TDataModel>,
  TVisibility,
  TExtraArguments
> {
  return customFunctionBuilder(
    query as (definition: AnyRecord) => unknown,
    customization as unknown as AnyCustomization,
  ) as never;
}

/**
 * Wraps a mutation builder (`mutation`, `internalMutation`, `mutationGeneric`)
 * with a customization.
 *
 * @param mutation - The Convex mutation builder to wrap
 * @param customization - `{ args, input }`, or `customCtx(...)`
 * @returns A builder used like `mutation({ args, returns, handler })`
 * @example
 * export const userMutation = customMutation(mutation, { args: {}, input: async (ctx) => ({ args: {}, ctx: { user: await requireUser(ctx) } }) });
 */
export function customMutation<
  TCustomArgumentsValidator extends PropertyValidators,
  TCustomCtx extends AnyRecord,
  TCustomMadeArguments extends AnyRecord,
  TVisibility extends FunctionVisibility,
  TDataModel extends GenericDataModel,
  TExtraArguments extends AnyRecord = object,
>(
  mutation: MutationBuilder<TDataModel, TVisibility>,
  customization: Customization<
    GenericMutationCtx<TDataModel>,
    TCustomArgumentsValidator,
    TCustomCtx,
    TCustomMadeArguments,
    TExtraArguments
  >,
): CustomBuilder<
  "mutation",
  TCustomArgumentsValidator,
  TCustomCtx,
  TCustomMadeArguments,
  GenericMutationCtx<TDataModel>,
  TVisibility,
  TExtraArguments
> {
  return customFunctionBuilder(
    mutation as (definition: AnyRecord) => unknown,
    customization as unknown as AnyCustomization,
  ) as never;
}

/**
 * Wraps an action builder (`action`, `internalAction`, `actionGeneric`) with a
 * customization.
 *
 * @param action - The Convex action builder to wrap
 * @param customization - `{ args, input }`, or `customCtx(...)`
 * @returns A builder used like `action({ args, returns, handler })`
 * @example
 * export const keyedAction = customAction(action, { args: { key: v.string() }, input: async (_ctx, { key }) => ({ args: {}, ctx: { key } }) });
 */
export function customAction<
  TCustomArgumentsValidator extends PropertyValidators,
  TCustomCtx extends AnyRecord,
  TCustomMadeArguments extends AnyRecord,
  TVisibility extends FunctionVisibility,
  TDataModel extends GenericDataModel,
  TExtraArguments extends AnyRecord = object,
>(
  action: ActionBuilder<TDataModel, TVisibility>,
  customization: Customization<
    GenericActionCtx<TDataModel>,
    TCustomArgumentsValidator,
    TCustomCtx,
    TCustomMadeArguments,
    TExtraArguments
  >,
): CustomBuilder<
  "action",
  TCustomArgumentsValidator,
  TCustomCtx,
  TCustomMadeArguments,
  GenericActionCtx<TDataModel>,
  TVisibility,
  TExtraArguments
> {
  return customFunctionBuilder(
    action as (definition: AnyRecord) => unknown,
    customization as unknown as AnyCustomization,
  ) as never;
}
