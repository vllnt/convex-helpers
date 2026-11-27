// Fails when the npm tarball would miss the bundled docs coding agents read from
// node_modules/@vllnt/convex-helpers/, would ship contributor or internal files,
// or when a relative link in a shipped doc points outside the tarball. Only inline
// links without a title, the form these docs use, are checked.
// Runs without a build, so dist/ is covered by check-package-contents.sh at publish.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

const root = new URL("..", import.meta.url);
const [pack] = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const packed = new Set(pack.files.map((file) => file.path));

const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "NOTICE",
  "CHANGELOG.md",
  "llms.txt",
  "docs/API.md",
  "src/index.ts",
];
const missing = required.filter((path) => !packed.has(path));
assert.deepEqual(
  missing,
  [],
  `tarball is missing required file(s): ${missing.join(", ")}`,
);

const internal =
  /^(AGENTS\.md|CLAUDE\.md|ROADMAP\.md|IDEAS\.md|CONTRIBUTING\.md|docs\/READINESS\.md|tests\/|scripts\/|\.github\/)|\.(test|spec)\.[cm]?[jt]sx?$/u;
const leaked = [...packed].filter((path) => internal.test(path));
assert.deepEqual(
  leaked,
  [],
  `tarball ships internal file(s): ${leaked.join(", ")}`,
);

const docs = ["llms.txt", "README.md", "docs/API.md"];
const linksOf = (path) =>
  [
    ...readFileSync(new URL(path, root), "utf8").matchAll(/\]\(([^)\s]+)\)/gu),
  ].map((match) => match[1]);
const unresolved = docs.flatMap((doc) =>
  linksOf(doc)
    .filter((href) => !/^([a-z][a-z\d+.-]*:|#)/iu.test(href))
    .map((href) => posix.join(posix.dirname(doc), href.split("#")[0]))
    .filter((path) => !packed.has(path))
    .map((path) => `${doc} -> ${path}`),
);
assert.deepEqual(
  unresolved,
  [],
  `relative doc link(s) not in the tarball: ${unresolved.join(", ")}`,
);
const mainLinks = linksOf("llms.txt").filter((href) =>
  /github\.com\/[^)]*\/blob\/main\/(README\.md|CHANGELOG\.md|NOTICE|LICENSE|docs\/)/u.test(
    href,
  ),
);
assert.deepEqual(
  mainLinks,
  [],
  `llms.txt: link shipped files relatively, not to main: ${mainLinks.join(", ")}`,
);

console.log(
  `OK    package docs: ${required.length} required file(s); relative links in ${docs.join(", ")} resolve`,
);
