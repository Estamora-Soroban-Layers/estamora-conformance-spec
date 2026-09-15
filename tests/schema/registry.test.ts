/**
 * Schema registry tests.
 *
 * Before anything can trust the schemas, the schemas have to be trustworthy
 * themselves: each one must exist, declare the Estamora dialect and identifier,
 * describe itself as a valid JSON Schema for that dialect, and compile under
 * Ajv's strict mode. A schema that is merely ignored at load time is worse than
 * a missing one, because it silently validates nothing.
 */

import { describe, expect, it } from "vitest";

import {
  checkSchemaDocument,
  ErrorCode,
  getSchemaRegistry,
  isJsonObject,
  JSON_SCHEMA_DIALECT,
  SCHEMA_FILES,
  SCHEMA_ID_BASE,
} from "../../scripts/lib/index.ts";
import { readDocument } from "../helpers/artifacts.ts";

const registry = getSchemaRegistry();

describe("normative schema set", () => {
  it("declares exactly the ten schemas the specification requires", () => {
    expect([...SCHEMA_FILES].sort()).toEqual([
      "assertion.schema.json",
      "authorization.schema.json",
      "behavior.schema.json",
      "event.schema.json",
      "failure.schema.json",
      "invariant.schema.json",
      "method.schema.json",
      "profile.schema.json",
      "report.schema.json",
      "vector.schema.json",
    ]);
  });

  it("compiles every schema into a validator", () => {
    for (const name of SCHEMA_FILES) {
      expect(registry.document(name), name).toBeDefined();
      expect(registry.validate(name, {}).errors.length, name).toBeGreaterThan(0);
    }
  });

  it("gives every schema the Estamora dialect and a stable $id", () => {
    for (const name of SCHEMA_FILES) {
      const document = registry.document(name);
      expect(isJsonObject(document), name).toBe(true);
      if (!isJsonObject(document)) {
        continue;
      }
      expect(document["$schema"], name).toBe(JSON_SCHEMA_DIALECT);
      expect(document["$id"], name).toBe(`${SCHEMA_ID_BASE}${name}`);
    }
  });

  it("describes each schema as a valid JSON Schema for its dialect", () => {
    for (const name of SCHEMA_FILES) {
      expect(checkSchemaDocument(name, registry.document(name)), name).toEqual([]);
    }
  });

  it("labels a rejected document with the schema's own error class", () => {
    const result = registry.validate("profile.schema.json", { profile: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const error of result.errors) {
      expect(error.code).toBe(ErrorCode.PROFILE_ERROR);
      expect(error.severity).toBe("error");
    }
  });

  it("reports a vector violation as a vector error, not a profile error", () => {
    const result = registry.validate("vector.schema.json", {});
    expect(result.valid).toBe(false);
    expect(result.errors.every((error) => error.code === ErrorCode.VECTOR_ERROR)).toBe(true);
  });

  it("refuses a standalone assertions document that asserts nothing", () => {
    // A vector may carry an empty `assertions` list, because `expected` already
    // states the outcome. A standalone assertions document may not: a published
    // file of zero checks asserts nothing while looking like a requirement.
    const result = registry.validate("assertion.schema.json", { assertions: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.message.includes("at least 1 item"))).toBe(true);
  });

  it("accepts the assertion list a real vector carries", () => {
    const vector = readDocument(
      "profiles/sep-41/1.0/vectors/transfer/transfer-moves-exact-amount.yaml",
    );
    const assertions = (vector as { assertions: unknown }).assertions;
    expect(registry.validate("assertion.schema.json", { assertions }).valid).toBe(true);
  });
});
