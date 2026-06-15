import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "dist/**"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
    coverage: {
      include: ["src/index.ts", "src/mcp/**/*.ts"],
      exclude: ["src/mcp/index.ts", "src/mcp/types.ts", "src/mcp/**/types.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
