# Introduction

Estamora answers one question:

> Does this Soroban contract actually behave according to the standard or interface
> profile it claims to implement?

This repository is the **specification layer**: it defines what that question means, in
documents that both a human and a machine can read. Measuring a deployed contract
against those documents, and reporting the result, is the job of
[`estamora-conformance-runner`](https://github.com/Estamora-Soroban-Layers/estamora-conformance-runner).
Estamora is exactly those two repositories.

## Why interface compatibility is not enough

A contract can expose all ten methods of the Soroban token interface with exactly the
expected names, argument types and return types, and still be broken in ways that cost
its users money:

- it checks that _a_ signature is present, but not _whose_ it is;
- it emits the `transfer` event before validating the amount, so consumers record a
  payment that never happened;
- it clamps a transfer larger than the balance instead of rejecting it, so a caller
  silently receives less than they asked for;
- it lets an allowance be spent twice, because it never decrements;
- it accepts a zero-value transfer and emits an event for it.

None of those are visible in a type signature. They are visible in _behaviour_: in what
a call leaves behind, which principal it demanded authorization from, what it emitted,
and what it did when it decided to reject.

## What the specification defines

A **profile** describes every requirement for one interface. It states:

| Dimension         | The question it answers                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Interface         | Which methods must exist, with what signatures, mutability and invocation mode                            |
| Authorization     | Which principal must authorize each value-moving call, and which arguments their authorization must cover |
| Events            | Which events must (and must not) be emitted, with what topics, payload, cardinality and ordering          |
| Behaviour         | What each successful call must leave behind                                                               |
| Failure           | Which calls must be rejected, and what state a rejected call must leave                                   |
| State transitions | Which observable values must change, by how much, relative to what                                        |
| Invariants        | Which properties must survive the call, scoped to the operations they hold for                            |

A **vector** turns those requirements into a case: a fixture, an input, an expected
outcome, expected state, expected events, and the assertions that make each one
individually reportable.

A **schema** constrains the shape of both, so that a malformed requirement is rejected
rather than silently ignored.

## Why the model is this large

Every dimension above exists because a contract can pass the others while violating it.
The authorization model distinguishes _no authorization_ from _wrong actor_ because a
contract that checks only for a signature passes any test that just asks whether the
unauthorized call failed. The event model binds payload fields to operation arguments
because an event that reports the wrong amount is structurally valid. Failure
requirements are stated semantically because upstream specifications generally do not
fix error codes, and inventing them would make every conformant contract fail.

The model is not large for its own sake. It is the smallest set of dimensions that
distinguishes "the call succeeded" from "the call did what the standard says".

## Reading order

1. [architecture.md](architecture.md) — how the repository is put together and how the
   three validation layers divide the work.
2. [terminology.md](terminology.md) — the terms used precisely throughout.
3. [profile-authoring.md](profile-authoring.md) — how to write a profile.
4. The model documents: [behavioral-model.md](behavioral-model.md),
   [authorization-model.md](authorization-model.md), [event-model.md](event-model.md),
   [state-model.md](state-model.md), [invariant-model.md](invariant-model.md),
   [failure-model.md](failure-model.md), [vector-model.md](vector-model.md).
5. [compatibility.md](compatibility.md), [versioning.md](versioning.md) and
   [certification.md](certification.md) — how versions move and what a result means.
6. [security.md](security.md) — what conformance does _not_ establish. Read this one
   before quoting any result.

## What this repository does not do

It does not execute anything against a contract, and it never claims that a contract is
conformant. It defines the requirements; the runner measures them and produces the report
that carries the claim. Nothing here is a security guarantee, and
[security.md](security.md) explains why in detail.
