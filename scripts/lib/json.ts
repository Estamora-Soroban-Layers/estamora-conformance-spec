/**
 * JSON reading and canonical serialisation.
 *
 * Canonical serialisation is what makes profile and vector digests stable
 * across machines: the runner (Repository 2) hashes the same documents with
 * the same rules, so a receipt produced on a laptop verifies on CI.
 */

import { readFileSync } from "node:fs";

import { ioError, parseError } from "./errors.ts";

/** A JSON object with unknown values, narrowed away from arrays and null. */
export type JsonObject = Record<string, unknown>;

/** Any value representable in JSON, plus `bigint` for exact integers. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | bigint
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Narrow an unknown value to a plain JSON object. */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read and parse a JSON file, raising `PARSE_ERROR` on malformed content. */
export function readJsonFile(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (cause) {
    throw ioError(`Unable to read JSON file: ${explain(cause)}`, file, cause);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (cause) {
    throw parseError(`Malformed JSON: ${explain(cause)}`, file, cause);
  }
}

/**
 * Serialise a value to canonical JSON: object keys sorted lexicographically,
 * no insignificant whitespace, integers rendered without exponent notation.
 *
 * `undefined` members are omitted rather than rejected, so optional
 * TypeScript fields do not need to be stripped by every caller.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return value.toString();
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`Cannot canonicalise non-finite number: ${String(value)}`);
      }
      return Number.isInteger(value) ? value.toFixed(0) : String(value);
    case "string":
      return JSON.stringify(value);
    case "undefined":
      return "null";
    case "object":
      break;
    default:
      throw new Error(`Cannot canonicalise value of type ${typeof value}`);
  }

  if (Array.isArray(value)) {
    return `[${value.map((element) => canonicalJson(element)).join(",")}]`;
  }

  const entries = Object.entries(value as JsonObject)
    .filter(([, member]) => member !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)
    .join(",")}}`;
}

/** Serialise a value as pretty-printed JSON with a trailing newline. */
export function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Resolve a JSON Pointer (RFC 6901) against a parsed document.
 *
 * Returns `undefined` when the pointer does not resolve, letting callers
 * attach a best-effort `path` to a diagnostic without a second traversal.
 */
export function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === "") {
    return document;
  }
  if (!pointer.startsWith("/")) {
    return undefined;
  }
  let current: unknown = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (isJsonObject(current) && Object.hasOwn(current, token)) {
      current = current[token];
      continue;
    }
    return undefined;
  }
  return current;
}

/** Escape a single token for inclusion in a JSON Pointer. */
export function escapePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Format an array index or object key as a JSON Pointer fragment. */
export function pointerSegment(indexOrKey: number | string): string {
  return `/${typeof indexOrKey === "number" ? indexOrKey : escapePointerToken(indexOrKey)}`;
}

function explain(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
