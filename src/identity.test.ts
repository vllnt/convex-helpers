import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import {
  type AuthCtx,
  getFromAuth,
  getOrCreateFromAuth,
  isAnonymousIdentity,
  requireFromAuth,
  requireIdentity,
  retargetRows,
} from "./identity.js";

function ctxWith(
  identity: null | { isAnonymous?: boolean; subject: string },
): AuthCtx {
  return {
    auth: {
      getUserIdentity: async () => identity,
    },
  };
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

describe("requireIdentity / getFromAuth / requireFromAuth", () => {
  it("requireIdentity throws when signed out", async () => {
    await expect(requireIdentity(ctxWith(null))).rejects.toBeInstanceOf(
      ConvexError,
    );
  });

  it("getFromAuth returns null when signed out or missing row", async () => {
    expect(
      await getFromAuth(ctxWith(null), async () => ({ id: "1" })),
    ).toBeNull();
    expect(
      await getFromAuth(ctxWith({ subject: "s" }), async () => null),
    ).toBeNull();
  });

  it("getFromAuth attaches isAnonymous", async () => {
    const user = await getFromAuth(
      ctxWith({ isAnonymous: true, subject: "s" }),
      async () => ({
        id: "1",
      }),
    );
    expect(user).toEqual({ id: "1", isAnonymous: true });
  });

  it("requireFromAuth throws USER_NOT_INITIALIZED", async () => {
    await expect(
      requireFromAuth(ctxWith({ subject: "s" }), async () => null),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("requireFromAuth returns the row", async () => {
    const user = await requireFromAuth(ctxWith({ subject: "s" }), async () => ({
      id: "1",
    }));
    expect(user.id).toBe("1");
    expect(user.isAnonymous).toBe(false);
  });
});

describe("getOrCreateFromAuth", () => {
  it("returns the existing row without inserting", async () => {
    let inserted = 0;
    const user = await getOrCreateFromAuth(ctxWith({ subject: "s" }), {
      insert: async () => {
        inserted += 1;
        return { id: "new" };
      },
      lookup: async () => ({ id: "existing" }),
    });
    expect(user.id).toBe("existing");
    expect(inserted).toBe(0);
  });

  it("inserts when lookup misses", async () => {
    const user = await getOrCreateFromAuth(
      ctxWith({ isAnonymous: true, subject: "s" }),
      {
        insert: async (subject) => ({ id: subject }),
        lookup: async () => null,
      },
    );
    expect(user).toEqual({ id: "s", isAnonymous: true });
  });

  it("throws when signed out", async () => {
    await expect(
      getOrCreateFromAuth(ctxWith(null), {
        insert: async () => ({ id: "x" }),
        lookup: async () => null,
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});

describe("retargetRows", () => {
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
