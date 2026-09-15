/**
 * Command-line parsing tests.
 *
 * The entry points are CI tools, so their argument handling is part of the
 * public interface. The rule these tests protect is specific: a mistyped flag
 * must fail as a *tooling* failure, never as a specification defect, because a
 * workflow that silently validates nothing looks identical to a workflow that
 * validated everything and passed.
 */

import { describe, expect, it, vi } from "vitest";

import {
  booleanFlag,
  EXIT_CODES,
  handleCliError,
  parseArgs,
  stringFlag,
  usage,
  UsageError,
  type FlagSpec,
} from "../../scripts/lib/index.ts";

const SPECS: readonly FlagSpec[] = [
  { name: "json", type: "boolean", description: "Emit JSON." },
  { name: "help", type: "boolean", alias: "h", description: "Show help." },
  { name: "profile", type: "string", description: "Select a profile." },
];

describe("parseArgs", () => {
  it("parses a boolean flag", () => {
    expect(booleanFlag(parseArgs(["--json"], SPECS), "json")).toBe(true);
    expect(booleanFlag(parseArgs([], SPECS), "json")).toBe(false);
  });

  it("parses a string flag in both separated and inline forms", () => {
    expect(stringFlag(parseArgs(["--profile", "sep-41@1.0"], SPECS), "profile")).toBe("sep-41@1.0");
    expect(stringFlag(parseArgs(["--profile=sep-41@1.0"], SPECS), "profile")).toBe("sep-41@1.0");
  });

  it("resolves a single-character alias", () => {
    expect(booleanFlag(parseArgs(["-h"], SPECS), "help")).toBe(true);
  });

  it("collects positionals in order", () => {
    expect(parseArgs(["one", "--json", "two"], SPECS).positionals).toEqual(["one", "two"]);
  });

  it("does not mistake a negative number for a flag value", () => {
    // `--profile` followed by a token beginning with `--` is a missing value, but
    // a single-dash token is a legitimate value, which is what lets
    // `--since -1` style arguments work.
    expect(stringFlag(parseArgs(["--profile", "-1"], SPECS), "profile")).toBe("-1");
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--nope"], SPECS)).toThrow(UsageError);
  });

  it("rejects a value supplied to a boolean flag", () => {
    expect(() => parseArgs(["--json=true"], SPECS)).toThrow(UsageError);
  });

  it("rejects a string flag with no value", () => {
    expect(() => parseArgs(["--profile"], SPECS)).toThrow(UsageError);
    expect(() => parseArgs(["--profile", "--json"], SPECS)).toThrow(UsageError);
  });

  it("rejects a duplicate flag declaration", () => {
    expect(() =>
      parseArgs(
        [],
        [
          { name: "json", type: "boolean", description: "one" },
          { name: "json", type: "boolean", description: "two" },
        ],
      ),
    ).toThrow(UsageError);
  });

  it("rejects an alias that collides with another flag's name", () => {
    expect(() =>
      parseArgs(
        [],
        [
          { name: "json", type: "boolean", description: "one", alias: "j" },
          { name: "j", type: "boolean", description: "two" },
        ],
      ),
    ).toThrow(UsageError);
  });

  it("returns undefined for a boolean read as a string", () => {
    expect(stringFlag(parseArgs(["--json"], SPECS), "json")).toBeUndefined();
  });
});

describe("usage", () => {
  it("documents every accepted flag and the exit codes", () => {
    const text = usage("estamora-test", "A test program.", SPECS);
    expect(text).toContain("Usage: estamora-test");
    expect(text).toContain("--json");
    expect(text).toContain("-h, --help");
    expect(text).toContain("--profile <value>");
    expect(text).toContain(String(EXIT_CODES.TOOLING_FAILURE));
  });
});

describe("handleCliError", () => {
  it("reports a usage error as a tooling failure", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const previous = process.exitCode;
    try {
      handleCliError(
        "estamora-test",
        "A test program.",
        SPECS,
        new UsageError("Unknown flag: --x"),
      );
      expect(process.exitCode).toBe(EXIT_CODES.TOOLING_FAILURE);
      expect(write).toHaveBeenCalled();
    } finally {
      process.exitCode = previous;
      write.mockRestore();
    }
  });

  it("rethrows anything that is not a usage error", () => {
    const boom = new Error("unexpected");
    expect(() => handleCliError("estamora-test", "A test program.", SPECS, boom)).toThrow(boom);
  });
});
