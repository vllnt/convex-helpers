import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Checks that docs/API.md names every public export (values and types) of each
 * package entry in that entry's section, and that each entry exports every name
 * the reference lists for it (Export/Function tables, "Exported types",
 * signature headings).
 */

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const manifest = JSON.parse(read("package.json")) as {
  exports: Record<string, string | { default: string }>;
};
const entries = Object.entries(manifest.exports).flatMap(([subpath, target]) =>
  typeof target === "string"
    ? []
    : [
        {
          file: target.default
            .replace(/^\.\/dist\//u, "src/")
            .replace(/\.js$/u, ".ts"),
          subpath,
        },
      ],
);

const program = ts.createProgram(
  entries.map((entry) => entry.file),
  {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  },
);
const checker = program.getTypeChecker();

function exportsOf(file: string): string[] {
  const source = program.getSourceFile(file);
  const symbol =
    source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`cannot read exports of ${file}`);
  return checker
    .getExportsOfModule(symbol)
    .map((item) => item.name)
    .sort();
}

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

function headingNames(heading: string): string[] {
  if (!heading.includes("(") && !heading.includes(" / ")) return [];
  return heading
    .slice(4)
    .split(" / ")
    .flatMap((part) => identifier.exec(part)?.[0] ?? []);
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

describe("docs/API.md matches the package exports", () => {
  it.each(entries)(
    "documents every export of $subpath",
    ({ file, subpath }) => {
      const section = sectionFor(subpath);
      const undocumented = exportsOf(file).filter(
        (name) => !new RegExp(`(\`|^### )${name}\\b`, "mu").test(section),
      );
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

  it.each(entries.filter((entry) => entry.subpath !== "."))(
    "names $subpath in README.md and llms.txt",
    ({ subpath }) => {
      expect(read("README.md")).toContain(`\`${subpath}\``);
      expect(read("llms.txt")).toContain(`\`${subpath}\``);
    },
  );
});
