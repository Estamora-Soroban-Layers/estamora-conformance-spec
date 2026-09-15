/**
 * Canonical filesystem layout of the Estamora conformance specification.
 *
 * Every validation entry point resolves paths through this module so that the
 * repository layout is declared in exactly one place. If the layout changes,
 * this file changes and the compatibility tests fail loudly rather than the
 * validators silently skipping a directory that moved.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the enclosing Git working tree. */
export const REPO_ROOT: string = findRepoRoot();

/** Absolute path to `schema/`, holding the normative JSON Schemas. */
export const SCHEMA_DIR: string = join(REPO_ROOT, "schema");

/** Absolute path to `profiles/`, holding versioned conformance profiles. */
export const PROFILES_DIR: string = join(REPO_ROOT, "profiles");

/** Absolute path to `profiles/examples/`, holding illustrative profiles. */
export const EXAMPLE_PROFILES_DIR: string = join(PROFILES_DIR, "examples");

/** Absolute path to `vectors/`, holding the shared vector library. */
export const VECTORS_DIR: string = join(REPO_ROOT, "vectors");

/** Absolute path to `examples/`, holding standalone example documents. */
export const EXAMPLES_DIR: string = join(REPO_ROOT, "examples");

/** Absolute path to `docs/`. */
export const DOCS_DIR: string = join(REPO_ROOT, "docs");

/** Absolute path to `docs/generated/`, whose contents are machine-written. */
export const GENERATED_DOCS_DIR: string = join(DOCS_DIR, "generated");

/** Absolute path to `tests/`. */
export const TESTS_DIR: string = join(REPO_ROOT, "tests");

/** Absolute path to the changelog. */
export const CHANGELOG_PATH: string = join(REPO_ROOT, "CHANGELOG.md");

/** Version of the Estamora specification *format* implemented by this tree. */
export const SPEC_FORMAT_VERSION = "1.0";

/**
 * Files that must exist for a directory to be considered a loadable profile.
 * A profile is a bundle, not a single document.
 */
export const PROFILE_BUNDLE_FILES = {
  profile: "profile.yaml",
  methods: "methods.yaml",
  authorization: "authorization.yaml",
  events: "events.yaml",
  behavior: "behavior.yaml",
  invariants: "invariants.yaml",
  failures: "failures.yaml",
} as const;

/** Keys of {@link PROFILE_BUNDLE_FILES}. */
export type ProfileBundleFileKey = keyof typeof PROFILE_BUNDLE_FILES;

/** The ten normative schema documents, in load order. */
export const SCHEMA_FILES = [
  "profile.schema.json",
  "method.schema.json",
  "behavior.schema.json",
  "authorization.schema.json",
  "event.schema.json",
  "invariant.schema.json",
  "vector.schema.json",
  "assertion.schema.json",
  "failure.schema.json",
  "report.schema.json",
] as const;

/** Name of a schema document, e.g. `profile.schema.json`. */
export type SchemaFileName = (typeof SCHEMA_FILES)[number];

/** JSON Schema dialect used by every schema in this repository. */
export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** Base URI used as the `$id` prefix for every Estamora schema. */
export const SCHEMA_ID_BASE = "https://estamora.dev/schema/";

/**
 * Walk upwards from this module until a directory containing `package.json`
 * is found. This makes path resolution independent of the caller's cwd, which
 * matters because CI and contributors invoke the scripts differently.
 */
function findRepoRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "schema"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      throw new Error(
        "Unable to locate the Estamora specification root: no ancestor directory contains both package.json and schema/.",
      );
    }
    current = parent;
  }
}
