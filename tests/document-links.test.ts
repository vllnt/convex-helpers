import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import {
  brokenLinks,
  headingAnchors,
  linkTargets,
  repoOnlyMentions,
} from "../scripts/document-links.mjs";

describe("linkTargets", () => {
  it("reads every link form the docs can use", () => {
    const markdown = [
      "[plain](a.md) and [titled](b.md \"Title\") and [single](c.md 'T')",
      "[paren](d.md (T)) and [angle](<e f.md>) and ![image](g.png)",
      "[![badge](https://img.example/x.svg)](h.md#part)",
      '[ref]: i.md "Ref title"',
      "<a href=\"j.md\">j</a> <img src='k.png'>",
    ].join("\n");
    expect(linkTargets(markdown)).toStrictEqual([
      "a.md",
      "b.md",
      "c.md",
      "d.md",
      "e f.md",
      "g.png",
      "https://img.example/x.svg",
      "h.md#part",
      "i.md",
      "j.md",
      "k.png",
    ]);
  });

  it("ignores links inside code", () => {
    const markdown =
      "`[x](span.md)`\n\n```md\n[y](fence.md)\n```\n[z](real.md)";
    expect(linkTargets(markdown)).toStrictEqual(["real.md"]);
  });

  it("does not let a stray backtick hide later paragraphs", () => {
    const markdown = "Use the ` char.\n\n[a](ROADMAP.md)\n\nand `x`";
    expect(linkTargets(markdown)).toStrictEqual(["ROADMAP.md"]);
  });

  it("does not close a fence on a line with an info string", () => {
    const markdown = "```\ncode\n```bash\n[a](inside.md)\n```\n[b](after.md)";
    expect(linkTargets(markdown)).toStrictEqual(["after.md"]);
  });
});

describe("headingAnchors", () => {
  it("matches GitHub anchors, numbering duplicates", () => {
    const markdown = [
      "## MCP tools (`./mcp`)",
      "## `./validators` (shipped)",
      "### asyncMap\\<T, U\\>(list, fn)",
      "## Usage",
      "## Usage",
      "```md\n## Not a heading\n```",
    ].join("\n");
    expect([...headingAnchors(markdown)]).toStrictEqual([
      "mcp-tools-mcp",
      "validators-shipped",
      "asyncmapt-ulist-fn",
      "usage",
      "usage-1",
    ]);
  });
});

describe("brokenLinks", () => {
  const packed = new Set(["README.md", "docs/API.md", "LICENSE"]);
  const check = (readme: string, api = "## Install\n") =>
    brokenLinks(
      new Map([
        ["docs/API.md", api],
        ["README.md", readme],
      ]),
      packed,
      posix,
    );

  it("accepts links to packed files and existing headings", () => {
    expect(
      check(
        "# Top\n[a](./docs/API.md#install) [b](LICENSE) [c](#top) [d](https://x.example/y.md)",
      ),
    ).toStrictEqual([]);
  });

  it("reports titled, reference and HTML links to unpacked files", () => {
    expect(
      check(
        '[a](ROADMAP.md "Roadmap")\n[r]: ./SECURITY.md\n<a href="CONTRIBUTING.md">c</a>',
      ),
    ).toStrictEqual([
      "README.md -> ROADMAP.md",
      "README.md -> ./SECURITY.md",
      "README.md -> CONTRIBUTING.md",
    ]);
  });

  it("reports anchors with no matching heading", () => {
    expect(check("[a](docs/API.md#missing) [b](#nowhere)")).toStrictEqual([
      "README.md -> docs/API.md#missing (no such heading)",
      "README.md -> #nowhere (no such heading)",
    ]);
  });

  it("reports a malformed escape instead of throwing", () => {
    expect(check("[a](bad%E0.md)")).toStrictEqual(["README.md -> bad%E0.md"]);
  });

  it("resolves links relative to the linking doc", () => {
    expect(check("", "[a](../README.md) [b](README.md)")).toStrictEqual([
      "docs/API.md -> README.md",
    ]);
  });
});

describe("repoOnlyMentions", () => {
  const repoOnly = ["scripts/proof.mjs", "vitest.config.mts", "docs/NOTES.md"];

  it("reports repository-only paths named in text or code spans", () => {
    expect(
      repoOnlyMentions(
        "Run `scripts/proof.mjs`; see vitest.config.mts and [notes](docs/NOTES.md).",
        repoOnly,
      ),
    ).toStrictEqual(repoOnly);
  });

  it("reports them with a leading ./", () => {
    expect(
      repoOnlyMentions(
        "Run ./scripts/proof.mjs or `./vitest.config.mts`.",
        repoOnly,
      ),
    ).toStrictEqual(["scripts/proof.mjs", "vitest.config.mts"]);
  });

  it("allows them as the text of an absolute link or inside a URL", () => {
    expect(
      repoOnlyMentions(
        "[`scripts/proof.mjs`](https://github.com/o/r/blob/main/scripts/proof.mjs) and https://github.com/o/r/blob/main/docs/NOTES.md",
        repoOnly,
      ),
    ).toStrictEqual([]);
  });

  it("matches whole paths only", () => {
    expect(
      repoOnlyMentions(
        "src/vitest.config.mts.bak other/scripts/proof.mjs",
        repoOnly,
      ),
    ).toStrictEqual([]);
  });
});
