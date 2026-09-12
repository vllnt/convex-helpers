import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import {
  getFromAuth,
  getOrCreateFromAuth,
  isAnonymousIdentity,
  requireFromAuth,
  requireIdentity,
  retargetRows,
} from "../src/identity.js";

import schema from "./convex/schema.js";

const modules = import.meta.glob("./convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

describe("isAnonymousIdentity", () => {
  it("is true only for the boolean true flag", () => {
    expect(isAnonymousIdentity({ isAnonymous: true, subject: "s" })).toBe(true);
    expect(isAnonymousIdentity({ isAnonymous: false, subject: "s" })).toBe(
      false,
    );
    expect(isAnonymousIdentity({ subject: "s" })).toBe(false);
  });
});

describe("convex-test identity", () => {
  it("enforces configured issuer before any host-row callback", async () => {
    const lookup = vi.fn(async () => ({ id: "row" }));
    const insert = vi.fn(async () => ({ id: "row" }));
    const trusted = {
      auth: {
        getUserIdentity: async () => ({
          issuer: "https://issuer.example",
          subject: "same",
        }),
      },
      trustedIssuer: "https://issuer.example",
    };
    const row = await getFromAuth(trusted, lookup);
    const identity = await requireIdentity(trusted);
    expect(row?.id).toBe("row");
    expect(identity.subject).toBe("same");
    lookup.mockClear();
    const foreign = {
      ...trusted,
      auth: {
        getUserIdentity: async () => ({
          issuer: "https://attacker.example",
          subject: "same",
        }),
      },
    };
    await expect(getFromAuth(foreign, lookup)).rejects.toThrow(
      "Untrusted issuer",
    );
    await expect(
      getOrCreateFromAuth(foreign, { insert, lookup }),
    ).rejects.toThrow("Untrusted issuer");
    const missing = {
      ...trusted,
      auth: { getUserIdentity: async () => ({ subject: "same" }) },
    };
    await expect(requireIdentity(missing)).rejects.toThrow("Untrusted issuer");
    expect(lookup).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
  it("requireIdentity throws when signed out", async () => {
    const t = setup();
    await expect(
      t.mutation(async (ctx) => requireIdentity(ctx)),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("getFromAuth returns null when signed out or missing row", async () => {
    const t = setup();
    expect(
      await t.mutation(async (ctx) =>
        getFromAuth(ctx, async (subject) =>
          ctx.db
            .query("users")
            .withIndex("by_betterauth_id", (q) => q.eq("betterAuthId", subject))
            .unique(),
        ),
      ),
    ).toBeNull();
    expect(
      await t.withIdentity({ subject: "s" }).mutation(async (ctx) =>
        getFromAuth(ctx, async (subject) =>
          ctx.db
            .query("users")
            .withIndex("by_betterauth_id", (q) => q.eq("betterAuthId", subject))
            .unique(),
        ),
      ),
    ).toBeNull();
  });

  it("getOrCreateFromAuth inserts then reuses", async () => {
    const t = setup();
    const authed = t.withIdentity({ isAnonymous: true, subject: "anon-1" });
    const created = await authed.mutation(async (ctx) =>
      getOrCreateFromAuth(ctx, {
        insert: async (subject) => {
          const id = await ctx.db.insert("users", { betterAuthId: subject });
          const row = await ctx.db.get(id);
          if (row === null) {
            throw new Error("insert failed");
          }
          return row;
        },
        lookup: async (subject) =>
          ctx.db
            .query("users")
            .withIndex("by_betterauth_id", (q) => q.eq("betterAuthId", subject))
            .unique(),
      }),
    );
    expect(created.betterAuthId).toBe("anon-1");
    expect(created.isAnonymous).toBe(true);
    const again = await authed.mutation(async (ctx) =>
      getOrCreateFromAuth(ctx, {
        insert: async () => {
          throw new Error("should not insert");
        },
        lookup: async (subject) =>
          ctx.db
            .query("users")
            .withIndex("by_betterauth_id", (q) => q.eq("betterAuthId", subject))
            .unique(),
      }),
    );
    expect(again.betterAuthId).toBe("anon-1");
  });

  it("requireFromAuth throws USER_NOT_INITIALIZED then returns", async () => {
    const t = setup();
    await expect(
      t.withIdentity({ subject: "s" }).mutation(async (ctx) =>
        requireFromAuth(ctx, async (subject) =>
          ctx.db
            .query("users")
            .withIndex("by_betterauth_id", (q) => q.eq("betterAuthId", subject))
            .unique(),
        ),
      ),
    ).rejects.toBeInstanceOf(ConvexError);
    await t.withIdentity({ subject: "s" }).mutation(async (ctx) => {
      await ctx.db.insert("users", { betterAuthId: "s" });
    });
    const user = await t.withIdentity({ subject: "s" }).mutation(async (ctx) =>
      requireFromAuth(ctx, async (subject) =>
        ctx.db
          .query("users")
          .withIndex("by_betterauth_id", (q) => q.eq("betterAuthId", subject))
          .unique(),
      ),
    );
    expect(user.betterAuthId).toBe("s");
    expect(user.isAnonymous).toBe(false);
  });
});

describe("retargetRows", () => {
  it("rejects oversized pages before callbacks", async () => {
    const apply = vi.fn(async () => "patched" as const);
    await expect(
      retargetRows(Array.from({ length: 1001 }), apply),
    ).rejects.toThrow(RangeError);
    expect(apply).not.toHaveBeenCalled();
  });

  it("stops on failure without starting later callbacks", async () => {
    const apply = vi.fn(async (row: number) => {
      if (row === 2) throw new Error("failed");
      return "patched" as const;
    });
    await expect(retargetRows([1, 2, 3], apply)).rejects.toThrow("failed");
    expect(apply.mock.calls).toEqual([[1], [2]]);
  });

  it("runs one callback at a time and accepts the page limit", async () => {
    let active = false;
    const result = await retargetRows(
      Array.from({ length: 1000 }),
      async () => {
        expect(active).toBe(false);
        active = true;
        await Promise.resolve();
        active = false;
        return "patched";
      },
    );
    expect(result.patched).toBe(1000);
  });
  it("counts patched, skipped, and deleted including empty", async () => {
    expect(await retargetRows([], async () => "patched")).toEqual({
      deleted: 0,
      patched: 0,
      skipped: 0,
    });
    const counted = await retargetRows(["a", "b", "c"], async (row) => {
      if (row === "a") return "patched";
      if (row === "b") return "skipped";
      return "deleted";
    });
    expect(counted).toEqual({ deleted: 1, patched: 1, skipped: 1 });
  });
});
