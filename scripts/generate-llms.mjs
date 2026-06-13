import { readFileSync, writeFileSync } from "fs";

const files = [
  "README.md",
  "CHANGELOG.md",
  "docs/API.md",
  "src/index.ts",
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
