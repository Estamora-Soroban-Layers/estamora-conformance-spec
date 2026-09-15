# The state model

A behavioural requirement is almost never a statement about a return value alone. It is a
statement about the world the call leaves behind. The state model is how a profile says
_what must be true afterwards_, and how it says it in a way that holds for every fixture
rather than for one.

## State assertions

A vector's `expected.state_assertions` is a list of assertions, each with an `id`, a
description, an optional `resource` naming what is being asserted about, and a `predicate`
that must hold.

```yaml
- id: sender-debited
  description: Alice's balance must fall by exactly the transferred amount.
  resource:
    kind: balance
    account: alice
  predicate:
    kind: equal
    left:
      kind: read
      method: balance
      args:
        - kind: actor
          ref: alice
    right:
      kind: literal
      value: "750"
```

Every assertion is evaluated and reported individually. The runner never collapses a
vector's state checks into one boolean, because "the transfer was wrong" is not an
actionable result while "the sender was debited 250 but the recipient was credited 240" is.

## The predicate vocabulary

A predicate is a closed, reviewable set of comparison forms. There are no operators a
profile can invent, and there is no way to embed executable logic.

| Predicate                          | Holds when                                   |
| ---------------------------------- | -------------------------------------------- |
| `equal`                            | Two values are equal                         |
| `not_equal`                        | Two values differ                            |
| `less_than`, `less_or_equal`       | An ordered comparison holds                  |
| `greater_than`, `greater_or_equal` | An ordered comparison holds                  |
| `one_of`                           | A value is a member of a declared set        |
| `in_range`                         | A value lies between a lower and upper bound |
| `delta`                            | A resource changed by a declared amount      |
| `unchanged`                        | A resource did not change at all             |
| `all_of`, `any_of`, `not`          | Boolean composition of the above             |

`unchanged` merits its own form rather than being written as `delta == 0`, because the two
catch different defects: `delta` compares against a computed amount, while `unchanged`
asserts the resource was not touched, which is the requirement that matters when a call is
supposed to have no effect.

## The value vocabulary

Where a predicate needs a value, it names a _value expression_, not a literal alone.

| Value expression   | Resolves to                                                   |
| ------------------ | ------------------------------------------------------------- |
| `literal`          | A fixed value                                                 |
| `actor`            | An actor from the vector's fixture                            |
| `input`            | An argument the vector supplied to the call                   |
| `read`             | The result of a read-only call evaluated against the contract |
| `field`            | A named field of a structured value                           |
| `sum`              | An aggregate over a resource set, such as all balances        |
| `arithmetic`       | A bounded arithmetic combination of other expressions         |
| `resource_member`  | The current member when a predicate is evaluated per resource |
| `ledger_sequence`  | The fixture's ledger sequence                                 |
| `allowance_expiry` | The expiry semantics of an allowance after the call           |

`read` is what makes state assertions executable without embedding logic: the profile says
"call `balance(alice)` and compare it", and the runner performs the call. A profile
therefore never names a storage key, a ledger entry, or an ABI encoding — all of which are
implementation details that differ between conforming contracts.

`allowance_expiry` and `ledger_sequence` are the two expressions that exist because a
genuine part of the token model is unobservable through the interface. An expired allowance
is required to _read_ as zero; the expiry itself is stored, not returned, so a profile has
to be able to refer to it to state the requirement without asserting on storage layout.

## Absolute versus relative

This is the distinction the whole model turns on.

| Form     | Written as                   | Holds for           |
| -------- | ---------------------------- | ------------------- |
| Absolute | `balance(alice) == "750"`    | Exactly one fixture |
| Relative | `Δ balance(from) == -amount` | Every fixture       |

An absolute assertion is a statement about one case. It is precise, it is easy to read, and
it is the right form when the vector is establishing a concrete baseline — the funded
transfer that proves value moved at all.

A relative assertion is a statement about the rule. When a profile means "a transfer debits
the sender by the amount transferred", stating it relatively is the only way to say it once
for every amount, every pair of accounts, and every starting balance. Stated absolutely, the
rule would have to be restated per fixture, and a restated rule is a rule that can quietly
drift between one case and the next.

```yaml
predicate:
  kind: delta
  target:
    kind: read
    method: balance
    args: [{ kind: input, name: from }]
  amount:
    kind: negation
    of: { kind: input, name: amount }
```

Profiles are expected to use both. Concrete vectors pin down behaviour a reviewer can read
at a glance; relative rules carry the requirement across the corpus.

## State on failure

Failure state assertions are written with `unchanged`, and they are not optional.

```yaml
- id: holder-balance-unchanged
  description: An unauthorized transfer must not move the holder's balance.
  predicate:
    kind: unchanged
    target:
      kind: read
      method: balance
      args:
        - kind: actor
          ref: alice
```

A call that returns an error yet mutates state is one of the most damaging defects a
contract can have, because a caller that observes the error reasonably assumes nothing
happened. The rejection half of the model is stated as strongly as the acceptance half, so
that a profile which says a call must fail also says the failure must be free of effects.

## Why there is no storage-level assertion

Profiles describe conformance to an interface and a behavioural profile, not to a storage
schema. Two contracts that store balances as a single map entry and as a per-account entry
are equally conforming to SEP-41, and a specification that asserted on storage would
reject one of them. The interface — reads, returns, events, authorization — is the
observable contract; everything below it is implementation.
