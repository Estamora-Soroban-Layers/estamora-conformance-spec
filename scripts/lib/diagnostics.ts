/**
 * Diagnostic collection and reporting.
 *
 * Validators never throw on the first problem. They accumulate diagnostics so
 * that a contributor sees every defect in one run, then exit with a code that
 * reflects whether any error-severity diagnostic was recorded.
 */

import { relative } from "node:path";

import { EXIT_CODES, type ExitCode } from "./errors.ts";
import { REPO_ROOT } from "./paths.ts";

/** Severity of a diagnostic. */
export type Severity = "error" | "warning" | "info";

/** A single recorded problem or observation. */
export interface Diagnostic {
  /** How seriously the finding should be treated. */
  readonly severity: Severity;
  /** Stable machine-readable code, e.g. `PROFILE_ERROR` or `REFERENCE_ERROR`. */
  readonly code: string;
  /** Human-readable explanation, phrased as a complete sentence. */
  readonly message: string;
  /** File the finding concerns, relative to the repository root where possible. */
  readonly file?: string;
  /** Location within the document, e.g. a JSON Pointer or `methods[3].name`. */
  readonly path?: string;
}

/** A finding paired with its deterministic position in the output. */
interface OrderedDiagnostic extends Diagnostic {
  readonly sequence: number;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * An ordered, de-duplicating collection of {@link Diagnostic} values.
 *
 * De-duplication matters because profile validation legitimately reaches the
 * same malformed document through more than one traversal path (for example,
 * once while validating the bundle, once while resolving references from a
 * vector). Reporting the same defect twice trains contributors to ignore the
 * output.
 */
export class DiagnosticBag {
  readonly #diagnostics: OrderedDiagnostic[] = [];
  readonly #seen = new Set<string>();
  #sequence = 0;

  /** Record a diagnostic. Exact duplicates are dropped. */
  public add(diagnostic: Diagnostic): void {
    const key = [
      diagnostic.severity,
      diagnostic.code,
      diagnostic.file ?? "",
      diagnostic.path ?? "",
      diagnostic.message,
    ].join("\u0000");
    if (this.#seen.has(key)) {
      return;
    }
    this.#seen.add(key);
    this.#diagnostics.push({ ...diagnostic, sequence: this.#sequence++ });
  }

  /** Record an error-severity diagnostic. */
  public error(code: string, message: string, file?: string, path?: string): void {
    this.add({ severity: "error", code, message, file, path });
  }

  /** Record a warning-severity diagnostic. */
  public warn(code: string, message: string, file?: string, path?: string): void {
    this.add({ severity: "warning", code, message, file, path });
  }

  /** Record an informational diagnostic. */
  public info(code: string, message: string, file?: string, path?: string): void {
    this.add({ severity: "info", code, message, file, path });
  }

  /** Whether at least one error-severity diagnostic was recorded. */
  public get hasErrors(): boolean {
    return this.#diagnostics.some((diagnostic) => diagnostic.severity === "error");
  }

  /** Number of recorded diagnostics with the given severity. */
  public count(severity: Severity): number {
    return this.#diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
  }

  /** Every recorded diagnostic, sorted by severity then insertion order. */
  public all(): readonly Diagnostic[] {
    return [...this.#diagnostics]
      .sort((left, right) => {
        const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
        return bySeverity !== 0 ? bySeverity : left.sequence - right.sequence;
      })
      .map(({ severity, code, message, file, path }) => ({ severity, code, message, file, path }));
  }

  /**
   * Render the diagnostics as stable, greppable lines.
   *
   * The shape is `<severity> <CODE> <file>[:<path>] <message>` so that CI logs
   * can be scanned with a single regular expression.
   */
  public format(): string {
    return this.all()
      .map((diagnostic) => {
        const location = formatLocation(diagnostic);
        return `${diagnostic.severity.toUpperCase().padEnd(7)} ${diagnostic.code.padEnd(20)} ${location} ${diagnostic.message}`;
      })
      .join("\n");
  }

  /** Serialise the diagnostics for machine consumption. */
  public toJSON(): readonly Diagnostic[] {
    return this.all();
  }

  /** Exit code implied by the contents of this bag. */
  public exitCode(): ExitCode {
    return this.hasErrors ? EXIT_CODES.DEFECTS_FOUND : EXIT_CODES.SUCCESS;
  }
}

/** Render the `file[:path]` fragment of a diagnostic, or `-` when absent. */
function formatLocation(diagnostic: Diagnostic): string {
  const file = diagnostic.file ? relative(REPO_ROOT, diagnostic.file) : "";
  if (file && diagnostic.path) {
    return `${file}:${diagnostic.path}`;
  }
  if (file) {
    return file;
  }
  return diagnostic.path ?? "-";
}
