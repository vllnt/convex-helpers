import { base } from "@vllnt/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "scripts/**",
      "tests/**",
      "eslint.config.js",
      "vitest.config.mts",
    ],
  },
  ...base,
  // Test files: relax rules that conflict with testing null-handling code
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "unicorn/no-null": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "unicorn/no-useless-undefined": "off",
    },
  },
  // ./mcp entry: ported verbatim from @vllnt/convex-mcp (the absorb-convex-mcp
  // migration — see ROADMAP.md). Proven, 100%-covered MCP/JSON-RPC/Web-Crypto code.
  // These relaxations are legitimate for protocol-level code, not blanket exemptions:
  //   - no-null: JSON-RPC requires literal `id: null`; the `null` Convex validator maps to it.
  //   - prefer-code-point: base64 byte handling MUST use charCodeAt/fromCharCode (codePointAt
  //     corrupts surrogate pairs) — a false positive for binary work.
  //   - naming-convention: HTTP header keys ("Content-Type") are not camelCase.
  //   - no-unsafe-return: the injectable `ConvexClient.{query,mutation,action}` return `Promise<any>`
  //     (Convex `FunctionReference` can't be typed without importing internals) — the seam is `any`.
  //   - no-deprecated: uses the MCP SDK `tool()`/`resource()` API. Migrating to
  //     registerTool/registerResource is a tracked follow-up (ROADMAP absorb-convex-mcp).
  //   - loop/abbreviation/length/comment-prose rules: stylistic, not worth churning proven code.
  {
    files: ["src/mcp/**/*.ts"],
    rules: {
      "unicorn/no-null": "off",
      "unicorn/prefer-code-point": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/consistent-destructuring": "off",
      "unicorn/prefer-export-from": "off",
      "write-good-comments/write-good-comments": "off",
      "max-lines-per-function": "off",
      "max-params": "off",
      "no-restricted-syntax": "off",
      "functional/no-loop-statements": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
];
