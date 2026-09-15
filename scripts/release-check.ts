#!/usr/bin/env node
/**
 * Check that this tree is releasable.
 *
 * The other entry points answer whether the specification is *correct*. This one
 * answers whether it is *releasable*, which is a different question with a
 * different set of failure modes:
 *
 * - the repository version and the newest changelog entry disagree, so a release
 *   that was tagged describes a tree nobody can identify;
 * - a profile exists on disk but appears in no changelog entry, so a requirement
 *   set was published without a ledger entry naming it;
 * - a profile version disagrees with the directory it lives in, so the identity a
 *   consumer pins is not the identity the path suggests;
 * - a profile declares a status outside the four the versioning policy permits;
 * - a placeholder marker reached a normative artefact, which is how a
 *   specification quietly ships a requirement nobody implemented;
 * - the license the profile metadata claims is not the license in the tree.
 *
 * Everything it checks is stated normatively in VERSIONING.md. Nothing here
 * re-validates profile content — that is `validate-profiles` and
 * `check-vectors`'s responsibility, and duplicating it would report the same
 * defect twice from two different commands.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  booleanFlag,
  CHANGELOG_PATH,
  COMMON_FLAGS,
  DiagnosticBag,
  discoverProfileDirectories,
  ErrorCode,
  EXIT_CODES,
  formatIdentity,
  handleCliError,
  note,
  parseArgs,
  prettyJson,
  PROFILES_DIR,
  PROFILE_BUNDLE_FILES,
  readJsonFile,
  readYamlFile,
  REPO_ROOT,
  reportSummary,
  SCHEMA_DIR,
  setMachineReadable,
  SCHEMA_FILES,
  SPEC_FORMAT_VERSION,
  tally,
  usage,
} from "./lib/index.ts";

const PROGRAM = "estamora-release-check";

/** Files a release must publish. */
const REQUIRED_DOCUMENTS = [
  "LICENSE",
  "CHANGELOG.md",
  "VERSIONING.md",
  "package.json",
  "tsconfig.json",
] as const;

/** Directories a release must publish. */
const REQUIRED_DIRECTORIES = [
  "schema",
  "profiles",
  "vectors",
  "examples",
  "scripts",
  "docs/generated",
] as const;

/** The statuses the versioning policy permits. */
const PERMITTED_STATUSES: readonly string[] = ["draft", "experimental", "stable", "deprecated"];

/** Trees whose contents are normative and therefore may not contain a placeholder. */
const NORMATIVE_TREES = ["schema", "profiles", "vectors", "examples"] as const;

/**
 * Markers that indicate unfinished work.
 *
 * Word boundaries matter: the pattern must not fire on a legitimate identifier
 * such as `todo_count` inside a description, only on the marker as a word.
 */
const PLACEHOLDER_PATTERN = /\b(TODO|FIXME|XXX|TBD|PLACEHOLDER|WIP)\b/u;

/** A release heading in the changelog, e.g. `## [0.1.0] - 2026-09-15`. */
const RELEASE_HEADING = /^##\s+\[([^\]]+)\]/u;

/** Heading text that denotes an unreleased section rather than a release. */
const UNRELEASED = "unreleased";

/** A release recorded in the changelog. */
interface ReleaseEntry {
  readonly version: string;
  /** One-based line number, so a diagnostic can point at the heading. */
  readonly line: number;
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv, COMMON_FLAGS);
  if (booleanFlag(args, "help")) {
    process.stdout.write(
      `${usage(PROGRAM, "Check that this repository is releasable.", COMMON_FLAGS)}\n`,
    );
    return EXIT_CODES.SUCCESS;
  }

  setMachineReadable(booleanFlag(args, "json"));

  const bag = new DiagnosticBag();

  const present = checkLayout(bag);
  if (!present) {
    // Without the layout there is nothing further to read, so report what is
    // missing rather than failing on the first unreadable file.
    const ok = reportSummary("release readiness", bag);
    return ok ? EXIT_CODES.SUCCESS : EXIT_CODES.DEFECTS_FOUND;
  }

  const changelogText = readFileSync(CHANGELOG_PATH, "utf8");
  const releases = parseReleases(changelogText);
  const repositoryVersion = readRepositoryVersion(bag);

  checkRepositoryVersion(bag, repositoryVersion, releases);
  checkSchemaInventory(bag);
  checkProfiles(bag, changelogText);
  checkPlaceholders(bag);
  checkLicense(bag);

  note(`${tally(releases.length, releases.length)} release entr(ies) recorded in CHANGELOG.md`);
  const ok = reportSummary("release readiness", bag);
  if (booleanFlag(args, "json")) {
    process.stdout.write(prettyJson({ ok, diagnostics: bag.toJSON() }));
  }
  return ok ? EXIT_CODES.SUCCESS : EXIT_CODES.DEFECTS_FOUND;
}

/** Verify that the required documents and directories exist. */
function checkLayout(bag: DiagnosticBag): boolean {
  let complete = true;

  for (const document of REQUIRED_DOCUMENTS) {
    const path = join(REPO_ROOT, document);
    if (!existsSync(path)) {
      bag.error(ErrorCode.RELEASE_ERROR, `A release must publish ${document}.`, path);
      complete = false;
      continue;
    }
    if (statSync(path).size === 0) {
      bag.error(ErrorCode.RELEASE_ERROR, `${document} is empty.`, path);
      complete = false;
    }
  }

  for (const directory of REQUIRED_DIRECTORIES) {
    const path = join(REPO_ROOT, directory);
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      bag.error(
        ErrorCode.RELEASE_ERROR,
        `A release must publish the ${directory}/ directory.`,
        path,
      );
      complete = false;
    }
  }

  return complete;
}

/** Read the repository version declared by `package.json`. */
function readRepositoryVersion(bag: DiagnosticBag): string | undefined {
  const path = join(REPO_ROOT, "package.json");
  let manifest: unknown;
  try {
    manifest = readJsonFile(path);
  } catch (cause) {
    bag.error(
      ErrorCode.RELEASE_ERROR,
      `Unable to read package.json: ${cause instanceof Error ? cause.message : String(cause)}`,
      path,
    );
    return undefined;
  }
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    bag.error(ErrorCode.RELEASE_ERROR, "package.json must contain a JSON object.", path);
    return undefined;
  }
  const version = (manifest as Record<string, unknown>)["version"];
  if (typeof version !== "string" || version.length === 0) {
    bag.error(ErrorCode.RELEASE_ERROR, "package.json must declare a version.", path);
    return undefined;
  }
  return version;
}

/** Read the release headings of the changelog, newest first. */
function parseReleases(changelogText: string): readonly ReleaseEntry[] {
  const releases: ReleaseEntry[] = [];
  const lines = changelogText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = RELEASE_HEADING.exec(lines[index] ?? "");
    const version = match?.[1]?.trim();
    if (version === undefined || version.toLowerCase() === UNRELEASED) {
      continue;
    }
    releases.push({ version, line: index + 1 });
  }
  return releases;
}

/** Require the newest changelog release to be the repository version. */
function checkRepositoryVersion(
  bag: DiagnosticBag,
  repositoryVersion: string | undefined,
  releases: readonly ReleaseEntry[],
): void {
  if (repositoryVersion === undefined) {
    return;
  }

  const newest = releases[0];
  if (newest === undefined) {
    bag.error(
      ErrorCode.RELEASE_ERROR,
      `CHANGELOG.md records no release, but package.json declares version ${JSON.stringify(repositoryVersion)}.`,
      CHANGELOG_PATH,
    );
    return;
  }

  if (newest.version !== repositoryVersion) {
    bag.error(
      ErrorCode.RELEASE_ERROR,
      `The newest changelog release is ${JSON.stringify(newest.version)} but package.json declares ${JSON.stringify(repositoryVersion)}. A release must be identifiable from both.`,
      CHANGELOG_PATH,
      `line ${String(newest.line)}`,
    );
  }
}

/** Require the schema inventory to match the schemas the tooling loads. */
function checkSchemaInventory(bag: DiagnosticBag): void {
  const present = safeReadDir(SCHEMA_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .sort();
  const expected = [...SCHEMA_FILES].sort();

  for (const name of expected) {
    if (!present.includes(name)) {
      bag.error(ErrorCode.RELEASE_ERROR, `Schema ${name} is declared but missing.`, SCHEMA_DIR);
    }
  }
  for (const name of present) {
    if (!(expected as readonly string[]).includes(name)) {
      bag.error(
        ErrorCode.RELEASE_ERROR,
        `Schema ${name} is published but not declared in SCHEMA_FILES, so nothing validates it.`,
        join(SCHEMA_DIR, name),
      );
    }
  }
}

/** Check the release metadata of every profile in the tree. */
function checkProfiles(bag: DiagnosticBag, changelogText: string): void {
  for (const directory of discoverProfileDirectories(PROFILES_DIR)) {
    const file = join(directory, PROFILE_BUNDLE_FILES.profile);
    let document: unknown;
    try {
      document = readYamlFile(file);
    } catch (cause) {
      bag.error(
        ErrorCode.RELEASE_ERROR,
        `Unable to read profile metadata: ${cause instanceof Error ? cause.message : String(cause)}`,
        file,
      );
      continue;
    }

    const profile = readObject(document, "profile");
    if (profile === undefined) {
      bag.error(ErrorCode.RELEASE_ERROR, "Profile metadata declares no profile block.", file);
      continue;
    }

    const id = profile["id"];
    const version = profile["version"];
    const status = profile["status"];

    if (typeof id !== "string" || typeof version !== "string") {
      bag.error(
        ErrorCode.RELEASE_ERROR,
        "Profile metadata must declare a string id and version to be releasable.",
        file,
      );
      continue;
    }

    const identity = formatIdentity({ id, version });

    if (typeof status !== "string" || !PERMITTED_STATUSES.includes(status)) {
      bag.error(
        ErrorCode.VERSION_ERROR,
        `Profile status ${JSON.stringify(status)} is not one of ${PERMITTED_STATUSES.join(", ")}.`,
        file,
        "/profile/status",
      );
    }

    const declaredFormat = document as Record<string, unknown>;
    if (declaredFormat["estamora_spec_version"] !== SPEC_FORMAT_VERSION) {
      bag.error(
        ErrorCode.VERSION_ERROR,
        `Profile must declare estamora_spec_version ${JSON.stringify(SPEC_FORMAT_VERSION)}.`,
        file,
        "/estamora_spec_version",
      );
    }

    const parts = relative(PROFILES_DIR, directory).split(/[/\\]/u);
    const isExample = parts[0] === "examples";
    if (!isExample) {
      const directoryVersion = parts[1];
      if (directoryVersion !== version) {
        bag.error(
          ErrorCode.VERSION_ERROR,
          `Profile version ${JSON.stringify(version)} disagrees with its directory ${JSON.stringify(directoryVersion ?? "")}. The path is part of the identity a consumer pins.`,
          file,
          "/profile/version",
        );
      }
    }

    if (!isExample && !changelogText.includes(identity)) {
      bag.error(
        ErrorCode.RELEASE_ERROR,
        `Profile ${identity} is not recorded in CHANGELOG.md. A released requirement set must appear in the ledger as \`${identity}\`.`,
        CHANGELOG_PATH,
      );
    }
  }
}

/** Refuse to ship a placeholder marker inside a normative artefact. */
function checkPlaceholders(bag: DiagnosticBag): void {
  for (const tree of NORMATIVE_TREES) {
    const root = join(REPO_ROOT, tree);
    for (const file of collectFiles(root, [".json", ".yaml", ".yml"])) {
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const match = PLACEHOLDER_PATTERN.exec(lines[index] ?? "");
        if (match?.[1] === undefined) {
          continue;
        }
        bag.error(
          ErrorCode.RELEASE_ERROR,
          `Normative artefact contains the placeholder marker ${JSON.stringify(match[1])}. Unfinished requirements do not belong in a release.`,
          file,
          `line ${String(index + 1)}`,
        );
      }
    }
  }
}

/** Require the LICENSE to be the license the profile metadata declares. */
function checkLicense(bag: DiagnosticBag): void {
  const path = join(REPO_ROOT, "LICENSE");
  if (!existsSync(path)) {
    return;
  }
  const text = readFileSync(path, "utf8");
  for (const required of ["Apache License", "Version 2.0"]) {
    if (!text.includes(required)) {
      bag.error(
        ErrorCode.RELEASE_ERROR,
        `LICENSE does not contain ${JSON.stringify(required)}, but profiles declare Apache-2.0.`,
        path,
      );
    }
  }
}

/** Read an object member from a parsed document. */
function readObject(document: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return undefined;
  }
  const member = (document as Record<string, unknown>)[key];
  if (typeof member !== "object" || member === null || Array.isArray(member)) {
    return undefined;
  }
  return member as Record<string, unknown>;
}

/** Recursively collect files with one of the given extensions. */
function collectFiles(root: string, extensions: readonly string[]): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of safeReadDir(directory)) {
      const path = join(directory, entry);
      let isDirectory = false;
      try {
        isDirectory = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (isDirectory) {
        walk(path);
        continue;
      }
      if (extensions.some((extension) => entry.endsWith(extension))) {
        found.push(path);
      }
    }
  };
  walk(root);
  return found.sort();
}

function safeReadDir(directory: string): readonly string[] {
  try {
    return readdirSync(directory).sort();
  } catch {
    return [];
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  handleCliError(PROGRAM, "Check that this repository is releasable.", COMMON_FLAGS, error);
  if (process.exitCode === undefined) {
    throw error;
  }
}
