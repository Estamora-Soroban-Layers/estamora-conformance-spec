# Contributing

Estamora is a specification project, so contributing means changing what conformance
_means_. That makes the review bar different from a code review: a merged requirement is
one that every consumer will be measured against, and a requirement that is ambiguous,
unverifiable, or invented is worse than a requirement that is missing.

Read [VERSIONING.md](VERSIONING.md) before changing anything normative. It contains the
one rule everything else depends on:

> **Any change that alters what a profile requires is a version change.**

## Repository architecture

```
schema/          the ten normative JSON Schemas
profiles/        released profiles (<id>/<MAJOR.MINOR>/) and worked examples (examples/<name>/)
vectors/         the shared vector library (<set>/<operation>/*.yaml)
examples/        standalone example documents, one schema each
scripts/         the five validation entry points
scripts/lib/     the shared library they are built from
tests/           the Vitest suite
docs/            reference documentation and generated indexes
```

A profile is a **bundle** of seven documents plus a vector directory. The three layers of
validation are deliberately separate:

| Layer           | Command                     | Answers                                                                     |
| --------------- | --------------------------- | --------------------------------------------------------------------------- |
| Schema          | `npm run validate:schemas`  | Is each document shaped correctly, and is each schema itself well formed?   |
| Cross-reference | `npm run validate:profiles` | Do the documents agree with each other?                                     |
| Corpus          | `npm run validate:vectors`  | Are the vectors trustworthy as artifacts, and do they cover the dimensions? |
| Release         | `npm run release:check`     | Is this tree releasable: version, ledger, placeholder markers, license?     |

`npm run validate` runs all four. `npm run ci` adds formatting, typechecking, the
generated-documentation check and the test suite.

## Local development

Requires Node.js 22.12 or later.

```bash
npm ci
npm run ci
```

`npm run ci` is the same chain the workflows run, so a green local run means a green pull
request. Individual checks:

```bash
npm run format          # write formatting, instead of npm run format:check
npm run typecheck
npm run validate
npm run docs:generate   # regenerate docs/generated/ after changing profiles or vectors
npm test                # vitest run
npm run test:watch      # vitest
```

Every entry point accepts `--json` and exits `0` for a valid tree, `1` for a defective
one and `2` when the tooling failed. When you are debugging a validator, `--json` gives
you every diagnostic as structured data, including the code and the JSON Pointer.

## Making a change

### Contributing a profile

1. **Find the upstream source.** A profile without a citation will be closed. The
   `provenance.derived_from` field must name the repository, path and exact revision:
   `stellar-protocol@master ecosystem/sep-0041.md v0.5.1`.
2. **Decide the identity.** A new profile is `id@0.1` or `id@1.0`; a behavioural change
   to an existing one is a new `MAJOR.MINOR` directory, never an edit in place.
3. **Write the seven documents.** Start from `profiles/sep-41/1.0/` or a worked example
   under `profiles/examples/`. Every method must be governed by an authorization rule —
   including a rule that says no authorization is required, because the absence of a
   requirement must be a stated decision.
4. **Record your interpretations.** `provenance.interpretation_notes` is required to be
   non-empty. Every point where the upstream text was ambiguous and you chose a reading
   belongs there, together with the reading you rejected.
5. **Write vectors.** Mandatory: at least one `negative` vector per profile, and the
   `positive`, `boundary`, `authorization`, `event`, `state` and `invariant` dimensions
   represented where the profile has something to check in them. A vector file is named
   after the identity it declares.
6. **Prove it validates.** `npm run validate && npm run docs:generate && npm test`.
7. **Open a profile proposal** using the issue template before the pull request, if the
   profile is new. It asks for the dimensions covered, the ambiguities and the negative
   cases, which is the information a reviewer needs.

### Changing an existing profile

Ask one question first: **does this change what a contract must do?**

- **Yes** → a new version. Add `profiles/<id>/<MAJOR.MINOR+1>/`, set `supersedes`, keep
  the previous directory exactly as it is, and add a changelog entry naming both
  identities. Vectors are per-version: a vector added because of a new requirement belongs
  to the new version's bundle.
- **No** (a typo, a clearer sentence, a reordered key) → an in-place edit to the same
  version, unless the wording is also one of the interpretation notes, in which case the
  note and the requirement change together.

A schema change that tightens a constraint is a requirement change for every profile the
constraint applies to, so it lands in the same pull request as the profile migrations it
forces.

### Adding a vector

Vectors are the cheapest useful contribution and the highest-leverage one. A vector that
catches a real defect in a real contract is worth more than a page of prose.

- Put a case that every profile of a family needs in `vectors/<set>/<operation>/`. Put a
  case that holds for any fungible token in `vectors/common/` against the wildcard
  profile `*`, so it is stated once instead of restated in every profile.
- Put a case that depends on one profile's decision in that bundle's own `vectors/`.
- Name the file after the `id` it declares. `check-vectors` enforces this.
- Write the `rationale`. It must say what a contract that passes the vector can still get
  wrong — that is the justification for the vector existing.
- Prefer a _relative_ expectation (`delta`, `unchanged`, `not_equal`) over a literal that
  repeats a fixture value.

### Changing the tooling or the schemas

- The schemas are loadable by any draft-2020-12 validator; Ajv's strict mode is enabled,
  so a schema with an unknown keyword, an implicit type or an unresolved `$ref` fails to
  build by design rather than being quietly ignored.
- Prefer tightening a schema over adding a cross-reference check, and a cross-reference
  check over a prose note. A rule nobody can fail is documentation.
- Every validator returns diagnostics through one `DiagnosticBag`; never throw for a
  defect that the run could continue past.
- Add a test in the matching `tests/` directory. Schema tests mutate a real artifact and
  require the rejection, rather than using a purpose-built fixture, so that a schema can
  never drift away from the artifacts it governs.

## Review

Requirements are reviewed against four questions, and a reviewer may ask for any of them
to be answered before approving:

1. **Is it cited?** Which upstream revision states this, and does the profile's wording
   match it?
2. **Is it checkable?** Can a runner evaluate it against a deployed contract? A
   requirement that cannot be evaluated is prose.
3. **Is it falsifiable?** Name a contract that passes it while violating the intent. If
   there is one, the requirement is too weak.
4. **Is it scoped?** Does it say _when_ it holds? "Balances are conserved" is true of a
   transfer and false of a mint.

Ambiguous requirements are treated as defects. If a reviewer and an author cannot agree
on what a requirement means, the requirement is rewritten rather than merged with the
ambiguity intact.

## Breaking changes

A breaking change to the data model — removing a field, renaming one, changing an enum,
or tightening a constraint so that a previously valid document becomes invalid — requires
a **format version** change (`estamora_spec_version`), and every profile and vector in the
tree migrated in the same pull request. The format version does not change for additive,
optional fields.

A breaking change to a profile requires a **new profile version**, keeps the old
directory, and is recorded in `CHANGELOG.md`, which the release gate checks for a ledger
entry naming every released profile identity.

## Commits

One commit per improvement, with a message that explains the _why_: which defect the
change makes impossible, or which requirement it pins. Atomic commits are not a style
preference here — the history of a specification is part of what makes it reviewable, and
a commit that bundles a requirement change with a formatting change cannot be reviewed at
all.

## Code of conduct

Be specific, be civil, and argue about the requirement rather than the author. Reviewers
are expected to say _why_ something is rejected, and authors are expected to answer the
four review questions rather than restate the requirement.
