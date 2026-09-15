/**
 * Profile bundle loading.
 *
 * A profile is a *bundle*: one metadata document plus six requirement
 * collections plus a vector directory. Loading therefore has three phases:
 *
 * 1. discover the bundle files a profile directory declares;
 * 2. validate each document against its schema;
 * 3. hand the caller a bundle whose typed members are present exactly when the
 *    corresponding document was schema-valid.
 *
 * Typed members being optional is intentional. A cross-reference validator
 * must still be able to report "vector X references unknown method Y" when
 * `methods.yaml` itself has a defect, instead of aborting with a stack trace.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { DiagnosticBag } from "./diagnostics.ts";
import { ErrorCode } from "./errors.ts";
import {
  type AuthorizationRule,
  type BehaviorRule,
  type EventDefinition,
  type FailureDefinition,
  type InvariantDefinition,
  type MethodDefinition,
  type ProfileDocument,
} from "./models.ts";
import {
  EXAMPLE_PROFILES_DIR,
  PROFILE_BUNDLE_FILES,
  PROFILES_DIR,
  REPO_ROOT,
  type ProfileBundleFileKey,
  type SchemaFileName,
} from "./paths.ts";
import type { SchemaRegistry } from "./schemas.ts";
import { discoverVectorFiles } from "./vectors.ts";
import { isValidProfileVersionDirectory, parseVersion } from "./version.ts";
import { readYamlFile } from "./yaml.ts";

/** Which schema validates which bundle file. */
const BUNDLE_SCHEMAS: Record<ProfileBundleFileKey, SchemaFileName> = {
  profile: "profile.schema.json",
  methods: "method.schema.json",
  authorization: "authorization.schema.json",
  events: "event.schema.json",
  behavior: "behavior.schema.json",
  invariants: "invariant.schema.json",
  failures: "failure.schema.json",
};

/** The collection key each bundle file holds its entries under. */
const COLLECTION_KEY = {
  methods: "methods",
  authorization: "authorization_rules",
  events: "events",
  behavior: "behaviors",
  invariants: "invariants",
  failures: "failures",
} as const;

/** A profile directory whose documents have been read and schema-checked. */
export interface ProfileBundle {
  /** Absolute path to the profile directory. */
  readonly directory: string;
  /** Repository-relative path, used in diagnostics. */
  readonly location: string;
  /** Present only when `profile.yaml` was schema-valid. */
  readonly profile: ProfileDocument | undefined;
  readonly methods: readonly MethodDefinition[] | undefined;
  readonly authorization: readonly AuthorizationRule[] | undefined;
  readonly events: readonly EventDefinition[] | undefined;
  readonly behaviors: readonly BehaviorRule[] | undefined;
  readonly invariants: readonly InvariantDefinition[] | undefined;
  readonly failures: readonly FailureDefinition[] | undefined;
  /** Absolute paths to every vector file owned by this bundle. */
  readonly vectorFiles: readonly string[];
  /** Whether every bundle document was schema-valid. */
  readonly valid: boolean;
  /** Profile identity, derivable even when the metadata document is invalid. */
  readonly identity: ProfileIdentity | undefined;
}

/** Canonical `<id>@<version>` identity of a profile. */
export interface ProfileIdentity {
  readonly id: string;
  readonly version: string;
}

/** Render an identity in the canonical `id@version` form. */
export function formatIdentity(identity: ProfileIdentity): string {
  return `${identity.id}@${identity.version}`;
}

/**
 * Discover every profile directory in the repository.
 *
 * A directory qualifies when its path is `<...>/<id>/<MAJOR.MINOR>` and it
 * contains `profile.yaml`.
 */
export function discoverProfileDirectories(root: string = PROFILES_DIR): readonly string[] {
  const found: string[] = [];
  for (const idEntry of safeReadDir(root)) {
    const idPath = join(root, idEntry);
    if (!isDirectory(idPath) || idEntry === "examples") {
      continue;
    }
    for (const versionEntry of safeReadDir(idPath)) {
      const versionPath = join(idPath, versionEntry);
      if (!isDirectory(versionPath)) {
        continue;
      }
      if (existsSync(join(versionPath, PROFILE_BUNDLE_FILES.profile))) {
        found.push(versionPath);
      }
    }
  }
  // Example profiles are only part of the repository's own registry. A caller
  // walking some other directory is asking about that directory, and silently
  // appending the repository's examples would make the result depend on a tree
  // the caller never mentioned.
  if (root === PROFILES_DIR) {
    found.push(...discoverExampleProfiles(EXAMPLE_PROFILES_DIR));
  }
  return found.sort();
}

/**
 * Discover example profiles.
 *
 * Examples use a flat layout, `profiles/examples/<name>/profile.yaml`, with no
 * version directory. An example is a worked illustration rather than a released
 * requirement set, so it carries a version inside its metadata instead of in its
 * path, and forcing a version directory would suggest a release that does not
 * exist. The validator reads the version from the metadata for these bundles.
 */
export function discoverExampleProfiles(root: string = EXAMPLE_PROFILES_DIR): readonly string[] {
  const found: string[] = [];
  for (const entry of safeReadDir(root)) {
    const entryPath = join(root, entry);
    if (isDirectory(entryPath) && existsSync(join(entryPath, PROFILE_BUNDLE_FILES.profile))) {
      found.push(entryPath);
    }
  }
  return found.sort();
}

/**
 * Discover version directories that do not satisfy the `MAJOR.MINOR` rule.
 *
 * `release-check` reports these, so that a typo like `profiles/sep-41/v1.0/`
 * fails CI instead of silently disappearing from the registry.
 */
export function findMalformedVersionDirectories(
  root: string = PROFILES_DIR,
): readonly { directory: string; reason: string }[] {
  const problems: { directory: string; reason: string }[] = [];
  for (const idEntry of safeReadDir(root)) {
    const idPath = join(root, idEntry);
    if (!isDirectory(idPath)) {
      continue;
    }
    if (idEntry === "examples") {
      continue;
    }
    for (const versionEntry of safeReadDir(idPath)) {
      const versionPath = join(idPath, versionEntry);
      if (!isDirectory(versionPath) || versionEntry === "vectors") {
        continue;
      }
      if (!isValidProfileVersionDirectory(versionEntry)) {
        problems.push({
          directory: versionPath,
          reason: `version directory ${JSON.stringify(versionEntry)} must be MAJOR.MINOR`,
        });
      }
    }
  }
  return problems;
}

/** Load and schema-validate a single profile bundle. */
export function loadProfileBundle(
  directory: string,
  registry: SchemaRegistry,
  bag: DiagnosticBag,
): ProfileBundle {
  const location = relative(REPO_ROOT, directory);
  const raw = new Map<ProfileBundleFileKey, unknown>();
  const schemaValid = new Map<ProfileBundleFileKey, boolean>();

  for (const key of Object.keys(PROFILE_BUNDLE_FILES) as ProfileBundleFileKey[]) {
    const file = join(directory, PROFILE_BUNDLE_FILES[key]);
    if (!existsSync(file)) {
      bag.error(
        ErrorCode.PROFILE_ERROR,
        `Profile bundle is missing required file ${JSON.stringify(PROFILE_BUNDLE_FILES[key])}.`,
        file,
      );
      schemaValid.set(key, false);
      continue;
    }
    let document: unknown;
    try {
      document = readYamlFile(file);
    } catch (cause) {
      bag.error(
        ErrorCode.PARSE_ERROR,
        cause instanceof Error ? cause.message : String(cause),
        file,
      );
      schemaValid.set(key, false);
      continue;
    }
    schemaValid.set(key, registry.validateInto(bag, BUNDLE_SCHEMAS[key], document, file));
    raw.set(key, document);
  }

  const present = (key: ProfileBundleFileKey): boolean => schemaValid.get(key) === true;

  return {
    directory,
    location,
    profile: present("profile") ? (raw.get("profile") as ProfileDocument) : undefined,
    methods: present("methods")
      ? readCollection<MethodDefinition>(raw.get("methods"), COLLECTION_KEY.methods)
      : undefined,
    authorization: present("authorization")
      ? readCollection<AuthorizationRule>(raw.get("authorization"), COLLECTION_KEY.authorization)
      : undefined,
    events: present("events")
      ? readCollection<EventDefinition>(raw.get("events"), COLLECTION_KEY.events)
      : undefined,
    behaviors: present("behavior")
      ? readCollection<BehaviorRule>(raw.get("behavior"), COLLECTION_KEY.behavior)
      : undefined,
    invariants: present("invariants")
      ? readCollection<InvariantDefinition>(raw.get("invariants"), COLLECTION_KEY.invariants)
      : undefined,
    failures: present("failures")
      ? readCollection<FailureDefinition>(raw.get("failures"), COLLECTION_KEY.failures)
      : undefined,
    vectorFiles: discoverVectorFiles(join(directory, "vectors"), bag),
    valid: (Object.keys(PROFILE_BUNDLE_FILES) as ProfileBundleFileKey[]).every((key) =>
      present(key),
    ),
    identity: readIdentity(raw.get("profile"), directory),
  };
}

/**
 * Resolve the canonical identity of a profile, preferring the metadata
 * document and falling back to the directory path so that a broken
 * `profile.yaml` does not stop the identity from being reported.
 */
function readIdentity(document: unknown, directory: string): ProfileIdentity | undefined {
  const metadata = readMember<ProfileDocument["profile"]>(document, "profile");
  if (metadata !== undefined && typeof metadata.id === "string") {
    return { id: metadata.id, version: String(metadata.version) };
  }
  // A released profile is `<profiles>/<id>/<MAJOR.MINOR>`. An example profile is
  // `<profiles>/examples/<name>` and has no version directory, so the metadata
  // path above is the only source of its identity; falling back to the path here
  // would invent the identity "examples@<name>".
  const parts = relative(PROFILES_DIR, directory).split(/[/\\]/u);
  const [id, version] = parts;
  if (
    id !== undefined &&
    version !== undefined &&
    parts.length === 2 &&
    parseVersion(version) !== undefined
  ) {
    return { id, version };
  }
  return undefined;
}

/** Read a named object member from a parsed document. */
function readMember<T>(document: unknown, key: string): T | undefined {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return undefined;
  }
  const member = (document as Record<string, unknown>)[key];
  if (typeof member !== "object" || member === null || Array.isArray(member)) {
    return undefined;
  }
  return member as T;
}

/** Read a named array collection from a parsed document. */
function readCollection<T>(document: unknown, key: string): readonly T[] | undefined {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return undefined;
  }
  const collection = (document as Record<string, unknown>)[key];
  if (!Array.isArray(collection)) {
    return undefined;
  }
  return collection as readonly T[];
}

function safeReadDir(directory: string): readonly string[] {
  try {
    return readdirSync(directory).sort();
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
