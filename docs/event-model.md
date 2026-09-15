# The event model

An emitted event is an observable effect of a call. It is part of behavioural
compatibility because the ecosystem depends on it: indexers build their tables from it,
wallets reconstruct history from it, and a transfer that moves the right balances but emits
nothing has broken every consumer downstream even though its balances are correct.

A profile therefore describes events with the same rigour it applies to return values.

## Where events are declared

`events.yaml` in a profile bundle holds an `events` array of event definitions. Each
definition is referenced by `id` from behavioural rules, vectors, and invariants.

```yaml
events:
  - id: transfer
    name: transfer
    requirement: required # required | optional | forbidden
    summary: Emitted exactly once for every successful value movement.
    occurrence: on_success # on_success | on_failure | always
    topics: […]
    data:
      format: vec
      fields: […]
    cardinality:
      min: 1
      max: 1
```

`requirement` is the same closed vocabulary used for methods. A `forbidden` event is not
the absence of a rule — it is an active requirement that the event must _not_ appear in
the situations the definition names, which is how a profile says "a failed transfer must
not emit a transfer event".

## Topics and data

Topics are matched by position, because topic position is part of the ABI a consumer
decodes against. `index` records that position explicitly so a reviewer can see the
expected slot layout without counting.

```yaml
topics:
  - index: 0
    binding: { kind: literal, value: transfer }
    semantics: The event name, which is always the first topic.
  - index: 1
    binding: { kind: actor, ref: from }
    semantics: The account whose balance is debited.
  - index: 2
    binding: { kind: actor, ref: to }
    semantics: The account whose balance is credited.
```

`data` declares the payload shape. `format` records which encoding the profile accepts:

| `format` | Meaning                                       |
| -------- | --------------------------------------------- |
| `scalar` | A single value, not a collection              |
| `vec`    | A positional list of values                   |
| `map`    | A named map of values                         |
| `either` | Both a positional and a named reading conform |

`either` exists for a concrete reason. SEP-41 permits several token events to be encoded
either as a vec or as a map, and both readings are conforming. A profile that forced one
form would reject contracts that satisfy the standard, which is exactly the false negative
Estamora exists to avoid. Where `format` is `vec` the declared fields are matched
positionally in declaration order; where it is `map` they are matched by name.

## Bindings, not literals

An expected event value is usually not a constant. `transfer(alice, bob, 250)` in one
vector is `transfer(alice, bob, 999)` in another; a profile that hard-coded `250` would
have to restate the definition for every fixture.

A _binding_ says where the expected value comes from instead:

| Binding kind    | Resolves to                                            |
| --------------- | ------------------------------------------------------ |
| `literal`       | A fixed value stated in the profile                    |
| `actor`         | An actor declared in the vector's fixture              |
| `input`         | An argument the vector supplied to the call            |
| `state_after`   | A resource value after the call, e.g. `balance(alice)` |
| `read`          | The result of a read-only call evaluated by the runner |
| `unconstrained` | Presence and shape are checked; the value is not       |

`unconstrained` is the deliberate escape hatch. Some event fields legitimately depend on
data the profile cannot name — a destination address may carry a multiplexing id that
differs per deployment — and inventing an assertion the upstream specification does not
make would be worse than declaring the field unconstrained. The field is still checked for
presence and shape, so an event missing its recipient is still caught.

## Cardinality and ordering

```yaml
cardinality: { min: 1, max: 1 }
ordering:
  - before: transfer
    strict: false
```

`cardinality` bounds how many events matching the definition may be observed. A
successful transfer that emits zero or two transfer events is a conformance failure even
when every balance is right, because a consumer cannot tell which of the two movements is
real. `ordering` constrains the relative order of one event type against another where the
standard requires it; `strict: false` permits the other event to be absent, `strict: true`
requires it.

JSON Schema cannot express the constraint that `min <= max` across two sibling integer
keywords, so the cross-reference validator enforces it and reports both offending values
at once rather than failing with an opaque schema error.

## Correlations

```yaml
correlations: [balances-conserved-by-transfer]
```

A correlation names an invariant the event's own values must satisfy. This is the
mechanism that ties an event to state rather than checking it in isolation: an event may
have the right shape and the right amount bound to the input, yet disagree with the
balance delta actually observed. Correlating the event to a conservation invariant catches
an event that reports a transfer the state does not reflect.

## Why absence is tested

The failure half of the model is not optional. For every situation where a profile says an
event must appear on success, it must also say what happens on failure, because the two
most common real defects are an event emitted on a reverted call and an event emitted twice
for one logical operation. Both are invisible to a test that only inspects successful
calls, which is why negative vectors declare `required: []` and a `forbidden` list rather
than simply omitting the event section.
