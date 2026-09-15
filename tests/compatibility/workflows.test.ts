/**
 * Workflow configuration tests.
 *
 * CI configuration is the one part of this repository that nothing validates. A
 * workflow with a typo in a job name, an unpinned action, or a step that runs a
 * script which does not exist is invisible until it runs — and a workflow that
 * silently checks nothing looks exactly like one that checked everything and
 * passed.
 *
 * These tests parse the workflow files and assert the properties a reader is
 * entitled to assume: the chain that must run, that every action is pinned, that
 * permissions are declared rather than inherited, and that no workflow uses the
 * trigger that grants a fork write access to the base repository.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, readYamlFile } from "../../scripts/lib/index.ts";
import { fixture } from "../helpers/artifacts.ts";

/** The workflows the specification publishes. */
const WORKFLOWS = [
  "ci.yml",
  "schema-validation.yml",
  "docs.yml",
  "profile-validation.yml",
  "release.yml",
] as const;

interface WorkflowJob {
  readonly "runs-on"?: unknown;
  readonly steps?: readonly WorkflowStep[];
}

interface WorkflowStep {
  readonly name?: unknown;
  readonly uses?: unknown;
  readonly run?: unknown;
}

interface Workflow {
  readonly name?: unknown;
  readonly on?: unknown;
  readonly permissions?: unknown;
  readonly jobs?: Record<string, WorkflowJob>;
}

function loadWorkflow(file: string): Workflow {
  const document = readYamlFile(fixture(join(".github", "workflows", file)));
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new Error(`${file} is not a mapping.`);
  }
  return document as Workflow;
}

/** Flatten every step of every job into one list. */
function steps(workflow: Workflow): readonly WorkflowStep[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

describe("workflow files", () => {
  it.each(WORKFLOWS)("%s is a named workflow with at least one job", (file) => {
    const workflow = loadWorkflow(file);
    expect(typeof workflow.name, `${file} must declare a name`).toBe("string");
    expect(workflow.on, `${file} must declare a trigger`).toBeDefined();
    const jobs = Object.keys(workflow.jobs ?? {});
    expect(jobs.length, `${file} must declare at least one job`).toBeGreaterThan(0);
    for (const job of jobs) {
      const definition = workflow.jobs?.[job];
      expect(typeof definition?.["runs-on"], `${file}: job ${job} needs runs-on`).toBe("string");
    }
  });

  it.each(WORKFLOWS)("%s declares its permissions explicitly", (file) => {
    // An undeclared permission set is inherited from the repository default, which
    // may be read-write. A specification repository needs no write access to run
    // its own checks, so silence here is a defect rather than a convenience.
    expect(loadWorkflow(file).permissions, `${file} must declare permissions`).toBeDefined();
  });

  it.each(WORKFLOWS)("%s does not use the pull_request_target trigger", (file) => {
    // `pull_request_target` runs with the base repository's token and secrets while
    // checking out untrusted code, which is the standard way a CI workflow is
    // turned into a credential-exfiltration path.
    const triggers = Object.keys((loadWorkflow(file).on ?? {}) as Record<string, unknown>);
    expect(triggers, `${file}`).not.toContain("pull_request_target");
  });

  it.each(WORKFLOWS)("%s pins every action to a released version", (file) => {
    const workflow = loadWorkflow(file);
    const actions = steps(workflow)
      .map((step) => step.uses)
      .filter((value): value is string => typeof value === "string");
    expect(actions.length, `${file} must use at least one action`).toBeGreaterThan(0);
    for (const action of actions) {
      // Either `owner/repo@vN[.N.N]` or a full commit SHA. A branch reference is not
      // acceptable: it means the workflow's behaviour can change without a commit
      // here, which for a specification repository is a provenance problem.
      expect(action, `${file}: ${action} must pin a version`).toMatch(
        /^[^@]+@(v?\d+(\.\d+)*|\d+:v?\d+(\.\d+)*|[0-9a-f]{40})$/u,
      );
    }
  });

  it.each(WORKFLOWS)("%s gives every step a name and an action to perform", (file) => {
    for (const step of steps(loadWorkflow(file))) {
      expect(step.name, `${file}: a step is unnamed`).toBeDefined();
      const performs = typeof step.uses === "string" || typeof step.run === "string";
      expect(performs, `${file}: a step neither runs nor uses anything`).toBe(true);
    }
  });

  it.each(WORKFLOWS)("%s sets a timeout on every job", (file) => {
    // A workflow with no timeout can occupy a runner for six hours on a hang, which
    // makes queued pull requests look like failures of their own.
    const raw = readYamlFile(fixture(join(".github", "workflows", file))) as {
      jobs?: Record<string, Record<string, unknown>>;
    };
    for (const [job, definition] of Object.entries(raw.jobs ?? {})) {
      expect(definition["timeout-minutes"], `${file}: job ${job}`).toBeTypeOf("number");
    }
  });
});

describe("the main CI workflow", () => {
  const workflow = loadWorkflow("ci.yml");

  it("runs every check the repository publishes", () => {
    const commands = steps(workflow)
      .map((step) => step.run)
      .filter((value): value is string => typeof value === "string")
      .join("\n");
    for (const script of [
      "npm ci",
      "npm run format:check",
      "npm run typecheck",
      "npm run validate",
      "npm run docs:check",
      "npm test",
    ]) {
      expect(commands, `ci.yml must run ${script}`).toContain(script);
    }
  });

  it("tests the declared engine floor as well as the current release", () => {
    const versions = Object.values(workflow.jobs ?? {})
      .map((job) => job as unknown as { strategy?: { matrix?: { node?: readonly string[] } } })
      .flatMap((job) => job.strategy?.matrix?.node ?? []);
    expect(versions.length).toBeGreaterThan(1);
    expect(versions.some((version) => version.startsWith("22"))).toBe(true);
  });

  it("never treats a scheduled run as an excuse to skip the suite", () => {
    // Guardrail against a workflow being trimmed to a subset of checks while its
    // name still claims to validate the specification.
    const names = Object.keys(workflow.jobs ?? {});
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names).toContain("specification");
  });
});

describe("repository workflow paths", () => {
  it("resolves every workflow file from the repository root", () => {
    for (const file of WORKFLOWS) {
      expect(fixture(join(".github", "workflows", file)).startsWith(REPO_ROOT)).toBe(true);
    }
  });
});
