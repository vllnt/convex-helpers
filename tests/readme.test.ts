import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { brokenLinks } from "../scripts/document-links.mjs";

import { entries, exportsOf, read } from "./package-exports.js";

/**
 * Holds README.md, docs/API.md and llms.txt to the agent-first layout:
 * required sections in order, install and first example near the top, tagged
 * and complete code blocks that type-check against the built package and a
 * typed schema, links that resolve inside the tarball, every export and error
 * text documented, and the exact footer and Ecosystem block.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const readme = read("README.md");
const apiReference = read("docs/API.md");
const llms = read("llms.txt");
const manifest = JSON.parse(read("package.json")) as {
  description: string;
  keywords: string[];
};
const documents = [
  ["README.md", readme],
  ["docs/API.md", apiReference],
] as const;

const requiredSections = [
  "For coding agents",
  "When to use",
  "Install",
  "Quick start",
  "API",
  "Common tasks",
  "Errors and fixes",
  "Limits and gotchas",
  "Compatibility",
  "Testing",
  "Security",
  "Related packages",
  "Contributing",
  "Links",
  "License",
];

const links = `## Links

- Docs and changelog: [oss.vllnt.com/packages/convex-helpers](https://oss.vllnt.com/packages/convex-helpers) · [release feed](https://oss.vllnt.com/packages/convex-helpers/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/convex-helpers) · [issues](https://github.com/vllnt/convex-helpers/issues) · [npm](https://www.npmjs.com/package/@vllnt/convex-helpers)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)
`;

const footer =
  "---\n\nPart of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/convex-helpers) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)\n";

const ecosystem = `## Ecosystem

- [Package page](https://oss.vllnt.com/packages/convex-helpers)
- [Release feed](https://oss.vllnt.com/packages/convex-helpers/rss.xml)
- [All @vllnt packages](https://oss.vllnt.com/llms.txt)
- [Search vllnt packages and docs](https://index.vllnt.com)
- [vllnt](https://vllnt.com/llms.txt)
- [Author](https://bntvllnt.com)
`;

type Fence = { body: string; end: number; info: string; start: number };

/** Fenced code blocks with their info string and 1-based line range. */
function fences(text: string): Fence[] {
  const lines = text.split("\n");
  const found: Fence[] = [];
  let open: undefined | { info: string; marker: string; start: number };
  lines.forEach((line, index) => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (match === null) return;
    const marker = match[1] ?? "";
    if (open === undefined) {
      open = { info: (match[2] ?? "").trim(), marker, start: index + 1 };
    } else if (marker.startsWith(open.marker) && match[2]?.trim() === "") {
      found.push({
        body: lines.slice(open.start, index).join("\n"),
        end: index + 1,
        info: open.info,
        start: open.start,
      });
      open = undefined;
    }
  });
  return found;
}

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`no "## ${heading}" section`);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const flatten = (text: string): string =>
  text
    .replaceAll("`", "")
    .replaceAll("\\|", "|")
    .replaceAll(/\s+/gu, " ")
    .trim();

/** Literal text pieces of an expression (string parts of templates and `+`). */
function pieces(node: ts.Node): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return [node.text];
  if (ts.isTemplateExpression(node))
    return [
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ];
  if (
    ts.isBinaryExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isConditionalExpression(node) ||
    ts.isObjectLiteralExpression(node) ||
    ts.isPropertyAssignment(node)
  ) {
    const parts: string[] = [];
    node.forEachChild((child) => {
      if (!ts.isIdentifier(child)) parts.push(...pieces(child));
    });
    return parts;
  }
  return [];
}

const errorNames = new Set(["error", "errorMessage", "message", "text"]);

/** zod methods whose second argument is the error message. */
const zodMessageMethods = new Set(["refine", "regex"]);

/**
 * Every error text src/ can throw or return: `new *Error(...)` arguments
 * (including `ConvexError` `code` and `message` values), `super(...)` and
 * parameter defaults in Error subclasses, string values of `error`,
 * `errorMessage`, `message` and `text` properties or variables, and messages
 * passed to zod `.regex(…, message)` and `.refine(…, message)`.
 */
function errorTexts(): string[] {
  const texts: string[] = [];
  const visit = (node: ts.Node, inErrorClass: boolean): void => {
    let errorClass = inErrorClass;
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text.endsWith("Error")
    )
      texts.push(
        ...(node.arguments ?? []).flatMap((argument) => pieces(argument)),
      );
    if (ts.isClassDeclaration(node))
      errorClass =
        node.heritageClauses?.some((clause) =>
          clause.types.some(
            (type) =>
              ts.isIdentifier(type.expression) &&
              type.expression.text === "Error",
          ),
        ) ?? false;
    if (
      errorClass &&
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.SuperKeyword
    )
      texts.push(...node.arguments.flatMap((argument) => pieces(argument)));
    if (errorClass && ts.isParameter(node) && node.initializer !== undefined)
      texts.push(...pieces(node.initializer));
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      zodMessageMethods.has(node.expression.name.text) &&
      node.arguments[1] !== undefined
    )
      texts.push(...pieces(node.arguments[1]));
    if (
      (ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      errorNames.has(node.name.text) &&
      node.initializer !== undefined
    )
      texts.push(...pieces(node.initializer));
    node.forEachChild((child) => {
      visit(child, errorClass);
    });
  };
  ts.createProgram(
    entries.map((entry) => join(root, entry.file)),
    { skipLibCheck: true },
  )
    .getSourceFiles()
    .filter((file) => file.fileName.startsWith(join(root, "src")))
    .forEach((source) => {
      visit(source, false);
    });
  return [
    ...new Set(texts.map(flatten).filter((text) => /[A-Za-z]{3}/u.test(text))),
  ].sort();
}

/** The first cell of each body row of the README Errors and fixes table. */
function errorColumn(): string[] {
  return section(readme, "Errors and fixes")
    .split("\n")
    .filter((line) => line.startsWith("| ") && !/^\|\s*-/u.test(line))
    .slice(1)
    .map((line) => flatten(line.split(/(?<!\\)\|/u)[1] ?? ""));
}

/** Bullets of a "When to use" section, each with its continuation lines. */
function whenToUse(text: string): string[][] {
  const bullets: string[][] = [];
  section(text, "When to use")
    .split("\n")
    .forEach((line) => {
      if (line.startsWith("- ")) bullets.push([line]);
      else if (line.startsWith("  ")) bullets.at(-1)?.push(line);
    });
  return bullets;
}

/** Tells whether a `{ ... }` body, or the whole block, holds nothing but line comments. */
const placeholder = (body: string): boolean =>
  /\{\s*(?:\/\/[^\n]*\n\s*)+\}/u.test(body) ||
  body.split("\n").every((line) => /^\s*(?:\/\/.*)?$/u.test(line));

/** Files `npm pack` would ship (without dist/, which the test builds). */
function packedFiles(): string[] {
  const [pack] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as [{ files: { path: string }[] }];
  return pack.files.map((file) => file.path);
}

const packed = packedFiles();

describe("README.md layout", () => {
  it("starts with the package name and one sentence", () => {
    const [title, blank, ...rest] = readme.split("\n");
    expect(title).toBe("# @vllnt/convex-helpers");
    expect(blank).toBe("");
    const sentence = rest.slice(0, rest.indexOf("")).join(" ");
    expect(sentence).toMatch(/^[^.]+\.$/u);
    expect(sentence.length).toBeLessThanOrEqual(160);
    expect(sentence).toBe(manifest.description);
    const summary = llms.split("\n").slice(2);
    expect(
      summary
        .slice(
          0,
          summary.findIndex((line) => !line.startsWith("> ")),
        )
        .map((line) => line.slice(2))
        .join(" "),
    ).toBe(sentence);
  });

  it("has 8 to 12 package keywords", () => {
    expect(manifest.keywords.length).toBeGreaterThanOrEqual(8);
    expect(manifest.keywords.length).toBeLessThanOrEqual(12);
  });

  it.each([
    ["README.md", readme],
    ["llms.txt", llms],
  ])("lists who should and should not use it in %s", (_name, text) => {
    const bullets = whenToUse(text);
    const use = bullets.filter(([first]) => first?.startsWith("- Use it"));
    const avoid = bullets.filter(([first]) =>
      first?.startsWith("- Do not use it"),
    );
    expect(use.length).toBeGreaterThanOrEqual(2);
    expect(use.length).toBeLessThanOrEqual(4);
    expect(avoid.length).toBeGreaterThanOrEqual(1);
    expect(avoid.length).toBeLessThanOrEqual(3);
    expect(use.length + avoid.length).toBe(bullets.length);
    expect(bullets.filter((bullet) => bullet.length > 2)).toStrictEqual([]);
  });

  it("has the required sections in order", () => {
    const headings = [...readme.matchAll(/^## (.+)$/gmu)].map(
      (match) => match[1],
    );
    const order = requiredSections.map((name) => headings.indexOf(name));
    expect(order).not.toContain(-1);
    expect(order).toStrictEqual([...order].sort((a, b) => a - b));
  });

  it("keeps For coding agents to three lines", () => {
    const body = section(readme, "For coding agents")
      .split("\n")
      .slice(2)
      .filter((line) => line !== "");
    expect(body.length).toBeLessThanOrEqual(3);
  });

  it("shows the install command and the first example in 40 lines", () => {
    const top = readme.split("\n").slice(0, 40).join("\n");
    expect(top).toContain("pnpm add @vllnt/convex-helpers");
    const quickStart = readme.indexOf("\n## Quick start\n");
    const example = fences(readme).find(
      (fence) =>
        fence.info === "ts" &&
        fence.start > readme.slice(0, quickStart).split("\n").length,
    );
    expect(example?.end).toBeLessThanOrEqual(40);
    expect(top).not.toContain("img.shields.io");
  });

  it.each(documents)(
    "tags every code block in %s and leaves no gaps or placeholders",
    (_name, text) => {
      const blocks = fences(text);
      expect(blocks.length).toBeGreaterThan(0);
      expect(
        blocks.filter((fence) => fence.info === "").map((fence) => fence.start),
      ).toStrictEqual([]);
      const gaps = blocks.filter(
        (fence) =>
          /\.\.\.(?![\w$({[])|…/u.test(fence.body) || placeholder(fence.body),
      );
      expect(gaps.map((fence) => fence.start)).toStrictEqual([]);
    },
  );

  it("has the exact Links section just before License", () => {
    expect(readme).toContain(`\n${links}\n## License\n`);
  });

  it("ends with the exact footer", () => {
    expect(readme.endsWith(`\n\n${footer}`)).toBe(true);
    expect(readme.split("Part of ").length).toBe(2);
  });
});

describe("README.md content", () => {
  it("lists every export of every entry in the API table", () => {
    const rows = section(readme, "API")
      .split("\n")
      .filter((line) => line.startsWith("| ["));
    const listed = rows.map((row) => {
      const [, name = "", entry = ""] =
        /^\| \[`([^`]+)`\]\([^)]+\)\s*\| `([^`]+)`/u.exec(row) ?? [];
      return `${entry} ${name}`;
    });
    const expected = entries.flatMap(({ file, subpath }) =>
      exportsOf(file).map((name) => `${subpath} ${name}`),
    );
    expect([...listed].sort()).toStrictEqual([...expected].sort());
  });

  let texts: string[] = [];

  beforeAll(() => {
    texts = errorTexts();
  }, 120_000);

  it("documents every error text in the first column of Errors and fixes", () => {
    const column = errorColumn();
    expect(texts.length).toBeGreaterThan(30);
    expect(
      texts.filter((text) => !column.some((cell) => cell.includes(text))),
    ).toStrictEqual([]);
  }, 60_000);

  it("links related @vllnt packages to their package pages", () => {
    const related = [
      ...section(readme, "Related packages").matchAll(
        /\[`?(@vllnt\/[\w.-]+)`?\]\(([^)\s]+)\)/gu,
      ),
    ];
    expect(related.length).toBeGreaterThan(0);
    expect(
      related
        .filter(
          ([, name = "", url]) =>
            url !== `https://oss.vllnt.com/packages/${name.slice(7)}`,
        )
        .map(([link]) => link),
    ).toStrictEqual([]);
  });

  it("uses no link text such as here", () => {
    expect(readme.match(/\[\s*(?:click )?here\s*\]\(/giu) ?? []).toStrictEqual(
      [],
    );
  });

  it("gives every image alt text", () => {
    const images = [...readme.matchAll(/!\[([^\]]*)\]\(/gu)];
    expect(images.length).toBeGreaterThan(0);
    expect(
      images
        .filter(([, alt = ""]) => alt.trim() === "")
        .map(([image]) => image),
    ).toStrictEqual([]);
  });

  it("puts the badges after the Quick start heading", () => {
    const quickStart = readme.indexOf("\n## Quick start\n");
    const badges = [
      ...readme.matchAll(
        /!\[[^\]]*\]\((?:https:\/\/img\.shields\.io|[^)]*badge\.svg)/gu,
      ),
    ];
    expect(badges.length).toBeGreaterThan(0);
    expect(
      badges
        .filter((badge) => badge.index < quickStart)
        .map(([badge]) => badge),
    ).toStrictEqual([]);
  });

  it("resolves every relative link and anchor inside the tarball", () => {
    const documents = new Map(
      packed
        .filter((path) => /\.md$|^llms\.txt$/u.test(path))
        .map((path) => [path, read(path)]),
    );
    expect(brokenLinks(documents, new Set(packed), posix)).toStrictEqual([]);
  });
});

describe("llms.txt", () => {
  it("states the summary and when to use, and links the reference", () => {
    expect(llms).toMatch(/^# @vllnt\/convex-helpers\n\n> /u);
    expect(llms).toContain("\n## When to use\n");
    expect(llms).toContain("](./docs/API.md)");
    expect(llms).toContain("](./README.md#errors-and-fixes)");
  });

  it("ends with the exact Ecosystem block and one oss index link", () => {
    expect(llms.endsWith(`\n\n${ecosystem}`)).toBe(true);
    expect(llms.split("https://oss.vllnt.com/llms.txt").length).toBe(2);
  });
});

describe("retired domain", () => {
  const retired = ["vllnt", "ai"].join(".");

  it("appears in no tracked or shipped file", () => {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((path) => path !== "");
    const hits = [...new Set([...tracked, ...packed])].filter((path) => {
      try {
        return readFileSync(join(root, path), "utf8").includes(retired);
      } catch {
        return false;
      }
    });
    expect(hits).toStrictEqual([]);
  });
});

/**
 * Type-checks the ts blocks of README.md and docs/API.md against the built
 * package. Convex examples import a typed `_generated/server` built from a stub
 * schema (`users` with a `by_subject` index on `subject`, and `projects` with
 * `name`), so the compiler checks table, index and field names. The stub
 * `_generated/api` is `anyApi`, so the compiler does not check function
 * references such as `api.projects.list`.
 */
describe("README.md and docs/API.md examples against the built package", () => {
  const work = join(root, "node_modules/.cache/readme-examples");
  const packageDirectory = join(work, "node_modules/@vllnt/convex-helpers");
  let program: ts.Program | undefined;
  let files: string[] = [];

  beforeAll(() => {
    rmSync(work, { force: true, recursive: true });
    mkdirSync(packageDirectory, { recursive: true });
    packed
      .filter((file) => !file.startsWith("dist/"))
      .forEach((path) => {
        mkdirSync(dirname(join(packageDirectory, path)), { recursive: true });
        cpSync(join(root, path), join(packageDirectory, path));
      });
    const config = ts.getParsedCommandLineOfConfigFile(
      join(root, "tsconfig.build.json"),
      { outDir: join(packageDirectory, "dist") },
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
    );
    if (config === undefined)
      throw new Error("cannot read tsconfig.build.json");
    const build = ts.createProgram(config.fileNames, config.options).emit();
    expect(build.diagnostics).toStrictEqual([]);

    const write = (path: string, text: string): void => {
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), text);
    };
    write(
      "convex/schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export default defineSchema({",
        "  projects: defineTable({ name: v.string() }),",
        '  users: defineTable({ subject: v.string() }).index("by_subject", ["subject"]),',
        "});",
        "",
      ].join("\n"),
    );
    write(
      "convex/_generated/server.ts",
      [
        "import {",
        "  actionGeneric,",
        "  mutationGeneric,",
        "  queryGeneric,",
        "  type ActionBuilder,",
        "  type DataModelFromSchemaDefinition,",
        "  type MutationBuilder,",
        "  type QueryBuilder,",
        '} from "convex/server";',
        "",
        'import type schema from "../schema";',
        "",
        "type DataModel = DataModelFromSchemaDefinition<typeof schema>;",
        "",
        'export const query: QueryBuilder<DataModel, "public"> = queryGeneric;',
        'export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;',
        'export const action: ActionBuilder<DataModel, "public"> = actionGeneric;',
        "",
      ].join("\n"),
    );
    write(
      "convex/_generated/api.ts",
      'export { anyApi as api } from "convex/server";\n',
    );
    documents.forEach(([name, text]) => {
      const prefix = name === "README.md" ? "readme" : "api";
      fences(text).forEach((fence, index) => {
        if (fence.info !== "ts") return;
        const folder = fence.body.includes('from "@/') ? "app" : "convex";
        write(`${folder}/${prefix}-${String(index)}.ts`, fence.body);
      });
    });

    files = ts.sys
      .readDirectory(work, [".ts"], ["node_modules"])
      .filter((path) => /\/(?:readme|api)-\d+\.ts$/u.test(path));
    program = ts.createProgram(files, {
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { "@/*": [join(work, "*")] },
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: ["node"],
    });
  }, 120_000);

  afterAll(() => {
    rmSync(work, { force: true, recursive: true });
  });

  it("type-checks every ts block", () => {
    expect(files.length).toBe(
      documents.flatMap(([, text]) =>
        fences(text).filter((fence) => fence.info === "ts"),
      ).length,
    );
    if (program === undefined) throw new Error("examples were not built");
    const problems = ts
      .getPreEmitDiagnostics(program)
      .map(
        (diagnostic) =>
          `${diagnostic.file?.fileName.slice(work.length + 1) ?? ""}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      );
    expect(problems).toStrictEqual([]);
  }, 60_000);
});
