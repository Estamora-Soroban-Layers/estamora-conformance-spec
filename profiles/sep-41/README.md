# SEP-41 — Soroban Token Interface

This directory holds the Estamora conformance profile for
[SEP-0041](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md),
the token interface every Soroban token should expose so that contracts, wallets
and indexers can handle tokens generically.

|                          |                                                |
| ------------------------ | ---------------------------------------------- |
| Profile identifier       | `sep-41`                                       |
| Profile version          | `1.0`                                          |
| Status                   | `draft`                                        |
| Upstream revision pinned | SEP-0041 v0.5.1, updated 2026-08-03            |
| Interface coverage       | `full` — all ten methods of the upstream trait |
| Owned vectors            | 12, across 10 operation directories            |
| Shared vectors consumed  | `common`, `sep-41` (8 vectors)                 |

A profile version is not the Estamora format version and not the runner's. See
[`../../VERSIONING.md`](../../VERSIONING.md).

## What this profile requires beyond the interface

Exposing the ten methods with the right signatures is not conformance, and this
profile is written on that assumption. A contract can satisfy every signature and
still move the wrong amount, credit the wrong account, accept a signature from the
wrong principal, emit no event, or leave state half-written after a failure.

The requirement set therefore states, for each operation:

- **the exact behaviour** — that a transfer debits the sender and credits the
  recipient by precisely the amount, expressed as relative changes so the rule
  survives a change of fixture;
- **the authorization semantics** — which principal must sign, and which arguments
  their signature must cover. `transfer` is authorized by the debited holder;
  `transfer_from` and `burn_from` are authorized by the spender whose allowance is
  consumed. The distinction is the whole reason the methods exist apart;
- **the failure behaviour** — what must be refused, and what must be left behind
  when it is. A refused call must emit nothing and must not mutate protected state;
- **the event requirements** — names, topic order, payload values, and cardinality
  in both directions. A successful transfer that emits two transfer events is a
  conformance failure even when both are correct, because a consumer cannot tell
  which movement is real;
- **the invariants** — properties that must survive an operation: balances are
  conserved by a transfer, no balance is negative, an allowance only falls unless
  `approve` replaces it, and a refusal leaves no trace.

## Interpretive decisions

SEP-0041 is silent or permissive in several places. Each reading below is recorded
in `1.0/profile.yaml` under `provenance.interpretation_notes`, because a profile
that resolved an ambiguity silently would be encoding one implementer's opinion as
a requirement.

| Point                                                                     | Reading taken                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transfer` takes `MuxedAddress` for `to`, `transfer_from` takes `Address` | Both modelled as declared. The distinction changes which payload a conforming contract must emit, so collapsing them would accept the wrong event.                                                                                                        |
| An expired allowance                                                      | Treated as a behavioural requirement: reading one reports zero, and `transfer_from` against one fails. The expiry itself is stated from the fixture, because once it has lapsed the interface cannot distinguish it from an allowance that never existed. |
| An allowance exceeding the holder's balance                               | Not an error. SEP-0041 defines an allowance as a spending limit rather than a reservation, so the two limits are enforced independently.                                                                                                                  |
| `approve` overwrites                                                      | The new amount replaces the old rather than adding to it, including replacing the expiry.                                                                                                                                                                 |
| Two payload encodings for several events                                  | Both accepted (`format: either`) rather than one being chosen, and the map form must be used consistently within a single event.                                                                                                                          |
| A negative amount                                                         | Treated as an invalid amount, with either signalling route accepted, because SEP-0041 defines no error codes and both routes trap.                                                                                                                        |
| `decimals`, `name` and `symbol` before initialization                     | The requirement to panic comes from the Stellar developer documentation rather than the SEP text, and is recorded as such in the provenance block.                                                                                                        |

## Deliberately out of scope

- **`mint`, `clawback` and `init_asset` are not methods.** SEP-0041 does not add
  them to the interface, so no method requirement is attached. Their _events_ are
  declared as optional, because a token that never mints or claws back never emits
  them.
- **The Stellar Asset Contract is not covered.** A SAC emits the same event names
  with an additional trailing SEP-11 asset topic. That shape belongs to CAP-67, and
  a SAC is not expected to certify against this profile without a separate profile
  that models the extra topic explicitly.
- **Total supply is not readable.** SEP-0041 exposes no total-supply accessor, so
  conservation requirements are expressed over the observable balance set instead.
  That is stronger in practice: it is measurable through the interface the profile
  describes, rather than through an accessor the specification does not define.

## Consuming the profile

A consumer resolves the bundle by path — `sep-41/1.0` — and reads the seven
documents `1.0/profile.yaml` declares. The runner refuses a bundle whose directory
disagrees with the identity it declares, and refuses a broken cross-reference
between the documents, so a bundle reached by path cannot silently be a different
requirement set from the one that was reviewed.

## Changing these requirements

A change to a behavioural requirement, an authorization rule, an event contract or
an invariant requires a new profile version. A change to prose, a note or a
rationale does not. Read
[`../../docs/compatibility.md`](../../docs/compatibility.md) before opening a pull
request, and
[`../../docs/profile-authoring.md`](../../docs/profile-authoring.md) for the
authoring workflow.
