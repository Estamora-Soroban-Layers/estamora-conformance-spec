# Governance

This document states who decides what in the Estamora specification, and how a profile
earns the status it claims.

## What is being governed

Two different things, and conflating them is the most common governance mistake in
standards work:

- **The format** — the schemas, the vocabulary, the report model, the validation
  tooling, the repository layout. Changing it changes how every profile is written.
- **A profile** — one set of behavioural requirements for one interface, such as
  `sep-41@1.0`. Changing it changes what some contracts must do.

The format is governed centrally and changes slowly. Profiles are proposed by anyone and
are promoted individually.

## Roles

| Role               | Responsibility                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contributor**    | Proposes a profile, a vector, a requirement change or a tooling change via a pull request.                                                              |
| **Reviewer**       | Reviews normative changes against the four review questions in [CONTRIBUTING.md](CONTRIBUTING.md) and can block a change it cannot see answered.        |
| **Maintainer**     | Listed in a profile's `profile.maintainers`, and in the repository's maintainer set. Merges changes, promotes status, and owns release decisions.       |
| **Profile author** | The person or people named as maintainers of a specific profile. Accountable for that profile's provenance and for answering review questions about it. |

There is no formal membership process. Reviewers and maintainers emerge by contributing
reviewable work, and the repository's history is the record of who has done it. A profile
names its own maintainers, so accountability is attached to the requirement set rather
than to a person's account-level permissions.

## How a profile is proposed and reviewed

1. **Proposal.** A profile proposal issue states the identity, the upstream revision, the
   dimensions covered, the upstream ambiguities and the negative cases. An empty
   dimension must be justified rather than omitted.
2. **Review.** A reviewer answers the four questions for each requirement: is it cited,
   checkable, falsifiable and scoped? Disagreement about _what a requirement means_ is
   resolved by rewriting the requirement, not by merging the ambiguity.
3. **Implementation.** The seven documents plus vectors, validating under
   `npm run validate`, with the interpretations recorded in `provenance`.
4. **Merge.** The profile is published at `draft`. Merging does not make it authoritative
   and does not make it stable.

## Status, and how a profile moves between them

Status is a claim about review and about the standard being encoded, never a claim about
quality.

| Status         | Requirements to hold it                                                                                                                                                                                                      | Who promotes                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `draft`        | The profile validates. Requirements may still change incompatibly.                                                                                                                                                           | Automatic on merge                                                                    |
| `experimental` | The author considers the requirement set complete, and every dimension is either covered by vectors or explicitly justified as out of scope.                                                                                 | A maintainer, on the author's request                                                 |
| `stable`       | The upstream specification the profile encodes is itself stable; the requirements have been reviewed by someone who did not author them; the profile is consumed by at least one implementation outside the authoring group. | A maintainer, in a pull request that changes only the status and records the evidence |
| `deprecated`   | A replacement identity exists, and `superseded_by` names it.                                                                                                                                                                 | A maintainer                                                                          |

A profile that encodes a **draft** upstream document cannot be `stable`, however
carefully it is written, because the standard it describes may still move. This is
deliberate: a `stable` status that silently tracks a moving upstream is worse than an
honest `draft`, and this is why `sep-41@1.0` is `draft`.

Promotion to `stable` requires naming the independent consumer in the pull request. If no
independent consumer exists, the profile stays `experimental`, and saying so is the
correct answer rather than a failure.

## Changing the format

Format changes follow the versioning policy in [VERSIONING.md](VERSIONING.md):

- **Additive and optional** — a new optional field, a new predicate kind — may be merged
  without a format version change, with a changelog entry and at least one schema test
  that rejects the malformed form of the addition.
- **Breaking** — removing, renaming or retyping a field, changing an enum, or tightening a
  constraint so that a previously valid document becomes invalid — requires a format
  version change and migration of every profile and vector in the same pull request. The
  migration is the review: a format change with no profiles to migrate is untested, and
  an untested format change is a guess.
- A breaking format change requires a maintainer's explicit approval in the pull request,
  not merely the absence of objections.

The vocabulary is held to an additional bar: **a new kind must be executable.** Adding a
predicate or invariant kind that no runner could evaluate lets a profile look thorough
while enforcing nothing, which is the failure mode this project exists to prevent.

## Deprecation

Deprecation is a metadata change, never a deletion:

1. Set `status: deprecated` and populate `superseded_by`.
2. The replacement populates `supersedes`.
3. Keep the directory. A conformance receipt names a profile version, and a receipt that
   names a version nobody can read is no longer verifiable.
4. Keep it passing validation. A deprecated profile that stops validating is a defect,
   because readers still consult it.

## Releases

A release is a tag matching `package.json` whose tree passes the full validation chain,
with a changelog entry naming every profile identity it contains. The release workflow
re-runs the chain against the tagged commit before publishing, because a tag pushed over a
defect must not become a published release. See [VERSIONING.md](VERSIONING.md).

## Conflicts of interest

A maintainer reviewing a profile they authored does not decide alone. The requirement is
still subject to the four review questions, and a `stable` promotion by the author of the
profile requires a second maintainer's approval — the point of the status is that someone
who did not write the requirements read them.

## Disagreement

Disagreements are resolved by argument about the requirement, in public, on the pull
request. The tiebreaker is always the upstream source: if a requirement cannot be
supported by the cited revision, the requirement changes or the citation does. Two
outcomes are explicitly _not_ resolutions:

- merging a requirement whose meaning the participants disagree about;
- weakening a requirement so that it stops being falsifiable in order to end the
  discussion.
