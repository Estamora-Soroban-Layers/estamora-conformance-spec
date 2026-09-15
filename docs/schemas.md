# Schemas

Ten JSON Schemas define the Estamora conformance format. They are the normative definition
of the shape of every artefact this specification publishes: where a document on this site
disagrees with a schema, the schema governs and the document is a defect.

Every schema is written in [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12/schema)
and carries a canonical `$id` that resolves on this site. A `$id` is not decoration: it is
what a consumer's validator resolves a cross-schema `$ref` against, and a `$id` that does not
resolve turns a machine-readable specification into one that can only be checked after a
clone.

| Schema                                                             | Defines                                                                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`profile.schema.json`](../schema/profile.schema.json)             | The bundle manifest: identity, version, status, the upstream specification it derives from, compatibility notes and the documents it includes                        |
| [`method.schema.json`](../schema/method.schema.json)               | One method requirement: arguments, types, semantics, return type, mutability, invocation mode and the requirements attached to it                                    |
| [`behavior.schema.json`](../schema/behavior.schema.json)           | Behavioural rules: preconditions, postconditions, success and failure conditions, state transitions, expected and forbidden outputs                                  |
| [`authorization.schema.json`](../schema/authorization.schema.json) | Who must authorize a call, which arguments their authorization must cover, and what an unauthorized or wrong-actor call must do                                      |
| [`event.schema.json`](../schema/event.schema.json)                 | Event requirements: topics, data fields, bindings, cardinality, ordering and occurrence                                                                              |
| [`invariant.schema.json`](../schema/invariant.schema.json)         | Reusable invariants, their kind, their scope and their severity                                                                                                      |
| [`assertion.schema.json`](../schema/assertion.schema.json)         | Predicates, value expressions and assertion categories, shared by the behaviour, invariant and vector schemas                                                        |
| [`vector.schema.json`](../schema/vector.schema.json)               | A test vector: operation, setup, inputs, expected outcome, state, events, authorization and assertions                                                               |
| [`failure.schema.json`](../schema/failure.schema.json)             | Semantic failure categories and their outcomes, including the distinction between an expected failure, an unexpected success, an execution error and a profile error |
| [`report.schema.json`](../schema/report.schema.json)               | A conformance result: the six statuses, per-dimension tallies, per-assertion findings and the identity of what produced them                                         |

## Canonical `$id`

Each schema declares its own URL as `$id`:

```
https://estamora-soroban-layers.github.io/estamora-conformance-spec/schema/profile.schema.json
```

Cross-schema references are relative (`profile.schema.json#/$defs/identifier`), so they
resolve against whichever `$id` the referencing schema declares. A validator that has all ten
documents available — from the site, from an `npm` install, or from a checkout — resolves the
whole graph offline. `scripts/validate-schema.ts` asserts that every `$id` is exactly the
canonical URI for its filename and that no two schemas claim the same one, so a schema cannot
be published with an `$id` that points somewhere it does not live.

The canonical base is a single constant in `scripts/lib/paths.ts`. Changing it changes every
`$id` and therefore every reference a consumer holds, which is why it is a breaking change to
the specification format rather than an edit — see [Versioning](versioning.md).

## Validating against them

With `ajv`, registering the ten documents by their `$id` resolves the relative references
offline:

```js
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const documents = readdirSync("schema").map((name) =>
  JSON.parse(readFileSync(`schema/${name}`, "utf8")),
);

// Registered by `$id`, so a relative `$ref` between two schemas resolves to the document
// that was just added rather than to a network fetch.
for (const document of documents) {
  ajv.addSchema(document);
}

const profile = ajv.getSchema(
  "https://estamora-soroban-layers.github.io/estamora-conformance-spec/schema/profile.schema.json",
);
if (!profile(parse(readFileSync("profiles/sep-41/1.0/profile.yaml", "utf8")))) {
  throw new Error(ajv.errorsText(profile.errors));
}
```

A profile is a bundle of seven documents rather than one, and several of the schemas validate
a fragment of it. `profile.schema.json` validates the manifest; the documents it includes are
validated by the schema named for each. `scripts/validate-profiles.ts` in this repository is a
worked example of the whole set, including the cross-document references that no single schema
can check.
