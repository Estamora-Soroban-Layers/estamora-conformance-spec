#!/usr/bin/env node
/**
 * Validate the ten normative JSON Schemas.
 *
 * This runs before any profile is touched, because a broken schema makes every
 * downstream result meaningless. It checks four things a schema file can get
 * wrong on its own:
 *
 * 1. it parses as JSON and is an object;
 * 2. its `$id` is exactly the canonical URI for its filename, so cross-document
 *    `$ref`s resolve to the file the reader expects;
 * 3. it is itself valid against the JSON Schema 2020-12 meta-schema;
 * 4. every `$defs` entry is reachable from somewhere.
 *
 * Step 4 catches a specific and quiet defect: a definition that no longer has
 * any referent is dead schema, and dead schema is how a repository ends up
 * with two competing versions of a rule. The registry is then built, which
 * compiles every document together and fails on any unresolvable reference.
 */

import { join } from "node:path";

import {
  booleanFlag,
  checkSchemaDocument,
  COMMON_FLAGS,
  DiagnosticBag,
  ErrorCode,
  EXIT_CODES,
  getSchemaRegistry,
  handleCliError,
  isJsonObject,
  JSON_SCHEMA_DIALECT,
  parseArgs,
  prettyJson,
  readJsonFile,
  reportSummary,
  REPO_ROOT,
  SCHEMA_DIR,
  SCHEMA_FILES,
  SCHEMA_ID_BASE,
  setMachineReadable,
  stringFlag,
  usage,
  type SchemaFileName,
} from "./lib/index.ts";

const PROGRAM = "estamora-validate-schema";

interface CollectedRef {
  readonly file: SchemaFileName;
  readonly target: string;
  readonly pointer: string;
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv, COMMON_FLAGS);
  if (booleanFlag(args, "help")) {
    process.stdout.write(
      `${usage(PROGRAM, "Validate the normative Estamora JSON Schemas.", COMMON_FLAGS)}\n`,
    );
    return EXIT_CODES.SUCCESS;
  }

  setMachineReadable(booleanFlag(args, "json"));

  const bag = new DiagnosticBag();
  const refs: CollectedRef[] = [];
  const seenIds = new Map<string, SchemaFileName>();

  for (const name of SCHEMA_FILES) {
    const file = join(SCHEMA_DIR, name);

    let document: unknown;
    try {
      document = readJsonFile(file);
    } catch (cause) {
      bag.error(
        ErrorCode.SCHEMA_ERROR,
        cause instanceof Error ? cause.message : String(cause),
        file,
      );
      continue;
    }

    if (!isJsonObject(document)) {
      bag.error(ErrorCode.SCHEMA_ERROR, "Schema must be a JSON object.", file, "/");
      continue;
    }

    const expectedId = `${SCHEMA_ID_BASE}${name}`;
    const actualId = document["$id"];
    if (actualId !== expectedId) {
      bag.error(
        ErrorCode.SCHEMA_ERROR,
        `Schema $id must be ${JSON.stringify(expectedId)}; found ${JSON.stringify(actualId)}. Cross-document references are resolved against this value.`,
        file,
        "/$id",
      );
    } else {
      const previous = seenIds.get(actualId as string);
      if (previous !== undefined) {
        bag.error(
          ErrorCode.SCHEMA_ERROR,
          `Schema $id is already claimed by ${previous}.`,
          file,
          "/$id",
        );
      }
      seenIds.set(actualId as string, name);
    }

    const dialect = document["$schema"];
    if (dialect !== JSON_SCHEMA_DIALECT) {
      bag.error(
        ErrorCode.SCHEMA_ERROR,
        `Schema $schema must be ${JSON_SCHEMA_DIALECT}; found ${JSON.stringify(dialect)}.`,
        file,
        "/$schema",
      );
    }

    for (const diagnostic of checkSchemaDocument(name, document)) {
      bag.add(diagnostic);
    }

    collectRefs(document, name, refs, "");
    checkDefinitionNames(document, bag, file);
  }

  reportUnusedDefinitions(refs, bag);
  reportUnusedRefTargets(refs, bag);

  // Building the registry compiles all ten documents together. Any
  // unresolvable cross-document reference fails here rather than at first use.
  try {
    const registry = getSchemaRegistry();
    if (registry.document(SCHEMA_FILES[0]) === undefined) {
      bag.error(ErrorCode.SCHEMA_ERROR, "Schema registry is incomplete.", SCHEMA_DIR);
    }
  } catch (cause) {
    bag.error(
      ErrorCode.SCHEMA_ERROR,
      `Schema registry failed to compile: ${cause instanceof Error ? cause.message : String(cause)}`,
      SCHEMA_DIR,
    );
  }

  const ok = reportSummary(`schema validation across ${SCHEMA_FILES.length} document(s)`, bag);
  if (stringFlag(args, "json") !== undefined || booleanFlag(args, "json")) {
    process.stdout.write(prettyJson({ ok, diagnostics: bag.toJSON() }));
  }
  return ok ? EXIT_CODES.SUCCESS : EXIT_CODES.DEFECTS_FOUND;
}

/** Collect every `$ref` string so that dead definitions can be detected. */
function collectRefs(
  node: unknown,
  file: SchemaFileName,
  refs: CollectedRef[],
  pointer: string,
): void {
  if (Array.isArray(node)) {
    node.forEach((element, index) => collectRefs(element, file, refs, `${pointer}/${index}`));
    return;
  }
  if (!isJsonObject(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string") {
      refs.push({ file, target: value, pointer: `${pointer}/$ref` });
      continue;
    }
    collectRefs(value, file, refs, `${pointer}/${key}`);
  }
}

/** Reject `$defs` keys that are not lowercase camelCase identifiers. */
function checkDefinitionNames(document: unknown, bag: DiagnosticBag, file: string): void {
  if (!isJsonObject(document) || !isJsonObject(document["$defs"])) {
    return;
  }
  for (const key of Object.keys(document["$defs"])) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key)) {
      bag.warn(
        ErrorCode.SCHEMA_ERROR,
        `Definition name ${JSON.stringify(key)} should be lowerCamelCase.`,
        file,
        `/$defs/${key}`,
      );
    }
  }
}

/** Warn about definitions no `$ref` resolves to. */
function reportUnusedDefinitions(refs: readonly CollectedRef[], bag: DiagnosticBag): void {
  for (const name of SCHEMA_FILES) {
    const file = join(SCHEMA_DIR, name);
    let document: unknown;
    try {
      document = readJsonFile(file);
    } catch {
      continue;
    }
    if (!isJsonObject(document) || !isJsonObject(document["$defs"])) {
      continue;
    }
    for (const key of Object.keys(document["$defs"])) {
      const used = refs.some((ref) => {
        if (ref.target === `#/$defs/${key}`) {
          return ref.file === name;
        }
        return ref.target.endsWith(`${name}#/$defs/${key}`);
      });
      if (!used) {
        bag.warn(
          ErrorCode.SCHEMA_ERROR,
          `Definition ${JSON.stringify(key)} is not referenced by any schema. Dead definitions let two versions of a rule coexist.`,
          file,
          `/$defs/${key}`,
        );
      }
    }
  }
}

/**
 * Warn when a `$ref` targets a definition name that no schema declares.
 *
 * Ajv already fails on an unresolvable reference, but its message does not say
 * which of the ten documents is at fault, and this check pinpoints it.
 */
function reportUnusedRefTargets(refs: readonly CollectedRef[], bag: DiagnosticBag): void {
  const declared = new Set<string>();
  for (const name of SCHEMA_FILES) {
    try {
      const document = readJsonFile(join(SCHEMA_DIR, name));
      if (isJsonObject(document) && isJsonObject(document["$defs"])) {
        for (const key of Object.keys(document["$defs"])) {
          declared.add(`${name}#/$defs/${key}`);
        }
      }
    } catch {
      continue;
    }
  }
  for (const ref of refs) {
    const match = /^(?:(?<file>[^#]+)#)?\/\$defs\/(?<def>[A-Za-z0-9]+)$/u.exec(ref.target);
    if (match?.groups === undefined) {
      continue;
    }
    const target = match.groups["file"] === undefined ? ref.file : match.groups["file"];
    const definition = match.groups["def"];
    if (target === undefined || definition === undefined) {
      continue;
    }
    if (!declared.has(`${target}#/$defs/${definition}`)) {
      bag.error(
        ErrorCode.SCHEMA_ERROR,
        `Reference ${JSON.stringify(ref.target)} does not resolve to a declared definition.`,
        join(REPO_ROOT, ref.file),
        ref.pointer,
      );
    }
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  handleCliError(PROGRAM, "Validate the normative Estamora JSON Schemas.", COMMON_FLAGS, error);
}
