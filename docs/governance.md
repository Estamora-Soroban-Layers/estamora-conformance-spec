# Governance

Estamora's value depends on one property above all others: a profile must mean what it says,
and it must keep meaning it. A profile that changes its requirements without the change being
visible, or that quietly weakens a requirement to make a contract pass, destroys the
usefulness of every result ever derived from it.

This document describes how profiles are proposed, reviewed, changed and retired. It
describes how the process actually works here, not an aspirational structure that does not
exist.

## What is governed

| Artifact                      | Why it is governed                                        |
| ----------------------------- | --------------------------------------------------------- |
| Profile requirements          | A change to a requirement changes what "conformant" means |
| Test vectors                  | A weakened vector weakens every claim that cited it       |
| JSON Schemas                  | A schema change can reclassify existing valid documents   |
| The failure-category registry | A change alters how results are grouped and compared      |
| Conformance status semantics  | Only the first three of six statuses describe a contract  |

Everything else — tooling internals, documentation wording, CI structure — is ordinary
engineering and does not need profile-level review.

## Profile lifecycle

A profile moves through four declared statuses, recorded in its `status` field.

| Status         | Meaning                                                    | May change how                                |
| -------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `draft`        | Under construction; incomplete requirements permitted      | Freely, including breaking changes            |
| `experimental` | Complete and executable, not yet reviewed as authoritative | Freely, with the change recorded              |
| `stable`       | Reviewed; relied upon                                      | Only with a version bump, per the rules below |
| `deprecated`   | Superseded; retained for reproducibility                   | Not at all; must name a successor             |

A `draft` profile is allowed to be incomplete, which is why it may change freely. A `stable`
profile is a commitment: it is the thing a conformance claim points at, and a claim that
pointed at a moving target would be meaningless.

The `deprecated` status exists so that an outdated profile can be retired without being
deleted. Deleting it would make every historical result that cited it unverifiable, which is
the opposite of what a versioned specification is for.

## Change classes

The versioning rules are stated normatively in [`versioning.md`](versioning.md). The
governance consequence is what matters here:

- A change that **alters a behavioural requirement** — adding, removing, relaxing or
  tightening any requirement, invariant, failure expectation or event expectation — requires
  a minor version bump at minimum, and a major bump if it invalidates a result previously
  reported as `CONFORMANT`.
- A change that **adds a vector without altering any requirement** requires at least a vector
  revision, because the vector corpus is part of what a claim pins.
- A change that **only clarifies prose** does not change the version, but the prose is still
  reviewed, because a profile's descriptions are what implementers read.

The rule the process exists to enforce: a profile revision number must never be incremented
in a way that hides a behavioural change from a consumer who pinned the previous one.

## Proposing a profile

A new profile is proposed as a `profile-proposal` issue before it is proposed as a pull
request. The issue asks for the upstream specification, the revision it was read at, the
interface it describes, and — the part most proposals get wrong — an account of where the
upstream text is ambiguous and which reading the author intends to take.

Proposals are evaluated on:

1. **Demand.** Is there an implementation that claims this interface? A profile for an
   interface nobody implements is untested requirements.
2. **Upstream authority.** Is there a specification, and is it the one implementations
   actually follow? Where the only source is an implementation, the profile must say so.
3. **Ambiguity handling.** Are the interpretations declared rather than assumed? A profile
   that silently resolves an ambiguity is asserting more than the standard does.
4. **Negative coverage.** Does it test what must fail? A profile of only positive vectors
   cannot establish conformance in any useful sense.
5. **Behavioural content.** Does it go beyond existence and signature? If it only checks that
   methods are present, it is an interface description rather than a conformance profile.

A proposal that cannot say where its requirements come from is not ready.

## Reviewing behavioural requirements

Every vector requires a `rationale` stating what a contract passing it could still get wrong.
This is not ceremony. It is the question a reviewer must be able to answer, and a vector whose
author cannot answer it is a vector that tests an implementation detail rather than a
requirement.

Reviewers should ask, of each requirement:

- Can this be traced to the upstream specification, or is it an invention? Invented
  requirements are the most common defect in a new profile, and the most damaging, because
  they reject conforming contracts.
- Is the requirement stated relatively where it should be? An absolute assertion that could
  be a relative one applies to one fixture and drifts.
- Is the failure side stated with equal strength? "Must fail" without "and must not mutate
  state" is an incomplete requirement.
- Could a conforming implementation fail this? If yes, the requirement is over-specified.
- Could a non-conforming implementation pass it? If yes, the requirement is too weak.

Changes to a `stable` profile's requirements are reviewed by more than one maintainer. A
requirement that is added or relaxed to make a particular contract pass is a change that
should be refused on its face, and the reason stated.

## Disagreement and interpretation

When the upstream specification is genuinely ambiguous, the resolution is recorded in the
profile's `provenance.interpretation_notes` rather than settled silently in an assertion. Two
readings may both be defensible; what is not acceptable is a profile that encodes one without
saying so, because a consumer of the result cannot then tell whether their contract differs
from the standard or from the profile's reading of it.

Where the disagreement is substantive rather than editorial, it is resolved in the open — in
the issue or pull request where it arose — and the reasoning is retained, because the next
person to encounter the ambiguity will want to know why the choice was made. Where consensus
cannot be reached, the profile records both readings and the stricter one governs, and a
note explains the split.

## Deprecation

Retiring a profile or a requirement follows the same discipline as adding one.

A profile is deprecated by publishing a final revision with `status: deprecated`, recording a
`superseded_by` reference, and leaving the bundle in place. It is not deleted and its vectors
are not removed. Results that cited it must remain verifiable indefinitely, which is the only
reason versioning is worth doing at all.

A requirement is deprecated by the same rule: it is marked, the successor is named, and the
change is a version bump. A requirement does not disappear.

## Roles

This is a small project. There is no committee and no voting procedure to describe. What
governs the process is the set of rules above, and the boundary that matters most is
deliberately narrow: **requirements are changed by versioned revision, never in place, and
never silently.** Any contributor may propose a profile; profile requirement changes land
with review from at least one maintainer other than the author; security-relevant changes
follow the process in [`../SECURITY.md`](../SECURITY.md).

The expectation for maintainers is straightforward: read the upstream specification rather
than the implementation, prefer a requirement stated relatively, require the failure side,
and refuse a change whose purpose is to make one contract pass.
