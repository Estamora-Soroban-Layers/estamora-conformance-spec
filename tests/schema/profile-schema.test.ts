/**
 * `profile.schema.json` acceptance and rejection tests.
 *
 * The positive cases are the real profiles and example documents in this
 * repository, so the schema cannot drift away from the artifacts it governs.
 * The negative cases are mutations of those same documents: every one is a
 * defect a contributor plausibly makes, and each must be rejected.
 */

import { describe, expect, it } from "vitest";

import {
  EXAMPLE_PROFILE_DOCUMENTS,
  expectSchemaAccepted,
  expectSchemaRejected,
  mutated,
  readDocument,
} from "../helpers/artifacts.ts";

const SCHEMA = "profile.schema.json" as const;
const BASELINE = "examples/basic-profile.yaml";

describe("profile.schema.json acceptance", () => {
  it.each(["profiles/sep-41/1.0/profile.yaml", ...EXAMPLE_PROFILE_DOCUMENTS])(
    "accepts %s",
    (path) => {
      expectSchemaAccepted(SCHEMA, readDocument(path), path);
    },
  );
});

describe("profile.schema.json rejection", () => {
  it("rejects a document with no format version", () => {
    const document = mutated(readDocument(BASELINE), (copy) => {
      delete copy["estamora_spec_version"];
    });
    const errors = expectSchemaRejected(SCHEMA, document, "missing estamora_spec_version");
    expect(errors.some((error) => error.message.includes("estamora_spec_version"))).toBe(true);
  });

  it("rejects a document with no metadata block", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        delete copy["profile"];
      }),
      "missing profile",
    );
  });

  it("rejects a document with no includes manifest", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        delete copy["includes"];
      }),
      "missing includes",
    );
  });

  it("rejects an unknown top-level property", () => {
    const errors = expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        copy["extra_requirements"] = ["something"];
      }),
      "unknown top-level property",
    );
    expect(errors.some((error) => error.message.includes("unexpected property"))).toBe(true);
  });

  it("rejects a profile with no identifier", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const profile = copy["profile"] as Record<string, unknown>;
        delete profile["id"];
      }),
      "missing profile.id",
    );
  });

  it("rejects an identifier that is not a slug", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const profile = copy["profile"] as Record<string, unknown>;
        profile["id"] = "Minimal Token";
      }),
      "invalid profile.id",
    );
  });

  it("rejects a status outside the versioning policy", () => {
    const errors = expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const profile = copy["profile"] as Record<string, unknown>;
        profile["status"] = "current";
      }),
      "invalid profile.status",
    );
    expect(errors.some((error) => error.message.includes("expected one of"))).toBe(true);
    expect(errors.some((error) => error.path?.startsWith("/profile/status") === true)).toBe(true);
  });

  it("rejects a version that is not MAJOR.MINOR", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const profile = copy["profile"] as Record<string, unknown>;
        profile["version"] = "v1";
      }),
      "invalid profile.version",
    );
  });

  it("rejects an upstream specification reference with no URL", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const profile = copy["profile"] as Record<string, unknown>;
        const specification = profile["specification"] as Record<string, unknown>;
        delete specification["url"];
      }),
      "missing specification.url",
    );
  });

  it("rejects provenance that claims no interpretation was needed", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const profile = copy["profile"] as Record<string, unknown>;
        const provenance = profile["provenance"] as Record<string, unknown>;
        provenance["interpretation_notes"] = [];
      }),
      "empty interpretation_notes",
    );
  });

  it("rejects a duplicate vector operation directory", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const includes = copy["includes"] as Record<string, unknown>;
        const vectors = includes["vectors"] as string[];
        includes["vectors"] = [vectors[0] ?? "deposit", vectors[0] ?? "deposit"];
      }),
      "duplicate include directory",
    );
  });

  it("rejects a compatibility block that claims no notes", () => {
    expectSchemaRejected(
      SCHEMA,
      mutated(readDocument(BASELINE), (copy) => {
        const profile = copy["profile"] as Record<string, unknown>;
        const compatibility = profile["compatibility"] as Record<string, unknown>;
        compatibility["notes"] = [];
      }),
      "empty compatibility.notes",
    );
  });
});
