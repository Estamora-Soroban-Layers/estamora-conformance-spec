# Security

## Conformance is not security

**Passing an Estamora profile does not mean a contract is secure.**

This is the single most important statement in this repository, and it is not a
disclaimer of convenience. Conformance is a claim about _defined behaviour_: that a
contract behaves as a profile says it must. Security is a claim about _adversarial
resistance_, which is a different property that a behavioural specification cannot
establish.

A contract can pass every requirement in `sep-41@1.0` — correct balances, correct events,
correct authorization semantics, conservation of value — and still be unsafe, because:

- **Profiles are written by people.** A profile that omits a failure mode does not detect
  it. The corpus is a set of cases someone thought of, and its completeness is bounded by
  their imagination.
- **A vector suite is not exhaustive.** A million vectors are still a finite sample of an
  input space that is not.
- **Requirements describe what is checked, not what matters.** A contract may satisfy
  every stated requirement while violating a property nobody stated, including properties
  the upstream standard itself leaves open.
- **Specification-level properties do not compose into protocol-level safety.** Reentrancy
  across calls, economic incentives, oracle manipulation, griefing costs and protocol
  composition are outside the model, and would be outside it even if every requirement
  were met.

Estamora does not replace, and must not be presented as replacing: formal verification,
a security audit, penetration testing, economic analysis, fuzzing, or vulnerability
research. Where a project needs those, it needs them _in addition to_ conformance, and a
conformance result must never be used to justify skipping them.

The runner produces the result; the requirements it checks come from here. Neither
repository ever claims a contract is safe.

## Reporting a defect in the specification

A defect in a profile is a security-relevant defect, because contracts and consumers may
be measured against it. Please report privately rather than in a public issue:

Use GitHub's [private vulnerability reporting](https://github.com/Estamora-Soroban-Layers/estamora-conformance-spec/security/advisories/new)
on this repository, or contact a maintainer named in the affected profile's
`profile.maintainers` field.

In-scope reports include:

- a requirement that **contradicts** the upstream specification it cites, so that a
  conformant contract is marked non-conformant, or a non-conformant one passes;
- a requirement that is **too weak to be falsifiable**, so that a contract violating the
  intent passes it;
- a **failure mode the profile claims to cover but does not**, where the omission is
  exploitable rather than merely incomplete;
- a schema that **accepts a document that means something other than it says** — for
  example, a duplicate key or an undeclared property that changes a requirement silently;
- a defect in the validation tooling that lets a defective profile **pass validation**;
- anything that would cause a conformance result to be **misattributed**: a digest that is
  not stable, a version that does not identify its requirements, a report status that
  collapses a failure into a pass.

Out of scope here: a deployed contract failing a requirement. That is the expected
output of a conformance run, and it belongs in
[`estamora-conformance-runner`](https://github.com/Estamora-Soroban-Layers/estamora-conformance-runner)
if the result itself is wrong.

We aim to acknowledge a private report within five working days. A confirmed defect in a
published requirement is corrected by publishing a new profile version with its
`supersedes` set — never by editing the version that contracts were measured against,
because a receipt that names a version must remain interpretable.

## Threat model of the specification layer

The specification is data, and this repository treats it that way. The adversarial
considerations that are in scope for the tooling:

| Threat                                                                                                                                                                                                                                                                 | Mitigation                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Malicious profile.** Anyone may propose a profile; a profile has authority only over the requirements it states. A profile obtained from outside this repository must not be treated as a trusted standard, and its provenance should be read before it is consumed. | Provenance is a required field. `provenance.source` distinguishes an upstream specification from an implementation, a convention or a composite, and `interpretation_notes` must be non-empty so a profile cannot be silent about where it interpreted.                                             |
| **Malformed profile accepted silently.** A document whose meaning is not what it appears to say is more dangerous than one that fails to parse.                                                                                                                        | Unknown properties are rejected (`additionalProperties: false`), duplicate YAML keys are rejected rather than collapsed, multi-document streams are refused, and cross-references are resolved rather than trusted — a dangling reference is an error, because it is a requirement nobody enforces. |
| **Alias expansion.** A few lines of YAML can expand to billions of nodes.                                                                                                                                                                                              | Alias construction is bounded, which defuses alias-expansion documents at parse time.                                                                                                                                                                                                               |
| **Digest instability.** A conformance result must be attributable to an exact revision of the requirements it was measured against.                                                                                                                                    | Digests are computed over canonical JSON — keys sorted, no insignificant whitespace — so the same value hashes identically on any machine, and provenance fields are excluded so that reformatting does not invalidate a published digest.                                                          |
| **Status inflation.** A profile claiming more review than it had.                                                                                                                                                                                                      | The four statuses are enumerated and constrained by the schema, and [GOVERNANCE.md](GOVERNANCE.md) states what each one requires. A profile encoding a draft upstream standard cannot be `stable`.                                                                                                  |
| **Placeholder requirements reaching a release.**                                                                                                                                                                                                                       | `release:check` refuses to let a `TODO`-class marker into a normative artifact, and refuses to release a profile that no changelog entry names.                                                                                                                                                     |
| **Version ambiguity.** A change that alters a requirement without a version change silently redefines what a passing result meant.                                                                                                                                     | [VERSIONING.md](VERSIONING.md) states the rule, and `check-vectors` fails the build for a vector whose `profile_version` has no directory.                                                                                                                                                          |
| **Uncontrolled execution.** A profile is not executable code, and nothing in it may cause arbitrary code to run.                                                                                                                                                       | The format contains no expression that evaluates code, no shell invocation, and no reference to an external executable. The runner executes _contract calls_, and is responsible for sandboxing them.                                                                                               |

## What is out of scope

- The security of a contract being measured. That is the contract's own property.
- The security of a network the runner connects to, and of the endpoints it uses.
- The security of third-party consumers that read a profile or a report. The formats are
  documented and deterministic; a consumer that misreads them is a consumer defect.
- Denial of service against a live network. No workflow in this repository contacts one.

## Supported versions

Before `1.0`, only the newest profile version of each identifier is maintained. A defect
in a superseded version is documented and, if it changes what a contract must do, fixed in
a new version rather than in the old directory.
