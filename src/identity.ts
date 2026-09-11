/**
 * Host-ctx identity glue: map `ctx.auth` to a host row, and retarget rows when
 * an anonymous subject upgrades. Writes the **host's** tables — not a component.
 */

import { ConvexError } from "convex/values";

export type AuthIdentity = {
  isAnonymous?: unknown;
  subject: string;
};

export type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<AuthIdentity | null>;
  };
};

export function isAnonymousIdentity(identity: AuthIdentity): boolean {
  return identity.isAnonymous === true;
}

export async function requireIdentity(ctx: AuthCtx): Promise<AuthIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign-in required.",
    });
  }
  return identity;
}

/**
 * Query-side lookup. Returns null when unauthenticated or the host row is not
 * there yet (BetterAuth `onCreate` can lag a fresh anonymous session).
 */
export async function getFromAuth<T extends object>(
  ctx: AuthCtx,
  lookup: (subject: string) => Promise<null | T>,
): Promise<null | (T & { isAnonymous: boolean })> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  const row = await lookup(identity.subject);
  if (row === null) return null;
  return { ...row, isAnonymous: isAnonymousIdentity(identity) };
}

export async function requireFromAuth<T extends object>(
  ctx: AuthCtx,
  lookup: (subject: string) => Promise<null | T>,
): Promise<T & { isAnonymous: boolean }> {
  const user = await getFromAuth(ctx, lookup);
  if (user === null) {
    throw new ConvexError({
      code: "USER_NOT_INITIALIZED",
      message: "User not initialized — the auth session may still be settling.",
    });
  }
  return user;
}

/**
 * Mutation-side: look up the host row for the current identity, or insert it.
 * Closes the race between BetterAuth `onCreate` and the first authed write.
 */
export async function getOrCreateFromAuth<T extends object>(
  ctx: AuthCtx,
  handlers: {
    insert: (subject: string) => Promise<T>;
    lookup: (subject: string) => Promise<null | T>;
  },
): Promise<T & { isAnonymous: boolean }> {
  const identity = await requireIdentity(ctx);
  const existing = await handlers.lookup(identity.subject);
  const row = existing ?? (await handlers.insert(identity.subject));
  return { ...row, isAnonymous: isAnonymousIdentity(identity) };
}

/**
 * Apply a host patch to every row keyed by `fromRef`. The host decides skip /
 * merge / patch; this runs the work and counts outcomes.
 */
export async function retargetRows<T>(
  rows: readonly T[],
  apply: (row: T) => Promise<"deleted" | "patched" | "skipped">,
): Promise<{ deleted: number; patched: number; skipped: number }> {
  const outcomes = await Promise.all(rows.map(async (row) => apply(row)));
  return outcomes.reduce(
    (accumulator, outcome) => {
      return { ...accumulator, [outcome]: accumulator[outcome] + 1 };
    },
    { deleted: 0, patched: 0, skipped: 0 },
  );
}
