/**
 * Terminal output for the validation entry points.
 *
 * Output is written to stdout for results and stderr for failures so that
 * `npm run validate > report.txt` still surfaces errors interactively. No
 * colour is emitted unless the environment opts in, because CI logs and
 * diffed output should be plain text.
 */

import type { DiagnosticBag } from "./diagnostics.ts";

const useColor = process.env["NO_COLOR"] === undefined && process.stdout.isTTY === true;

const CODES = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  dim: "\u001b[2m",
} as const;

function paint(code: keyof typeof CODES, text: string): string {
  return useColor ? `${CODES[code]}${text}${CODES.reset}` : text;
}

/** Print a section heading. */
export function heading(text: string): void {
  process.stdout.write(`${paint("bold", text)}\n`);
}

/** Print a successful step. */
export function success(text: string): void {
  process.stdout.write(`${paint("green", "ok")} ${text}\n`);
}

/** Print a failed step. */
export function failure(text: string): void {
  process.stderr.write(`${paint("red", "failed")} ${text}\n`);
}

/** Print a warning. */
export function warning(text: string): void {
  process.stderr.write(`${paint("yellow", "warning")} ${text}\n`);
}

/** Print a note in dimmed text. */
export function note(text: string): void {
  process.stdout.write(`${paint("dim", text)}\n`);
}

/** Wrap a long value in backticks for inline code rendering. */
export function code(text: string): string {
  return `\`${text}\``;
}

/**
 * Print the standard batch summary and return whether any error was recorded.
 *
 * This is the single place that decides what a "clean" run looks like, so
 * every entry point reports failures identically.
 */
export function reportSummary(label: string, diagnostics: DiagnosticBag): boolean {
  const errors = diagnostics.count("error");
  const warnings = diagnostics.count("warning");

  if (diagnostics.all().length > 0) {
    process.stderr.write(`${diagnostics.format()}\n`);
  }

  if (errors > 0) {
    failure(`${label}: ${errors} error(s), ${warnings} warning(s).`);
    return false;
  }
  if (warnings > 0) {
    warning(`${label}: 0 errors, ${warnings} warning(s).`);
    return true;
  }
  success(`${label}: all checks passed.`);
  return true;
}

/** Render a short `passed/total` tally. */
export function tally(passed: number, total: number): string {
  const marker = passed === total ? paint("green", "ok") : paint("red", "!!");
  return `${marker} ${passed}/${total}`;
}
