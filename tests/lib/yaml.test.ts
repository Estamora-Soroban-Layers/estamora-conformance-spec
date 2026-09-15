/**
 * Hardened YAML tests.
 *
 * The loader's restrictions exist because a specification file is normative:
 * a silently collapsed duplicate key, or an alias-expansion document that
 * exhausts memory, would let a profile's meaning differ from its text. Each
 * restriction therefore has a test that fails if the restriction is lifted.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ErrorCode,
  EstamoraError,
  parseYaml,
  readYamlFile,
  REPO_ROOT,
} from "../../scripts/lib/index.ts";

/** Assert that parsing throws an {@link EstamoraError} with `PARSE_ERROR`. */
function expectParseFailure(source: string): void {
  try {
    parseYaml(source, "inline.yaml");
    expect.unreachable("parsing must fail");
  } catch (error) {
    expect(error).toBeInstanceOf(EstamoraError);
    expect((error as EstamoraError).code).toBe(ErrorCode.PARSE_ERROR);
  }
}

describe("parseYaml", () => {
  it("parses a normal document into plain values", () => {
    expect(parseYaml("a: 1\nb:\n  - x\n  - y\n", "inline.yaml")).toEqual({ a: 1, b: ["x", "y"] });
  });

  it("rejects a duplicate mapping key instead of collapsing it", () => {
    expectParseFailure("required: false\nrequired: true\n");
  });

  it("rejects a multi-document stream", () => {
    expectParseFailure("a: 1\n---\nb: 2\n");
  });

  it("rejects an empty document", () => {
    expectParseFailure("# only a comment\n");
  });

  it("rejects a document whose only content is null", () => {
    expectParseFailure("null\n");
  });

  it("rejects malformed YAML", () => {
    expectParseFailure("a: [1, 2\n");
  });

  it("bounds alias expansion", () => {
    // Each level multiplies the previous node list nine times, so a document a
    // few lines long would expand to billions of nodes if aliases were resolved
    // without a bound.
    const levels = 14;
    const lines = ['a0: ["x", "x", "x", "x", "x", "x", "x", "x", "x"]'];
    for (let level = 1; level < levels; level += 1) {
      const aliases = Array.from({ length: 9 }, () => `*a${String(level - 1)}`);
      lines.push(`a${String(level)}: [${aliases.join(", ")}]`);
    }
    expectParseFailure(`${lines.join("\n")}\n`);
  });
});

describe("readYamlFile", () => {
  it("reads a real specification document", () => {
    const document = readYamlFile(join(REPO_ROOT, "profiles", "sep-41", "1.0", "profile.yaml"));
    expect(document).toMatchObject({ profile: { id: "sep-41" } });
  });

  it("classifies a missing file as an IO error", () => {
    try {
      readYamlFile(join(REPO_ROOT, "profiles", "sep-41", "1.0", "absent.yaml"));
      expect.unreachable("reading a missing file must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EstamoraError);
      expect((error as EstamoraError).code).toBe(ErrorCode.IO_ERROR);
    }
  });
});
