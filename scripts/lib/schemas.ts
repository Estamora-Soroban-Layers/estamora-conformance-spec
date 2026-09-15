/**
 * The JSON Schema registry.
 *
 * All ten Estamora schemas are registered with one Ajv instance before any of
 * them is compiled, so that cross-document `$ref`s (for example
 * `method.schema.json` referencing `profile.schema.json#/$defs/typeExpr`)
 * resolve without the loader having to know the dependency order.
 *
 * Ajv runs in strict mode. A schema that relies on an unknown keyword, an
 * implicit type, or an unresolvable reference is a defect in this repository,
 * not something to paper over, so strictness is enforced rather than relaxed.
 */

import { join } from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsPlugin from "ajv-formats";

/**
 * `ajv-formats` is published as CommonJS with ESM-syntax declarations, so
 * TypeScript models its default export as the module namespace under
 * `NodeNext`. At runtime `module.exports` *is* the plugin function, so the
 * cast below restores the real signature. It is confined to this one line on
 * purpose: everywhere else in the codebase uses fully checked types.
 */
const addFormats = addFormatsPlugin as unknown as (ajv: Ajv2020) => Ajv2020;

import { readJsonFile } from "./json.ts";
import { DiagnosticBag, type Diagnostic } from "./diagnostics.ts";
import { ErrorCode, EstamoraError } from "./errors.ts";
import { SCHEMA_DIR, SCHEMA_FILES, type SchemaFileName } from "./paths.ts";

/** Outcome of validating one document against one schema. */
export interface SchemaValidationResult {
  /** Whether the document satisfied the schema. */
  readonly valid: boolean;
  /** Errors, already converted into Estamora diagnostics. */
  readonly errors: readonly Diagnostic[];
}

/** Loaded, compiled access to every normative schema. */
export class SchemaRegistry {
  readonly #validators: ReadonlyMap<SchemaFileName, ValidateFunction>;
  readonly #documents: ReadonlyMap<SchemaFileName, unknown>;
  readonly #ajv: Ajv2020;

  public constructor(
    ajv: Ajv2020,
    validators: ReadonlyMap<SchemaFileName, ValidateFunction>,
    documents: ReadonlyMap<SchemaFileName, unknown>,
  ) {
    this.#ajv = ajv;
    this.#validators = validators;
    this.#documents = documents;
  }

  /** The underlying Ajv instance, for callers that need to compile extra schemas. */
  public get ajv(): Ajv2020 {
    return this.#ajv;
  }

  /** Parse a schema document from disk without compiling it. */
  public document(name: SchemaFileName): unknown {
    return this.#documents.get(name);
  }

  /** Validate a parsed document against a named schema. */
  public validate(
    name: SchemaFileName,
    value: unknown,
    file?: string,
    code?: string,
  ): SchemaValidationResult {
    const validator = this.#validators.get(name);
    if (validator === undefined) {
      throw new EstamoraError(
        ErrorCode.SCHEMA_ERROR,
        `No compiled validator registered for schema ${name}.`,
        file,
      );
    }
    const valid = validator(value) === true;
    const errors = valid ? [] : toDiagnostics(validator.errors ?? [], file, code ?? codeFor(name));
    return { valid, errors };
  }

  /** Validate a document and append any errors to a diagnostic bag. */
  public validateInto(
    bag: DiagnosticBag,
    name: SchemaFileName,
    value: unknown,
    file?: string,
    code?: string,
  ): boolean {
    const result = this.validate(name, value, file, code);
    for (const diagnostic of result.errors) {
      bag.add(diagnostic);
    }
    return result.valid;
  }
}

/** Default diagnostic code used when a schema is violated. */
function codeFor(name: SchemaFileName): string {
  switch (name) {
    case "profile.schema.json":
    case "method.schema.json":
    case "behavior.schema.json":
    case "authorization.schema.json":
    case "event.schema.json":
    case "invariant.schema.json":
    case "failure.schema.json":
      return ErrorCode.PROFILE_ERROR;
    case "vector.schema.json":
    case "assertion.schema.json":
      return ErrorCode.VECTOR_ERROR;
    case "report.schema.json":
      return ErrorCode.PARSE_ERROR;
  }
}

let cached: SchemaRegistry | undefined;

/**
 * Build (once) the registry of compiled validators.
 *
 * Compilation happens eagerly so that a broken `$ref` fails immediately with
 * a precise message, rather than surfacing later as "no validator registered".
 */
export function getSchemaRegistry(): SchemaRegistry {
  if (cached !== undefined) {
    return cached;
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    discriminator: true,
    allowUnionTypes: false,
    validateFormats: true,
    unicodeRegExp: true,
    verbose: false,
  });
  addFormats(ajv);

  const documents = new Map<SchemaFileName, unknown>();
  for (const name of SCHEMA_FILES) {
    const file = join(SCHEMA_DIR, name);
    let document: unknown;
    try {
      document = readJsonFile(file);
    } catch (cause) {
      throw new EstamoraError(
        ErrorCode.SCHEMA_ERROR,
        `Unable to load schema ${name}: ${cause instanceof Error ? cause.message : String(cause)}`,
        file,
        { cause },
      );
    }
    if (typeof document !== "object" || document === null || Array.isArray(document)) {
      throw new EstamoraError(
        ErrorCode.SCHEMA_ERROR,
        `Schema ${name} must be a JSON object.`,
        file,
      );
    }
    ajv.addSchema(document as object, name);
    documents.set(name, document);
  }

  const validators = new Map<SchemaFileName, ValidateFunction>();
  for (const name of SCHEMA_FILES) {
    const validator = ajv.getSchema(name);
    if (validator === undefined) {
      throw new EstamoraError(
        ErrorCode.SCHEMA_ERROR,
        `Schema ${name} could not be compiled. Check its $id and any $ref targets.`,
        join(SCHEMA_DIR, name),
      );
    }
    validators.set(name, validator);
  }

  cached = new SchemaRegistry(ajv, validators, documents);
  return cached;
}

/**
 * Check that a schema document is itself a valid JSON Schema for the declared
 * dialect. Used by `scripts/validate-schema.ts` before anything consumes it.
 */
export function checkSchemaDocument(
  name: SchemaFileName,
  document: unknown,
): readonly Diagnostic[] {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  if (ajv.validateSchema(document as object) === true) {
    return [];
  }
  return toDiagnostics(ajv.errors ?? [], join(SCHEMA_DIR, name), ErrorCode.SCHEMA_ERROR);
}

/** Convert Ajv errors into Estamora diagnostics. */
export function toDiagnostics(
  errors: readonly ErrorObject[],
  file: string | undefined,
  code: string,
): readonly Diagnostic[] {
  return errors.map((error) => {
    const location = error.instancePath === "" ? "/" : error.instancePath;
    const params = describeParams(error);
    return {
      severity: "error" as const,
      code,
      message: `${error.message ?? "schema violation"}${params}`,
      file,
      path: `${location} (${error.schemaPath})`,
    };
  });
}

/** Render the most useful Ajv error params as a short suffix. */
function describeParams(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case "additionalProperties":
      return `: unexpected property ${JSON.stringify(params["additionalProperty"])}`;
    case "required":
      return `: missing required property ${JSON.stringify(params["missingProperty"])}`;
    case "enum":
      return `: expected one of ${JSON.stringify(params["allowedValues"])}`;
    case "const":
      return `: expected ${JSON.stringify(params["allowedValue"])}`;
    case "discriminator":
      return `: tag ${JSON.stringify(params["tag"])} ${JSON.stringify(params["error"])}`;
    case "pattern":
      return `: must match ${JSON.stringify(params["pattern"])}`;
    case "minItems":
      return `: must contain at least ${String(params["limit"])} item(s)`;
    case "minLength":
      return `: must be at least ${String(params["limit"])} character(s)`;
    default:
      return "";
  }
}
