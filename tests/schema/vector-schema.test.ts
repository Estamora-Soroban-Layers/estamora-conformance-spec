/**
 * `vector.schema.json` acceptance and rejection tests.
 *
 * The positive cases are every vector that actually ships in this repository,
 * both the shared library and the profile-owned set, discovered from disk rather
 * than listed by hand. A newly added vector is therefore covered the moment it
 * is added, and cannot be merged with a shape the schema rejects.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, VECTORS_DIR } from "../../scripts/lib/index.ts";
import {
  collectYamlFiles,
  expectSchemaAccepted,
  expectSchemaRejected,
  mutated,
  readDocument,
  repoRelative,
  SEP41_PROFILE_DIR,
} from "../helpers/artifacts.ts";

const SCHEMA = "vector.schema.json" as const;

/** Every vector file in the repository, profile-owned and shared. */
const ALL_VECTORS: readonly string[] = [
  ...collectYamlFiles(join(SEP41_PROFILE_DIR, "vectors")),
  ...collectYamlFiles(VECTORS_DIR),
];

const BASELINE = "profiles/sep-41/1.0/vectors/transfer/transfer-moves-exact-amount.yaml";

describe("vector.schema.json acceptance", () => {
  it("finds the vectors that ship in this repository", () => {
    expect(ALL_VECTORS.length).toBeGreaterThanOrEqual(20);
  });

  it.each(ALL_VECTORS.map((path) => repoRelative(path)))("accepts %s", (path) => {
    expectSchemaAccepted(SCHEMA, readDocument(path), path);
  });

  it("accepts a vector whose expected collection is empty", () => {
    // A vector that asserts only a failure and an absence legitimately has no
    // extra assertions of its own.
    expectSchemaAccepted(
      SCHEMA,
      readDocument("vectors/common/failures/transfer-beyond-balance-fails.yaml"),
      "negative vector",
    );
  });
});

describe("vector.schema.json rejection", () => {
  it("rejects an unknown vector kind", () => {
    const errors = expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        copy["kind"] = "exploratory";
      }),
      "unknown kind",
    );
    expect(errors.some((error) => error.message.includes("expected one of"))).toBe(true);
    expect(errors.some((error) => error.path?.startsWith("/kind") === true)).toBe(true);
  });

  it("rejects an outcome that is neither success nor failure", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const expected = copy["expected"] as Record<string, unknown>;
        expected["outcome"] = "probably";
      }),
      "unknown outcome",
    );
  });

  it("rejects a vector with no rationale", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        delete copy["rationale"];
      }),
      "missing rationale",
    );
  });

  it("rejects a vector with no method under test", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        delete copy["method"];
      }),
      "missing method",
    );
  });

  it("rejects an unknown top-level property", () => {
    const errors = expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        copy["skip"] = true;
      }),
      "unknown property",
    );
    expect(errors.some((error) => error.message.includes("unexpected property"))).toBe(true);
  });

  it("rejects a profile reference that is not a slug or the wildcard", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        copy["profile"] = "SEP 41";
      }),
      "invalid profile reference",
    );
  });

  it("rejects a title that is too short to be meaningful", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        copy["title"] = "x";
      }),
      "trivial title",
    );
  });

  it("rejects an amount that is not an exact integer string", () => {
    // Amounts are decimal strings so that i128 values survive YAML parsing. A
    // numeric literal or a decimal point silently loses precision.
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const fixtures = copy["fixtures"] as Record<string, unknown>;
        fixtures["balances"] = { alice: "1000.5", bob: "500" };
      }),
      "decimal balance",
    );
  });

  it("rejects an unknown fixture actor kind", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const fixtures = copy["fixtures"] as Record<string, unknown>;
        const actors = fixtures["actors"] as Record<string, unknown>[];
        const first = actors[0];
        if (first !== undefined) {
          first["kind"] = "wallet";
        }
      }),
      "unknown actor kind",
    );
  });

  it("rejects an assertion with an unknown category", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const assertions = copy["assertions"] as Record<string, unknown>[];
        const first = assertions[0];
        if (first !== undefined) {
          first["category"] = "vibes";
        }
      }),
      "unknown assertion category",
    );
  });

  it("rejects an empty required-events entry list only where the schema forbids it", () => {
    // `events.required` may be empty on purpose (a failed call must emit nothing),
    // so the comparable rejection is a malformed *event reference* instead.
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const expected = copy["expected"] as Record<string, unknown>;
        const events = expected["events"] as Record<string, unknown>;
        events["forbidden"] = ["NOT A SLUG"];
      }),
      "invalid forbidden event name",
    );
  });
});

describe("repository layout assumptions used by these tests", () => {
  it("resolves the shared vector directory through the shared layout module", () => {
    expect(VECTORS_DIR.startsWith(REPO_ROOT)).toBe(true);
    expect(collectYamlFiles(VECTORS_DIR).length).toBeGreaterThan(0);
  });
});
