/**
 * Deterministic digests over specification artifacts.
 *
 * Estamora pins profiles and vectors by digest so that a conformance result
 * can be attributed to an exact revision of the requirements it was measured
 * against. The digest is always `sha256:` followed by lowercase hex, and the
 * hashed bytes are always produced by {@link canonicalJson} so that key order
 * and whitespace in the source document cannot change the identity of a
 * profile.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { canonicalJson } from "./json.ts";
import { ioError } from "./errors.ts";

/** A digest string of the form `sha256:<64 lowercase hex characters>`. */
export type Digest = `sha256:${string}`;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Hash raw bytes with SHA-256. */
export function sha256(bytes: string | Uint8Array): Digest {
  const hash = createHash("sha256");
  hash.update(bytes);
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Hash a value by first canonicalising it.
 *
 * Identical values in different key orders produce identical digests.
 */
export function digestOfValue(value: unknown): Digest {
  return sha256(canonicalJson(value));
}

/**
 * Hash the canonical form of a parsed document, ignoring its `$schema` and
 * `metadata.generated` members.
 *
 * Provenance fields are excluded so that re-formatting an unrelated part of
 * the repository does not invalidate a published digest.
 */
export function digestOfArtifact(value: unknown): Digest {
  return digestOfValue(stripVolatileFields(value));
}

/** Hash a file's bytes exactly as stored on disk. */
export function digestOfFile(file: string): Digest {
  try {
    return sha256(readFileSync(file));
  } catch (cause) {
    throw ioError(
      `Unable to read file for digest: ${cause instanceof Error ? cause.message : String(cause)}`,
      file,
      cause,
    );
  }
}

/** Check whether a value is a well-formed {@link Digest}. */
export function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

/**
 * Combine several digests into one, so that a directory of vectors has a
 * single stable identity. Order is significant and must be deterministic;
 * callers are expected to sort their inputs before calling.
 */
export function combineDigests(digests: readonly Digest[]): Digest {
  return sha256(digests.join("\n"));
}

function stripVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((element) => stripVolatileFields(element));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$schema") {
      continue;
    }
    if (key === "metadata" && isVolatileMetadata(member)) {
      continue;
    }
    result[key] = stripVolatileFields(member);
  }
  return result;
}

function isVolatileMetadata(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "generated";
}
