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
    coverage: {
      provider: "v8",
      // The library, not the entry points. `scripts/*.ts` are process entry
      // points: they are executed by `tests/compatibility/exit-codes.test.ts`,
      // which spawns them through `tsx` and asserts their exit codes, and the v8
      // provider cannot attribute coverage to a child process. Counting them here
      // would report a denominator in the thousands at zero and bury the surface
      // that can be measured.
      //
      // What is excluded, and what covers it, is named in the README's "Test
      // coverage" section rather than left implicit here. An exclusion visible
      // only in a config file is indistinguishable from a hidden denominator.
      include: ["scripts/lib/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        // `models.ts` declares types and `index.ts` re-exports. Neither contains
        // a runtime statement, so instrumenting them reports 0% for a file with
        // nothing to cover: a figure that reads as a gap and is not one.
        "**/scripts/lib/models.ts",
        "**/scripts/lib/index.ts",
        // Test infrastructure, which is not shipped code.
        "**/tests/**",
      ],
      reporter: ["text", "json-summary"],
      // A floor, not a target: below the measured figures so ordinary
      // refactoring does not fail the build, and high enough that a module
      // losing its tests does.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 75,
        branches: 70,
      },
    },
  },
});
