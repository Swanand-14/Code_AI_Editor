// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    reporters: "verbose",
    include: [
      "modules/**/__tests__/**/*.test.ts",
      "modules/**/__tests__/**/*.test.tsx",
      "modules/**/*.test.ts",
      "modules/**/*.test.tsx",
    ],
    exclude: ["node_modules", ".next"],
  
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),  // point to root, not ./src
    },
  },
});