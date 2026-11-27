import { readFileSync } from "node:fs";

import ts from "typescript";

/** Reads the package entries and their exports from `package.json` and src/. */

export const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const manifest = JSON.parse(read("package.json")) as {
  exports: Record<string, string | { default: string }>;
};

/** Each code entry of `package.json` `exports` with its source file. */
export const entries = Object.entries(manifest.exports).flatMap(
  ([subpath, target]) =>
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

export const program = ts.createProgram(
  entries.map((entry) => entry.file),
  {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  },
);
const checker = program.getTypeChecker();

/** The export symbols of one source file, sorted by name. */
export function exportSymbols(file: string): ts.Symbol[] {
  const source = program.getSourceFile(file);
  const symbol =
    source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`cannot read exports of ${file}`);
  return checker
    .getExportsOfModule(symbol)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The export names of one source file, sorted. */
export function exportsOf(file: string): string[] {
  return exportSymbols(file).map((item) => item.name);
}

/** The TSDoc summary of an export, read from its declaration. */
export function summaryOf(symbol: ts.Symbol): string {
  const target =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return ts.displayPartsToString(target.getDocumentationComment(checker));
}
