import { readFileSync, writeFileSync } from "fs";

const files = [
  "README.md",
  "CHANGELOG.md",
  "docs/API.md",
  "src/index.ts",
  "src/better-auth.ts",
  "src/identity.ts",
  "src/mcp/index.ts",
  "src/mcp/types.ts",
  "src/mcp/auth.ts",
  "src/mcp/callback.ts",
  "src/mcp/tools/types.ts",
  "src/mcp/tools/helpers.ts",
  "src/mcp/tools/register.ts",
  "src/mcp/resources/types.ts",
  "src/mcp/resources/helpers.ts",
  "src/mcp/resources/register.ts",
];

let out = "# @vllnt/convex-helpers — Full Source\n\nAuto-generated. Do not edit manually.\n";

for (const f of files) {
  out += "\n---\n\n## " + f + "\n\n";
  if (f.endsWith(".md")) {
    out += readFileSync(f, "utf8");
  } else {
    out += "```ts\n" + readFileSync(f, "utf8") + "```";
  }
  out += "\n";
}

writeFileSync("llms-full.txt", out);
console.log("Generated llms-full.txt");
