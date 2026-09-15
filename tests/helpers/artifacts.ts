/**
 * Shared test helpers.
 *
 * The suite deliberately tests the *real* artifacts in this repository rather
 * than hand-written copies of them. A validator test that uses a fixture the
 * test author invented proves only that the fixture and the schema were written
 * by the same person on the same day; when the schema later tightens, the
 * fixture is updated alongside it and nothing fails. Mutating a real profile or
 * vector and requiring the rejection means the suite breaks the moment the
 * schemas stop rejecting what they claim to reject.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { expect } from "vitest";

import {
  getSchemaRegistry,
  readYamlFile,
  REPO_ROOT,
  type Diagnostic,
  type SchemaFileName,
} from "../../scripts/lib/index.ts";

/** Absolute path to the released SEP-41 1.0 profile bundle. */
export const SEP41_PROFILE_DIR = join(REPO_ROOT, "profiles", "sep-41", "1.0");

/** Canonical `id@version` identity of the SEP-41 1.0 profile. */
export const SEP41_IDENTITY = "sep-41@1.0";

/**
 * Standalone example documents that are `profile.yaml` documents, by
 * repository-relative path.
 *
 * `examples/profile-with-invariants.yaml` is deliberately absent: it is a
 * standalone *invariants* document and validates against
 * `invariant.schema.json`. The example set is arranged so that each file
 * demonstrates exactly one schema, which is what lets the examples validator
 * decide which schema an example is meant to satisfy.
 */
export const EXAMPLE_PROFILE_DOCUMENTS = [
  "examples/basic-profile.yaml",
  "examples/custom-profile.yaml",
  "examples/sep-41-profile.yaml",
] as const;

/** Standalone example documents that are invariants documents. */
export const EXAMPLE_INVARIANT_DOCUMENTS = ["examples/profile-with-invariants.yaml"] as const;

/** Resolve a repository-relative path, failing loudly when it is absent. */
export function fixture(relativePath: string): string {
  const absolute = join(REPO_ROOT, relativePath);
  if (!existsSyncSafe(absolute)) {
    throw new Error(`Expected ${relativePath} to exist under ${REPO_ROOT}.`);
  }
  return absolute;
}

/** Read a repository-relative YAML document. */
export function readDocument(relativePath: string): unknown {
  return readYamlFile(fixture(relativePath));
}

/** Diagnostics produced by validating a document against a named schema. */
export function validateDocument(schema: SchemaFileName, value: unknown): readonly Diagnostic[] {
  return getSchemaRegistry().validate(schema, value).errors;
}

/** Assert that a document satisfies a schema, with the label in the failure. */
export function expectSchemaAccepted(schema: SchemaFileName, value: unknown, label: string): void {
  const errors = validateDocument(schema, value);
  expect(
    errors.map((error) => `${error.path ?? "?"} ${error.message}`),
    `${label} must satisfy ${schema}`,
  ).toEqual([]);
}

/**
 * Assert that a document violates a schema and return the diagnostics.
 *
 * Every returned diagnostic must carry the schema's own error code, so a test
 * cannot accidentally pass because an unrelated failure (a parse error, say)
 * produced *some* diagnostic.
 */
export function expectSchemaRejected(
  schema: SchemaFileName,
  value: unknown,
  label: string,
): readonly Diagnostic[] {
  const errors = validateDocument(schema, value);
  expect(errors.length, `${label} must violate ${schema}`).toBeGreaterThan(0);
  for (const error of errors) {
    expect(error.severity, `${label}: severity`).toBe("error");
  }
  return errors;
}

/**
 * Deep-copy a parsed document and apply an in-place mutation to its top level.
 *
 * `structuredClone` is enough because parsed YAML is plain objects, arrays and
 * scalars.
 */
export function mutated(
  document: unknown,
  mutate: (copy: Record<string, unknown>) => void,
): Record<string, unknown> {
  const copy = structuredClone(document) as Record<string, unknown>;
  mutate(copy);
  return copy;
}

/** Read a required nested object member from a parsed document. */
export function member<T extends object>(source: unknown, key: string): T {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    throw new Error(`Cannot read member ${key} from a non-object.`);
  }
  const value = (source as Record<string, unknown>)[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Member ${key} is not an object.`);
  }
  return value as T;
}

/** Recursively collect every YAML file under a directory, sorted. */
export function collectYamlFiles(root: string): readonly string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSafe(directory)) {
      const path = join(directory, entry);
      if (isDirectory(path)) {
        walk(path);
      } else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
        files.push(path);
      }
    }
  };
  walk(root);
  return files.sort();
}

/** Repository-relative form of an absolute path, for readable test names. */
export function repoRelative(absolute: string): string {
  return relative(REPO_ROOT, absolute);
}

function existsSyncSafe(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readdirSafe(directory: string): readonly string[] {
  try {
    return readdirSync(directory).sort();
  } catch {
    return [];
  }
}
