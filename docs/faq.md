# FAQ

## What Estamora is

**Is this a smart contract security scanner?**

No. It is a conformance specification. Estamora defines what it means for a contract to
behave as a standard says; it does not look for vulnerabilities, and a passing result is
not evidence that a contract is safe. See [security.md](security.md).

**Is this a testing framework?**

No. It defines requirements and cases in a machine-readable format; the runner executes
them. If you want to write ad-hoc contract tests, an ordinary Rust test target is the
right tool. Estamora is for _conformance to a published definition_, which is a different
problem: the requirements outlive any single test suite and must be readable by anyone,
including language-agnostic consumers.

**Why two repositories?**

Because "what conformance means" and "did this contract conform" have different
audiences, different release cadences and different trust properties. Merging them would
make the requirement set depend on one implementation, and the specification format is
designed so that an independent implementation can consume it.

**Does using Estamora require the runner?**

No. The format is documented and the schemas are plain draft 2020-12 JSON Schema. Any
implementation can consume the profiles and vectors. Nothing here references the runner's
internals.

## Profiles

**Why is a profile seven files instead of one?**

Because the requirements have to be reviewable by dimension. An authorization reviewer
should not have to read event payload structure to find the rules they are checking, and a
single document of two thousand lines makes it easy for a requirement to be added without
anyone noticing which dimension it belongs to. The split also lets the validator enforce
cross-references per dimension, which is where the important defects live.

**Why does a method need an authorization rule even when nothing needs authorizing?**

Because otherwise "no authorization required" and "somebody forgot to say" look identical
in the document. The model requires every method to be governed by a rule; a rule whose
actor is `none` states the expectation, and the schema enforces that such a rule covers no
arguments because there are none to cover.

**Why does `sep-41@1.0` have a version number when SEP-0041 is still a draft?**

Because the profile version identifies _the requirement set_, not the upstream document.
The upstream revision is pinned separately, in `profile.specification.version` and
`provenance.derived_from`. The profile's status is `draft`, and
[GOVERNANCE.md](../GOVERNANCE.md) forbids promoting it to `stable` while the upstream
document is still a draft.

**Can I write a profile for my own contract's interface?**

Yes, and it is the intended use. Put it under `profiles/<id>/<version>/`, cite whatever
authority the requirements come from, and record your interpretations. A profile for an
interface nobody else has ratified is still useful: it makes your compatibility claims
checkable and reviewable. Its provenance block will say `composite` rather than
`upstream-specification`, and that is an honest answer rather than a defect.

**Where do the requirements come from?**

From an upstream specification, an upstream implementation, an established ecosystem
convention, or a documented composite. Requirements are never invented. Where the upstream
text is ambiguous, the profile records the reading it adopted and the alternative it
rejected in `provenance.interpretation_notes`, which the schema requires to be non-empty.

## Vectors

**Why are negative vectors mandatory?**

Because a suite of only successful calls cannot establish behavioural conformance. A
contract that silently succeeds where the specification requires a rejection is invisible
to a positive-only suite, and that is precisely the class of defect Estamora exists to
catch. `validate:vectors` fails the build for a profile with no negative vector.

**Why does a vector need a `rationale`?**

It must say what a contract passing the vector can still get wrong. If nothing can, the
vector is redundant; if the answer is "nothing", it belongs in an existing vector rather
than a new one. This is a review tool as much as documentation.

**Why do wildcard vectors exist?**

Some requirements hold for every fungible token regardless of which interface it claims —
a transfer larger than the balance must fail, for instance. Stating that once in
`vectors/common/` means a new token profile inherits it, instead of being remembered (or
forgotten, or silently softened) in each profile.

**Can a vector be version-specific?**

Yes, and most are. A vector inside a bundle belongs to that profile version; a vector in
the shared library carries `profile_version` and is validated against it. A vector whose
`profile_version` has no corresponding profile directory fails the build.

**Why is a vector file named after its identifier?**

Because the identifier is the name a report uses and the file name is the name a diff
shows. When they disagree, a reader navigating the corpus and a report naming the vector
can be talking about different requirements. `check-vectors` enforces the correspondence.

## Versions and results

**When do I need a new profile version?**

Whenever a change alters what a contract must do. That includes adding a required method,
adding an authorization or event requirement, adding an invariant, changing a failure from
a warning to an error, or changing an interpretation of upstream text.
[VERSIONING.md](../VERSIONING.md) states the rule and lists the cases.

**Do profile versions follow the runner version?**

No. They are independent. A runner release never changes what a profile requires, and a
profile revision never invalidates a runner release. A result is identified by the profile
identity it was measured against, never by the runner version alone.

**What does a conformance result mean, exactly?**

That the contract behaved as the named profile version requires, for every vector that was
executed, on the network and at the ledger it names. It does not mean the contract is
secure, correct in ways the profile does not describe, or exempt from any other
obligation. [certification.md](certification.md) covers the receipt model.

**Why is there no single pass/fail boolean?**

Because "the contract failed a requirement" and "the measurement itself failed" are
different findings. A report has six statuses, and `EXECUTION_ERROR` and `PROFILE_ERROR`
are statements about the measurement, not about the contract. Collapsing them into
`false` would blame a contract for a runner or specification defect.

## Contributing

**How do I propose a new profile?**

Open a profile proposal issue first; it asks for the upstream revision, the dimensions you
will cover, the ambiguities and at least three ways a contract could satisfy the interface
while still being non-conformant. Then open the pull request. See
[CONTRIBUTING.md](../CONTRIBUTING.md).

**Do I need to write Rust to contribute?**

No. The specification layer is TypeScript for the tooling and YAML for the content, and
most contributions are YAML. Writing Rust is for the runner.

**A requirement is ambiguous. Is that a bug?**

Yes. An ambiguous requirement in a normative document is a defect, and the resolution is
to rewrite the requirement rather than to merge it with the ambiguity intact. File a bug
report.
