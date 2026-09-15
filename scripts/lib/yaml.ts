/**
 * Hardened YAML loading.
 *
 * Profiles and vectors are YAML because humans review them. That convenience
 * is also an attack surface, so parsing is deliberately restricted:
 *
 * - duplicate mapping keys are rejected instead of silently collapsing,
 *   because `required: false` followed by `required: true` must not be able to
 *   change a requirement without anyone noticing;
 * - aliases are bounded when constructing JavaScript values, which defuses
 *   alias-expansion ("billion laughs") documents;
 * - merge keys (`<<`) are left disabled, which is the YAML 1.2 core schema
 *   default, so composition happens through explicit identifiers that the
 *   validators can resolve and report on;
 * - multi-document streams are rejected, because a specification file has
 *   exactly one meaning.
 */

import { readFileSync } from "node:fs";

import { parseAllDocuments, type Document, type ParseOptions } from "yaml";

import { ioError, parseError } from "./errors.ts";

const MAX_ALIAS_COUNT = 100;

const PARSE_OPTIONS: ParseOptions = {
  uniqueKeys: true,
  strict: true,
};

/** Parse a single-document YAML string under the hardened rules above. */
export function parseYaml(source: string, file: string): unknown {
  let documents: readonly Document.Parsed[];
  try {
    documents = parseAllDocuments(source, PARSE_OPTIONS);
  } catch (cause) {
    throw parseError(`Malformed YAML: ${describe(cause)}`, file, cause);
  }

  if (documents.length === 0) {
    throw parseError("YAML document is empty.", file);
  }
  if (documents.length > 1) {
    throw parseError(
      `YAML file contains ${documents.length} documents; Estamora specification files must contain exactly one.`,
      file,
    );
  }

  const document = documents[0];
  if (document === undefined) {
    throw parseError("YAML document is empty.", file);
  }

  const errors = document.errors;
  const first = errors[0];
  if (first !== undefined) {
    throw parseError(`Malformed YAML: ${first.message}`, file, first);
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  } catch (cause) {
    throw parseError(`Malformed YAML: ${describe(cause)}`, file, cause);
  }

  if (value === null || value === undefined) {
    throw parseError("YAML document is empty.", file);
  }

  return value;
}

/** Read and parse a YAML file, raising structured errors on failure. */
export function readYamlFile(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (cause) {
    throw ioError(`Unable to read YAML file: ${describe(cause)}`, file, cause);
  }
  return parseYaml(raw, file);
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
