/**
 * Diagnostic collection tests.
 *
 * Because every validator reports through a single bag, the bag's behaviour *is*
 * the repository's error-reporting contract. De-duplication and stable ordering
 * are not cosmetic: a contributor reading 40 lines of output needs to be able to
 * trust that each line is a distinct defect.
 */

import { describe, expect, it } from "vitest";

import { DiagnosticBag, EXIT_CODES } from "../../scripts/lib/index.ts";
import { fixture } from "../helpers/artifacts.ts";

describe("DiagnosticBag", () => {
  it("drops exact duplicates", () => {
    const bag = new DiagnosticBag();
    bag.error("PROFILE_ERROR", 'Missing required property "profile".', "a.yaml", "/profile");
    bag.error("PROFILE_ERROR", 'Missing required property "profile".', "a.yaml", "/profile");
    expect(bag.count("error")).toBe(1);
  });

  it("keeps two findings that differ only in location", () => {
    const bag = new DiagnosticBag();
    bag.error("PROFILE_ERROR", "Unexpected property.", "a.yaml", "/profile");
    bag.error("PROFILE_ERROR", "Unexpected property.", "b.yaml", "/profile");
    expect(bag.count("error")).toBe(2);
  });

  it("orders errors before warnings before notes", () => {
    const bag = new DiagnosticBag();
    bag.info("NOTE", "third");
    bag.warn("WARN", "second");
    bag.error("ERROR", "first");
    expect(bag.all().map((diagnostic) => diagnostic.severity)).toEqual([
      "error",
      "warning",
      "info",
    ]);
  });

  it("preserves insertion order within a severity", () => {
    const bag = new DiagnosticBag();
    bag.error("A", "first");
    bag.error("B", "second");
    expect(bag.all().map((diagnostic) => diagnostic.code)).toEqual(["A", "B"]);
  });

  it("reports whether it holds an error", () => {
    const clean = new DiagnosticBag();
    expect(clean.hasErrors).toBe(false);
    expect(clean.exitCode()).toBe(EXIT_CODES.SUCCESS);

    clean.warn("WARN", "not fatal");
    expect(clean.hasErrors).toBe(false);
    expect(clean.exitCode()).toBe(EXIT_CODES.SUCCESS);

    clean.error("ERROR", "fatal");
    expect(clean.hasErrors).toBe(true);
    expect(clean.exitCode()).toBe(EXIT_CODES.DEFECTS_FOUND);
  });

  it("renders greppable lines that name the severity, code and location", () => {
    const bag = new DiagnosticBag();
    bag.error(
      "PROFILE_ERROR",
      "Something is wrong.",
      fixture("profiles/sep-41/1.0/methods.yaml"),
      "/methods/0",
    );
    expect(bag.format()).toMatch(
      /^ERROR\s+PROFILE_ERROR\s+profiles\/sep-41\/1\.0\/methods\.yaml:\/methods\/0 Something is wrong\.$/u,
    );
  });

  it("renders a dash when a diagnostic has no location", () => {
    const bag = new DiagnosticBag();
    bag.error("RELEASE_ERROR", "Missing CHANGELOG.md.");
    expect(bag.format()).toBe("ERROR   RELEASE_ERROR        - Missing CHANGELOG.md.");
  });

  it("serialises to JSON without leaking internal ordering state", () => {
    const bag = new DiagnosticBag();
    bag.error("ERROR", "message", "file.yaml", "/path");
    expect(bag.toJSON()).toEqual([
      { severity: "error", code: "ERROR", message: "message", file: "file.yaml", path: "/path" },
    ]);
  });
});
