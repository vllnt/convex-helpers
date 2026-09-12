import { describe, expect, it, vi } from "vitest";

import { validateRequest } from "./auth.js";
import { policyCallback } from "./callback.js";

describe("bounded policy callbacks", () => {
  it("enforces its deadline with the real event loop", async () => {
    await expect(
      policyCallback(
        () =>
          new Promise<never>(() => {
            // Deliberately unsettled callback; the real timer must release the caller.
          }),
      ),
    ).rejects.toThrow("Policy callback timed out");
  }, 15_000);

  it("returns values and propagates errors", async () => {
    expect(await policyCallback(() => 1)).toBe(1);
    await expect(
      policyCallback(() => {
        throw new Error("secret");
      }),
    ).rejects.toThrow("secret");
  });

  it("times out and cleans its timer", async () => {
    vi.useFakeTimers();
    try {
      const result = policyCallback(
        () =>
          new Promise<never>(() => {
            /* Deliberately unsettled host callback. */
          }),
      );
      const assertion = expect(result).rejects.toThrow(
        "Policy callback timed out",
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("masks thrown auth and token resolution errors", async () => {
    const request = new Request("https://example.com", {
      headers: { authorization: "Bearer secret" },
    });
    for (const auth of [
      {
        validate: () => {
          throw new Error("secret");
        },
      },
      {
        convexToken: () => {
          throw new Error("secret");
        },
        validate: () => true,
      },
    ]) {
      const result = await validateRequest(request, auth);
      expect(result.valid).toBe(false);
      if (result.valid) throw new Error("Expected rejection");
      expect(await result.response.text()).toBe(
        '{"error":"Authentication failed."}',
      );
    }
  });
});
