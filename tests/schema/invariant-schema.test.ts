/**
 * `invariant.schema.json` tests.
 *
 * Invariants are the part of a profile most often written as prose, and the part
 * where a vague requirement does the most damage: an invariant that cannot be
 * evaluated is indistinguishable from one that always passes. The schema
 * therefore constrains invariants by *kind*, and these tests pin that
 * discrimination in both directions — a conditional requirement that is merely
 * optional must be rejected just as firmly as a missing one.
 */

import { describe, expect, it } from "vitest";

import {
  EXAMPLE_INVARIANT_DOCUMENTS,
  expectSchemaAccepted,
  expectSchemaRejected,
  mutated,
  readDocument,
} from "../helpers/artifacts.ts";

const SCHEMA = "invariant.schema.json" as const;
const BASELINE = "examples/profile-with-invariants.yaml";

/** Read the invariants of a document, failing loudly when the shape is wrong. */
function invariantsOf(path: string): Record<string, unknown>[] {
  const document = readDocument(path);
  const invariants = (document as { invariants?: unknown }).invariants;
  if (!Array.isArray(invariants)) {
    throw new Error(`${path} does not contain an invariants array.`);
  }
  return invariants as Record<string, unknown>[];
}

/** Mutate the first invariant of the baseline document. */
function mutatedFirstInvariant(
  mutate: (invariant: Record<string, unknown>) => void,
): Record<string, unknown> {
  return mutated(readDocument(BASELINE), (copy) => {
    const invariants = copy["invariants"] as Record<string, unknown>[];
    const first = invariants[0];
    if (first === undefined) {
      throw new Error("The baseline invariants document has no entries.");
    }
    mutate(first);
  });
}

describe("invariant.schema.json acceptance", () => {
  it.each([...EXAMPLE_INVARIANT_DOCUMENTS, "profiles/sep-41/1.0/invariants.yaml"])(
    "accepts %s",
    (path) => {
      expectSchemaAccepted(SCHEMA, readDocument(path), path);
    },
  );

  it("covers the check families the SEP-41 profile relies on", () => {
    const kinds = invariantsOf("profiles/sep-41/1.0/invariants.yaml").map(
      (invariant) => invariant["kind"],
    );
    for (const required of ["conservation", "state_unchanged", "bounds"]) {
      expect(kinds, `SEP-41 must declare a ${required} invariant`).toContain(required);
    }
  });
});

describe("invariant.schema.json rejection", () => {
  it("rejects an unknown check family", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["kind"] = "good_vibes";
      }),
      "unknown kind",
    );
  });

  it("rejects a conservation invariant that names no resource set", () => {
    const errors = expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["kind"] = "conservation";
        delete invariant["resource"];
      }),
      "conservation without resource",
    );
    expect(errors.some((error) => error.message.includes("resource"))).toBe(true);
  });

  it("rejects a monotonic invariant that states no direction", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["kind"] = "monotonic";
        invariant["resource"] = "balances";
      }),
      "monotonic without direction",
    );
  });

  it("rejects a predicate invariant that carries no predicate", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["kind"] = "predicate";
        delete invariant["resource"];
      }),
      "predicate without predicate",
    );
  });

  it("rejects a state_unchanged invariant that names a resource it cannot have", () => {
    // The converse rule: `resource` is meaningless outside the aggregate kinds,
    // and accepting it would let an author believe it scopes the check.
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["kind"] = "state_unchanged";
        invariant["resource"] = "balances";
      }),
      "state_unchanged with resource",
    );
  });

  it("rejects an un-scoped invariant", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        delete invariant["scope"];
      }),
      "missing scope",
    );
  });

  it("rejects a scope with no methods", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        const scope = invariant["scope"] as Record<string, unknown>;
        scope["methods"] = [];
      }),
      "empty scope.methods",
    );
  });

  it("rejects a scope that states no outcome", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        const scope = invariant["scope"] as Record<string, unknown>;
        delete scope["outcomes"];
      }),
      "missing scope.outcomes",
    );
  });

  it("rejects a rationale too short to explain the invariant", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["rationale"] = "It must hold.";
      }),
      "trivial rationale",
    );
  });

  it("rejects a summary too short to state the invariant", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["summary"] = "Holds.";
      }),
      "trivial summary",
    );
  });

  it("rejects a severity outside the two permitted levels", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["severity"] = "fatal";
      }),
      "unknown severity",
    );
  });

  it("rejects an unknown property on an invariant", () => {
    expectSchemaRejected(
      SCHEMA,
      mutatedFirstInvariant((invariant) => {
        invariant["optional"] = true;
      }),
      "unknown property",
    );
  });

  it("rejects a document that declares no invariants at all", () => {
    expectSchemaRejected(SCHEMA, { invariants: [] }, "empty invariants document");
  });
});
