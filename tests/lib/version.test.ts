/**
 * Version algebra tests.
 *
 * The versioning policy in VERSIONING.md is only real if the tooling enforces
 * it, so these tests pin every rule the policy states: what counts as a version,
 * what counts as a *profile* version directory, how prereleases sort, and what
 * compatibility means.
 */

import { describe, expect, it } from "vitest";

import {
  compareVersions,
  isCompatibleSuccessor,
  isValidProfileVersionDirectory,
  isValidVersion,
  parseVersion,
} from "../../scripts/lib/index.ts";

describe("parseVersion", () => {
  it("parses MAJOR.MINOR with an implicit zero patch", () => {
    expect(parseVersion("1.0")).toEqual({
      raw: "1.0",
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: undefined,
    });
  });

  it("parses MAJOR.MINOR.PATCH with a prerelease", () => {
    expect(parseVersion("2.13.7-rc.1")).toEqual({
      raw: "2.13.7-rc.1",
      major: 2,
      minor: 13,
      patch: 7,
      prerelease: "rc.1",
    });
  });

  it.each(["1", "1.", ".1", "v1.0", "1.0.0.0", "01.0", "1.-1", "1.0.0-", "1.0 ", ""])(
    "rejects %j",
    (input) => {
      expect(parseVersion(input)).toBeUndefined();
      expect(isValidVersion(input)).toBe(false);
    },
  );
});

describe("compareVersions", () => {
  const order = ["1.0", "1.1", "1.1.1", "2.0"];

  it("orders versions ascending", () => {
    for (let index = 0; index < order.length - 1; index += 1) {
      const left = parseVersion(order[index] ?? "");
      const right = parseVersion(order[index + 1] ?? "");
      expect(left).toBeDefined();
      expect(right).toBeDefined();
      if (left === undefined || right === undefined) {
        return;
      }
      expect(compareVersions(left, right)).toBeLessThan(0);
      expect(compareVersions(right, left)).toBeGreaterThan(0);
      expect(compareVersions(left, left)).toBe(0);
    }
  });

  it("sorts a prerelease before the release it precedes", () => {
    const prerelease = parseVersion("1.0.0-rc.1");
    const release = parseVersion("1.0.0");
    expect(prerelease).toBeDefined();
    expect(release).toBeDefined();
    if (prerelease === undefined || release === undefined) {
      return;
    }
    expect(compareVersions(prerelease, release)).toBeLessThan(0);
    expect(compareVersions(release, prerelease)).toBeGreaterThan(0);
  });
});

describe("isCompatibleSuccessor", () => {
  it("accepts a later minor of the same major", () => {
    const baseline = parseVersion("1.0");
    const candidate = parseVersion("1.4");
    expect(baseline && candidate && isCompatibleSuccessor(baseline, candidate)).toBe(true);
  });

  it("rejects a major bump, which signals changed requirements", () => {
    const baseline = parseVersion("1.4");
    const candidate = parseVersion("2.0");
    expect(baseline && candidate && isCompatibleSuccessor(baseline, candidate)).toBe(false);
  });

  it("rejects an older version of the same major", () => {
    const baseline = parseVersion("1.4");
    const candidate = parseVersion("1.2");
    expect(baseline && candidate && isCompatibleSuccessor(baseline, candidate)).toBe(false);
  });
});

describe("isValidProfileVersionDirectory", () => {
  it.each(["1.0", "0.1", "10.20"])("accepts %j", (name) => {
    expect(isValidProfileVersionDirectory(name)).toBe(true);
  });

  it.each(["1.0.0", "1.0-rc.1", "v1.0", "1", "latest", "examples", "1.0.1"])(
    "rejects %j",
    (name) => {
      expect(isValidProfileVersionDirectory(name)).toBe(false);
    },
  );
});
