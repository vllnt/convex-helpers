/**
 * Host-ctx identity glue: map `ctx.auth` to a host row, and retarget rows when
 * an anonymous subject upgrades. Writes the **host's** tables — not a component.
 */

import { ConvexError } from "convex/values";

export type AuthIdentity = {
  isAnonymous?: unknown;
  issuer?: string;
  subject: string;
};

export type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<AuthIdentity | null>;
  };
  /** Host-configured issuer; never accept this value from request arguments. */
  trustedIssuer?: string;
};

export function isAnonymousIdentity(identity: AuthIdentity): boolean {
  return identity.isAnonymous === true;
}

function assertTrustedIssuer(ctx: AuthCtx, identity: AuthIdentity): void {
  if (
    ctx.trustedIssuer !== undefined &&
    identity.issuer !== ctx.trustedIssuer
  ) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Untrusted issuer.",
    });
  }
}

export async function requireIdentity(ctx: AuthCtx): Promise<AuthIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign-in required.",
    });
  }
  assertTrustedIssuer(ctx, identity);
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
  assertTrustedIssuer(ctx, identity);
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
 * Atomic when both callbacks use the SAME Convex mutation transaction,
 * including an indexed lookup; every competing writer must use that lookup.
 * Actions, remote calls and nontransactional callbacks do not provide uniqueness.
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
 * Process at most 1000 rows sequentially (one callback in flight).
 * The host owns authorization, page size, continuation, conflict resolution and
 * transaction boundaries. This is not an account merge or ownership check.
 */
export async function retargetRows<T>(
  rows: readonly T[],
  apply: (row: T) => Promise<"deleted" | "patched" | "skipped">,
): Promise<{ deleted: number; patched: number; skipped: number }> {
  if (rows.length > 1000) {
    throw new RangeError("retargetRows accepts at most 1000 rows per page");
  }
  return rows.reduce<
    Promise<{ deleted: number; patched: number; skipped: number }>
  >(
    async (previous, row) => {
      const counts = await previous;
      const outcome = await apply(row);
      return { ...counts, [outcome]: counts[outcome] + 1 };
    },
    Promise.resolve({ deleted: 0, patched: 0, skipped: 0 }),
  );
}
