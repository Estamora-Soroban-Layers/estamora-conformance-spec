# The vector model

A vector is a first-class specification artifact, not a test fixture that happens to be
committed. It carries a fixture, an input, an expected outcome, expected state, expected
events, and its own assertions — and it is validated as a document in its own right.

## Where vectors live, and why

| Location                                             | Holds                                                      | Consumed by                                                |
| ---------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `vectors/<set>/<operation>/*.yaml`                   | Cases every profile of a family needs                      | Profiles that declare the set in `includes.shared_vectors` |
| `vectors/common/<operation>/*.yaml`                  | Profile-independent cases, declared against `profile: "*"` | Every profile that declares `common`                       |
| `profiles/<id>/<version>/vectors/<operation>/*.yaml` | Cases pinned to that exact profile version                 | That bundle only                                           |

The distinction is part of the model. A requirement that holds for every fungible token —
a transfer larger than the balance must fail — is stated **once** in `vectors/common/`
rather than restated in each profile, because a restated requirement is a requirement that
can drift, or be quietly softened, in one profile while remaining strict in another.

A vector in `vectors/common/` belongs to no bundle, so it cannot name a profile-specific
failure identifier. It names a `failure_category` instead. That is the only place the two
forms differ, and it is why `failure_category` exists on a vector at all.

A vector in the shared library carries `profile_version` and is validated against it. A
vector whose `profile_version` has no corresponding directory fails the build: a vector
that states a requirement about a revision nobody can read is not interpretable.

## Anatomy

```yaml
id: transfer-moves-exact-amount # must match the file name
profile: sep-41 # or "*" for a wildcard vector
profile_version: "1.0"
title: A funded transfer debits the sender and credits the recipient
description: >- # what the case does, and what it establishes
kind: positive # positive | negative | boundary | authorization | event | state | invariant
method: transfer
tags: [transfer, positive, state, event]
rationale: >- # required: what a contract passing this can still get wrong
references: # citations for the requirement the vector exercises
  - https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md
```

### Fixture

The deterministic world the vector starts in. Determinism is a requirement, not a
convenience: a vector that depends on wall-clock time or on ambient ledger state cannot be
reproduced, and a conformance result that cannot be reproduced cannot be verified.

```yaml
fixtures:
  actors:
    - name: alice
      kind: account # account | contract
      ref: common/addresses/alice # optional link into the shared library
      description: The holder whose balance is debited.
  balances:
    alice: "1000" # amounts are exact integer strings
    bob: "500"
  allowances: []
  total_supply: "1500"
  ledger:
    sequence: 1000
    timestamp: "2026-01-15T12:00:00Z"
  authorization:
    alice: true # whether the actor holds token-level authorization
```

Every actor a vector references — in an input, an event expectation, or a state assertion
— must be declared here. An undeclared reference is an error, because the runner would
have nothing to bind it to.

Amounts are **strings of digits**. A YAML number or a decimal point silently loses
precision on an `i128`, and a vector whose amount is not the amount it appears to be is
worse than one that fails to parse.

### Inputs

Argument name to value expression, and they must agree with the method's declared
signature — including the _type_. Supplying an `address` where the method declares an
`i128` is caught, because the vector would otherwise describe a call the contract cannot
receive.

```yaml
inputs:
  from: { kind: actor, ref: alice }
  to: { kind: actor, ref: bob }
  amount: { kind: literal, value: "250" }
```

### Authorization plan

```yaml
authorization:
  actors: [alice] # who signs the invocation
  expected: accepted # accepted | rejected | not_required
  substituted_for: [] # actors whose signature is deliberately replaced by another's
```

`substituted_for` is how a **wrong actor** case is built: the signature is valid, and it
simply belongs to someone else. That is the case a contract fails when it verifies that
some signature is present without verifying whose it is, and it is a different vector from
one where no signature is presented at all.

### Expected outcome

```yaml
expected:
  outcome: failure # success | failure
  failure: transfer-beyond-balance # a profile failure id, or:
  failure_category: insufficient_balance # a category, for a wildcard vector
  returns: { kind: literal, value: "150" }
  state_assertions: […]
  events:
    required: […]
    forbidden: [approve, burn]
  invariants: [balances-conserved-by-transfer, balances-non-negative]
```

An operation that must fail declares **no required events**. Requiring an event and
requiring unchanged state in the same vector would be a contradiction only the profile
author could resolve, and `check-vectors` rejects the corpus if one appears.

### State assertions

Each has an identifier, a description and a resource:

```yaml
- id: sender-debited
  description: Alice's balance must fall by exactly the transferred amount.
  resource: { kind: balance, account: alice } # balance | allowance | total_supply | ledger_sequence | custom
  predicate:
    kind: equal
    left: { kind: read, method: balance, args: [{ kind: actor, ref: alice }] }
    right: { kind: literal, value: "750" }
```

The description is required, because a report that says `sender-debited` failed is useful
and a report that says "assertion 3 failed" is not.

Prefer `unchanged` and `delta` over literals that restate a fixture value: a literal stops
holding when the fixture changes, which makes the requirement look more specific than it
is.

### Assertions

Assertions are the checks that do not belong to state or events — an interface check, an
authorization observation, a behavioural property. Each carries a `category`
(`interface`, `authorization`, `event`, `behavior`, `state`, `invariant`, `failure`) so a
report can group failures by dimension.

An empty `assertions` list is legitimate on a vector: `expected` already states the
outcome, and an assertion that repeats it adds a second way for the same requirement to
appear in a report. A standalone _assertions document_ may not be empty, because a
published file of zero checks looks like a requirement and asserts nothing.

## Vector kinds, and what the checker requires

| Kind            | What it establishes                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `positive`      | The call succeeds and has the stated effect.                                                                |
| `negative`      | The call must fail and leave the stated state. **Mandatory for every profile.**                             |
| `boundary`      | The case at the edge of a limit, where off-by-one behaviour shows up.                                       |
| `authorization` | The acceptance path of an authorization requirement, which is what makes the rejection cases interpretable. |
| `event`         | Event presence, absence, payload, cardinality or ordering.                                                  |
| `state`         | A specific state transition, including that a rejected call left state alone.                               |
| `invariant`     | A property that must survive the call.                                                                      |

`negative` is the only mandatory kind. The others are reported as warnings when a profile
has none, because an empty dimension is either a decision that should be recorded or an
omission that should be fixed, and the tooling cannot tell which. Example bundles are
excluded from that report: an illustration is not a released requirement set, and
reporting the gaps would train a reader to ignore the same warnings on a published profile.

## Corpus invariants the checker enforces

- Vector identifiers are unique across the entire corpus, profile-owned and shared.
- A vector file is named after the identifier it declares.
- A profile-owned vector's `profile` and `profile_version` match its bundle's identity.
- A shared vector with a non-wildcard profile is bound to a set that exists and that some
  profile declares in `includes.shared_vectors`.
- A wildcard vector lives under `vectors/common/`.
- A negative vector's outcome is `failure`; a positive vector's is `success`.
- A failure vector requires no events, and forbids only events the owning profile declares.
- Every state assertion names a resource and a predicate, and describes itself.
- Every profile bundle owns at least one negative vector.

## The corpus digest

`check-vectors` computes a digest over the canonical JSON of every vector in the corpus.
This is the identity a conformance receipt records, so that a result can be attributed to
an exact set of requirements rather than to "whatever was in the repository at the time".
It is stable because canonical serialisation sorts keys and strips insignificant
whitespace, and it is order-independent because the digests are sorted before they are
combined.
