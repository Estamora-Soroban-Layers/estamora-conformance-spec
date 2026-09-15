# The Estamora conformance specification

This site is the reference set for Estamora: the machine-readable definitions of what it
means for a Soroban smart contract to behave according to the standard or interface profile
it claims to implement.

Estamora answers one question.

> Does this Soroban contract actually behave according to the standard or interface profile
> it claims to implement?

Not whether it compiles, and not whether it exposes the expected methods. A contract can
implement `transfer`, `approve` and `balance` with exactly the right signatures and still
move the wrong amount, credit the wrong account, skip the authorization check, emit no event,
or return an error after mutating state. Interface compatibility is a claim about _shape_.
Behavioural conformance is a claim about what happens.

This site defines the second claim. The runner that measures it lives in
[`estamora-conformance-runner`](https://github.com/Estamora-Soroban-Layers/estamora-conformance-runner).

## Where to start

| If you want to                        | Read                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Understand the problem and the design | [Introduction](introduction.md), then [Architecture](architecture.md)           |
| Write a profile for a standard        | [Authoring a profile](profile-authoring.md)                                     |
| Know what a term means here           | [Terminology](terminology.md)                                                   |
| See what is published                 | [Profiles](generated/profile-index.md) and [Vectors](generated/vector-index.md) |
| Read the schemas                      | [Schemas](schemas.md)                                                           |
| Cite a result                         | [Versioning](versioning.md) and [Certification](certification.md)               |
| Know what this does not prove         | [Security](security.md)                                                         |

## The normative artefacts

Two things in this repository are normative, and where a document disagrees with them, the
document is the defect.

- **The ten JSON Schemas** under [`schema/`](../schema/) define the format. Every document
  here is written in JSON Schema draft 2020-12, and each carries a canonical `$id` that
  resolves on this site.
- **The released profiles** under [`profiles/`](../profiles/) define the requirements. A
  profile is a bundle of seven documents rather than one file, because a method's
  authorization requirements, its events and its failure behaviour are separate claims that
  have to be reviewable separately.

::: info Conformance is not security
Passing a profile means a contract behaves as that profile defines. Profiles are written by
people, and a profile that misses a failure mode does not detect it. Estamora does not
replace formal verification, a security audit, penetration testing, economic analysis or
vulnerability research.
:::
