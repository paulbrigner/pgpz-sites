import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: [
      { find: "@pgpz/core/server", replacement: path.resolve(__dirname, "../../packages/core/src/server/index.ts") },
      { find: "@pgpz/core", replacement: path.resolve(__dirname, "../../packages/core/src/index.ts") },
      { find: "@pgpz/auth-dynamodb", replacement: path.resolve(__dirname, "../../packages/auth-dynamodb/src/index.ts") },
      { find: "@pgpz/ui", replacement: path.resolve(__dirname, "../../packages/ui/src/index.ts") },
      { find: "server-only", replacement: path.resolve(__dirname, "../../packages/core/src/test-server-only.ts") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  }
});
