// Fails when the npm tarball would miss the bundled docs coding agents read from
// node_modules/@vllnt/convex-helpers/, would ship contributor or internal files,
// when a relative link or #anchor in a shipped doc does not resolve inside the
// tarball, or when a shipped file names a repository file that is not packed.
// Runs without a build, so dist/ is covered by check-package-contents.sh at publish.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

import {
  brokenLinks,
  linkTargets,
  repoOnlyMentions,
} from "./document-links.mjs";

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

const read = (path) => readFileSync(new URL(path, root), "utf8");
const docs = new Map(
  [...packed]
    .filter((path) => /\.md$|^llms\.txt$/u.test(path))
    .sort()
    .map((path) => [path, read(path)]),
);
const unresolved = brokenLinks(docs, packed, posix);
assert.deepEqual(
  unresolved,
  [],
  `relative doc link(s) not in the tarball: ${unresolved.join(", ")}`,
);

const repoOnly = execFileSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter((path) => path !== "" && !packed.has(path));
const textFiles = [...packed].filter((path) =>
  /\.(md|txt|ts)$|^NOTICE$/u.test(path),
);
const named = textFiles.flatMap((path) =>
  repoOnlyMentions(read(path), repoOnly).map(
    (mention) => `${path} -> ${mention}`,
  ),
);
assert.deepEqual(
  named,
  [],
  `shipped file(s) name repository-only files (link them on GitHub instead): ${named.join(", ")}`,
);
const mainLinks = linkTargets(docs.get("llms.txt")).filter((href) =>
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
  `OK    package docs: ${required.length} required file(s); links in ${[...docs.keys()].join(", ")} resolve; ${textFiles.length} shipped text file(s) name no repo-only file`,
);
