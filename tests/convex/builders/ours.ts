import * as builders from "../../../src/builders.js";

import { defineCases } from "./cases.js";

export const { bareSubject, keyed, kind, subject, tagged } =
  defineCases(builders);
