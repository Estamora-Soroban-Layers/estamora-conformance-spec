# The failure model

Testing only successful calls cannot establish conformance. A contract that accepts every
call satisfies every positive requirement ever written about it and is unusable. The
failure model is how a profile states what a contract must _refuse_, and why.

## Four outcomes, not two

The runner classifies every executed vector into one of four results. Collapsing these into
"passed" and "failed" destroys the information a user actually needs, because the four mean
very different things.

| Outcome              | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| `success`            | The call did what the profile required                |
| `expected_failure`   | The call was rejected, and rejection was required     |
| `unexpected_success` | The call was accepted, and acceptance was a violation |
| `execution_error`    | The call could not be evaluated at all                |

`expected_failure` and `unexpected_success` are both _conformance_ results: the contract
behaved as the profile did or did not require. They are not runner errors.

`execution_error` is not a statement about the contract's conformance. It means the runner
could not reach a verdict — the network was unreachable, the contract could not be
resolved, the profile could not be loaded, the fixture could not be initialized. A runner
that reported an unreachable node as a contract failure would be actively harmful in CI,
blaming the wrong party. Estamora reports infrastructure failures as infrastructure
failures and keeps them out of the conformance verdict.

## Failure definitions

`failures.yaml` declares the failures a profile expects, one entry per failure, each with a
stable `id` that rules and vectors reference.

```yaml
failures:
  - id: insufficient-balance
    category: insufficient_balance
    summary: A transfer larger than the sender's balance must be rejected.
    description: >-
      The requested amount exceeds the value the sender holds, so no value may
      move and the call must not silently clamp the amount to the balance.
    methods: [transfer, transfer-from]
    trigger: >-
      The caller requests an amount strictly greater than the sender's balance.
    expected:
      outcome: failure
      mutates_state: false
      emits_events: false
    error_codes:
      policy: any
      notes:
        - >-
          SEP-41 does not standardize the error value, so the profile requires a
          rejection without prescribing its encoding.
```

The split between `summary` and `description` is deliberate: the summary is the requirement
a report quotes, the description is the reasoning a reviewer reads.

## Failure categories

`category` classifies the failure semantically, from a closed registry:

`insufficient_balance`, `insufficient_allowance`, `unauthorized`, `missing_authorization`,
`wrong_actor`, `invalid_amount`, `invalid_address`, `invalid_argument`, `invalid_state`,
`uninitialized`, `expired`, `unsupported_operation`, `arithmetic_overflow`, `custom`.

The registry is closed so that a report can group and compare failures across profiles with
a stable vocabulary. Two profiles that both require a token to reject an over-balance
transfer should both be able to say so in the same words, and a reader comparing their
reports should not have to learn two dialects.

`custom` is the single escape hatch. It exists because a profile may need to describe a
failure the registry does not name — and it is deliberately the only general one, so that
its use is visible in review. A profile that reaches for `custom` is expected to explain the
failure in prose; the category alone carries no meaning.

## The error-code policy

This is the model's most important restraint.

Soroban contracts do not share a standardized error encoding. SEP-41 does not prescribe an
error value for an over-balance transfer, and two conforming contracts may return different
numbers, different enum discriminants, or a plain trap. A profile that required a specific
code would therefore reject conforming contracts — it would be testing one implementation's
choice rather than the standard's requirement.

The profile states an `error_codes.policy` instead:

| Policy       | Requires                                    |
| ------------ | ------------------------------------------- |
| `any`        | Any rejection; the value is not constrained |
| `allow_list` | One of a declared set of values             |
| `exact`      | One specific value                          |

`any` is the correct policy wherever the upstream standard is silent, and it is the policy
the SEP-41 profile uses. `exact` exists for profiles that genuinely pin an encoding — a
profile for a specific deployed contract family, for example, or a standard that does
define its codes. The policy is stated explicitly rather than implied, so a reviewer can see
which of the two situations they are in. An implicit "we check the code" that silently
accepts anything is exactly the brittle-yet-toothless assertion this field replaces.

## Semantic failures, not just errors

The distinction the model insists on is between three things that all look like "the call
failed":

- an **authorized** call that succeeded,
- an **unauthorized** call that was rejected because authorization was missing,
- a **wrong-actor** call that was rejected because the wrong party authorized it.

A contract that rejects both of the last two passes a naive "unauthorized transfer fails"
test. It is not conformant: an implementation that rejects _every_ transfer is not a token.
The categories `missing_authorization` and `wrong_actor` are therefore separate from
`unauthorized`, and the SEP-41 profile tests them with separate vectors — one with no
signer at all, one with a valid signature from the wrong account. Only the pair
distinguishes a correct authorization check from an over-broad rejection.

## Expected, forbidden, and unexpected

Every failure definition carries an `expected` block describing what a conforming rejection
looks like:

```yaml
expected:
  outcome: failure
  mutates_state: false # the failure must leave state untouched
  emits_events: false # the failure must not emit the success event
```

This is the other half of the rejection model. "Must fail" on its own is satisfied by a
contract that fails _destructively_ — one that returns an error after partially moving
value, or emits the success event and then reverts. Requiring the failure to be free of
effects is what makes a rejection safe to depend on, and it is why negative vectors assert
`unchanged` state and forbid the success event rather than checking only that an error came
back.
