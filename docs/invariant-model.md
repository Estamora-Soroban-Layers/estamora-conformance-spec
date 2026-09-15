# The invariant model

An invariant is a property that must hold across a family of operations rather than for one
call. It is the part of the specification that catches a contract whose every individual
call looks correct while the system as a whole drifts.

Invariants live in `invariants.yaml`, are identified by `id`, and are referenced by name
from behavioural rules, vectors, and event correlations. Each is independently addressable
and reusable, so the same requirement can be applied to many cases without restatement.

## Kinds

The `kind` field selects the check family. It is a closed vocabulary, and every member
exists because it names a requirement that the others cannot express.

| Kind                            | Asserts                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `conservation`                  | An aggregate across a resource set is unchanged              |
| `state_unchanged`               | No mutation occurred at all                                  |
| `authorization_blocks_mutation` | A rejected caller cannot change protected state              |
| `monotonic`                     | A resource moves in one direction only                       |
| `bounds`                        | A value stays within declared limits                         |
| `predicate`                     | A general predicate holds for every member of a resource set |

`conservation` is the one that most clearly earns its place. It takes an aggregate over the
_whole_ resource set:

```yaml
- id: balances-conserved-by-transfer
  title: Transfers conserve the total of all balances
  kind: conservation
  severity: error
  summary: Moving value between holders must not change the sum of all balances.
  scope:
    methods: [transfer, transfer-from]
    outcomes: [success]
  resource: balances
```

Because the sum is taken across every account in the fixture rather than across the two
named by the operation, a pairwise check cannot substitute for it. A contract that credits
a third account, mints on transfer, or rounds a remainder into a fee address leaves both
named balances exactly right and changes the total. Only the set-wide aggregate notices.

`authorization_blocks_mutation` is the counterpart on the rejection path. Where
`state_unchanged` says a call had no effect, this says specifically that a call rejected for
authorization reasons had no effect — which is the property a staker relies on when a
malicious transaction fails.

## Scope

An invariant applies to a set of methods and a set of outcomes. Without a scope it would
claim to hold for every call, which is almost never what is meant.

```yaml
scope:
  methods: [transfer, transfer-from] # or ["*"] for every method
  outcomes: [success, failure]
```

The scope is what makes `allowance-non-increasing-without-approve` a true statement. An
allowance falls when it is consumed and rises when it is replaced, so "an allowance only
ever decreases" is false in general and true when restricted to the methods that consume
it. An unscoped invariant would be either wrong or vacuous.

## Direction, bounds and severity

`monotonic` carries a `direction` of `non_increasing` or `non_decreasing`. `bounds` carries a
`predicate` evaluated once against each member of the resource set:

```yaml
kind: bounds
resource: balances
predicate:
  kind: greater_or_equal
  left:
    kind: resource_member
  right:
    kind: literal
    value: "0"
```

`resource_member` is the value being checked on this iteration. That is what allows a single
invariant to state "no balance is ever negative" for a fixture with two accounts and for one
with two hundred.

`severity` is `error` or `warning`. An `error` makes the run non-conformant. A `warning` is
recorded and reported but does not by itself fail the profile — it exists for requirements
that a reasonable conforming implementation may vary on while the profile still wants the
variation made visible. A profile should use `warning` sparingly; a warning that never
matters is a warning contributors learn to ignore.

## Why invariants are not comments

It would be simpler to write the conservation property as prose in a description field and
trust a human reviewer. That is deliberately not the model.

A prose invariant cannot be executed, so it produces no result and no regression when it is
violated. It cannot be referenced, so the same requirement is restated in each vector that
needs it and drifts between them. It cannot be scoped, so a reviewer cannot see which
operations it was meant to constrain. And it cannot be reported, so a failing run says "a
vector failed" rather than "the balance total changed".

Each invariant here has an identifier, an executable form, a declared scope, a severity, and
a rationale. The rationale is required because the question a reviewer must answer about an
invariant is not "does this parse" but "is this actually required by the standard" — and
that question can only be answered by stating why the property matters.
