# Authoring a profile

This is the practical guide. [`CONTRIBUTING.md`](../CONTRIBUTING.md) covers process,
[`GOVERNANCE.md`](../GOVERNANCE.md) covers status and review, and
[`VERSIONING.md`](../VERSIONING.md) covers when a change needs a new version.

## Before you start

Answer three questions, in this order. A profile that cannot answer them is not ready to
be written.

1. **What is the authority?** Which document states these requirements, at which exact
   revision? If the answer is "my implementation", the provenance source is
   `upstream-implementation` and you must say so. If the answer is "nothing", the profile
   is a composite of choices, which is allowed but must be recorded.
2. **What can a contract do to satisfy the interface and still be wrong?** Name at least
   three things. Those become your negative vectors, and they are the profile's purpose.
   A profile whose author cannot name any is a type signature with extra steps.
3. **What is out of scope, and why?** An empty dimension is a decision. Record it in the
   compatibility notes rather than leaving a reader to guess whether it was considered.

## The shape of a bundle

```
profiles/<id>/<MAJOR.MINOR>/
├── profile.yaml         identity, upstream citation, compatibility, provenance, manifest
├── methods.yaml         interface requirements
├── authorization.yaml   who must authorize what, and which arguments their authorization covers
├── events.yaml          what must be emitted, with what structure
├── behavior.yaml        what each call must leave behind
├── invariants.yaml      what must survive
├── failures.yaml        which calls must be rejected, and what a rejection leaves
└── vectors/<operation>/*.yaml
```

Start from `profiles/sep-41/1.0/` for a real standard, or from a bundle under
`profiles/examples/` if you want something small enough to read in one sitting.

## Step 1 — the manifest and its provenance

```yaml
estamora_spec_version: "1.0"

profile:
  id: my-interface
  version: "0.1"
  title: My Interface
  status: draft
  summary: One sentence. A reviewer reads this before anything else.
  description: >-
    What the interface is for, who implements it, and what the profile adds beyond the
    interface's shape.
  license: Apache-2.0
  specification:
    name: SEP-0041
    title: Soroban Token Interface
    version: "0.5.1"
    status: draft
    url: https://…
    updated: "2026-08-03"
  maintainers: [your-github-handle]
  compatibility:
    interface: full # or `partial`, with the omissions named in `notes`
    notes: […] # required non-empty: what you cover and what you deliberately do not
  provenance:
    source: upstream-specification
    derived_from: stellar-protocol@master ecosystem/sep-0041.md v0.5.1 (updated 2026-08-03)
    interpretation_notes: […] # required non-empty

includes:
  methods: methods.yaml
  authorization: authorization.yaml
  events: events.yaml
  behavior: behavior.yaml
  invariants: invariants.yaml
  failures: failures.yaml
  vectors: [my_operation] # directory names under this bundle's vectors/
  shared_vectors: [common] # sets under the repository's vectors/
```

`interpretation_notes` being required is not bureaucracy. A profile that had to interpret
an ambiguous upstream sentence and does not say so is presenting a decision as a
transcription, and a reviewer has no way to tell the difference.

If your interface has no upstream document, `source: composite`, a `derived_from` that
says so plainly, and an interpretation note explaining that every requirement is a choice.
That is a legitimate profile; a profile that hides it is not.

## Step 2 — methods, with their requirement lists

Every method declares what governs it. The lists are identifiers, resolved by the
cross-reference validator, and a dangling reference is an error rather than a warning:

```yaml
- id: transfer
  name: transfer # the on-chain name, snake_case
  requirement: required # required | optional | forbidden
  summary: … # one sentence
  description: >- # what a conforming contract must do, and the mistakes worth naming
  args:
    - name: from
      type: { kind: prim, name: address } # or muxed_address, i128, vec, option, map, tuple, result, custom
      semantics: … # what the argument means, not just its type
      authorization:
        required: true # must the caller's authorization cover this argument?
        semantics: …
  returns:
    type: { kind: prim, name: void }
    semantics: …
  mutability: mutating # readonly | mutating
  invocation: invoke # invoke | read_only | simulate
  authorization: [holder-authorizes-transfer]
  events: [transfer]
  failures: [transfer-beyond-balance]
  behaviors: [transfer-moves-value]
  notes: […] # anything a reader must know that has no other home
```

Two conventions worth following:

- **`id` is kebab-case, `name` is the on-chain name.** `transfer-from` as an identifier,
  `transfer_from` as the name. Value expressions that call a method use the _name_.
- **A read-only method still needs an authorization rule.** Say `actor: { kind: none }`
  and explain why reading is public. Omitting the rule is what the tooling rejects.

## Step 3 — authorization, as three outcomes

```yaml
- id: holder-authorizes-transfer
  methods: [transfer, burn]
  actor:
    kind: argument # argument | invoker | none
    argument: from
    on_behalf_of: false
  coverage:
    mode: exact # exact | at_least | at_most
    arguments: [from]
  unauthorized: { kind: fail, failure: missing-transfer-authorization }
  wrong_actor: { kind: fail, failure: wrong-transfer-actor }
  replay_sensitive: false
```

Coverage is not decoration. `mode: exact` over `[from]` states that the caller's
authorization must cover precisely the account being debited — which is a different claim
from "the caller presented a signature", and the one that catches a contract checking for
presence rather than for identity.

The schema enforces two consistency rules. A rule whose actor is `none` or `invoker` may
not name coverage arguments, because there are none to name. A rule with `mode: exact`
must name at least one, because "exactly these arguments" over an empty set is not a
statement.

## Step 4 — events, tied to state

```yaml
- id: transfer
  name: transfer
  requirement: required
  occurrence: on_success
  topics:
    - index: 0
      type: { kind: prim, name: symbol }
      binding: { kind: literal, value: transfer }
    - index: 1
      type: { kind: prim, name: address }
      binding: { kind: input, name: from }
  data:
    format: either # scalar | vec | map | either
    fields:
      - name: amount
        type: { kind: prim, name: i128 }
        binding: { kind: input, name: amount }
        optional: false
  cardinality: { min: 1, max: 1 }
  ordering: []
  correlations: [balances-conserved-by-transfer]
```

Bindings are how the event is tied to the call: `literal` for the discriminator, `input`
for an argument, `actor` for a fixture account, `read` for a value fetched back,
`state_after` for a resource after the call, `unconstrained` when the interface gives you
no way to know the value. Prefer `input` and `read` over literals that repeat a fixture
value: a requirement expressed against an argument survives a change of fixture.

`format: either` accepts both documented encodings. Use it when the upstream specification
permits both and the difference is not observable to a consumer; pin the format when it
is.

`correlations` is what makes an event checkable rather than merely well-formed. Without
one, a contract can emit a correctly shaped event that reports something the contract did
not do.

## Step 5 — behaviour, as relative postconditions

```yaml
- id: transfer-moves-value
  method: transfer
  kind: success # success | failure
  preconditions:
    - kind: greater_than
      left: { kind: input, name: amount }
      right: { kind: literal, value: "0" }
  postconditions:
    - kind: delta
      target: { kind: read, method: balance, args: [{ kind: input, name: from }] }
      direction: decrease
      by: { kind: input, name: amount }
  expect_failures: []
  expect_events: [transfer]
  forbid_events: []
  invariants: [balances-conserved-by-transfer]
```

State the _relative_ change. `equal` against a literal repeats a fixture value and stops
holding the moment the fixture changes; `delta` and `unchanged` hold for every fixture,
which is what a requirement is supposed to do.

For a `failure` behaviour, `postconditions` must be `unchanged` clauses and `forbid_events`
must name the event the operation would have emitted. A contract that emits its success
event before validating its arguments is invisible to a state assertion alone.

## Step 6 — invariants, scoped

```yaml
- id: balances-conserved-by-transfer
  title: Transfers conserve the total of all balances
  kind: conservation # conservation | state_unchanged | authorization_blocks_mutation | monotonic | bounds | predicate
  severity: error # error | warning
  summary: …
  description: …
  scope:
    methods: [transfer, transfer-from] # or [*] for every method
    outcomes: [success]
  resource: balances # required for conservation/monotonic/bounds, forbidden otherwise
  rationale: … # required: why it holds, and what breaks if it does not
```

Scope is mandatory because "balances are conserved" is true of a transfer and false of a
mint. An unscoped invariant is wrong for at least one operation in the profile.

The `kind` determines what else is required, and the schema enforces it in both
directions: a `bounds` invariant needs a `predicate` and a `resource`; a `state_unchanged`
invariant may have neither.

## Step 7 — failures, semantically

```yaml
- id: transfer-beyond-balance
  category: insufficient_balance
  methods: [transfer]
  trigger: The amount exceeds the sender's balance.
  expected:
    outcome: failure
    signal: either # trap | panic | host_error | either
    state_effect: unchanged # reverted | unchanged | unspecified
    events_emitted: none # none | unspecified
  error_codes:
    policy: semantic_only # semantic_only | tolerated | exact_required
    allowed: []
  rationale: …
```

Use `semantic_only` unless the upstream specification actually fixes codes. Requiring an
exact payload that the standard does not define marks conformant contracts as
non-conformant, which is a false negative and worse than a missing requirement.

`state_effect: unchanged` is the field that catches clamping and partial application, and
`events_emitted: none` is the field that catches events emitted before validation.

## Step 8 — vectors

At least one `negative` vector is mandatory. Represent every other dimension in which the
profile has something to check. Put a case in this bundle when it depends on this profile's
decisions; put it in the shared library when every profile of a family needs it, and in
`vectors/common/` when it holds for any fungible token.

Name the file after the `id` it declares, write the `rationale`, and make the failure
vector assert `unchanged` state _and_ the absence of the event.

## Step 9 — validate, then propose

```bash
npm run validate        # schemas, cross-references, corpus, release metadata
npm run docs:generate   # refresh docs/generated/
npm test                # the suite, including the layout and corpus contracts
```

Then open a pull request. If the profile is new, open the profile proposal issue first —
it asks for the information a reviewer needs, which is cheaper than a review round trip.

## Common mistakes

| Symptom the validator prints                                                                 | What it means                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cross-reference checks were skipped because at least one document failed schema validation` | Fix the schema errors first; every reference error below them is derived noise.                                                                    |
| `Required method "x" is not governed by any authorization rule`                              | Add a rule, including a `none` actor one for a public read.                                                                                        |
| `Vector file must be named … to match its declared id`                                       | Rename the file. The name is what a reviewer navigates by.                                                                                         |
| `Profile has no "negative" vector`                                                           | Add one. Without it the profile cannot establish conformance.                                                                                      |
| `Vector supplies N data entries for event X, which accepts between …`                        | The event's payload is declared with a different arity than the vector expects.                                                                    |
| `Profile declares version "0.1" but its directory is named …`                                | A released profile's directory name is its version. An example profile has no version directory, which is why it lives under `profiles/examples/`. |
