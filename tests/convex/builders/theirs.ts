import * as builders from "convex-helpers/server/customFunctions";

import { defineCases } from "./cases.js";

// Runtime parity fixture; src/builders.test.ts compares the types.
export const { bareSubject, keyed, kind, subject, tagged } = defineCases(
  builders as unknown as Parameters<typeof defineCases>[0],
);
