/**
 * @module @vllnt/convex-helpers
 * Pure host-side helpers for Convex backends.
 */

/**
 * Applies an async function to every element of an array, returning results in order.
 *
 * @param list - Input array
 * @param fn - Async mapper function
 * @returns Promise resolving to mapped array in original order
 * @example
 * const docs = await asyncMap(ids, (id) => ctx.db.get(id));
 */
export async function asyncMap<T, TResult>(
  list: T[],
  fn: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  return Promise.all(list.map(fn));
}

/**
 * Filters null and undefined values from an array.
 *
 * @param list - Input array potentially containing null/undefined
 * @returns Array with all null and undefined values removed
 * @example
 * const docs = pruneNull(await asyncMap(ids, (id) => ctx.db.get(id)));
 */
export function pruneNull<T>(list: (null | T | undefined)[]): T[] {
  return list.filter((item): item is T => item !== null && item !== undefined);
}

/**
 * Error thrown when a required document is null or undefined.
 */
export class NullDocumentError extends Error {
  constructor(message = "Expected a non-null document") {
    super(message);
    this.name = "NullDocumentError";
  }
}

/**
 * Asserts a value is non-null and non-undefined, throwing NullDocumentError when absent.
 *
 * @param value - Value to check
 * @param message - Optional custom error message
 * @returns The value, narrowed to exclude null and undefined
 * @throws {NullDocumentError} When value is null or undefined
 * @example
 * const doc = nullThrows(await ctx.db.get(id), `Document ${id} not found`);
 */
export function nullThrows<T>(
  value: null | T | undefined,
  message?: string,
): T {
  if (value === null || value === undefined) {
    throw new NullDocumentError(message);
  }
  return value;
}
