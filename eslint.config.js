import { base } from "@vllnt/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "scripts/**",
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
];
