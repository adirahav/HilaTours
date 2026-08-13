import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Booting mongodb-memory-server in `beforeAll` regularly exceeds vitest's
    // default 10s hook timeout on a cold binary cache (mirrors tour-service).
    hookTimeout: 120000,
    testTimeout: 30000,
    // In-memory Mongo is shared per file; run test files sequentially.
    fileParallelism: false,
    // Without this, vitest's default include glob also picks up compiled
    // *.test.js under dist/ (from `npm run build`), double-running every
    // test against stale output and confusing failures with real ones.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
})
