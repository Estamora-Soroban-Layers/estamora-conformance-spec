/**
 * Vector loading.
 *
 * Vectors live in two places, and the distinction is part of the
 * specification rather than an accident of layout:
 *
 * - the shared library under `vectors/<set>/<operation>/` holds vectors that
 *   every profile of a given family consumes, plus the profile-independent
 *   scenarios under `vectors/common/`, which declare `profile: "*"`;
 * - a profile bundle's own `vectors/<operation>/` holds cases that exist
 *   because of a decision pinned to that exact profile version.
 *
 * Both are validated by `vector.schema.json`. Keeping one document shape for
 * both means the runner has exactly one vector parser to implement.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { DiagnosticBag } from "./diagnostics.ts";
import { ErrorCode } from "./errors.ts";
import type { VectorDefinition } from "./models.ts";
import { REPO_ROOT, VECTORS_DIR } from "./paths.ts";
import type { SchemaRegistry } from "./schemas.ts";
import { readYamlFile } from "./yaml.ts";

/** The wildcard profile id used by profile-independent scenarios. */
export const WILDCARD_PROFILE = "*";

/** A vector file that has been read and schema-checked. */
export interface LoadedVector {
  /** Absolute path to the file. */
  readonly path: string;
  /** Repository-relative path, used in diagnostics. */
  readonly location: string;
  /** Parsed document, present when the YAML parsed at all. */
  readonly raw: unknown;
  /** Typed vector, present only when the document was schema-valid. */
  readonly vector: VectorDefinition | undefined;
  /** Whether the document satisfied `vector.schema.json`. */
  readonly valid: boolean;
}

/**
 * Discover vector files in one of the two layouts.
 *
 * Layouts are validated rather than guessed: a file directly inside `vectors/`
 * is an error, because the operation directory is what lets the runner map a
 * vector onto a contract method without parsing it first.
 */
export function discoverVectorFiles(
  root: string,
  bag: DiagnosticBag,
  options: { readonly required: boolean } = { required: true },
): readonly string[] {
  if (!existsSync(root)) {
    if (options.required) {
      bag.error(ErrorCode.VECTOR_ERROR, "Vector directory does not exist.", root);
    }
    return [];
  }
  if (!isDirectory(root)) {
    bag.error(ErrorCode.VECTOR_ERROR, "Expected a directory of vectors.", root);
    return [];
  }

  const files: string[] = [];
  for (const entry of safeReadDir(root)) {
    const entryPath = join(root, entry);
    if (isDirectory(entryPath)) {
      const children = safeReadDir(entryPath);
      if (children.length === 0) {
        bag.warn(
          ErrorCode.VECTOR_ERROR,
          `Vector directory ${JSON.stringify(entry)} is empty; remove it or add vectors.`,
          entryPath,
        );
      }
      for (const child of children) {
        const childPath = join(entryPath, child);
        if (isDirectory(childPath)) {
          bag.error(
            ErrorCode.VECTOR_ERROR,
            "Vector trees may only be two levels deep: <set>/<operation>/*.yaml.",
            childPath,
          );
        } else if (isYaml(child)) {
          files.push(childPath);
        } else {
          bag.error(
            ErrorCode.VECTOR_ERROR,
            `Vector directories may only contain .yaml files; found ${JSON.stringify(child)}.`,
            childPath,
          );
        }
      }
    } else if (isYaml(entry)) {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        "Vector files must live in an operation subdirectory, e.g. transfer/basic.yaml.",
        entryPath,
      );
    } else {
      bag.warn(
        ErrorCode.VECTOR_ERROR,
        `Ignoring non-YAML entry ${JSON.stringify(entry)} in a vector directory.`,
        entryPath,
      );
    }
  }
  return files.sort();
}

/** Discover every file in the shared vector library, including `common/`. */
export function discoverSharedVectorSets(
  bag: DiagnosticBag,
): ReadonlyMap<string, readonly string[]> {
  const sets = new Map<string, readonly string[]>();
  if (!existsSync(VECTORS_DIR)) {
    bag.error(
      ErrorCode.VECTOR_ERROR,
      "The shared vector library directory is missing.",
      VECTORS_DIR,
    );
    return sets;
  }
  for (const entry of safeReadDir(VECTORS_DIR)) {
    const entryPath = join(VECTORS_DIR, entry);
    if (isDirectory(entryPath)) {
      sets.set(entry, discoverVectorFiles(entryPath, bag, { required: false }));
    }
  }
  return sets;
}

/** Read and schema-validate one vector file. */
export function loadVector(
  path: string,
  registry: SchemaRegistry,
  bag: DiagnosticBag,
): LoadedVector {
  const location = relative(REPO_ROOT, path);
  let raw: unknown;
  try {
    raw = readYamlFile(path);
  } catch (cause) {
    bag.error(ErrorCode.PARSE_ERROR, cause instanceof Error ? cause.message : String(cause), path);
    return { path, location, raw: undefined, vector: undefined, valid: false };
  }
  const valid = registry.validateInto(bag, "vector.schema.json", raw, path);
  return {
    path,
    location,
    raw,
    vector: valid ? (raw as VectorDefinition) : undefined,
    valid,
  };
}

/** Load and validate a batch of vector files. */
export function loadVectors(
  files: readonly string[],
  registry: SchemaRegistry,
  bag: DiagnosticBag,
): readonly LoadedVector[] {
  return files.map((file) => loadVector(file, registry, bag));
}

function isYaml(name: string): boolean {
  return name.endsWith(".yaml") || name.endsWith(".yml");
}

function safeReadDir(directory: string): readonly string[] {
  try {
    return readdirSync(directory).sort();
  } catch {
    return [];
  }
}

/**
 * Read a directory's entries, returning an empty list when it is missing.
 *
 * Exposed so that validators can walk the shared vector library without each of
 * them re-implementing the same missing-directory handling.
 */
export function readdirSyncSafe(directory: string): readonly string[] {
  return safeReadDir(directory);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
