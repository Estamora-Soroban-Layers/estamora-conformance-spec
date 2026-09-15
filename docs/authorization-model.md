# The authorization model

Authorization is the dimension where conformance failures cost the most, and the one a
naive check gets most wrong. Estamora treats it as a first-class dimension with its own
document per profile, not as an attribute of a method.

## The three outcomes a single "did it fail" check cannot distinguish

| Situation                                                         | Required outcome                  | Why the distinction matters                                              |
| ----------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| The correct principal authorized the call                         | success                           | The acceptance path, without which the rejection cases are unfalsifiable |
| No authorization was presented                                    | **missing authorization** failure | The contract must reject the call                                        |
| Valid authorization was presented, belonging to another principal | **wrong actor** failure           | The contract must reject _and_ must have checked identity, not presence  |

The third row is the one that loses funds. A contract that verifies _a_ signature is
present without verifying _whose_ it is passes any test that only asks whether an
unauthorized call failed — because it does fail, for the wrong reason. Separating the two
rejection routes is what makes the difference observable.

A profile therefore names two failures, not one:

```yaml
unauthorized: { kind: fail, failure: missing-transfer-authorization }
wrong_actor: { kind: fail, failure: wrong-transfer-actor }
```

A profile that only defines one authorization failure is telling a reader that it cannot
distinguish the two cases, which is an honest but weaker statement.

## The actor

```yaml
actor:
  kind: argument # argument | invoker | none
  argument: from
  on_behalf_of: false
```

| `kind`     | Meaning                                           | Typical interface                                                                            |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `argument` | The principal is named by an argument of the call | `transfer(from, to, amount)` — the holder whose balance moves                                |
| `invoker`  | The principal is whoever signed the invocation    | An interface with no parameter for the author, where the payload is attributed to the caller |
| `none`     | No authorization is required                      | A read-only query                                                                            |

`on_behalf_of` records that the named principal is not the one whose own state changes —
a delegated transfer, where an operator acts for a holder. It exists so that a profile
says which principal must sign, rather than leaving it to a reader to infer.

**Every method must be governed by a rule.** A method with no rule is rejected by the
validator, which is why a public read needs a rule with `actor: { kind: none }`. Without
it, "no authorization required" and "somebody forgot to say" are the same document.

## Coverage: authorization over arguments

"The caller authorized" and "the caller's authorization covered the arguments that move
value" are different claims. A contract can check a signature over `from` and never over
`amount`, and signature comparison alone cannot tell you which happened.

```yaml
coverage:
  mode: exact # exact | at_least | at_most
  arguments: [from]
```

| Mode       | Statement                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `exact`    | The covered set equals `arguments`. The strict reading a value-moving interface needs.                                                                 |
| `at_least` | These arguments must be covered; the contract may cover more. For an interface that deliberately requires broader authorization.                       |
| `at_most`  | The contract must not cover arguments beyond these. Also the encoding of "must not demand authorization over any argument", written with an empty set. |

Two consistency rules are enforced by the schema, in both directions:

- a rule whose actor is `none` or `invoker` may not name coverage arguments, because there
  is no argument for the authorization to cover;
- a rule with `mode: exact` must name at least one argument, because "exactly these" over
  the empty set is not a statement.

### A worked example of why coverage is separate

An interface defines `approve(from, spender, amount, live_until_ledger)`. Which arguments
must the holder's authorization cover?

- `from`, always: it is the holder whose allowance is being granted.
- `spender`, usually: otherwise an attacker who observes a signed approval could substitute
  their own address and grant themselves the allowance.
- `amount` and `live_until_ledger`: a judgement. Requiring them makes the authorization
  valid for one exact instruction and no other; not requiring them makes a signed approval
  a standing permission the contract enforces.

The model does not decide. It makes the choice explicit and checkable, which is the
difference between a reviewed decision and an accident. The decision belongs in the rule
and in its `notes`.

## Replay sensitivity

```yaml
replay_sensitive: true
```

`true` means a repeated, otherwise valid invocation must not be accepted twice. It is a
property of the interface, not a preference: a deposit is additive, so repeating one
credits the amount again and that is _not_ a defect; a spend or a burn reduces a balance,
so accepting the same instruction twice moves value twice.

A profile that leaves this unstated cannot say whether a repeated invocation is a defect,
which is why it is a required field on every rule including the ones with no actor.

## Testing the dimension

The dimension needs at least three vectors per rule, and the reason is not symmetry:

| Vector kind                                 | What it establishes                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `authorization`, `expected: accepted`       | The authorized call succeeds. Without this, a contract that rejects everything passes every rejection case.             |
| `negative`, `expected: rejected`            | No authorization at all is rejected, with the state unchanged and no event emitted.                                     |
| `authorization`, `substituted_for: [alice]` | Valid authorization belonging to another principal is rejected. This is the vector that catches presence-only checking. |

The `substituted_for` field is how the wrong-actor case is constructed: the signature is
valid; it simply belongs to somebody else. A runner substitutes the named actor's signature
with another's and holds everything else fixed.

## What the model does not claim

- **It does not model the signature scheme.** Whether a requirement is satisfied through a
  Soroban authorization entry, a delegated signer or an account abstraction is the
  runner's concern. The profile states _who_ must authorize and _what_ their authorization
  must cover.
- **It does not model expiry of the authorization itself.** An allowance's
  `live_until_ledger` is contract state, modelled in the state and failure dimensions
  (`expired`). The invoker's own authorization entry has its own lifetime, which belongs to
  the host environment rather than to the contract's behaviour.
- **It does not make a contract safe.** An authorization rule states what must be
  authorized. Passing it means the rule held, not that the contract has no other way to
  lose funds; see [security.md](security.md).
