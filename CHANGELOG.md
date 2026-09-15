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

## [0.1.1] - 2026-09-15

This release corrects a defect that made the schemas unusable from outside a checkout,
and publishes the specification in a form that can be installed rather than only cloned.
The requirements themselves are unchanged: no profile, vector, schema keyword or format
version is altered, so `sep-41@1.0` means exactly what it meant in `0.1.0`.

### Fixed

- **The canonical `$id` of every schema named a host with no DNS record.** All ten
  schemas declared `$id` values under `https://estamora.dev/schema/`, and the validator
  enforced that base. Because a `$ref` between schemas is resolved against the `$id` of
  the document containing it, a consumer's validator asked to resolve
  `profile.schema.json#/$defs/identifier` had nothing to fetch, and the schemas were
  machine-readable only from inside a clone. The base now names the site that serves
  those documents. No consumer could have depended on the previous value — it never
  resolved — which is why this is a patch correction rather than a format version change;
  the rule the mistake produced is recorded under *Canonical identifiers* in
  [VERSIONING.md](VERSIONING.md).

### Added

- **The published documentation site**, at
  <https://estamora-soroban-layers.github.io/estamora-conformance-spec/>. It renders the
  reference set, and it also serves `schema/` and `profiles/` beside the pages — the copy
  that makes each canonical `$id` and each profile identity a URL that resolves. Built by
  `scripts/build-docs-site.sh`, deployed by `.github/workflows/pages.yml` through an OIDC
  token rather than a stored secret, and never deployed from a pull request.

- **`scripts/verify-published-schemas.py`**, which fetches every schema from the published
  site and asserts that the document served at a URL is the document that claims it. It is
  the check whose absence allowed the defect above to ship: every offline check agreed with
  the same constant that was wrong. It runs after every deployment, and its schema list is
  read from the checkout, so a schema added later is covered without the job being edited.

- **`docs/schemas.md`**, the schema reference: what each of the ten defines, how a
  canonical `$id` is derived and why it is load-bearing, and a worked `ajv` example that
  registers all ten documents by `$id` so the relative references resolve offline.

- **`scripts/check-doc-links.py`**, which resolves every relative link in the documentation
  against the file that contains it. MkDocs validates links against its own source
  directory and so reports every correct link to `schema/`, `profiles/` or a root document
  as broken; this check runs instead, with the whole repository visible, and it is what the
  site build depends on.

- **A packaged release artefact.** Releases previously carried no files, so the only way to
  obtain this specification at a pinned revision was to clone the repository. Each release
  now attaches the `npm pack` tarball for the tagged tree and a `SHA256SUMS` beside it, so
  `npm install <tarball-url>` is a working install path with no registry account.

### Notes on scope

- This is a patch release, not a new profile version. `sep-41@1.0` is unchanged, and a
  conformance result produced against `0.1.0` remains valid against `0.1.1`.

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
