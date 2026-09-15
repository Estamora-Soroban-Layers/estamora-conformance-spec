/**
 * Canonical JSON tests.
 *
 * Canonical serialisation is the basis of profile and vector identity, so it is
 * tested as a contract rather than an implementation detail: identical values in
 * different key orders must serialise identically, because the runner hashes
 * these bytes into a conformance receipt.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  ErrorCode,
  escapePointerToken,
  isJsonObject,
  pointerSegment,
  readJsonFile,
  REPO_ROOT,
  resolvePointer,
  EstamoraError,
} from "../../scripts/lib/index.ts";

describe("canonicalJson", () => {
  it("orders object keys lexicographically and emits no whitespace", () => {
    expect(canonicalJson({ b: 1, a: 2, c: [3, { z: true }] })).toBe(
      '{"a":2,"b":1,"c":[3,{"z":true}]}',
    );
  });

  it("produces identical output for the same value in different key orders", () => {
    expect(canonicalJson({ one: 1, two: 2, three: { a: "a", b: "b" } })).toBe(
      canonicalJson({ three: { b: "b", a: "a" }, two: 2, one: 1 }),
    );
  });

  it("omits undefined members instead of failing", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("renders integers without exponent notation and bigints exactly", () => {
    expect(canonicalJson([1, -0, 1000, 9007199254740991, 42n])).toBe(
      "[1,0,1000,9007199254740991,42]",
    );
  });

  it("refuses to canonicalise a non-finite number", () => {
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it("treats a top-level undefined as null", () => {
    expect(canonicalJson(undefined)).toBe("null");
  });
});

describe("isJsonObject", () => {
  it.each([
    [null, false],
    [[], false],
    ["text", false],
    [1, false],
    [{}, true],
  ])("narrows %j to %s", (value, expected) => {
    expect(isJsonObject(value)).toBe(expected);
  });
});

describe("resolvePointer", () => {
  const document = { a: { b: [10, 20, 30] }, "a/b": { c: 1 }, "x~y": 2, "": "root" };

  it("resolves a nested pointer", () => {
    expect(resolvePointer(document, "/a/b/1")).toBe(20);
  });

  it("resolves the whole document for the empty pointer", () => {
    expect(resolvePointer(document, "")).toBe(document);
  });

  it("decodes the ~1 and ~0 escapes", () => {
    expect(resolvePointer(document, "/a~1b/c")).toBe(1);
    expect(resolvePointer(document, "/x~0y")).toBe(2);
  });

  it("addresses the empty key with a lone slash", () => {
    expect(resolvePointer(document, "/")).toBe("root");
  });

  it("returns undefined for a pointer that does not resolve", () => {
    expect(resolvePointer(document, "/a/b/9")).toBeUndefined();
    expect(resolvePointer(document, "/missing")).toBeUndefined();
    expect(resolvePointer(document, "a/b")).toBeUndefined();
  });
});

describe("pointer helpers", () => {
  it("escapes the escape character before the separator", () => {
    expect(escapePointerToken("a/b")).toBe("a~1b");
    expect(escapePointerToken("a~b")).toBe("a~0b");
    expect(escapePointerToken("a~/b")).toBe("a~0~1b");
  });

  it("renders numeric indices verbatim and string keys escaped", () => {
    expect(pointerSegment(3)).toBe("/3");
    expect(pointerSegment("a/b")).toBe("/a~1b");
  });
});

describe("readJsonFile", () => {
  it("classifies a missing file as an IO error", () => {
    try {
      readJsonFile(join(REPO_ROOT, "schema", "does-not-exist.schema.json"));
      expect.unreachable("reading a missing file must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EstamoraError);
      expect((error as EstamoraError).code).toBe(ErrorCode.IO_ERROR);
    }
  });

  it("classifies malformed JSON as a parse error", () => {
    // `README.md` exists but is not JSON, which is exactly the situation a
    // contributor hits after hand-editing a schema document.
    try {
      readJsonFile(join(REPO_ROOT, "README.md"));
      expect.unreachable("reading a non-JSON file must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EstamoraError);
      expect((error as EstamoraError).code).toBe(ErrorCode.PARSE_ERROR);
    }
  });
});
