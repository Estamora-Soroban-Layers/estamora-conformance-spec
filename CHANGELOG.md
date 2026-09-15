# Changelog

All notable changes to the Estamora conformance specification are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to the versioning policy in [VERSIONING.md](VERSIONING.md).

Two kinds of version appear in this file and they are not interchangeable:

- the **repository version** (the heading below), which is the version of the
  specification tree as a whole — its schemas, its tooling and its layout;
- **profile versions** (written `id@MAJOR.MINOR`), which are the versions of the
  individual requirement sets. Profile versions move independently and are never
  implied by the repository version.

## [0.1.0] - 2026-09-15

The first release of the Estamora specification layer. It establishes the
normative data model for Soroban contract behavioural conformance, the validation
tooling that enforces it, and the first profile built on it.

### Added

- **Ten normative JSON Schemas** under `schema/`, targeting JSON Schema
  draft 2020-12 and compiled by Ajv in strict mode: `profile`, `method`,
  `behavior`, `authorization`, `event`, `invariant`, `vector`, `assertion`,
  `failure` and `report`. Each schema rejects unknown properties, so an
  undeclared requirement cannot be smuggled into a profile without a
  corresponding schema change.

- **The SEP-41 profile, version `sep-41@1.0`**, under `profiles/sep-41/1.0/`.
  It models all ten methods of the upstream `TokenInterface` trait (`allowance`,
  `approve`, `balance`, `transfer`, `transfer_from`, `burn`, `burn_from`,
  `decimals`, `name`, `symbol`), together with authorization requirements, event
  requirements, behavioural rules, state assertions, invariants and semantic
  failure categories. The profile pins SEP-0041 at version `0.5.1` (updated
  2026-08-03) and records that revision as the source of every requirement.

- **Twenty test vectors** in two libraries. Twelve are owned by the SEP-41
  bundle under `profiles/sep-41/1.0/vectors/`; eight live in the shared library
  under `vectors/`, of which four are profile-independent scenarios in
  `vectors/common/` declared against the wildcard profile. The corpus covers the
  `positive`, `negative`, `boundary`, `authorization`, `event`, `state` and
  `invariant` dimensions.

- **Five validation entry points** under `scripts/`, all of which exit `0` when
  the tree is valid, `1` when it contains defects, and `2` when the tooling
  itself failed: `validate-schema.ts`, `validate-profiles.ts`,
  `check-vectors.ts`, `generate-docs.ts` and `release-check.ts`.

- **Cross-reference validation**, which is the part JSON Schema cannot express:
  a method that names an authorization rule, event, failure or behaviour that
  does not exist is reported rather than silently unenforced, and the same holds
  for a vector whose inputs disagree with the signature it tests.

- **Generated reference indexes** under `docs/generated/`, holding the profile
  inventory and the vector inventory with their digests.

- **Four standalone example documents** under `examples/`, each demonstrating
  exactly one schema.

- **Three worked example bundles** under `profiles/examples/` — `minimal-token`,
  `authorization-sensitive` and `event-sensitive` — each a complete seven-document
  bundle with its own vectors. They are validated by the same tooling as the
  released profile, so the examples cannot drift away from the schemas they
  illustrate. Each one is an illustration rather than a standard, which its
  provenance block states.

- **The release gate**, which ties the repository version to this changelog,
  requires every released profile to appear here by `id@version`, and refuses to
  let a placeholder marker reach a normative artefact.

- **Continuous integration** under `.github/`, as five workflows: the full
  validation chain, a schema-only path, a profile-and-vector path, a documentation
  currency check, and a release workflow that re-runs the chain against the tagged
  commit before publishing anything. Every action is pinned to a version, every
  workflow declares its permissions rather than inheriting them, every job sets a
  timeout, and no workflow uses `pull_request_target`.

- **The contributor documentation**: `README.md`, `CONTRIBUTING.md`,
  `GOVERNANCE.md` and `SECURITY.md`, plus issue templates for profile proposals,
  bug reports and improvements, a pull request template, and a dependency-update
  configuration. `release:check` refuses to release a tree whose README is a stub,
  whose community documents are empty, or whose workflows are missing — a check
  that no automation runs is not a check.

- **The reference documentation set** under `docs/`: seventeen documents that
  define the model normatively — the introduction and the architecture, the
  shared terminology, profile authoring, and one document for each conformance
  dimension (behaviour, authorization, events, state, invariants, failures and
  vectors) — together with versioning, compatibility, certification, security and
  governance. The README indexes every one of them, and the layout suite fails if
  a document is missing, empty, unreachable from the README, or linked to a path
  that does not resolve.

### Notes on scope

- The SEP-41 profile is declared `draft`. Upstream SEP-0041 is itself a draft
  document, and a profile is not promoted to `stable` while the standard it
  encodes is still moving. The profile records every point where the upstream
  text required interpretation in its `provenance` block instead of inventing a
  requirement.

- Passing this specification proves nothing about a contract. It defines what
  conformance means; measuring a deployed contract against it, and reporting the
  result, belongs to `estamora-conformance-runner`. Passing Estamora conformance
  is not a security guarantee, and the specification does not present itself as
  one.
