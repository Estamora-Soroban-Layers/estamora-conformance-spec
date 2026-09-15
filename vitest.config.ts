import { defineConfig } from "vitest/config";

/**
 * Test runner configuration for the specification layer.
 *
 * The suite is deliberately split by *what it protects* rather than by source
 * file: `tests/schema` asks whether the schemas reject malformed documents,
 * `tests/lib` covers the shared validation primitives, `tests/profiles` covers
 * bundle loading and layout, `tests/vectors` covers the vector corpus, and
 * `tests/compatibility` asserts the published interface of the repository as a
 * whole (the CLI exit codes other projects depend on).
 *
 * Timeouts are generous on purpose. Several tests spawn the real entry points
 * through `tsx`, which pays a transpiler start-up cost per process; a tight
 * timeout would turn a slow machine into a false failure, and a false failure
 * in a specification repository trains contributors to ignore the suite.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/.tmp*/**"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Assertions are compared as plain data, so a full diff on failure is worth
    // more than a truncated one.
    diff: { expand: true },
  },
});
