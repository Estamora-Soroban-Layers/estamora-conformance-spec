/**
 * Repository layout tests.
 *
 * The layout is part of the specification's public interface: Repository 2
 * resolves `schema/<name>.schema.json`, `profiles/<id>/<MAJOR.MINOR>/` and
 * `vectors/<set>/<operation>/` without being told where to look. These tests
 * fail when the tree stops matching what a consumer is entitled to assume, which
 * is the only way a structural change gets noticed before release.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CHANGELOG_PATH,
  discoverProfileDirectories,
  DOCS_DIR,
  EXAMPLE_PROFILES_DIR,
  EXAMPLES_DIR,
  GENERATED_DOCS_DIR,
  PROFILE_BUNDLE_FILES,
  PROFILES_DIR,
  REPO_ROOT,
  SCHEMA_DIR,
  SCHEMA_FILES,
  SPEC_FORMAT_VERSION,
  TESTS_DIR,
  VECTORS_DIR,
} from "../../scripts/lib/index.ts";
import { collectYamlFiles, readDocument } from "../helpers/artifacts.ts";

function entries(directory: string): string[] {
  try {
    return readdirSync(directory).sort();
  } catch {
    return [];
  }
}

function subdirectories(directory: string): string[] {
  return entries(directory).filter((entry) => {
    try {
      return statSync(join(directory, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}

function files(directory: string): string[] {
  return entries(directory).filter((entry) => {
    try {
      return statSync(join(directory, entry)).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * The normative reference documents. The README links each one and the runner
 * cites them by path, so the set is a published interface rather than a
 * directory of prose that happens to exist.
 */
const REFERENCE_DOCS = [
  "architecture.md",
  "authorization-model.md",
  "behavioral-model.md",
  "certification.md",
  "compatibility.md",
  "event-model.md",
  "failure-model.md",
  "faq.md",
  "governance.md",
  "introduction.md",
  "invariant-model.md",
  "profile-authoring.md",
  "security.md",
  "state-model.md",
  "terminology.md",
  "vector-model.md",
  "versioning.md",
] as const;

/**
 * Every relative Markdown link in a document, as written.
 *
 * Absolute targets are excluded, and that is the whole job of this function: a
 * document is allowed to cite an upstream specification by URL, and a link to a
 * remote `.md` is not a path this repository is expected to resolve. Filtering on
 * the `.md` suffix alone made the check fail for exactly the documents that cite
 * their source most carefully.
 */
function markdownLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] ?? "")
    .filter((target) => target.endsWith(".md") && !target.includes("://"));
}

/** The five validation entry points CI invokes. */
const ENTRY_POINTS = [
  "validate-schema.ts",
  "validate-profiles.ts",
  "check-vectors.ts",
  "generate-docs.ts",
  "release-check.ts",
] as const;

describe("top-level layout", () => {
  it.each(["schema", "profiles", "vectors", "examples", "scripts", "docs"])(
    "publishes the %s directory",
    (name) => {
      expect(subdirectories(REPO_ROOT), name).toContain(name);
    },
  );

  it.each(ENTRY_POINTS)("publishes scripts/%s", (name) => {
    expect(files(join(REPO_ROOT, "scripts")), name).toContain(name);
  });

  it.each([
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "VERSIONING.md",
    "CONTRIBUTING.md",
    "GOVERNANCE.md",
    "SECURITY.md",
    "package.json",
    "tsconfig.json",
  ])("publishes %s", (name) => {
    expect(files(REPO_ROOT), name).toContain(name);
  });

  it("publishes the continuous integration configuration", () => {
    const github = join(REPO_ROOT, ".github");
    expect(subdirectories(github).sort()).toEqual(["ISSUE_TEMPLATE", "workflows"]);
    expect(files(join(github, "workflows")).sort()).toEqual([
      "ci.yml",
      "docs.yml",
      "profile-validation.yml",
      "release.yml",
      "schema-validation.yml",
    ]);
    expect(files(join(github, "ISSUE_TEMPLATE")).sort()).toEqual([
      "bug-report.yml",
      "config.yml",
      "improvement.yml",
      "profile-proposal.yml",
    ]);
    expect(files(github)).toContain("PULL_REQUEST_TEMPLATE.md");
    expect(files(github)).toContain("dependabot.yml");
  });

  it("keeps the test suite inside the tree the tsconfig typechecks", () => {
    expect(subdirectories(REPO_ROOT)).toContain("tests");
    expect(join(REPO_ROOT, "tests").startsWith(TESTS_DIR)).toBe(true);
  });
});

describe("schema layout", () => {
  it("contains exactly the ten normative schemas", () => {
    expect(files(SCHEMA_DIR).sort()).toEqual([...SCHEMA_FILES].sort());
  });
});

describe("profile layout", () => {
  it("stores each profile under <id>/<MAJOR.MINOR>/", () => {
    for (const directory of discoverProfileDirectories(PROFILES_DIR)) {
      const relativePath = directory.slice(PROFILES_DIR.length + 1);
      const parts = relativePath.split("/");
      const isFlatExample =
        parts[0] === "examples" && parts.length === 2 && directory.startsWith(EXAMPLE_PROFILES_DIR);
      if (isFlatExample) {
        continue;
      }
      expect(parts.length, relativePath).toBe(2);
      expect(parts[1], relativePath).toMatch(/^\d+\.\d+$/u);
    }
  });

  it("keeps only version directories, the example set and a README beside each profile id", () => {
    for (const id of subdirectories(PROFILES_DIR)) {
      if (id === "examples") {
        continue;
      }
      for (const version of subdirectories(join(PROFILES_DIR, id))) {
        expect(version, `profiles/${id}/${version}`).toMatch(/^\d+\.\d+$/u);
      }
      // Asserted rather than merely permitted. The loop this replaced iterated an
      // empty list when no README existed, so a profile id could ship without one
      // and the test still passed: a check that read as a requirement and was not
      // one. The README is the only file a profile id may hold beside its version
      // directories, so the set is pinned exactly.
      expect(files(join(PROFILES_DIR, id)), `profiles/${id}`).toEqual(["README.md"]);
    }
  });

  it("gives every bundle exactly the seven documents and a vector directory", () => {
    // The rule applies to a released profile and to a worked example alike: a
    // bundle is defined by its file set, and a consumer that reads six of the
    // seven documents is reading a different specification.
    const bundles = discoverProfileDirectories(PROFILES_DIR);
    expect(bundles.length).toBeGreaterThan(0);
    for (const directory of bundles) {
      const expected = [...Object.values(PROFILE_BUNDLE_FILES)].sort();
      expect(files(directory).sort(), directory).toEqual(expected);
      expect(subdirectories(directory).sort(), directory).toEqual(["vectors"]);
    }
  });

  it("resolves every relative Markdown link in every profile README", () => {
    // A profile README is the document a reader arrives at after following the
    // identity of the requirement set, so a dead link in one is a reader who
    // cannot reach the versioning policy or the authoring guide from where the
    // question actually arises.
    const readmes = [
      join(PROFILES_DIR, "README.md"),
      ...subdirectories(PROFILES_DIR)
        .filter((id) => id !== "examples")
        .map((id) => join(PROFILES_DIR, id, "README.md")),
    ];
    for (const readme of readmes) {
      const relative = readme.slice(REPO_ROOT.length + 1);
      expect(existsSync(readme), relative).toBe(true);
      for (const target of markdownLinks(readFileSync(readme, "utf8"))) {
        expect(existsSync(join(dirname(readme), target)), `${relative} links to ${target}`).toBe(
          true,
        );
      }
    }
  });

  it("publishes a worked example bundle for each documented scenario", () => {
    expect(subdirectories(EXAMPLE_PROFILES_DIR).sort()).toEqual([
      "authorization-sensitive",
      "event-sensitive",
      "minimal-token",
    ]);
  });

  it("writes the current Estamora format version into every profile document", () => {
    for (const directory of discoverProfileDirectories(PROFILES_DIR)) {
      const document = readDocument(
        `${directory.slice(REPO_ROOT.length + 1)}/${PROFILE_BUNDLE_FILES.profile}`,
      );
      const declared = (document as { estamora_spec_version?: unknown }).estamora_spec_version;
      expect(declared, directory).toBe(SPEC_FORMAT_VERSION);
    }
  });
});

describe("vector layout", () => {
  it("groups the shared library by set and operation", () => {
    for (const set of subdirectories(VECTORS_DIR)) {
      for (const operation of subdirectories(join(VECTORS_DIR, set))) {
        expect(collectYamlFiles(join(VECTORS_DIR, set, operation)).length).toBeGreaterThan(0);
      }
    }
  });

  it("places no loose YAML file at the root of the shared library", () => {
    expect(files(VECTORS_DIR).filter((file) => file.endsWith(".yaml"))).toEqual([]);
  });
});

describe("example layout", () => {
  it("keeps the standalone example documents at the top level", () => {
    const examples = files(EXAMPLES_DIR).filter((file) => file.endsWith(".yaml"));
    expect(examples.sort()).toEqual([
      "basic-profile.yaml",
      "custom-profile.yaml",
      "profile-with-invariants.yaml",
      "sep-41-profile.yaml",
    ]);
    // The example set is flat on purpose: each file is a single document that
    // demonstrates exactly one schema, so nothing here may be a bundle.
    expect(subdirectories(EXAMPLES_DIR)).toEqual([]);
  });
});

describe("reference documentation", () => {
  it.each(REFERENCE_DOCS)("publishes a non-empty docs/%s", (name) => {
    expect(files(DOCS_DIR)).toContain(name);
    expect(statSync(join(DOCS_DIR, name)).size).toBeGreaterThan(0);
  });

  it("links every reference document from the README", () => {
    const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
    for (const name of REFERENCE_DOCS) {
      // A document no reader can find is a document that will be missed when
      // the model changes, so the README has to point at each one.
      expect(readme, `README must link docs/${name}`).toContain(`docs/${name}`);
    }
  });

  it("resolves every relative Markdown link between documents", () => {
    for (const name of files(DOCS_DIR).filter((file) => file.endsWith(".md"))) {
      const source = join(DOCS_DIR, name);
      for (const target of markdownLinks(readFileSync(source, "utf8"))) {
        expect(statSync(join(dirname(source), target)).isFile(), `${name} links to ${target}`).toBe(
          true,
        );
      }
    }
  });
});

describe("generated documentation and release metadata", () => {
  it("publishes the generated indexes", () => {
    const generated = files(GENERATED_DOCS_DIR);
    expect(generated).toContain("profile-index.md");
    expect(generated).toContain("vector-index.md");
  });

  it("keeps a changelog for the release gate to validate", () => {
    expect(files(REPO_ROOT)).toContain("CHANGELOG.md");
    expect(statSync(CHANGELOG_PATH).size).toBeGreaterThan(0);
  });
});
