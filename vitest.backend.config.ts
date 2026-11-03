import { defineConfig } from "vitest/config"
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "edge-runtime",
    include: [
      "convex/**/*.test.ts",
      "src/components/workspace-connections.test.tsx",
    ],
  },
})
