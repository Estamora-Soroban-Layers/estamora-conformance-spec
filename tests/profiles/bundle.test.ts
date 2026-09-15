/**
 * Profile bundle tests.
 *
 * The released SEP-41 bundle is asserted against its *published* identity and
 * inventory, because Repository 2 consumes it by identity and by file list. The
 * remaining cases build scratch bundles under `tests/.tmp-*` so that failure
 * handling — a missing bundle file, an unparsable document, a malformed version
 * directory — is tested against artefacts the suite owns and can therefore
 * break on purpose.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  DiagnosticBag,
  discoverExampleProfiles,
  discoverProfileDirectories,
  findMalformedVersionDirectories,
  formatIdentity,
  getSchemaRegistry,
  loadProfileBundle,
  PROFILE_BUNDLE_FILES,
  PROFILES_DIR,
  REPO_ROOT,
  VECTORS_DIR,
} from "../../scripts/lib/index.ts";
import {
  collectYamlFiles,
  readDocument,
  SEP41_IDENTITY,
  SEP41_PROFILE_DIR,
} from "../helpers/artifacts.ts";

/** Every method SEP-41 defines as part of `TokenInterface`. */
const SEP41_METHODS = [
  "allowance",
  "approve",
  "balance",
  "burn",
  "burn_from",
  "decimals",
  "name",
  "symbol",
  "transfer",
  "transfer_from",
] as const;

const scratch = mkdtempSync(join(REPO_ROOT, "tests", ".tmp-bundle-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("the released SEP-41 bundle", () => {
  const bag = new DiagnosticBag();
  const bundle = loadProfileBundle(SEP41_PROFILE_DIR, getSchemaRegistry(), bag);

  it("loads without a single diagnostic", () => {
    expect(bag.all()).toEqual([]);
  });

  it("is valid and identifies itself as sep-41@1.0", () => {
    expect(bundle.valid).toBe(true);
    expect(bundle.identity).toBeDefined();
    if (bundle.identity === undefined) {
      return;
    }
    expect(formatIdentity(bundle.identity)).toBe(SEP41_IDENTITY);
  });

  it("declares exactly the ten SEP-41 methods", () => {
    expect(bundle.methods?.map((method) => method.name).sort()).toEqual([...SEP41_METHODS].sort());
  });

  it("populates every requirement collection", () => {
    expect(bundle.authorization?.length ?? 0).toBeGreaterThan(0);
    expect(bundle.events?.length ?? 0).toBeGreaterThan(0);
    expect(bundle.behaviors?.length ?? 0).toBeGreaterThan(0);
    expect(bundle.invariants?.length ?? 0).toBeGreaterThan(0);
    expect(bundle.failures?.length ?? 0).toBeGreaterThan(0);
  });

  it("owns vectors and names every one of them in its manifest", () => {
    const manifest = readDocument("profiles/sep-41/1.0/profile.yaml") as {
      includes: { vectors: string[]; shared_vectors: string[] };
    };
    const declared = new Set(manifest.includes.vectors);
    // Every owned vector must sit in a declared operation directory, and every
    // declared directory must contribute at least one vector.
    const contributed = new Set<string>();
    for (const file of bundle.vectorFiles) {
      const operation = file.slice(join(SEP41_PROFILE_DIR, "vectors").length + 1).split("/")[0];
      expect(operation, `${file} is not inside a declared operation directory`).toBeDefined();
      if (operation !== undefined) {
        expect(declared.has(operation), `${operation} is not declared in includes.vectors`).toBe(
          true,
        );
        contributed.add(operation);
      }
    }
    expect([...contributed].sort()).toEqual([...declared].sort());
  });

  it("consumes shared vector sets that exist and are not empty", () => {
    const manifest = readDocument("profiles/sep-41/1.0/profile.yaml") as {
      includes: { shared_vectors: string[] };
    };
    expect(manifest.includes.shared_vectors.length).toBeGreaterThan(0);
    for (const set of manifest.includes.shared_vectors) {
      const files = collectYamlFiles(join(VECTORS_DIR, set));
      expect(files.length, `shared vector set ${set} must contribute vectors`).toBeGreaterThan(0);
    }
  });
});

describe("profile discovery", () => {
  it("finds the released profile directory", () => {
    expect(discoverProfileDirectories(PROFILES_DIR)).toContain(SEP41_PROFILE_DIR);
  });

  it("reports no malformed version directory in the released tree", () => {
    expect(findMalformedVersionDirectories(PROFILES_DIR)).toEqual([]);
  });

  it("finds a version directory whose name is not MAJOR.MINOR", () => {
    const root = join(scratch, "discovery");
    mkdirSync(join(root, "broken", "v1.0"), { recursive: true });
    writeFileSync(join(root, "broken", "v1.0", PROFILE_BUNDLE_FILES.profile), "profile: {}\n");
    mkdirSync(join(root, "ok", "1.0"), { recursive: true });
    writeFileSync(join(root, "ok", "1.0", PROFILE_BUNDLE_FILES.profile), "profile: {}\n");

    const problems = findMalformedVersionDirectories(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.reason).toContain("v1.0");
    // Discovery deliberately finds both: reporting the malformed one is the
    // validator's job, so a typo produces an explicit diagnostic rather than a
    // directory that quietly disappears from the registry.
    expect(discoverProfileDirectories(root)).toHaveLength(2);
  });

  it("discovers a flat example bundle", () => {
    const root = join(scratch, "examples");
    mkdirSync(join(root, "flat-example"), { recursive: true });
    writeFileSync(join(root, "flat-example", PROFILE_BUNDLE_FILES.profile), "profile: {}\n");
    expect(discoverExampleProfiles(root)).toEqual([join(root, "flat-example")]);
  });
});

describe("bundle loading failures", () => {
  it("reports every missing bundle file and stays loadable", () => {
    const directory = join(scratch, "incomplete");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, PROFILE_BUNDLE_FILES.profile),
      "estamora_spec_version: '1.0'\nprofile:\n  id: incomplete\n  version: '1.0'\nincludes: {}\n",
    );

    const bag = new DiagnosticBag();
    const bundle = loadProfileBundle(directory, getSchemaRegistry(), bag);

    expect(bundle.valid).toBe(false);
    expect(bundle.profile).toBeUndefined();
    // Six bundle files are missing and the metadata document itself is invalid.
    expect(bag.count("error")).toBeGreaterThanOrEqual(6);
    for (const key of [
      "methods",
      "authorization",
      "events",
      "behavior",
      "invariants",
      "failures",
    ]) {
      expect(bag.format(), key).toContain(
        PROFILE_BUNDLE_FILES[key as keyof typeof PROFILE_BUNDLE_FILES],
      );
    }
    // The identity is still readable, so a broken bundle can be named in a report
    // instead of surfacing as "unknown profile".
    expect(bundle.identity).toEqual({ id: "incomplete", version: "1.0" });
  });

  it("classifies an unparsable bundle document as a parse error", () => {
    const directory = join(scratch, "unparsable");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, PROFILE_BUNDLE_FILES.profile), "profile: [unterminated\n");
    writeFileSync(join(directory, PROFILE_BUNDLE_FILES.methods), "methods: []\n");

    const bag = new DiagnosticBag();
    const bundle = loadProfileBundle(directory, getSchemaRegistry(), bag);

    expect(bundle.valid).toBe(false);
    expect(bundle.profile).toBeUndefined();
    expect(bag.all().some((diagnostic) => diagnostic.code === "PARSE_ERROR")).toBe(true);
  });

  it("does not invent an identity for an example bundle with no version path", () => {
    const directory = join(scratch, "unnamed-example");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, PROFILE_BUNDLE_FILES.profile), "profile: {}\n");

    const bag = new DiagnosticBag();
    const bundle = loadProfileBundle(directory, getSchemaRegistry(), bag);

    // `<profiles>/examples/<name>` has no version component, so deriving the
    // identity from the path would produce `examples@<name>`, which is not an
    // identity any contract could be certified against.
    expect(bundle.identity).toBeUndefined();
  });
});
