# Compatibility

Compatibility questions in Estamora come in three shapes, and mixing them up is how a
specification ends up promising something it cannot deliver:

1. **Between a profile and an upstream specification** — does the profile still describe
   the standard it claims to encode?
2. **Between two profile versions** — does a result measured against one tell you anything
   about the other?
3. **Between the specification and its consumers** — can a runner written against an older
   format read a newer tree?

## 1. Profiles and their upstream specification

A profile pins the upstream revision it was derived from:

```yaml
specification:
  name: SEP-0041
  version: "0.5.1"
  status: draft
  url: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md
  updated: "2026-08-03"
provenance:
  derived_from: stellar-protocol@master ecosystem/sep-0041.md v0.5.1 (updated 2026-08-03)
```

Drift between the two is inevitable and is handled explicitly rather than silently:

- **Upstream changes a requirement.** The profile does not change. A profile is not a
  mirror; it is a pinned set of requirements. A new profile version is published when
  someone chooses to adopt the new upstream text, and it records the new revision.
- **Upstream clarifies an ambiguity the profile already read.** The reading the profile
  adopted either matches the clarification or it does not. If it matches, nothing changes.
  If it does not, that is a defect in the profile and is fixed in a new version, with the
  interpretation note updated.
- **Upstream moves from draft to final.** The profile's `specification.status` is updated
  and the profile becomes eligible for `stable`. Its requirements do not change, so its
  own version does not change either — a status promotion is metadata, not a requirement.

`compatibility.interface` records whether the profile models the whole interface (`full`)
or a documented subset (`partial`), and `compatibility.notes` is required to be non-empty
so that a profile cannot be silent about what it covers and what it deliberately does not.
This is where a scope decision belongs: "the Stellar Asset Contract emits an extra SEP-11
topic that belongs to CAP-67, and is out of scope for this profile" is a compatibility
note, not prose buried in a description.

## 2. Between profile versions

| From  | To    | What a result tells you                                                                                                                        |
| ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.0` | `1.1` | A `1.0`-conformant contract is not necessarily `1.1`-conformant, because `1.1` requires more. Measure against the version you intend to claim. |
| `1.0` | `2.0` | Nothing. The requirements changed incompatibly and the result must be re-measured.                                                             |
| `1.1` | `1.0` | Nothing, unless the contract was also measured against `1.0`.                                                                                  |

Two consequences follow, and both are enforced:

- **Consumers pin the exact version.** A result that names only `sep-41` is incomplete,
  which is why `vector.profile_version` is a required field and why `release:check`
  requires a released profile to appear in the changelog as `id@version`.
- **A vector belongs to a version.** A vector whose `profile_version` has no directory
  fails the build, because a requirement about a revision nobody can read is not
  interpretable.

Supersession is recorded explicitly, in both directions: the new version sets
`supersedes`, the old one sets `superseded_by`, and the old directory is never deleted.
A conformance receipt names a profile version, so a version that disappears takes the
meaning of every receipt that names it with it.

## 3. Consumers of the format

The format has its own version, `estamora_spec_version`, and it moves on a stricter rule
than a profile version does.

**A consumer written against format `1.0` must be able to read every `1.0` document.** That
means:

- a field may be **added** only when it is optional, or when its absence is meaningful and
  documented;
- a field may not be renamed, retyped or removed without a format version change;
- an enum may not lose a member; adding a member is also a format change, because a
  consumer that switches exhaustively over the previous set has no branch for the new one;
- a constraint may be **tightened** only with a format version change, because a document
  that was valid stops being valid — which is exactly the definition.

The format version does not change for an additive optional field, and CI proves the
compatibility claim rather than asserting it: the schemas declare their dialect and
identifier, `validate-schema` checks that every schema is a valid draft-2020-12 schema and
that every `$ref` resolves, and the rejection tests fail the moment a schema stops
rejecting what it claims to reject.

### The runner's side of the contract

The runner depends on three things that this repository must not change by accident:

1. **Paths.** `schema/<name>.schema.json`, `profiles/<id>/<MAJOR.MINOR>/`,
   `vectors/<set>/<operation>/`. Pinned by `tests/profiles/layout.test.ts`.
2. **Exit codes.** `0` valid, `1` defects found, `2` tooling failure. Pinned by
   `tests/compatibility/exit-codes.test.ts`, which spawns the real entry points.
3. **Digests.** Canonical JSON, `sha256:<64 hex>`, key-order independent and stable across
   machines. Pinned by `tests/lib/digest.test.ts`.

Each of those is a tested contract rather than a convention, because the failure mode of an
unpinned convention is a runner that silently validates the wrong thing.

## What compatibility does not mean

**Compatibility is not equivalence.** A `1.1`-conformant contract and a `2.0`-conformant
contract may behave identically in practice. The version says what was _required_, not what
was observed.

**Passing a profile version does not mean passing a future one.** That is the point of the
major version: it exists to make "this may no longer hold" explicit rather than leaving
consumers to discover it.

**A profile's `compatibility.notes` is not a specification of the upstream standard.** It
records scope decisions the profile made. Reading it as a description of the standard is
how a reader mistakes a documented omission for a documented absence of the requirement.
