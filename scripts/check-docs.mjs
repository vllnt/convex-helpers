import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const range = JSON.parse(read("package.json")).peerDependencies.convex;
for (const path of ["docs/API.md", "llms.txt", "llms-full.txt"]) {
  const documented = [...read(path).matchAll(/convex@([^`\s]+)/gu)].map((match) => match[1]);
  assert.ok(documented.length > 0, `${path}: missing Convex peer range`);
  for (const value of documented) {
    assert.equal(value, range, `${path}: stale Convex peer range`);
  }
}
const minimum = range.replace(/^\^/u, "");
assert.ok(read(".github/ISSUE_TEMPLATE/bug.yml").includes(`placeholder: "${minimum}"`), "Bug template: stale Convex version example");
