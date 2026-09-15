/**
 * Exit-code compatibility tests.
 *
 * These spawn the real entry points rather than calling into the library,
 * because the contract CI depends on is the *process* contract: `0` means the
 * specification tree is valid, `1` means it contains defects, and `2` means the
 * tooling itself failed. A workflow that cannot tell a broken profile apart from
 * a broken workflow will eventually report an infrastructure failure as a
 * non-conformant contract, which is the single most damaging confusion this
 * project can produce.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EXIT_CODES, REPO_ROOT } from "../../scripts/lib/index.ts";

interface RunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run an entry point in a child process and capture its exit status. */
function run(script: string, args: readonly string[] = []): RunResult {
  const command = [
    process.execPath,
    "--import",
    "tsx",
    join(REPO_ROOT, "scripts", script),
    ...args,
  ];
  try {
    const stdout = execFileSync(command[0] ?? process.execPath, command.slice(1), {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { status: EXIT_CODES.SUCCESS, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? -1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

const ENTRY_POINTS = [
  "validate-schema.ts",
  "validate-profiles.ts",
  "check-vectors.ts",
  "generate-docs.ts",
  "release-check.ts",
] as const;

/**
 * How to obtain a machine-readable document from each entry point.
 *
 * `generate-docs` is invoked with `--check`, because its generating mode writes
 * to the working tree and a test must never do that.
 */
const JSON_INVOCATIONS: readonly { script: string; args: readonly string[] }[] = [
  { script: "validate-schema.ts", args: ["--json"] },
  { script: "validate-profiles.ts", args: ["--json"] },
  { script: "check-vectors.ts", args: ["--json"] },
  { script: "generate-docs.ts", args: ["--json", "--check"] },
  { script: "release-check.ts", args: ["--json"] },
];

describe("entry points on a clean tree", () => {
  it.each(ENTRY_POINTS)("%s exits 0", (script) => {
    const result = run(script);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(EXIT_CODES.SUCCESS);
  });

  it("keeps generated documentation current", () => {
    const result = run("generate-docs.ts", ["--check"]);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(EXIT_CODES.SUCCESS);
  });

  it("reports the vector corpus digest in JSON form", () => {
    const result = run("check-vectors.ts", ["--json"]);
    expect(result.status).toBe(EXIT_CODES.SUCCESS);
    const payload = JSON.parse(result.stdout) as { ok: boolean; corpus_digest: string };
    expect(payload.ok).toBe(true);
    expect(payload.corpus_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it.each(JSON_INVOCATIONS)(
    "$script keeps stdout free of prose under $args",
    ({ script, args }) => {
      // A single stray progress line makes the document unparsable, so the JSON
      // contract is checked rather than assumed.
      const result = run(script, args);
      expect(result.status).toBe(EXIT_CODES.SUCCESS);
      expect(() => JSON.parse(result.stdout) as unknown).not.toThrow();
    },
  );

  it.each(ENTRY_POINTS)("%s documents itself and exits 0 on --help", (script) => {
    const result = run(script, ["--help"]);
    expect(result.status).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Usage:");
  });
});

describe("entry points on a defective command line", () => {
  it.each(ENTRY_POINTS)("%s exits 2 for an unknown flag", (script) => {
    const result = run(script, ["--definitely-not-a-flag"]);
    expect(result.status).toBe(EXIT_CODES.TOOLING_FAILURE);
    expect(result.stderr).toContain("Unknown flag");
  });

  it("exits 2 when a string flag is given no value", () => {
    const result = run("validate-profiles.ts", ["--profile"]);
    expect(result.status).toBe(EXIT_CODES.TOOLING_FAILURE);
    expect(result.stderr).toContain("requires a value");
  });

  it("distinguishes a missing profile from a broken workflow", () => {
    // A profile that is not there is a defect in the request, not a crash in the
    // tooling, so it exits 1 and not 2.
    const result = run("validate-profiles.ts", ["--profile", "examples/does-not-exist"]);
    expect(result.status).toBe(EXIT_CODES.DEFECTS_FOUND);
    expect(result.stderr).toContain("No profile bundle found");
  });
});
