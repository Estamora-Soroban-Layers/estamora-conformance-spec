# Security

Estamora answers one question: does a contract behave as a defined profile requires. That is
a narrow question, and the most important thing this document can do is prevent it being
read as a wider one.

## Conformance is not security

**A contract that passes every Estamora vector has not been shown to be secure.**

Conformance testing and security assessment are different activities that happen to both
involve executing a contract. A profile describes the behaviour a standard requires. A
security review looks for behaviour that is possible, unintended, and harmful — and that
question is not addressed by any number of passing vectors, because the vectors are drawn
from the standard, and the standard does not enumerate an implementation's mistakes.

A contract can be fully conformant and still be exploitable. It can satisfy every transfer,
authorization, event and invariant requirement in SEP-41 while containing an overflow in a
code path the profile never describes, a reentrancy hazard in a callback the interface does
not expose, an economic incentive that is within spec and ruinous in practice, or a
privileged entry point outside the profiled interface entirely.

Estamora does not replace, and must never be presented as replacing:

- formal verification of a contract's actual semantics,
- a security audit by a competent reviewer,
- penetration testing against a live deployment,
- economic or game-theoretic analysis,
- vulnerability research against the wider ecosystem.

Passing vectors is evidence that a contract is _compatible_. It is not evidence that it is
_safe_. Never market Estamora as a smart-contract security scanner; a scanner is a different
product with a different claim, and making that claim here would be a misuse of the results
this repository produces.

## Profiles are not automatically trustworthy

A profile is a document with an author, and the runner executes whatever profile it is
given. Three consequences follow.

**A profile's requirements are only as good as its provenance.** A profile claiming to
codify a standard may codify a misreading of it, an outdated reading, or the preferences of
the party that wrote it. Where the upstream text is ambiguous, the profile is required to
record its interpretation in a `provenance.interpretation_notes` entry rather than quietly
choosing — so that the choice is visible to review rather than hidden inside an assertion.

**A malicious or careless profile is not a standard.** Authoring a profile that requires
less than the standard, that omits the negative vectors, or that scopes an invariant so
narrowly it cannot fail would produce a conformant result for a non-conformant contract.
This repository's tooling therefore validates structure and cross-references strictly, and
reviews additions as requirements rather than as configuration. Validation cannot detect a
requirement that is _wrong_ — only one that is malformed — so review is where that burden
stays, and it is why every vector requires a rationale explaining what a contract passing it
could still get wrong.

**Version pinning matters.** A profile can change its requirements between versions. A claim
that does not name the profile version is a claim about whatever the current version happens
to say, which is not a stable statement. Every report records the profile identity and the
vector digest for exactly this reason.

## Deterministic vectors

A vector must be reproducible. A conformance result that depends on wall-clock time,
ambient ledger state, or execution order cannot be independently verified by anyone other
than the system that produced it, which removes the entire value of publishing it.

Vectors therefore declare their fixture explicitly — actors, balances, allowances, ledger
sequence, timestamp, and the authorization each actor holds. Execution that depends on
network state is confined to environments the vector names, and any nondeterminism that the
environment forces must be recorded rather than smoothed over. Where an external network is
unavailable, the correct response is a clean abstraction over it plus a deterministic local
fixture — never a fabricated success.

## Untrusted inputs

A profile, a vector, and a contract's reported metadata are all inputs from outside this
repository, and each is treated as untrusted.

- **Malformed documents** must be rejected with a diagnostic, not interpreted leniently.
  The schemas are strict and the validators exit non-zero.
- **A profile may not contain executable logic.** This is a security property as well as a
  reviewability one. If a profile could carry arbitrary code, consuming one would mean
  running it, and a profile would become an attack surface rather than a document. Every
  requirement is a closed-vocabulary predicate, and adding expressiveness means adding a
  reviewed kind, never an escape hatch.
- **Reported metadata is a hint, not a fact.** Contract interface data obtained from a
  network is used to inform inspection and is never treated as proof of behaviour. A
  contract that passes interface inspection still executes the behavioural vectors, because
  the interface description and the implementation can disagree and the description is the
  party that may be lying.
- **Report content derived from a target is not trusted markup.** Values captured from a
  contract flow into a report, so report rendering must escape and bound them rather than
  interpolating them into a document. An unbounded or unescaped value from an external
  contract is a report-injection vector.
- **Resource consumption is bounded.** Profiles and vectors are attacker-influenced input,
  so parsing, resolution and execution must have explicit limits rather than relying on the
  good behaviour of the document. An unbounded vector expansion is a denial-of-service
  against the CI job that runs it.

## Version and dependency control

The specification layer pins its validation dependencies and its Node engine range, and the
runner pins its toolchain. Controlled versions matter here for a reason beyond hygiene: a
result is only meaningful if the tooling that produced it is identified, and an unpinned
validator can change the meaning of a passing run without any profile changing. Both
repositories are subject to automated dependency updates, and dependency changes are
reviewed like any other change that could alter a verdict.

## Reporting a vulnerability

Report security issues in the specification, the schemas, or the validation tooling as
described in [`../SECURITY.md`](../SECURITY.md). Do not open a public issue for a
vulnerability that could be used to produce a false conformant result or to make the tooling
execute untrusted input — those affect every consumer of every profile, and they are fixed
before they are disclosed.
