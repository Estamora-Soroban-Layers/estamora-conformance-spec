## What this changes

<!-- One or two sentences. Name the requirement, schema or validator, not the file. -->

## Why

<!--
The reasoning, not the diff. For a profile change this is the upstream passage
and the reading you adopted; for a tooling change it is the defect or the class of
defect the change makes impossible.
-->

## Which of these applies

<!-- Tick every one that applies, then answer the question underneath it. -->

- [ ] **A requirement changed.** Then a profile version changed. Which identity, and is the change backwards compatible?
- [ ] **A document shape changed.** Then `estamora_spec_version` changed, and every profile and vector was migrated in the same pull request.
- [ ] **A schema tightened.** Something that used to validate no longer does. Which profiles or vectors needed updating?
- [ ] **A schema relaxed.** Say what the schema no longer rejects, and why that is safe.
- [ ] **Vectors were added.** Say which conformance dimension each one covers, and why the existing corpus did not.
- [ ] **Vectors were renamed or removed.** Say why a new identity or a removal is required rather than an edit in place — every rename breaks anyone who referenced the old identity.
- [ ] **Tooling or process only.** No normative artifact changed.

## Upstream citation

<!--
Required for any change to a requirement. Give the repository, path and exact
revision. "The SEP says so" is not a citation.
-->

## Interpretation

<!--
If the upstream text was ambiguous, state the reading you adopted and the
alternative you rejected. This becomes (or already is) an `interpretation_notes`
entry, which the schema requires to be non-empty.
-->

## Validation

<!--
Run these and paste the result. A pull request that changes a requirement without
running the release gate has not shown that the change is releasable.
-->

```
npm ci
npm run format:check
npm run typecheck
npm run validate
npm run docs:check
npm test
```

## Does any of this imply a security guarantee?

- [ ] No. Conformance is not a security property, and nothing in this change presents it as one.

<!--
If you cannot tick that, say why in the box below. Estamora verifies defined
behavioural compatibility against a stated profile. It does not audit, and a
passing result must never be described as making a contract safe.
-->
