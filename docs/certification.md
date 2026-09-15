# Certification

This repository defines the normative model a certification claim is built from. It does
not issue certification, does not operate a service, and does not place anything on chain.
Execution and receipt generation belong to the runner (Repository 2). What lives here is the
_meaning_: exactly what a claim refers to, and what would make one false.

## A claim needs to be fully determined

A statement that a contract "is SEP-41 compliant" is not verifiable, because it does not say
which profile, at which revision, against which vector corpus, at which moment. Two people
can assert it in good faith, reach different conclusions, and both be right — because they
checked different things.

For a claim to be checkable it must pin every input that could change its outcome:

| Component                       | Pins                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| Profile identifier and version  | The requirements that were applied                            |
| Vector digest                   | The exact corpus those requirements were exercised with       |
| Contract identifier and network | Which deployment the claim is about                           |
| Contract WASM hash              | Which bytecode, so an upgrade cannot silently inherit a claim |
| Runner version                  | The implementation that produced the verdict                  |
| Execution result                | The verdict itself                                            |
| Report digest                   | The evidence the verdict came from                            |
| Timestamp                       | When it was established                                       |

Every one of these is necessary. Drop the profile version and the claim survives a
behavioural requirement being added. Drop the vector digest and it survives the corpus being
weakened. Drop the WASM hash and a contract can be upgraded to different bytecode at the
same address while the claim continues to be cited. Drop the runner version and a result
produced by a buggy implementation is indistinguishable from a correct one. The model is
deliberately unforgiving about this, because a claim missing a field is not a weaker claim —
it is a different, unstated claim.

## The report

A conformance run produces a report conforming to `schema/report.schema.json`. It records
the runner identity, the target (contract, network, WASM hash, metadata), the profile
identity and digest, the vector count and digest, the execution configuration, the
per-vector results with their individual assertion outcomes, a per-category summary, the
final status, and the exit code.

The report is the evidence. A receipt asserts a verdict; the report is what that verdict was
derived from, and a receipt that cannot be checked against a report proves nothing.

## The six statuses

The `status` field is one of six values, and the distinction between them is the model's
most consequential rule.

| Status                 | Meaning                                              |
| ---------------------- | ---------------------------------------------------- |
| `CONFORMANT`           | Every required vector passed                         |
| `PARTIALLY_CONFORMANT` | Some required vectors passed, some failed            |
| `NON_CONFORMANT`       | A required behavioural requirement was violated      |
| `INCONCLUSIVE`         | The suite could not reach a decision                 |
| `EXECUTION_ERROR`      | The environment failed; the contract is not to blame |
| `PROFILE_ERROR`        | The requirements were unusable                       |

Only the first three describe the contract. `EXECUTION_ERROR` means the network was
unreachable, the contract could not be resolved, or the fixture could not be initialized.
`PROFILE_ERROR` means the profile itself was malformed and was therefore never applied. Both
must be reported as what they are: a runner that reported an unreachable node as
non-conformance would be actively harmful in a CI gate, blaming a contract for a network
outage and blocking a release for the wrong reason.

`INCONCLUSIVE` is the honest status for a suite that was partially executable — some vectors
ran, others could not be evaluated, and the missing ones could contain a failure. Reporting
partial execution as conformance would be the single most damaging thing this system could
do.

## What a receipt should carry

Repository 2 owns the receipt format. The normative requirement this repository places on it
is that a receipt carry the fields above explicitly, or a digest over a document that does.
Where a receipt is signed, the signature covers the digest over the canonical encoding, and
the encoding itself is deterministic — a receipt whose bytes depend on serialization order
cannot be independently reproduced, and an unreproducible receipt cannot be verified by
anyone who did not generate it.

## What a claim means, and what it does not

A conformance claim states exactly one thing:

> This contract, at this identity on this network, behaved as this profile version required
> for this vector corpus, as evaluated by this runner version, at this time.

It does not state that the contract is correct in any other respect, that it is free of
vulnerabilities, that its economics are sound, or that it will continue to behave this way.
Conformance is a statement about defined requirements, and it is bounded by the corpus that
was run.

This is made explicit rather than left to inference because the failure mode — a conformance
certificate read as an audit — is the one most likely to harm users. See
[`security.md`](security.md).

## Provenance

A profile has an author. A vector corpus has a revision. A report has a runner. All three
are recorded, because a claim is only as trustworthy as the requirements it was measured
against, and requirements authored by an interested party deserve exactly the scrutiny that
fact invites. The `provenance` block in a profile records whether its requirements were
derived from an upstream specification, from an upstream implementation, from ecosystem
convention, or from a composite — and requires the interpretation notes wherever the
upstream text was ambiguous and a reading had to be chosen.
