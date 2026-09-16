/**
 * The reporting surface of every entry point.
 *
 * These functions decide what a clean run looks like, and they are the only
 * place that writes to the terminal. Two properties are worth protecting and
 * neither is visible from a passing validation run: that results go to stdout
 * while failures go to stderr, so `npm run validate > report.txt` still shows
 * errors on the console; and that `--json` silences the human-readable stream
 * without silencing warnings, so a machine-readable consumer can still watch a
 * long run and still be warned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiagnosticBag } from "../../scripts/lib/diagnostics.ts";
import {
  code,
  failure,
  heading,
  note,
  reportSummary,
  setMachineReadable,
  success,
  tally,
  warning,
} from "../../scripts/lib/console.ts";

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  setMachineReadable(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  setMachineReadable(false);
});

function bagWith(...severities: ("error" | "warning" | "info")[]): DiagnosticBag {
  const bag = new DiagnosticBag();
  severities.forEach((severity, index) => {
    bag.add({ severity, code: `CODE_${index}`, message: `diagnostic ${index}` });
  });
  return bag;
}

describe("results go to stdout", () => {
  it("writes a heading with a trailing newline", () => {
    heading("Validating profiles");

    expect(stdout.join("")).toBe("Validating profiles\n");
    expect(stderr).toEqual([]);
  });

  it("writes a success line and a note to stdout", () => {
    success("profiles are valid");
    note("nothing else to do");

    expect(stdout.join("")).toContain("profiles are valid");
    expect(stdout.join("")).toContain("nothing else to do");
    expect(stderr).toEqual([]);
  });

  it("never writes a result to stderr, so a redirect does not swallow failures", () => {
    success("fine");

    expect(stderr).toEqual([]);
  });
});

describe("failures and warnings go to stderr", () => {
  it("writes a failure to stderr", () => {
    failure("one profile is invalid");

    expect(stderr.join("")).toContain("one profile is invalid");
    expect(stdout).toEqual([]);
  });

  it("writes a warning to stderr", () => {
    warning("deprecated field");

    expect(stderr.join("")).toContain("deprecated field");
    expect(stdout).toEqual([]);
  });
});

describe("--json reserves stdout for the document", () => {
  it("silences headings, successes and notes", () => {
    setMachineReadable(true);

    heading("Validating");
    success("ok");
    note("aside");

    expect(stdout).toEqual([]);
  });

  it("does not silence a warning or a failure, which are the reasons to stop", () => {
    setMachineReadable(true);

    warning("something is wrong");
    failure("it is still wrong");

    expect(stderr.join("")).toContain("something is wrong");
    expect(stderr.join("")).toContain("it is still wrong");
  });

  it("is reversible, because the flag is process-wide state", () => {
    setMachineReadable(true);
    heading("suppressed");
    setMachineReadable(false);
    heading("visible");

    expect(stdout.join("")).toBe("visible\n");
  });
});

describe("formatting helpers", () => {
  it("wraps a value in backticks for inline code", () => {
    expect(code("sep-41@1.0")).toBe("`sep-41@1.0`");
  });

  it("marks a full tally differently from a partial one", () => {
    // The two must not be confused: this line is what a reader skims for.
    expect(tally(12, 12).endsWith("12/12")).toBe(true);
    expect(tally(11, 12).endsWith("11/12")).toBe(true);
    expect(tally(0, 0)).not.toBe(tally(0, 1));
  });
});

describe("the summary decides what a clean run is", () => {
  it("reports success and returns true when nothing was recorded", () => {
    const clean = reportSummary("validate-profiles", bagWith());

    expect(clean).toBe(true);
    expect(stdout.join("")).toContain("validate-profiles: all checks passed.");
  });

  it("treats warnings as a clean run and says how many there were", () => {
    const clean = reportSummary("validate-profiles", bagWith("warning", "warning"));

    expect(clean).toBe(true);
    expect(stderr.join("")).toContain("validate-profiles: 0 errors, 2 warning(s).");
  });

  it("treats a single error as a failed run and returns false", () => {
    const clean = reportSummary("validate-profiles", bagWith("error", "warning"));

    expect(clean).toBe(false);
    expect(stderr.join("")).toContain("validate-profiles: 1 error(s), 1 warning(s).");
  });

  it("prints the diagnostics themselves, not only the count", () => {
    reportSummary("check-vectors", bagWith("error"));

    expect(stderr.join("")).toContain("diagnostic 0");
  });

  it("prints nothing beyond the summary when the bag is empty", () => {
    reportSummary("check-vectors", bagWith());

    expect(stderr).toEqual([]);
    // One line, prefixed with the `ok` marker, and no colour: the suite runs without a TTY.
    expect(stdout.join("")).toBe("ok check-vectors: all checks passed.\n");
  });

  it("does not let an info diagnostic turn a clean run into a warning", () => {
    // An info diagnostic is an observation. Reporting it as a warning would make
    // every run that notes anything look like it needs attention.
    const clean = reportSummary("release-check", bagWith("info"));

    expect(clean).toBe(true);
    expect(stderr.join("")).toContain("diagnostic 0");
    expect(stdout.join("")).not.toContain("warning");
  });
});
