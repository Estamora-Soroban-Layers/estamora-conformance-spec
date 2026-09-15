/**
 * Profile version handling.
 *
 * Profile versions are independent of the runner version and of the Estamora
 * format version. A profile version identifies a set of behavioural
 * requirements; changing a requirement requires a new version. This module
 * implements exactly enough version algebra to enforce that policy, and
 * refuses to guess about version strings it does not understand.
 */

/** A parsed profile or format version. */
export interface Version {
  /** Original textual form, e.g. `1.0`. */
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Prerelease identifier without the leading hyphen, e.g. `rc.1`. */
  readonly prerelease: string | undefined;
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Parse a version string.
 *
 * Accepts `MAJOR.MINOR` and `MAJOR.MINOR.PATCH` with an optional prerelease
 * suffix. Estamora profile *directories* are named `MAJOR.MINOR` because a
 * profile revision that only fixes wording is not worth a new directory; the
 * patch component is reserved for the profile document itself.
 */
export function parseVersion(raw: string): Version | undefined {
  const match = VERSION_PATTERN.exec(raw);
  if (match === null) {
    return undefined;
  }
  const [, major, minor, patch, prerelease] = match;
  if (major === undefined || minor === undefined) {
    return undefined;
  }
  return {
    raw,
    major: Number(major),
    minor: Number(minor),
    patch: patch === undefined ? 0 : Number(patch),
    prerelease,
  };
}

/** Whether a version string is well formed. */
export function isValidVersion(raw: string): boolean {
  return parseVersion(raw) !== undefined;
}

/** Compare two parsed versions, prereleases sorting before their release. */
export function compareVersions(left: Version, right: Version): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }
  if (left.prerelease === right.prerelease) {
    return 0;
  }
  if (left.prerelease === undefined) {
    return 1;
  }
  if (right.prerelease === undefined) {
    return -1;
  }
  return left.prerelease < right.prerelease ? -1 : 1;
}

/**
 * Whether `candidate` is a backward-compatible successor of `baseline`.
 *
 * Compatible means: same major version, and a version that is not older. A
 * major-version bump signals a behavioural change in the requirements, which
 * the versioning policy treats as breaking.
 */
export function isCompatibleSuccessor(baseline: Version, candidate: Version): boolean {
  return baseline.major === candidate.major && compareVersions(candidate, baseline) >= 0;
}

/**
 * Whether a directory name is a legal profile version directory.
 *
 * Only `MAJOR.MINOR` is accepted, which keeps the on-disk layout predictable
 * for the runner: `profiles/<id>/<MAJOR.MINOR>/`.
 */
export function isValidProfileVersionDirectory(name: string): boolean {
  const parsed = parseVersion(name);
  if (parsed === undefined) {
    return false;
  }
  return parsed.patch === 0 && parsed.prerelease === undefined && /^\d+\.\d+$/.test(name);
}
