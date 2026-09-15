/**
 * Digest tests.
 *
 * A digest is how Estamora pins a conformance result to an exact revision of
 * the requirements it was measured against. If digests are not stable, a receipt
 * that verified yesterday stops verifying today, so stability is a correctness
 * property and not a performance detail.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  combineDigests,
  digestOfArtifact,
  digestOfFile,
  digestOfValue,
  isDigest,
  REPO_ROOT,
  sha256,
} from "../../scripts/lib/index.ts";

const EMPTY_SHA256 = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("sha256", () => {
  it("matches the published digest of the empty input", () => {
    expect(sha256("")).toBe(EMPTY_SHA256);
  });

  it("hashes bytes and strings identically when they are equal", () => {
    expect(sha256(new TextEncoder().encode("estamora"))).toBe(sha256("estamora"));
  });
});

describe("digestOfValue", () => {
  it("is independent of object key order", () => {
    expect(digestOfValue({ a: 1, b: [2, 3] })).toBe(digestOfValue({ b: [2, 3], a: 1 }));
  });

  it("changes when a value changes", () => {
    expect(digestOfValue({ a: 1 })).not.toBe(digestOfValue({ a: 2 }));
  });
});

describe("digestOfArtifact", () => {
  it("ignores the $schema declaration and generated metadata", () => {
    const artifact = {
      $schema:
        "https://estamora-soroban-layers.github.io/estamora-conformance-spec/schema/vector.schema.json",
      metadata: { generated: "2026-09-15T00:00:00Z" },
      id: "example",
    };
    expect(digestOfArtifact(artifact)).toBe(digestOfValue({ id: "example" }));
  });

  it("keeps meaningful metadata, since it is part of the artifact", () => {
    const artifact = { metadata: { author: "winningtalker-commits" }, id: "example" };
    expect(digestOfArtifact(artifact)).not.toBe(digestOfValue({ id: "example" }));
  });
});

describe("digestOfFile", () => {
  it("hashes the file's bytes", () => {
    const file = join(REPO_ROOT, "package.json");
    expect(digestOfFile(file)).toBe(sha256(readFileSync(file, "utf8")));
  });
});

describe("combineDigests", () => {
  it("returns the empty digest for an empty corpus", () => {
    expect(combineDigests([])).toBe(EMPTY_SHA256);
  });

  it("is order sensitive, so a reordered corpus is a different identity", () => {
    const left = sha256("left");
    const right = sha256("right");
    expect(combineDigests([left, right])).not.toBe(combineDigests([right, left]));
  });
});

describe("isDigest", () => {
  it.each([
    [EMPTY_SHA256, true],
    ["sha256:ABC", false],
    ["e3b0c442", false],
    [42, false],
    [null, false],
  ])("classifies %j as %s", (value, expected) => {
    expect(isDigest(value)).toBe(expected);
  });
});
