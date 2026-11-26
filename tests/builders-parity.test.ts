import { type FunctionReference, makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./convex/schema.js";

const modules = import.meta.glob("./convex/**/*.ts");

type Outcome = { error: string } | { value: unknown };

type Name = "bareSubject" | "keyed" | "kind" | "subject" | "tagged";

/* eslint-disable @typescript-eslint/no-explicit-any -- convex-test takes untyped references to fixture functions */
type Functions = Record<Name, FunctionReference<any>>;

function functionsOf(module: "ours" | "theirs"): Functions {
  const names: Name[] = ["bareSubject", "keyed", "kind", "subject", "tagged"];
  return Object.fromEntries(
    names.map((name) => [
      name,
      makeFunctionReference<any>(`builders/${module}:${name}`),
    ]),
  ) as Functions;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs one scenario against a fresh backend for each implementation. */
async function bothWays(
  scenario: (
    t: ReturnType<typeof convexTest>,
    fns: Functions,
  ) => Promise<unknown>,
): Promise<{ ours: unknown; theirs: unknown }> {
  const run = async (name: "ours" | "theirs") => {
    const t = convexTest(schema, modules);
    const result = await scenario(t, functionsOf(name));
    const tasks = await t.run(async (ctx) => {
      const rows = await ctx.db.query("tasks").collect();
      return rows.map((task) => task.title);
    });
    return { result, tasks };
  };
  return { ours: await run("ours"), theirs: await run("theirs") };
}

describe("builders parity with convex-helpers 0.1.124 (convex-test)", () => {
  it("customCtx adds ctx fields with and without an identity", async () => {
    const { ours, theirs } = await bothWays(async (t, fns) => ({
      anonymous: await t.query(fns.subject, { prefix: "p:" }),
      bare: await t.withIdentity({ subject: "u2" }).query(fns.bareSubject, {}),
      signedIn: await t
        .withIdentity({ subject: "u1" })
        .query(fns.subject, { prefix: "p:" }),
    }));
    expect(ours).toStrictEqual(theirs);
    expect(ours).toMatchObject({
      result: { anonymous: "p:anonymous", bare: "u2", signedIn: "p:u1" },
    });
  });

  it("{ args, input } consumes its args, adds args, sees extras and runs onSuccess", async () => {
    const { ours, theirs } = await bothWays(async (t, fns) =>
      t.mutation(fns.tagged, { tag: "T", title: "hello" }),
    );
    expect(ours).toStrictEqual(theirs);
    expect(ours).toStrictEqual({
      result: "T|T:extra|hello|label,title",
      tasks: ["after:T|T:extra|hello|label,title:title"],
    });
  });

  it("rejects calls missing a consumed arg", async () => {
    const { ours, theirs } = await bothWays(async (t, fns) =>
      outcome(() => t.mutation(fns.tagged, { title: "hello" })),
    );
    expect(ours).toStrictEqual(theirs);
    expect(ours).toMatchObject({
      result: { error: expect.stringContaining("tag") },
    });
  });

  it("customCtx receives the definition's extra properties", async () => {
    const { ours, theirs } = await bothWays(async (t, fns) =>
      t.mutation(fns.kind, { name: "n" }),
    );
    expect(ours).toStrictEqual(theirs);
    expect(ours).toMatchObject({ result: { kind: "artist", name: "n" } });
  });

  it("customAction adds ctx fields", async () => {
    const { ours, theirs } = await bothWays(async (t, fns) =>
      t.action(fns.keyed, { n: 7 }),
    );
    expect(ours).toStrictEqual(theirs);
    expect(ours).toMatchObject({ result: "k7" });
  });
});
