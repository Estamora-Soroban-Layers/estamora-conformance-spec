/**
 * Vector corpus tests.
 *
 * A vector suite is the only thing that makes a profile actionable, so the
 * corpus is treated as a deliverable in its own right. These tests answer the
 * questions a reader of a conformance result will eventually ask: are the vector
 * identities unique, does every vector belong to a profile that exists, does the
 * suite cover the negative and authorization dimensions at all, and will the
 * corpus digest a receipt records be the same tomorrow?
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  combineDigests,
  DiagnosticBag,
  digestOfValue,
  discoverProfileDirectories,
  discoverSharedVectorSets,
  getSchemaRegistry,
  loadProfileBundle,
  loadVectors,
  PROFILES_DIR,
  VECTORS_DIR,
  WILDCARD_PROFILE,
  type LoadedVector,
  type ProfileBundle,
  type VectorKind,
} from "../../scripts/lib/index.ts";

const registry = getSchemaRegistry();

/** Every vector owned by a profile bundle, paired with its bundle. */
const bundleVectors: readonly { bundle: ProfileBundle; loaded: LoadedVector }[] =
  discoverProfileDirectories(PROFILES_DIR).flatMap((directory) => {
    const bundle = loadProfileBundle(directory, registry, new DiagnosticBag());
    return loadVectors(bundle.vectorFiles, registry, new DiagnosticBag()).map((loaded) => ({
      bundle,
      loaded,
    }));
  });

/** Every vector in the shared library, paired with the set it lives in. */
const sharedVectors: readonly { set: string; loaded: LoadedVector }[] = [
  ...discoverSharedVectorSets(new DiagnosticBag()),
].flatMap(([set, files]) =>
  loadVectors(files, registry, new DiagnosticBag()).map((loaded) => ({ set, loaded })),
);

const allVectors: readonly LoadedVector[] = [
  ...bundleVectors.map((entry) => entry.loaded),
  ...sharedVectors.map((entry) => entry.loaded),
];

/** Compute the corpus digest exactly as the vector checker does. */
function corpusDigest(vectors: readonly LoadedVector[]): string {
  const digests = vectors
    .map((vector) => digestOfValue(vector.raw))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return combineDigests(digests);
}

describe("corpus integrity", () => {
  it("finds both the profile-owned and the shared vectors", () => {
    expect(bundleVectors.length).toBeGreaterThan(0);
    expect(sharedVectors.length).toBeGreaterThan(0);
  });

  it("loads every vector without a diagnostic", () => {
    const bag = new DiagnosticBag();
    loadVectors(
      [...bundleVectors, ...sharedVectors].map((entry) => entry.loaded.path),
      registry,
      bag,
    );
    expect(bag.all()).toEqual([]);
  });

  it("gives every vector a unique identity across the whole corpus", () => {
    const seen = new Map<string, string>();
    for (const entry of [...bundleVectors, ...sharedVectors]) {
      const id = entry.loaded.vector?.id;
      expect(id, `${entry.loaded.location} has no id`).toBeDefined();
      if (id === undefined) {
        continue;
      }
      const previous = seen.get(id);
      expect(previous, `duplicate vector id ${id}`).toBeUndefined();
      seen.set(id, entry.loaded.location);
    }
    expect(seen.size).toBe(allVectors.length);
  });

  it("names the file after the vector it contains", () => {
    for (const entry of [...bundleVectors, ...sharedVectors]) {
      const id = entry.loaded.vector?.id;
      if (id === undefined) {
        continue;
      }
      expect(entry.loaded.path.endsWith(`${id}.yaml`), `${entry.loaded.location} -> ${id}`).toBe(
        true,
      );
    }
  });
});

describe("profile ownership", () => {
  it("binds every profile-owned vector to the bundle that owns it", () => {
    for (const { bundle, loaded } of bundleVectors) {
      const vector = loaded.vector;
      expect(vector, loaded.location).toBeDefined();
      if (vector === undefined || bundle.identity === undefined) {
        continue;
      }
      expect(vector.profile, loaded.location).toBe(bundle.identity.id);
      expect(vector.profile_version, loaded.location).toBe(bundle.identity.version);
    }
  });

  it("keeps a shared vector bound to an existing profile", () => {
    const identities = new Set(
      discoverProfileDirectories(PROFILES_DIR)
        .map((directory) => loadProfileBundle(directory, registry, new DiagnosticBag()).identity)
        .filter((identity) => identity !== undefined)
        .map((identity) => identity.id),
    );
    for (const { set, loaded } of sharedVectors) {
      const vector = loaded.vector;
      if (vector === undefined) {
        continue;
      }
      if (vector.profile === WILDCARD_PROFILE) {
        // Profile-independent scenarios live in exactly one place, so that the
        // requirement they encode has a single definition.
        expect(set, loaded.location).toBe("common");
        continue;
      }
      expect(identities.has(vector.profile), `${loaded.location} names ${vector.profile}`).toBe(
        true,
      );
      expect(set, loaded.location).toBe(vector.profile);
    }
  });
});

describe("coverage of the conformance dimensions", () => {
  it("covers every vector kind for the SEP-41 family", () => {
    const kinds = new Set(
      [...bundleVectors, ...sharedVectors]
        .filter(
          (entry) =>
            entry.loaded.location.includes("sep-41") || entry.loaded.vector?.profile === "sep-41",
        )
        .map((entry) => entry.loaded.vector?.kind),
    );
    const required: readonly VectorKind[] = [
      "positive",
      "negative",
      "boundary",
      "authorization",
      "event",
      "state",
      "invariant",
    ];
    for (const kind of required) {
      expect(kinds, `no ${kind} vector covers the SEP-41 family`).toContain(kind);
    }
  });

  it("gives every profile bundle at least one negative vector", () => {
    // A suite of only successful calls cannot establish behavioural conformance,
    // which is the premise Estamora is built on.
    const byBundle = new Map<string, VectorKind[]>();
    for (const { bundle, loaded } of bundleVectors) {
      const key = bundle.identity === undefined ? bundle.location : bundle.identity.id;
      const kinds = byBundle.get(key) ?? [];
      if (loaded.vector !== undefined) {
        kinds.push(loaded.vector.kind);
      }
      byBundle.set(key, kinds);
    }
    expect(byBundle.size).toBeGreaterThan(0);
    for (const [profile, kinds] of byBundle) {
      expect(kinds, `${profile} declares no negative vector`).toContain("negative");
    }
  });

  it("states a failure for every negative vector and a success for every positive one", () => {
    for (const entry of [...bundleVectors, ...sharedVectors]) {
      const vector = entry.loaded.vector;
      if (vector === undefined) {
        continue;
      }
      if (vector.kind === "negative") {
        expect(vector.expected.outcome, entry.loaded.location).toBe("failure");
      }
      if (vector.kind === "positive") {
        expect(vector.expected.outcome, entry.loaded.location).toBe("success");
      }
    }
  });

  it("requires no event on an operation that must fail", () => {
    // Requiring an event and requiring unchanged state in the same vector would be
    // a contradiction only the profile author could resolve, so no failure vector
    // in this corpus may do it.
    for (const entry of [...bundleVectors, ...sharedVectors]) {
      const vector = entry.loaded.vector;
      if (vector === undefined || vector.expected.outcome !== "failure") {
        continue;
      }
      expect(vector.expected.events.required, entry.loaded.location).toEqual([]);
    }
  });

  it("forbids only events the owning profile declares", () => {
    for (const { bundle, loaded } of bundleVectors) {
      const vector = loaded.vector;
      if (vector === undefined || bundle.events === undefined) {
        continue;
      }
      const declared = new Set(bundle.events.map((event) => event.id));
      for (const name of vector.expected.events.forbidden) {
        expect(declared.has(name), `${loaded.location} forbids undeclared event ${name}`).toBe(
          true,
        );
      }
    }
  });

  it("scopes every state assertion to a resource and a predicate", () => {
    for (const entry of [...bundleVectors, ...sharedVectors]) {
      const vector = entry.loaded.vector;
      if (vector === undefined) {
        continue;
      }
      for (const assertion of vector.expected.state_assertions) {
        expect(assertion.resource, `${entry.loaded.location}/${assertion.id}`).toBeDefined();
        expect(assertion.predicate, `${entry.loaded.location}/${assertion.id}`).toBeDefined();
        expect(
          assertion.description?.length ?? 0,
          `${entry.loaded.location}/${assertion.id}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("corpus identity", () => {
  it("is a well-formed digest", () => {
    expect(corpusDigest(allVectors)).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("does not depend on the order vectors happen to be discovered in", () => {
    expect(corpusDigest(allVectors)).toBe(corpusDigest([...allVectors].reverse()));
  });

  it("changes when a vector changes", () => {
    const tampered = allVectors.map((vector) => ({
      ...vector,
      raw: { ...(vector.raw as Record<string, unknown>), title: "tampered" },
    }));
    expect(corpusDigest(tampered)).not.toBe(corpusDigest(allVectors));
  });
});

describe("shared library layout", () => {
  it("stores shared vectors under `<set>/<operation>/<file>.yaml`", () => {
    for (const entry of sharedVectors) {
      const relativePath = entry.loaded.path.slice(VECTORS_DIR.length + 1);
      expect(relativePath.split("/").length, relativePath).toBe(3);
    }
  });

  it("places the wildcard scenarios in the common set", () => {
    const wildcards = allVectors.filter((vector) => vector.vector?.profile === WILDCARD_PROFILE);
    expect(wildcards.length).toBeGreaterThan(0);
    for (const vector of wildcards) {
      expect(vector.path.startsWith(join(VECTORS_DIR, "common"))).toBe(true);
    }
  });
});
