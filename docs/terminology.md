# Terminology

These terms have one meaning each in Estamora. Where a term is also in common use in the
Stellar ecosystem with a looser sense, the definition here is the one that governs a
profile.

## Core objects

**Specification** — this repository: the schemas, the profiles, the vectors and the
tooling that validates them. Not a contract, and not a result.

**Runner** — `estamora-conformance-runner`, the only component that executes anything
against a contract and the only one that produces a result.

**Profile** — a set of behavioural requirements for one interface, identified by
`id@MAJOR.MINOR` and stored as a **bundle** of seven documents plus a vector directory.
A profile is the unit of conformance: a contract is conformant _to a profile version_.

**Bundle** — the seven documents that make up one profile version: `profile.yaml`,
`methods.yaml`, `authorization.yaml`, `events.yaml`, `behavior.yaml`, `invariants.yaml`,
`failures.yaml`, plus a `vectors/` directory. Six of the seven documents form the
requirement set; `profile.yaml` is metadata about it.

**Vector** — a first-class specification artifact: one case, with a fixture, an input, an
expected outcome, expected state, expected events and assertions. A requirement with no
vector is a requirement nobody has executed.

**Assertion** — one independently reportable check inside a vector, with its own
identifier and category. Assertions exist so that a failure names the rule that failed
rather than saying "something was wrong".

**Invariant** — a property that must hold across calls, with a scope and an identifier, so
that vectors and events can refer to it instead of restating it.

**Wildcard profile** — the identity `*`, used by profile-independent vectors under
`vectors/common/`. Such a vector belongs to no bundle and therefore names a
`failure_category` rather than a profile-specific failure identifier.

## Requirement vocabulary

**Required / optional / forbidden** — the three values a requirement can take. A
requirement is never absent: a method that must not be governed by authorization carries a
rule saying so, because the absence of a requirement must be a stated decision rather than
an omission.

**Dimension** — one axis of conformance: interface, authorization, events, behaviour,
failure, state transition, invariant. A profile should represent every dimension in which
it has something to check, and justify an empty one rather than omit it.

**Actor** — the principal whose authorization a call requires, expressed as an `argument`,
the `invoker`, or `none`.

**Coverage** — which arguments the caller's authorization must cover, and how strictly:
`exact` (precisely these), `at_least` (these and possibly more) or `at_most` (no more than
these). Coverage is separate from the actor because "the caller authorized" and "the
caller's authorization covered the value-moving arguments" are different claims.

**Occurrence** — when an event must be emitted: `on_success`, `on_failure` or `always`. In
practice a profile almost always requires `on_success` plus an explicit _forbidden_ entry
on the failure path.

**Cardinality** — how many times an event must be emitted by one call, as an inclusive
`min`/`max`.

**Correlation** — the link from an event to the invariant that checks whether what the
event claims matches what the contract did. Without a correlation, an event check is
structural only.

**Predicate** — a condition: `equal`, `not_equal`, the four orderings, `one_of`,
`in_range`, `delta`, `unchanged`, `all_of`, `any_of`, `not`. Predicates are evaluated
against **value expressions**.

**Value expression** — how a predicate gets its operands: `literal`, `input` (a method
argument), `actor` (a fixture account), `read` (a call to a read-only method), `sum` over a
resource set, `field`, `ledger_sequence`, `allowance_expiry`, `resource_member`,
`arithmetic`.

**State assertion** — a predicate evaluated against a named piece of contract state
(`balance`, `allowance`, `total_supply`, `ledger_sequence`, or a `custom` read). Every
state assertion has an identifier and a description, so a failure points at the
requirement rather than at a location in a file.

**Failure category** — a semantic classification such as `insufficient_balance`,
`unauthorized`, `wrong_actor`, `invalid_amount`, `invalid_state`,
`unsupported_operation`, `arithmetic_overflow`. Categories exist because upstream
specifications generally do not fix error codes, and inventing them would mark conformant
contracts as non-conformant.

**Interpretation note** — a recorded decision about upstream text that was ambiguous. The
schema requires a profile's `interpretation_notes` to be non-empty: a profile must not be
silent about where it had to read meaning in.

**Provenance** — where a profile's requirements came from: `upstream-specification`,
`upstream-implementation`, `ecosystem-convention` or `composite`, plus the exact revision
and the interpretation notes.

## Version and status vocabulary

**Profile version** — `MAJOR.MINOR`, the identity of one requirement set. Independent of
the repository version and of the runner version. `1.0` → `1.1` is a backward-compatible
addition; `1.x` → `2.0` means a conformant contract may no longer be.

**Format version** — `estamora_spec_version`, the version of the _document shape_. Moves
only when a change makes a previously valid document invalid, not for an additive optional
field.

**Repository version** — the version of this tree, in `package.json`, matched against the
newest changelog entry.

**Status** — `draft`, `experimental`, `stable` or `deprecated`. A claim about review, not
about quality or correctness. A profile encoding a draft upstream specification cannot be
`stable`.

**Conformance status** — the outcome recorded in a report: `CONFORMANT`,
`PARTIALLY_CONFORMANT`, `NON_CONFORMANT`, `INCONCLUSIVE`, `EXECUTION_ERROR` or
`PROFILE_ERROR`. Only the first four are statements about the contract;
`EXECUTION_ERROR` and `PROFILE_ERROR` are statements about the measurement.

## Exit codes

`0` — every checked artifact is valid. `1` — at least one defect was found. `2` — the
tooling itself failed, or the command line was wrong. `2` never means "a contract is
non-conformant".

## Deliberate non-terms

**"Certified"** — not used of a contract. A conformance result is a measurement against a
named profile version. Certification is discussed in [certification.md](certification.md)
and belongs to the receipt model, not to this repository.

**"Audited"** / **"secure"** — never used. Conformance is not a security property; see
[security.md](security.md).

**"Passes the standard"** — never used, because a standard is not a profile version. A
result names the identity it was measured against or it is not interpretable.
