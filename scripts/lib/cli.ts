/**
 * Minimal, dependency-free argument parsing shared by the entry points.
 *
 * The entry points are validation tools used by CI and by contributors, so
 * their interface has to be predictable: unknown flags are an error rather
 * than silently ignored, because a typo in a CI workflow that silently
 * validates nothing is worse than a failed build.
 */

import { EXIT_CODES, type ExitCode } from "./errors.ts";

/** Declaration of one accepted flag. */
export interface FlagSpec {
  /** Flag name without the leading dashes, e.g. `json`. */
  readonly name: string;
  /** Whether the flag takes a value. */
  readonly type: "boolean" | "string";
  /** One-line explanation used in usage output. */
  readonly description: string;
  /** Alternative single-character name, e.g. `h` for `--help`. */
  readonly alias?: string;
}

/** Result of parsing a command line. */
export interface ParsedArgs {
  readonly flags: ReadonlyMap<string, string | boolean>;
  readonly positionals: readonly string[];
}

/** Raised when a command line cannot be interpreted. */
export class UsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** Parse `argv` (without the node and script entries) against a flag spec. */
export function parseArgs(argv: readonly string[], specs: readonly FlagSpec[]): ParsedArgs {
  const byName = new Map<string, FlagSpec>();
  for (const spec of specs) {
    if (byName.has(spec.name)) {
      throw new UsageError(`Duplicate flag declaration: --${spec.name}`);
    }
    byName.set(spec.name, spec);
    if (spec.alias !== undefined) {
      if (byName.has(spec.alias)) {
        throw new UsageError(`Duplicate flag declaration: --${spec.alias}`);
      }
      byName.set(spec.alias, spec);
    }
  }

  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }
    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    const isLong = token.startsWith("--");
    const body = isLong ? token.slice(2) : token.slice(1);
    const separator = body.indexOf("=");
    const name = separator === -1 ? body : body.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : body.slice(separator + 1);

    const spec = byName.get(name);
    if (spec === undefined) {
      throw new UsageError(`Unknown flag: ${token}`);
    }

    if (spec.type === "boolean") {
      if (inlineValue !== undefined) {
        throw new UsageError(`Flag --${spec.name} does not take a value.`);
      }
      flags.set(spec.name, true);
      continue;
    }

    if (inlineValue !== undefined) {
      flags.set(spec.name, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new UsageError(`Flag --${spec.name} requires a value.`);
    }
    flags.set(spec.name, next);
    index += 1;
  }

  return { flags, positionals };
}

/** Read a boolean flag, defaulting to false. */
export function booleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true;
}

/** Read a string flag, or `undefined` when absent. */
export function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

/** Render usage text from a flag spec. */
export function usage(program: string, description: string, specs: readonly FlagSpec[]): string {
  const lines = [
    `Usage: ${program} [options]`,
    "",
    description,
    "",
    "Options:",
    ...specs.map((spec) => {
      const declaration =
        spec.alias === undefined ? `--${spec.name}` : `-${spec.alias}, --${spec.name}`;
      const value = spec.type === "string" ? " <value>" : "";
      return `  ${`${declaration}${value}`.padEnd(26)} ${spec.description}`;
    }),
    "",
    "Exit codes:",
    `  ${String(EXIT_CODES.SUCCESS)}  every checked artifact is valid`,
    `  ${String(EXIT_CODES.DEFECTS_FOUND)}  at least one defect was found`,
    `  ${String(EXIT_CODES.TOOLING_FAILURE)}  the tooling itself failed`,
  ];
  return lines.join("\n");
}

/** Flags every entry point accepts. */
export const COMMON_FLAGS: readonly FlagSpec[] = [
  { name: "json", type: "boolean", description: "Write diagnostics to stdout as JSON" },
  { name: "help", type: "boolean", alias: "h", description: "Show this help text" },
];

/** Exit code used when a run completed but found defects. */
export function exitWith(ok: boolean): ExitCode {
  return ok ? EXIT_CODES.SUCCESS : EXIT_CODES.DEFECTS_FOUND;
}
