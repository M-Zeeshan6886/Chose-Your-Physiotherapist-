import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // test files share one database, so run them one after another
  test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"], fileParallelism: false },
});
