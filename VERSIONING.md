# Versioning policy

This document is normative. `scripts/release-check.ts` enforces the parts of it
that can be checked mechanically, and a change that contradicts it is a defect
in the repository rather than a matter of taste.

## Three independent versions

Estamora has three version numbers, and conflating them is the most common way a
conformance claim becomes unverifiable.

| Version                | Identifies                                          | Where it lives                                       |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| **Repository version** | This tree: its schemas, its layout, its tooling     | `package.json`, the newest heading in `CHANGELOG.md` |
| **Format version**     | The shape of the documents, `estamora_spec_version` | Every profile and vector document, currently `1.0`   |
| **Profile version**    | A set of behavioural requirements, `id@MAJOR.MINOR` | `profiles/<id>/<MAJOR.MINOR>/`                       |

The runner (`estamora-conformance-runner`) has a fourth version of its own. **A
profile version is independent of the runner version and of the repository
version.** A runner release never changes what a profile requires, and a profile
revision never invalidates a runner release. A conformance result is therefore
identified by the profile identity it was measured against, never by the runner
version alone.

## Profile versions

A profile version is written `MAJOR.MINOR` and lives in a directory of exactly
that name: `profiles/sep-41/1.0/`. The patch component is reserved for the
profile document inside the directory and is never part of a directory name; a
revision that only fixes wording does not earn its own directory.

### The rule that matters

> **Any change that alters what a profile requires is a version change.**

This includes changes that look small:

- adding a required method, or turning an optional method into a required one;
- adding an authorization requirement, or widening which arguments authorization
  must cover;
- adding an event requirement, or tightening an event's cardinality or payload;
- adding an invariant, or changing an invariant's scope;
- changing a failure expectation from `warning` to `error`, or the reverse;
- adding a vector, when the vector asserts something the profile did not
  previously assert;
- changing an interpretation of upstream text, because the requirement that was
  enforced has changed even though the upstream text has not.

Adding a vector that asserts something already required is not a version change.
Correcting a typo, reordering keys, or improving a description is not a version
change. When the answer is unclear, the change is treated as behavioural, because
a consumer that silently receives stricter requirements than it pinned has no way
to notice.

### MAJOR

A major bump signals that a profile which was conformant may no longer be. A
contract certified against `sep-41@1.x` carries no promise about `sep-41@2.0`.
Major changes are what `supersedes` and `superseded_by` exist to record.

### MINOR

A minor bump signals a backward-compatible addition: everything `1.0` required,
`1.1` still requires, and `1.1` requires more. `isCompatibleSuccessor` in
`scripts/lib/version.ts` implements exactly this test — same major, not older —
and the compatibility suite pins it.

### Patch

A patch component may appear in a profile's metadata version, never in a
directory name, and only for changes that cannot alter what is checked.

## Profile status

Every profile declares a `status`. The four permitted values are a promise about
review, not about quality.

| Status         | Meaning                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`        | Requirements are still being established. The profile may change incompatibly at any time, and a result measured against it must record the exact version.                  |
| `experimental` | The requirements are considered complete but have not been reviewed by anyone outside the authoring group.                                                                  |
| `stable`       | The requirements have been reviewed, the upstream specification they encode is itself stable, and the profile has been consumed by at least one independent implementation. |
| `deprecated`   | The profile must not be adopted. It is retained so that existing certifications remain interpretable.                                                                       |

A profile encoding a **draft** upstream specification cannot be `stable`, no
matter how carefully it was written, because the standard it describes may still
move. This is why `sep-41@1.0` is `draft`: upstream SEP-0041 is a draft at the
revision the profile pins.

## Deprecation

Deprecating a profile is a metadata change, not a deletion.

1. Set `status: deprecated` and populate `superseded_by` with the replacement
   identity.
2. The replacement profile populates `supersedes` with the deprecated identity.
3. Do not remove the directory. A certification receipt names a profile version,
   and a receipt that names a version nobody can read is no longer verifiable.
4. Deprecated profiles are still validated by CI. A deprecated profile that stops
   passing validation is a defect: readers will still consult it.

## Compatibility between profile versions

| From  | To    | Contract                                                                                  |
| ----- | ----- | ----------------------------------------------------------------------------------------- |
| `1.0` | `1.1` | Everything `1.0` required is still required. Additional requirements apply to `1.1` only. |
| `1.0` | `2.0` | No promise. A result must be re-measured.                                                 |
| `1.1` | `1.0` | Not a downgrade path. Pin the lower version explicitly if it is what you intend.          |

Consumers are expected to **pin** the exact profile version they certify against.
A conformance result that names only `sep-41` without a version is incomplete,
which is why the vector model carries `profile_version` as a required field.

## Vectors

Vectors carry a `profile_version` for the same reason: a vector states a
requirement about a specific revision of a profile. A vector whose
`profile_version` has no corresponding directory is a defect, and `check-vectors`
fails the build for it.

Vector identities are unique across the entire corpus, and a vector file is named
after the identity it declares. Renaming a vector is a breaking change for anyone
who referenced its id in a report, so a vector that is superseded is replaced by
a new id rather than edited in place.

## Repository releases

The repository version is the version in `package.json`, and it must equal the
newest release heading in `CHANGELOG.md`. `release-check` fails when they
disagree, and when a released profile appears in no changelog entry — a profile
cannot be released without a ledger entry naming it as `id@version`.

The **format version** (`estamora_spec_version`) moves only when the _shape_ of a
document changes in a way that a reader written against the previous shape cannot
handle. Adding an optional field does not change the format version. Removing a
field, renaming one, changing an enum, or tightening a requirement in a way that
makes a previously valid document invalid does.
