import { convexToJson, type Value } from "convex/values";

/** Serialize native Convex values using Convex's lossless tagged JSON format. */
export function stringifyConvex(value: unknown): string {
  return JSON.stringify(convexToJson((value ?? null) as Value), null, 2);
}
