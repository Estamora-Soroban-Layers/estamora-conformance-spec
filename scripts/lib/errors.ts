/**
 * Structured error taxonomy for the Estamora specification layer.
 *
 * The specification layer deliberately distinguishes failure classes, because
 * Repository 2 (the runner) inherits the same taxonomy: a malformed profile is
 * a `PROFILE_ERROR`, a malformed vector is a `VECTOR_ERROR`, and a broken
 * cross-reference is a `REFERENCE_ERROR`. Collapsing these into one generic
 * "validation failed" message is explicitly disallowed by the Estamora error
 * model, since it prevents automation from telling spec defects apart from
 * tooling defects.
 */

/** Machine-readable error classes emitted by the specification tooling. */
export enum ErrorCode {
  /** An I/O failure while reading repository content. */
  IO_ERROR = "IO_ERROR",
  /** A YAML or JSON document could not be parsed. */
  PARSE_ERROR = "PARSE_ERROR",
  /** A JSON Schema document is itself invalid or has an unresolvable `$ref`. */
  SCHEMA_ERROR = "SCHEMA_ERROR",
  /** A profile bundle violates the profile schemas. */
  PROFILE_ERROR = "PROFILE_ERROR",
  /** A vector violates the vector schema or its assertion rules. */
  VECTOR_ERROR = "VECTOR_ERROR",
  /** A structural reference between specification artifacts does not resolve. */
  REFERENCE_ERROR = "REFERENCE_ERROR",
  /** Two artifacts claim the same identity within one namespace. */
  DUPLICATE_ID_ERROR = "DUPLICATE_ID_ERROR",
  /** A declared version or status is not permitted by the versioning policy. */
  VERSION_ERROR = "VERSION_ERROR",
  /** The repository layout or release metadata is internally inconsistent. */
  RELEASE_ERROR = "RELEASE_ERROR",
  /** Generated documentation is out of date with respect to the profiles. */
  DOCS_OUT_OF_DATE = "DOCS_OUT_OF_DATE",
}

/**
 * An error that carries a machine-readable {@link ErrorCode}.
 *
 * Thrown only for conditions that make further validation meaningless (for
 * example, an unreadable file). Recoverable defects are recorded as
 * diagnostics instead, so that one run reports every problem it can find.
 */
export class EstamoraError extends Error {
  /** Stable machine-readable classification of this failure. */
  public readonly code: ErrorCode;

  /** Absolute or repository-relative path the failure concerns, if any. */
  public readonly file: string | undefined;

  public constructor(code: ErrorCode, message: string, file?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EstamoraError";
    this.code = code;
    this.file = file;
  }
}

/** Convenience constructor for an I/O failure. */
export function ioError(message: string, file?: string, cause?: unknown): EstamoraError {
  return new EstamoraError(ErrorCode.IO_ERROR, message, file, { cause });
}

/** Convenience constructor for a parse failure. */
export function parseError(message: string, file?: string, cause?: unknown): EstamoraError {
  return new EstamoraError(ErrorCode.PARSE_ERROR, message, file, { cause });
}

/**
 * Process exit codes.
 *
 * `0` means "the specification tree is valid". `1` means "the tree contains
 * defects". `2` means "the tooling itself failed", which must never be
 * reported as a specification defect. CI relies on this distinction.
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  DEFECTS_FOUND: 1,
  TOOLING_FAILURE: 2,
} as const;

/** A member of {@link EXIT_CODES}. */
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
