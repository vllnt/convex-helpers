import ts from "typescript";
import { describe, expect, it } from "vitest";

import { codeTypeNames } from "../scripts/document-links.mjs";

import {
  entries,
  exportsOf,
  exportSymbols,
  program,
  read,
  summaryOf,
} from "./package-exports.js";

/**
 * Checks that docs/API.md names every public export (values and types) of each
 * package entry in that entry's section, and that each entry exports every name
 * the reference lists for it (Export/Function tables, "Exported types",
 * signature headings). Every export also needs a TSDoc summary.
 */

const api = read("docs/API.md");

function sectionFor(subpath: string): string {
  const sections = api.split(/^## /mu).slice(1);
  const found = sections.find((section) => {
    const heading = section.slice(0, section.indexOf("\n"));
    return subpath === "."
      ? heading.startsWith("Root utilities")
      : heading.includes(`\`${subpath}\``);
  });
  if (found === undefined)
    throw new Error(`docs/API.md: no ${subpath} section`);
  return found;
}

const identifier = /^[A-Za-z_$][\w$]*/u;

function spans(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/gu)].flatMap((match) => {
    const name = identifier.exec(match[1] ?? "")?.[0];
    return name === undefined ? [] : [name];
  });
}

/** A `###` heading lists a signature (`name(...)`, `a / b`) or one bare name. */
function headingNames(heading: string): string[] {
  const text = heading.slice(4).replaceAll("`", "").trim();
  if (!text.includes("(") && !text.includes(" / "))
    return /\s/u.test(text) ? [] : [text];
  return text.split(" / ").flatMap((part) => identifier.exec(part)?.[0] ?? []);
}

function exportTableNames(block: string): string[] {
  const [header = "", , ...rows] = block.split("\n");
  if (!/^\|\s*(Export|Function)\s*\|/u.test(header)) return [];
  return rows.flatMap((row) => spans(row.split("|")[1] ?? ""));
}

/** Names the section presents as exports of its entry. */
function listedExports(section: string): string[] {
  const blocks = section.split(/\n\s*\n/u);
  const names = blocks.flatMap((block, index) => {
    if (block.startsWith("### ")) return headingNames(block);
    if (block.startsWith("|")) return exportTableNames(block);
    const typeList =
      block.startsWith("Exported type") ||
      blocks[index - 1] === "### Exported types";
    return typeList ? spans(block) : [];
  });
  return [...new Set(names)].sort();
}

/** Names the docs may show in code that are not this package's exports. */
const outsideNames = new Set([
  "ArrayBuffer",
  "Date",
  "Map",
  "Promise",
  "Record",
  "Request",
  "Response",
  "Authorization",
  "Bearer",
  "Origin",
  "AppError",
  "RowLevelSecurity",
  "Builder",
  "Tool",
]);

const publicNames = new Set(entries.flatMap((entry) => exportsOf(entry.file)));

/** Type, interface, class and enum names declared anywhere in src/. */
const declaredTypes = new Set(
  program
    .getSourceFiles()
    .filter((source) => /\/src\/(?!.*\.test\.ts$)/u.test(source.fileName))
    .flatMap((source) =>
      source.statements.flatMap((statement) =>
        (ts.isTypeAliasDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name !== undefined
          ? [statement.name.text]
          : [],
      ),
    ),
);

/** The README's error table quotes messages, whose capitalized words are not type names. */
const withoutErrorTable = (text: string): string =>
  text.replace(/\n## Errors and fixes\n[\s\S]*?(?=\n## )/u, "\n");

describe("docs/API.md matches the package exports", () => {
  it.each(entries)(
    "documents every export of $subpath",
    ({ file, subpath }) => {
      const listed = new Set(listedExports(sectionFor(subpath)));
      const undocumented = exportsOf(file).filter((name) => !listed.has(name));
      expect(undocumented).toStrictEqual([]);
    },
  );

  it.each(entries)(
    "lists only real exports for $subpath",
    ({ file, subpath }) => {
      const exported = new Set(exportsOf(file));
      const listed = listedExports(sectionFor(subpath));
      expect(listed.length).toBeGreaterThan(0);
      expect(listed.filter((name) => !exported.has(name))).toStrictEqual([]);
    },
  );

  it.each(["docs/API.md", "README.md", "llms.txt"])(
    "%s names no internal type of this package",
    (file) => {
      const internal = [...new Set(read(file).match(/\b[A-Z]\w*\b/gu))].filter(
        (name) => declaredTypes.has(name) && !publicNames.has(name),
      );
      expect(internal).toStrictEqual([]);
    },
  );

  it.each(["docs/API.md", "README.md", "llms.txt"])(
    "%s names only real exports or known outside names in code",
    (file) => {
      const named = codeTypeNames(withoutErrorTable(read(file)));
      expect(
        [...new Set(named)].filter(
          (name) => !publicNames.has(name) && !outsideNames.has(name),
        ),
      ).toStrictEqual([]);
    },
  );

  it.each(entries)(
    "gives every export of $subpath a TSDoc summary",
    ({ file }) => {
      const bare = exportSymbols(file)
        .filter((symbol) => summaryOf(symbol).trim() === "")
        .map((symbol) => symbol.name);
      expect(bare).toStrictEqual([]);
    },
  );

  it.each(entries.filter((entry) => entry.subpath !== "."))(
    "names $subpath in README.md and llms.txt",
    ({ subpath }) => {
      expect(read("README.md")).toContain(`\`${subpath}\``);
      expect(read("llms.txt")).toContain(`\`${subpath}\``);
    },
  );
});
