# Profiles

This directory holds the Estamora conformance profiles.

## Layout

```
profiles/
├── <profile-id>/
│   ├── <MAJOR.MINOR>/        the released requirement set
│   │   ├── profile.yaml      identity, upstream pin, manifest
│   │   ├── methods.yaml      interface requirements
│   │   ├── authorization.yaml authorization requirements
│   │   ├── events.yaml       event requirements
│   │   ├── behavior.yaml     behavioural rules
│   │   ├── invariants.yaml   reusable invariants
│   │   ├── failures.yaml     expected failure categories
│   │   └── vectors/          vectors owned by this version
│   │       └── <operation>/<case>.yaml
│   └── README.md
└── examples/
    └── <name>/               illustrative bundle, no version directory
```

A profile is a **bundle**, not a file. Seven documents together describe one set of
requirements, and they cross-reference each other by identifier. Validating a
single document is not enough: the defects that matter are the ones where the
documents disagree, which is what `validate-profiles.ts` exists to catch.

## Released profiles and examples

Released profiles live at `profiles/<id>/<MAJOR.MINOR>/`, and the version directory
name must equal the version declared inside `profile.yaml`. The duplication is
deliberate. A version that disagrees with its own path is how a reference resolves
to the wrong requirement set, so the mismatch is an error rather than a warning.

Examples live at `profiles/examples/<name>/` and have **no version directory**. An
example is a worked illustration rather than a released requirement set, so it
carries a version inside its metadata instead of in its path. Forcing a version
directory would suggest a release that does not exist.

## Versioning

Profile versions are independent of the Estamora format version and of any runner
version. A change to a behavioural requirement requires a new version; a change to
prose, a note or a rationale does not. See `docs/versioning.md`.

## Adding a profile

Read `docs/profile-authoring.md`. In short:

1. Create `profiles/<id>/<MAJOR.MINOR>/` and write the seven bundle documents.
2. Declare every operation directory in `includes.vectors`, and create it. The
   manifest and the tree are checked against each other in both directions.
3. Include at least one negative vector. A suite of only successful calls cannot
   establish behavioural conformance, so a profile without one fails validation.
4. Pin `profile.specification` to an exact upstream revision and record every
   interpretation you had to make in `profile.provenance.interpretation_notes`.
5. Run `npm run validate`.
