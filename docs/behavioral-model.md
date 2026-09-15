# The behavioural model

Behavioural conformance is the defining feature of Estamora. It is the claim that a call
does what the standard says it does — not that it exists, compiles, or has the right
signature.

## What a behaviour rule is

A behavioural rule is a statement about one method, in one of two directions:

```yaml
- id: transfer-moves-value
  method: transfer
  kind: success # what a successful call must do
  preconditions: […] # when the rule applies
  postconditions: […] # what must be true afterwards
  expect_failures: []
  expect_events: [transfer]
  forbid_events: []
  invariants: [balances-conserved-by-transfer]
```

```yaml
- id: transfer-without-authorization-fails
  method: transfer
  kind: failure # what a rejected call must leave behind
  preconditions: []
  postconditions: […] # must be `unchanged` clauses
  expect_failures: [missing-transfer-authorization, wrong-transfer-actor]
  expect_events: []
  forbid_events: [transfer]
  invariants: [failed-transfer-cannot-mutate]
```

A rule is a _requirement_, not a test. Vectors turn rules into cases. The rule states what
must hold for every invocation that matches its preconditions; a vector states one
invocation and the expected consequence.

## Why a rule cannot embed executable code

A profile is data. It is read by a reviewer who may not write Rust, consumed by a runner
written in another language, and diffed by a human deciding whether a requirement changed.

If a profile could contain arbitrary logic, three things would follow, and all three are
bad: the requirement could not be reviewed without executing it; the runner would have to
be a sandbox rather than an evaluator; and a profile would become an attack surface rather
than a document. Every requirement is therefore expressed in a finite vocabulary of
predicates and value expressions, and where that vocabulary is not expressive enough, the
answer is to add a _kind_ — reviewed, and subject to the requirement that it be executable
by a runner — rather than to add an escape hatch.

## Preconditions

A precondition narrows when the rule applies. Without one, a rule is a claim about every
call, which is almost never what is meant.

```yaml
preconditions:
  - kind: greater_than
    left: { kind: input, name: amount }
    right: { kind: literal, value: "0" }
```

This is the rule "a positive transfer credits the recipient by the transferred amount",
which is a true statement. The same postcondition with no precondition would also claim to
describe a zero or negative amount, which is not a statement the profile means to make.

## Postconditions, stated relatively

The distinction that matters most in the whole model:

| Form     | Example                      | Holds for     |
| -------- | ---------------------------- | ------------- |
| Absolute | `balance(alice) == 750`      | One fixture   |
| Relative | `Δ balance(from) == -amount` | Every fixture |

```yaml
postconditions:
  - kind: delta
    target: { kind: read, method: balance, args: [{ kind: input, name: from }] }
    direction: decrease
    by: { kind: input, name: amount }
```

An absolute value repeats a fixture, and stops holding the moment the fixture changes —
which means the requirement is not about the contract but about the numbers someone chose.
`delta` binds the change to the operation's own argument, so a contract that credits a
rounded amount, or debits and credits different quantities, fails for every fixture rather
than for one.

The vocabulary: `equal`, `not_equal`, the four orderings, `one_of`, `in_range`, `delta`,
`unchanged`, `all_of`, `any_of`, `not`.

## Failure behaviours

For `kind: failure`, the model requires two things beyond the expected failure:

1. **`postconditions` are `unchanged` clauses.** A rejected call must not have moved
   anything. This is what catches clamping, saturation and partial application: a contract
   that transfers a reduced amount instead of rejecting passes every successful-path rule
   while losing value for its users.
2. **`forbid_events` names the event the operation would otherwise emit.** A contract that
   emits its success event before validating its arguments leaves every consumer with a
   record of something that did not happen, and a state assertion alone cannot see it.

Stating only the first is the most common incomplete rule, and it is the reason
`check-vectors` rejects a corpus in which a failure vector requires events.

## Rules, events and invariants are linked, not parallel

A behaviour rule names the events it expects and the invariants that must hold. Those
references are resolved by the validator, and a dangling one is an error, because it is a
requirement that would silently never be enforced.

The links are also what makes the model composable. A conservation invariant can be
attached to every value-moving behaviour without being restated; an event's correlation to
an invariant is what turns "an event of the right shape was emitted" into "an event whose
content agrees with the state".

## Worked example

The requirement: _a transfer debits the sender by exactly the amount, credits the
recipient by the same amount, emits exactly one transfer event describing that movement,
and conserves the total._

```yaml
- id: transfer-moves-value
  method: transfer
  kind: success
  preconditions:
    - kind: greater_than
      left: { kind: input, name: amount }
      right: { kind: literal, value: "0" }
  postconditions:
    - kind: delta
      target: { kind: read, method: balance, args: [{ kind: input, name: from }] }
      direction: decrease
      by: { kind: input, name: amount }
    - kind: delta
      target: { kind: read, method: balance, args: [{ kind: input, name: to }] }
      direction: increase
      by: { kind: input, name: amount }
  expect_events: [transfer]
  invariants: [balances-conserved-by-transfer, balances-non-negative]
```

Three things are worth noticing. The two deltas are separate assertions, so a report names
_which_ side failed. The conservation invariant is attached rather than restated. And the
postcondition for the recipient uses `input: to` rather than a fixture actor, which is what
makes the rule hold for every transfer rather than for one.

## What a behaviour rule cannot express

Deliberately, the model says nothing about:

- **cross-contract effects.** What another contract does in response is outside the
  interface being specified.
- **gas, cost or resource usage.** These are properties of an implementation and a
  network, not of a behavioural standard.
- **timing.** A requirement about a clock is expressible only through the ledger sequence
  the fixture fixes, which is deterministic by construction.
- **concurrency.** Soroban invocations are sequential within a ledger, and the model
  assumes the runner executes in that model.

Where a requirement genuinely needs one of these, the profile states what it can observe
and records the limit in `compatibility.notes`. A requirement that claims more than the
interface can show is a requirement that cannot be checked.
