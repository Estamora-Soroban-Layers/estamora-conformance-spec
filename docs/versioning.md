# Versioning

The normative policy is [`VERSIONING.md`](../VERSIONING.md) at the repository root. This
document is the reference summary: what the three versions are, what tooling enforces each
rule, and what to do in the cases the policy covers. Where the two disagree, the root
document governs.

## Three versions, never conflated

| Version    | Identifies                          | Where it lives                                      | Moves when                                         |
| ---------- | ----------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Repository | This tree: schemas, layout, tooling | `package.json`, newest `CHANGELOG.md` heading       | The tree changes enough to release                 |
| Format     | The shape of a document             | `estamora_spec_version` in every profile and vector | A change makes a previously valid document invalid |
| Profile    | One requirement set                 | `profiles/<id>/<MAJOR.MINOR>/`                      | What a contract must do changes                    |

A fourth version exists in the runner. It never implies anything about the first three: a
runner release does not change what a profile requires, and a profile revision does not
invalidate a runner release. A conformance result is identified by the profile identity it
was measured against, never by the runner version alone.

## The rule

> Any change that alters what a profile requires is a version change.

Mechanically, that includes:

- adding a required method, or turning an optional method into a required one;
- adding an authorization requirement, or widening which arguments authorization covers;
- adding an event requirement, or tightening an event's cardinality, payload or ordering;
- adding an invariant, or changing an invariant's scope;
- moving a failure expectation from `warning` to `error`, or the reverse;
- adding a vector, when it asserts something the profile did not assert before;
- changing an interpretation of upstream text, because what is enforced has changed even
  though the upstream text has not.

It does not include: adding a vector that asserts something already required, correcting a
typo, reordering keys, or improving a description. When the answer is unclear, treat the
change as behavioural — a consumer that silently receives stricter requirements than it
pinned has no way to notice.

## What `MAJOR` and `MINOR` mean

| From  | To    | Contract                                                                                           |
| ----- | ----- | -------------------------------------------------------------------------------------------------- |
| `1.0` | `1.1` | Everything `1.0` required is still required; `1.1` requires more.                                  |
| `1.0` | `2.0` | No promise. A previously conformant contract may no longer be, and the result must be re-measured. |
| `1.1` | `1.0` | Not a downgrade path. Pin the lower version explicitly if that is what you intend.                 |

`isCompatibleSuccessor` in `scripts/lib/version.ts` implements exactly the `1.0` → `1.1`
test — same major, not older — and `tests/lib/version.test.ts` pins it, so the policy and
the code cannot drift apart.

The patch component may appear in a profile's metadata version but never in a directory
name. A revision that only fixes wording does not earn its own directory.

## Status, and what it promises

| Status         | Promise                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `draft`        | Requirements are still being established; they may change incompatibly. A result must name the exact version.                                    |
| `experimental` | The requirement set is considered complete, but nobody outside the authoring group has reviewed it.                                              |
| `stable`       | Reviewed by someone who did not author it, the upstream specification is itself stable, and at least one independent implementation consumes it. |
| `deprecated`   | Do not adopt. Retained so that existing results remain interpretable.                                                                            |

A profile encoding a **draft** upstream document cannot be `stable`, however carefully it
is written, because the standard it describes may still move. That is why `sep-41@1.0` is
`draft`: upstream SEP-0041 is a draft at the revision the profile pins, and the profile
says so rather than implying a stability the standard does not have.

## Deprecation

A metadata change, never a deletion:

1. `status: deprecated` and `superseded_by: <new identity>`.
2. The replacement sets `supersedes: <old identity>`.
3. Keep the directory. A receipt names a profile version, and a version nobody can read
   makes the receipt unverifiable.
4. Keep it passing validation. CI validates deprecated profiles too: a reader still
   consults them, and a deprecated profile that stops validating is a defect.

## What enforces each rule

| Rule                                                             | Enforced by                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Version directory is `MAJOR.MINOR`                               | `validate-profiles` (`VERSION_ERROR`)                       |
| Declared version matches the path                                | `validate-profiles`                                         |
| Status is one of the four                                        | `profile.schema.json`, and `release:check`                  |
| Format version is the current one                                | `profile.schema.json`, `release:check`                      |
| Every released profile appears in `CHANGELOG.md` as `id@version` | `release:check`                                             |
| Repository version equals the newest changelog heading           | `release:check`                                             |
| A vector's `profile_version` has a directory                     | `check-vectors`                                             |
| `1.0` → `1.1` is compatible                                      | `tests/lib/version.test.ts`, `tests/vectors/corpus.test.ts` |

Rules that no tool can enforce — whether a change is behavioural, whether a reviewer was
independent, whether an upstream document is stable — are stated in
[`GOVERNANCE.md`](../GOVERNANCE.md) and answered in the pull request.

## Changing the format

- **Additive and optional** — a new optional field, a new predicate kind — may land without
  a format version change, with a changelog entry and at least one schema test that rejects
  the malformed form of the addition.
- **Breaking** — removing, renaming or retyping a field, changing an enum, or tightening a
  constraint so that a valid document becomes invalid — requires a format version change and
  migration of every profile and vector in the same pull request.

The migration is the review. A format change with nothing to migrate is untested, and an
untested format change is a guess.

A vocabulary addition carries an extra bar: **it must be executable.** A predicate kind no
runner can evaluate lets a profile look thorough while enforcing nothing, which is the
failure mode this project exists to prevent.
