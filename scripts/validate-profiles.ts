#!/usr/bin/env node
/**
 * Validate every profile bundle.
 *
 * Schema validation answers "is this document shaped correctly". This entry
 * point answers the harder question: "do the documents agree with each other".
 * A profile is a set of cross-referencing collections, and the defects that
 * schema validation cannot see are the ones that matter most in a normative
 * document:
 *
 * - a method that names an authorization rule, event, failure or behaviour that
 *   does not exist, so the requirement is silently never checked;
 * - an authorization rule that covers an argument the method does not declare,
 *   so the coverage statement is unverifiable;
 * - two entries claiming the same identity, so a reference resolves to whichever
 *   one a reader happened to find first;
 * - a vector whose inputs do not match the signature it is testing, or whose
 *   expected failure or event is not declared anywhere;
 * - an operation directory that exists but is not declared, or is declared and
 *   does not exist.
 *
 * None of these are caught by JSON Schema, and each of them turns a profile into
 * a document that looks complete and enforces less than it appears to.
 */

import { existsSync } from "node:fs";
import { basename, join } from "node:path";

import {
  booleanFlag,
  COMMON_FLAGS,
  DiagnosticBag,
  ErrorCode,
  EXAMPLES_DIR,
  EXIT_CODES,
  discoverProfileDirectories,
  findMalformedVersionDirectories,
  formatIdentity,
  getSchemaRegistry,
  handleCliError,
  loadProfileBundle,
  loadVectors,
  note,
  parseArgs,
  prettyJson,
  PROFILES_DIR,
  readdirSyncSafe,
  readYamlFile,
  reportSummary,
  REPO_ROOT,
  stringFlag,
  tally,
  usage,
  VECTORS_DIR,
  WILDCARD_PROFILE,
  type LoadedVector,
  type ProfileBundle,
  type SchemaFileName,
} from "./lib/index.ts";

const PROGRAM = "estamora-validate-profiles";

/**
 * Schemas an example document may demonstrate.
 *
 * The report schema is excluded because a report is emitted by the runner rather
 * than authored, so an example of one would be a fixture rather than a model for
 * contributors to copy. Every other document type a profile author writes is here.
 */
const EXAMPLE_DOCUMENT_SCHEMAS: readonly SchemaFileName[] = [
  "profile.schema.json",
  "method.schema.json",
  "authorization.schema.json",
  "event.schema.json",
  "behavior.schema.json",
  "invariant.schema.json",
  "failure.schema.json",
  "vector.schema.json",
  "assertion.schema.json",
];

/** The referenceable identities a profile declares, unioned across versions. */
interface ProfileIdIndex {
  readonly methods: Set<string>;
  readonly failures: Set<string>;
  readonly events: Set<string>;
  readonly invariants: Set<string>;
}

function emptyIndex(): ProfileIdIndex {
  return {
    methods: new Set(),
    failures: new Set(),
    events: new Set(),
    invariants: new Set(),
  };
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv, [
    ...COMMON_FLAGS,
    {
      name: "profile",
      type: "string",
      description: "Validate only this profile directory (absolute or relative)",
    },
  ]);

  if (booleanFlag(args, "help")) {
    process.stdout.write(
      `${usage(PROGRAM, "Validate every Estamora conformance profile bundle.", COMMON_FLAGS)}\n`,
    );
    return EXIT_CODES.SUCCESS;
  }

  const bag = new DiagnosticBag();
  const registry = getSchemaRegistry();

  for (const problem of findMalformedVersionDirectories(PROFILES_DIR)) {
    bag.error(ErrorCode.VERSION_ERROR, problem.reason, problem.directory);
  }

  const requested = stringFlag(args, "profile");
  const directories =
    requested === undefined
      ? discoverProfileDirectories(PROFILES_DIR)
      : [join(REPO_ROOT, requested.replace(/^\.\//u, ""))].filter((path) =>
          existsSync(join(path, "profile.yaml")),
        );

  if (directories.length === 0) {
    bag.error(
      ErrorCode.PROFILE_ERROR,
      requested === undefined
        ? "No profile bundles were found under profiles/."
        : `No profile bundle found at ${requested}.`,
      requested === undefined ? PROFILES_DIR : join(REPO_ROOT, requested),
    );
  }

  const vectorIds = new Map<string, string>();
  const profileIndex = new Map<string, ProfileIdIndex>();
  let checked = 0;
  let passed = 0;

  for (const directory of directories) {
    const bundle = loadProfileBundle(directory, registry, bag);
    checked += 1;
    if (validateBundle(bundle, registry, bag, vectorIds, profileIndex)) {
      passed += 1;
    }
  }

  validateSharedVectorSets(registry, bag, vectorIds, profileIndex);
  validateExamples(registry, bag);

  if (directories.length > 0) {
    note(`${tally(passed, checked)} profile bundle(s) passed every cross-reference check`);
  }

  const ok = reportSummary(`profile validation across ${checked} bundle(s)`, bag);
  if (booleanFlag(args, "json")) {
    process.stdout.write(prettyJson({ ok, diagnostics: bag.toJSON() }));
  }
  return ok ? EXIT_CODES.SUCCESS : EXIT_CODES.DEFECTS_FOUND;
}

/** Run every semantic check for one bundle. Returns whether it was clean. */
function validateBundle(
  bundle: ProfileBundle,
  registry: ReturnType<typeof getSchemaRegistry>,
  bag: DiagnosticBag,
  vectorIds: Map<string, string>,
  profileIndex: Map<string, ProfileIdIndex>,
): boolean {
  const before = bag.count("error");
  const file = bundle.location;

  if (!bundle.valid) {
    // Cascading reference failures are noise: when methods.yaml is malformed,
    // every rule that names a method appears broken too, and forty derivative
    // errors bury the one schema error that actually needs fixing.
    bag.error(
      ErrorCode.PROFILE_ERROR,
      "Cross-reference checks were skipped because at least one document in this bundle failed schema validation. Fix the schema errors above first; they are the cause of any reference that appears unresolvable.",
      file,
    );
    return false;
  }

  if (bundle.identity !== undefined && bundle.valid) {
    const metadata = bundle.profile?.profile;
    if (metadata !== undefined) {
      const expectedVersion = basename(bundle.directory);
      if (metadata.version !== expectedVersion) {
        bag.error(
          ErrorCode.VERSION_ERROR,
          `Profile declares version ${JSON.stringify(metadata.version)} but its directory is named ${JSON.stringify(expectedVersion)}. A version that disagrees with its path makes every reference ambiguous.`,
          file,
        );
      }
      if (metadata.supersedes === formatIdentity({ id: metadata.id, version: metadata.version })) {
        bag.error(ErrorCode.VERSION_ERROR, "A profile cannot supersede itself.", file);
      }
    }
  }

  const methodIds = collectIds(bundle.methods, "methods", file, bag);
  const authorizationIds = collectIds(bundle.authorization, "authorization_rules", file, bag);
  const eventIds = collectIds(bundle.events, "events", file, bag);
  const behaviorIds = collectIds(bundle.behaviors, "behaviors", file, bag);
  const invariantIds = collectIds(bundle.invariants, "invariants", file, bag);
  const failureIds = collectIds(bundle.failures, "failures", file, bag);

  if (bundle.identity !== undefined) {
    const index = profileIndex.get(bundle.identity.id) ?? emptyIndex();
    for (const id of methodIds) index.methods.add(id);
    for (const id of failureIds) index.failures.add(id);
    for (const id of eventIds) index.events.add(id);
    for (const id of invariantIds) index.invariants.add(id);
    profileIndex.set(bundle.identity.id, index);
  }

  checkVectorDirectoryDeclaration(bundle, bag);
  checkDuplicateMethodNames(bundle, file, bag);
  checkMethodReferences(bundle, { authorizationIds, eventIds, behaviorIds, failureIds }, file, bag);
  checkAuthorizationRules(bundle, methodIds, failureIds, file, bag);
  checkEventCorrelations(bundle, eventIds, invariantIds, file, bag);
  checkBehaviorReferences(bundle, { methodIds, failureIds, eventIds, invariantIds }, file, bag);
  checkInvariantReferences(bundle, methodIds, file, bag);
  checkFailureReferences(bundle, methodIds, file, bag);

  const bundleVectors = loadVectors(bundle.vectorFiles, registry, bag);
  for (const vector of bundleVectors) {
    checkVector(vector, bundle, { methodIds, failureIds, eventIds, invariantIds }, bag, vectorIds);
  }

  return bag.count("error") === before;
}

/**
 * Validate the standalone example documents.
 *
 * An example is a single file with no bundle around it, so there is no manifest to
 * say which document type it demonstrates. Rather than keying off the filename,
 * which would let a rename silently change what is being checked, each example is
 * offered to every document schema and must satisfy exactly one. That also makes
 * the examples a live test of schema disjointness: if two document types ever
 * became mutually satisfiable, an example would validate against both and this
 * check would say so instead of quietly picking the first match.
 */
function validateExamples(
  registry: ReturnType<typeof getSchemaRegistry>,
  bag: DiagnosticBag,
): void {
  if (!existsSync(EXAMPLES_DIR)) {
    bag.error(ErrorCode.IO_ERROR, "The examples directory is missing.", EXAMPLES_DIR);
    return;
  }

  const files = readdirSyncSafe(EXAMPLES_DIR).filter(
    (entry) => entry.endsWith(".yaml") || entry.endsWith(".yml"),
  );
  if (files.length === 0) {
    bag.warn(
      ErrorCode.IO_ERROR,
      "The examples directory contains no documents, so no example is verified to validate.",
      EXAMPLES_DIR,
    );
    return;
  }

  for (const entry of files) {
    const path = join(EXAMPLES_DIR, entry);
    let document: unknown;
    try {
      document = readYamlFile(path);
    } catch (cause) {
      bag.error(
        ErrorCode.PARSE_ERROR,
        cause instanceof Error ? cause.message : String(cause),
        path,
      );
      continue;
    }

    const matches = EXAMPLE_DOCUMENT_SCHEMAS.filter(
      (schema) => registry.validate(schema, document, path).valid,
    );

    if (matches.length === 0) {
      const detailed = registry.validate("profile.schema.json", document, path);
      bag.error(
        ErrorCode.PROFILE_ERROR,
        `Example matches no Estamora document schema. It neither satisfies the profile schema nor any of the collection schemas, so a reader copying it would start from an invalid document. First profile-schema error: ${detailed.errors[0]?.message ?? "none reported"}`,
        path,
      );
      continue;
    }
    if (matches.length > 1) {
      bag.error(
        ErrorCode.SCHEMA_ERROR,
        `Example validates against ${matches.length} document schemas (${matches.join(", ")}), which means the schemas are not disjoint and a consumer cannot tell which document type this file is.`,
        path,
      );
      continue;
    }

    if (matches[0] === "profile.schema.json") {
      const metadata = readMember<{ id?: unknown; version?: unknown }>(document, "profile");
      if (metadata !== undefined) {
        note(
          `example ${entry} is a profile document for ${String(metadata.id)}@${String(metadata.version)}`,
        );
      }
    }
  }
}

/** Read a named object member from a parsed document. */
function readMember<T>(document: unknown, key: string): T | undefined {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return undefined;
  }
  const member = (document as Record<string, unknown>)[key];
  if (typeof member !== "object" || member === null || Array.isArray(member)) {
    return undefined;
  }
  return member as T;
}

/**
 * Check that the vector directories a profile declares match the ones on disk.
 *
 * An undeclared directory means vectors exist that no declaration accounts for,
 * and a declared directory that does not exist means the manifest promises
 * coverage the bundle does not provide. Both make the manifest an unreliable
 * description of the profile, which is exactly what a consumer is entitled to
 * treat it as.
 */
function checkVectorDirectoryDeclaration(bundle: ProfileBundle, bag: DiagnosticBag): void {
  if (!bundle.valid || bundle.profile === undefined) {
    return;
  }
  const vectorsRoot = join(bundle.directory, "vectors");
  const declared = new Set(bundle.profile.includes.vectors);
  const present = new Set(readdirSyncSafe(vectorsRoot).filter((entry) => entry !== "vectors"));

  for (const entry of present) {
    if (!declared.has(entry)) {
      bag.error(
        ErrorCode.PROFILE_ERROR,
        `Vector directory ${JSON.stringify(entry)} exists but is not listed in includes.vectors, so its vectors are not part of the declared bundle and a consumer has no way to know they should run.`,
        join(vectorsRoot, entry),
      );
    }
  }
  for (const entry of declared) {
    if (!present.has(entry)) {
      bag.error(
        ErrorCode.PROFILE_ERROR,
        `includes.vectors declares ${JSON.stringify(entry)} but no such directory exists, so the manifest promises coverage the bundle does not provide.`,
        vectorsRoot,
      );
    }
  }
}

/** Collect ids from a collection and report duplicates. */
function collectIds<T extends { id: string }>(
  collection: readonly T[] | undefined,
  label: string,
  file: string,
  bag: DiagnosticBag,
): ReadonlySet<string> {
  const ids = new Set<string>();
  if (collection === undefined) {
    return ids;
  }
  for (const entry of collection) {
    if (ids.has(entry.id)) {
      bag.error(
        ErrorCode.DUPLICATE_ID_ERROR,
        `Duplicate ${label} id ${JSON.stringify(entry.id)}. A reference to it would resolve to whichever entry a reader found first.`,
        file,
      );
    }
    ids.add(entry.id);
  }
  return ids;
}

function checkDuplicateMethodNames(bundle: ProfileBundle, file: string, bag: DiagnosticBag): void {
  const names = new Map<string, string>();
  for (const method of bundle.methods ?? []) {
    const previous = names.get(method.name);
    if (previous !== undefined) {
      bag.error(
        ErrorCode.DUPLICATE_ID_ERROR,
        `Methods ${JSON.stringify(previous)} and ${JSON.stringify(method.id)} both describe the exported name ${JSON.stringify(method.name)}. The interface would be described twice and could disagree with itself.`,
        file,
      );
    }
    names.set(method.name, method.id);
  }
}

function checkMethodReferences(
  bundle: ProfileBundle,
  known: {
    authorizationIds: ReadonlySet<string>;
    eventIds: ReadonlySet<string>;
    behaviorIds: ReadonlySet<string>;
    failureIds: ReadonlySet<string>;
  },
  file: string,
  bag: DiagnosticBag,
): void {
  for (const method of bundle.methods ?? []) {
    const groups: readonly (readonly [string, readonly string[], ReadonlySet<string>])[] = [
      ["authorization", method.authorization, known.authorizationIds],
      ["events", method.events, known.eventIds],
      ["behaviors", method.behaviors, known.behaviorIds],
      ["failures", method.failures, known.failureIds],
    ];
    for (const [label, references, declared] of groups) {
      for (const reference of references) {
        if (!declared.has(reference)) {
          bag.error(
            ErrorCode.REFERENCE_ERROR,
            `Method ${JSON.stringify(method.id)} references unknown ${label} ${JSON.stringify(reference)}. An unresolvable reference is a requirement that is never enforced.`,
            file,
          );
        }
      }
    }

    const argumentNames = new Set(method.args.map((argument) => argument.name));
    if (argumentNames.size !== method.args.length) {
      bag.error(
        ErrorCode.DUPLICATE_ID_ERROR,
        `Method ${JSON.stringify(method.id)} declares the same argument name more than once.`,
        file,
      );
    }
    for (const argument of method.args) {
      if (argument.authorization?.required === true && method.mutability === "readonly") {
        bag.error(
          ErrorCode.PROFILE_ERROR,
          `Method ${JSON.stringify(method.id)} is read-only yet declares ${JSON.stringify(argument.name)} as authorization-bearing.`,
          file,
        );
      }
    }
  }
}

function checkAuthorizationRules(
  bundle: ProfileBundle,
  methodIds: ReadonlySet<string>,
  failureIds: ReadonlySet<string>,
  file: string,
  bag: DiagnosticBag,
): void {
  const methodsById = new Map((bundle.methods ?? []).map((method) => [method.id, method]));
  for (const rule of bundle.authorization ?? []) {
    for (const methodId of rule.methods) {
      if (!methodIds.has(methodId)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Authorization rule ${JSON.stringify(rule.id)} governs unknown method ${JSON.stringify(methodId)}.`,
          file,
        );
        continue;
      }
      const method = methodsById.get(methodId);
      const arguments_ = new Set((method?.args ?? []).map((argument) => argument.name));
      if (rule.actor.kind === "argument") {
        if (!arguments_.has(rule.actor.argument)) {
          bag.error(
            ErrorCode.REFERENCE_ERROR,
            `Authorization rule ${JSON.stringify(rule.id)} requires authorization from argument ${JSON.stringify(rule.actor.argument)}, which method ${JSON.stringify(methodId)} does not declare.`,
            file,
          );
        }
      }
      for (const covered of rule.coverage.arguments) {
        if (!arguments_.has(covered)) {
          bag.error(
            ErrorCode.REFERENCE_ERROR,
            `Authorization rule ${JSON.stringify(rule.id)} claims coverage of argument ${JSON.stringify(covered)}, which method ${JSON.stringify(methodId)} does not declare.`,
            file,
          );
        }
      }
    }
    for (const outcome of [rule.unauthorized, rule.wrong_actor]) {
      if (outcome.kind === "fail" && !failureIds.has(outcome.failure)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Authorization rule ${JSON.stringify(rule.id)} expects failure ${JSON.stringify(outcome.failure)}, which failures.yaml does not declare.`,
          file,
        );
      }
    }
  }

  const governed = new Set((bundle.authorization ?? []).flatMap((rule) => [...rule.methods]));
  for (const method of bundle.methods ?? []) {
    if (method.requirement === "required" && !governed.has(method.id)) {
      bag.warn(
        ErrorCode.PROFILE_ERROR,
        `Required method ${JSON.stringify(method.id)} is not governed by any authorization rule. Every method must state its authorization expectation explicitly, including the expectation that none is required.`,
        file,
      );
    }
  }
}

function checkEventCorrelations(
  bundle: ProfileBundle,
  eventIds: ReadonlySet<string>,
  invariantIds: ReadonlySet<string>,
  file: string,
  bag: DiagnosticBag,
): void {
  for (const event of bundle.events ?? []) {
    for (const correlation of event.correlations) {
      if (!invariantIds.has(correlation)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Event ${JSON.stringify(event.id)} correlates with unknown invariant ${JSON.stringify(correlation)}.`,
          file,
        );
      }
    }
    for (const ordering of event.ordering) {
      if (!eventIds.has(ordering.before)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Event ${JSON.stringify(event.id)} declares ordering against unknown event ${JSON.stringify(ordering.before)}.`,
          file,
        );
      }
      if (ordering.before === event.id) {
        bag.error(
          ErrorCode.PROFILE_ERROR,
          `Event ${JSON.stringify(event.id)} cannot be ordered against itself.`,
          file,
        );
      }
    }
    if (event.cardinality.min > event.cardinality.max) {
      bag.error(
        ErrorCode.PROFILE_ERROR,
        `Event ${JSON.stringify(event.id)} declares cardinality min ${String(event.cardinality.min)} greater than max ${String(event.cardinality.max)}, which no emission can satisfy.`,
        file,
      );
    }
    const seen = new Set<number>();
    for (const topic of event.topics) {
      if (seen.has(topic.index)) {
        bag.error(
          ErrorCode.PROFILE_ERROR,
          `Event ${JSON.stringify(event.id)} declares topic index ${String(topic.index)} more than once.`,
          file,
        );
      }
      seen.add(topic.index);
    }
  }
}

function checkBehaviorReferences(
  bundle: ProfileBundle,
  known: {
    methodIds: ReadonlySet<string>;
    failureIds: ReadonlySet<string>;
    eventIds: ReadonlySet<string>;
    invariantIds: ReadonlySet<string>;
  },
  file: string,
  bag: DiagnosticBag,
): void {
  for (const rule of bundle.behaviors ?? []) {
    if (!known.methodIds.has(rule.method)) {
      bag.error(
        ErrorCode.REFERENCE_ERROR,
        `Behaviour rule ${JSON.stringify(rule.id)} constrains unknown method ${JSON.stringify(rule.method)}.`,
        file,
      );
      continue;
    }
    const attached = bundle.methods?.find((method) => method.id === rule.method)?.behaviors ?? [];
    if (!attached.includes(rule.id)) {
      bag.warn(
        ErrorCode.PROFILE_ERROR,
        `Behaviour rule ${JSON.stringify(rule.id)} is not listed on method ${JSON.stringify(rule.method)}, so it is only reachable through a vector that names it directly.`,
        file,
      );
    }
    for (const failure of rule.expect_failures) {
      if (!known.failureIds.has(failure)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Behaviour rule ${JSON.stringify(rule.id)} expects unknown failure ${JSON.stringify(failure)}.`,
          file,
        );
      }
    }
    for (const event of [...rule.expect_events, ...rule.forbid_events]) {
      if (!known.eventIds.has(event)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Behaviour rule ${JSON.stringify(rule.id)} references unknown event ${JSON.stringify(event)}.`,
          file,
        );
      }
    }
    for (const invariant of rule.invariants) {
      if (!known.invariantIds.has(invariant)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Behaviour rule ${JSON.stringify(rule.id)} requires unknown invariant ${JSON.stringify(invariant)}.`,
          file,
        );
      }
    }
    const overlap = rule.expect_events.filter((event) => rule.forbid_events.includes(event));
    for (const event of overlap) {
      bag.error(
        ErrorCode.PROFILE_ERROR,
        `Behaviour rule ${JSON.stringify(rule.id)} both requires and forbids event ${JSON.stringify(event)}.`,
        file,
      );
    }
  }
}

function checkInvariantReferences(
  bundle: ProfileBundle,
  methodIds: ReadonlySet<string>,
  file: string,
  bag: DiagnosticBag,
): void {
  for (const invariant of bundle.invariants ?? []) {
    for (const methodId of invariant.scope.methods) {
      if (methodId !== "*" && !methodIds.has(methodId)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Invariant ${JSON.stringify(invariant.id)} is scoped to unknown method ${JSON.stringify(methodId)}. A scope that names nothing means the invariant is never evaluated.`,
          file,
        );
      }
    }
  }
}

function checkFailureReferences(
  bundle: ProfileBundle,
  methodIds: ReadonlySet<string>,
  file: string,
  bag: DiagnosticBag,
): void {
  for (const failure of bundle.failures ?? []) {
    for (const methodId of failure.methods) {
      if (!methodIds.has(methodId)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Failure ${JSON.stringify(failure.id)} is reachable from unknown method ${JSON.stringify(methodId)}.`,
          file,
        );
      }
    }
    const declaring = bundle.methods?.find((method) => method.failures.includes(failure.id));
    if (declaring === undefined) {
      bag.warn(
        ErrorCode.PROFILE_ERROR,
        `Failure ${JSON.stringify(failure.id)} is not listed on any method, so it is only reachable through a vector that names it directly.`,
        file,
      );
    }
  }
}

/** Check one vector against its bundle and against the global id namespace. */
function checkVector(
  loaded: LoadedVector,
  bundle: ProfileBundle,
  known: {
    methodIds: ReadonlySet<string>;
    failureIds: ReadonlySet<string>;
    eventIds: ReadonlySet<string>;
    invariantIds: ReadonlySet<string>;
  },
  bag: DiagnosticBag,
  vectorIds: Map<string, string>,
): void {
  const file = loaded.location;
  const previous = vectorIds.get(loaded.vector?.id ?? "");
  if (loaded.vector !== undefined) {
    if (previous !== undefined) {
      bag.error(
        ErrorCode.DUPLICATE_ID_ERROR,
        `Vector id ${JSON.stringify(loaded.vector.id)} is already used by ${previous}. Vector ids are the reference used in a report, so they must be unique across the repository.`,
        file,
      );
    }
    vectorIds.set(loaded.vector.id, file);
  }
  if (!loaded.valid || loaded.vector === undefined) {
    return;
  }

  const vector = loaded.vector;
  const identity = bundle.identity;
  if (identity !== undefined && vector.profile !== identity.id) {
    bag.error(
      ErrorCode.REFERENCE_ERROR,
      `Vector ${JSON.stringify(vector.id)} declares profile ${JSON.stringify(vector.profile)} but lives in the bundle for ${JSON.stringify(identity.id)}.`,
      file,
    );
  }
  if (identity !== undefined && vector.profile_version !== identity.version) {
    bag.error(
      ErrorCode.VERSION_ERROR,
      `Vector ${JSON.stringify(vector.id)} targets profile version ${JSON.stringify(vector.profile_version)} but the bundle is version ${JSON.stringify(identity.version)}.`,
      file,
    );
  }

  const method = bundle.methods?.find((candidate) => candidate.id === vector.method);
  if (method === undefined) {
    bag.error(
      ErrorCode.REFERENCE_ERROR,
      `Vector ${JSON.stringify(vector.id)} exercises unknown method ${JSON.stringify(vector.method)}.`,
      file,
    );
  } else {
    const declared = new Set(method.args.map((argument) => argument.name));
    for (const name of Object.keys(vector.inputs)) {
      if (!declared.has(name)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Vector ${JSON.stringify(vector.id)} supplies input ${JSON.stringify(name)}, which method ${JSON.stringify(method.id)} does not declare. An input the contract will never receive means the vector is not testing what it claims.`,
          file,
        );
      }
    }
    for (const argument of method.args) {
      if (!Object.hasOwn(vector.inputs, argument.name)) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Vector ${JSON.stringify(vector.id)} omits input ${JSON.stringify(argument.name)}, which method ${JSON.stringify(method.id)} requires. The runner would have to invent a value, which would make the vector non-deterministic.`,
          file,
        );
      }
    }
  }

  if (vector.expected.outcome === "failure") {
    if (vector.expected.failure_category !== undefined) {
      bag.error(
        ErrorCode.PROFILE_ERROR,
        `Vector ${JSON.stringify(vector.id)} names the semantic category ${JSON.stringify(vector.expected.failure_category)} instead of a failure from this profile. A vector inside a bundle can always name the exact failure definition it expects, so it must; the category form exists only for profile-independent vectors, which are intentionally less specific.`,
        file,
      );
    }
    const failure = vector.expected.failure;
    if (failure !== undefined && !known.failureIds.has(failure)) {
      bag.error(
        ErrorCode.REFERENCE_ERROR,
        `Vector ${JSON.stringify(vector.id)} expects unknown failure ${JSON.stringify(failure)}.`,
        file,
      );
    }
  }

  for (const invariant of vector.expected.invariants) {
    if (!known.invariantIds.has(invariant)) {
      bag.error(
        ErrorCode.REFERENCE_ERROR,
        `Vector ${JSON.stringify(vector.id)} asserts unknown invariant ${JSON.stringify(invariant)}.`,
        file,
      );
    }
  }

  for (const expectation of vector.expected.events.required) {
    if (!known.eventIds.has(expectation.event)) {
      bag.error(
        ErrorCode.REFERENCE_ERROR,
        `Vector ${JSON.stringify(vector.id)} requires unknown event ${JSON.stringify(expectation.event)}.`,
        file,
      );
    }
  }
  for (const forbidden of vector.expected.events.forbidden) {
    if (!known.eventIds.has(forbidden)) {
      bag.error(
        ErrorCode.REFERENCE_ERROR,
        `Vector ${JSON.stringify(vector.id)} forbids unknown event ${JSON.stringify(forbidden)}.`,
        file,
      );
    }
  }

  const forbiddenAndRequired = vector.expected.events.forbidden.filter((forbidden) =>
    vector.expected.events.required.some((expectation) => expectation.event === forbidden),
  );
  for (const event of forbiddenAndRequired) {
    bag.error(
      ErrorCode.PROFILE_ERROR,
      `Vector ${JSON.stringify(vector.id)} both requires and forbids event ${JSON.stringify(event)}.`,
      file,
    );
  }
}

/** Validate the shared vector library, whose entries are not inside a bundle. */
function validateSharedVectorSets(
  registry: ReturnType<typeof getSchemaRegistry>,
  bag: DiagnosticBag,
  vectorIds: Map<string, string>,
  profileIndex: Map<string, ProfileIdIndex>,
): void {
  if (!existsSync(VECTORS_DIR)) {
    bag.error(
      ErrorCode.VECTOR_ERROR,
      "The shared vector library directory is missing.",
      VECTORS_DIR,
    );
    return;
  }
  for (const set of readdirSyncSafe(VECTORS_DIR)) {
    const setPath = join(VECTORS_DIR, set);
    const files = collectYaml(setPath);
    const loaded = loadVectors(files, registry, bag);
    for (const vector of loaded) {
      if (vector.vector === undefined) {
        continue;
      }
      const previous = vectorIds.get(vector.vector.id);
      if (previous !== undefined) {
        bag.error(
          ErrorCode.DUPLICATE_ID_ERROR,
          `Vector id ${JSON.stringify(vector.vector.id)} is already used by ${previous}.`,
          vector.location,
        );
      }
      vectorIds.set(vector.vector.id, vector.location);
      if (set !== "common" && vector.vector.profile !== set) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Vector ${JSON.stringify(vector.vector.id)} lives in shared set ${JSON.stringify(set)} but declares profile ${JSON.stringify(vector.vector.profile)}.`,
          vector.location,
        );
      }
      if (set === "common" && vector.vector.profile !== WILDCARD_PROFILE) {
        bag.error(
          ErrorCode.PROFILE_ERROR,
          `Shared vector ${JSON.stringify(vector.vector.id)} is under the profile-independent set but declares profile ${JSON.stringify(vector.vector.profile)}; use ${JSON.stringify(WILDCARD_PROFILE)} instead.`,
          vector.location,
        );
      }
      if (set === "common") {
        if (vector.vector.expected.failure !== undefined) {
          bag.error(
            ErrorCode.PROFILE_ERROR,
            `Profile-independent vector ${JSON.stringify(vector.vector.id)} names failure ${JSON.stringify(vector.vector.expected.failure)}, which belongs to no bundle. Use failure_category instead.`,
            vector.location,
          );
        }
        continue;
      }
      const index = profileIndex.get(set);
      if (index === undefined) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Shared vector set ${JSON.stringify(set)} matches no profile declared in this repository, so its vectors cannot be checked for unresolvable references.`,
          VECTORS_DIR,
        );
        continue;
      }
      checkSharedVectorReferences(vector, index, bag);
    }
  }
}

/**
 * Check that a shared profile-specific vector's references resolve against the
 * profile it declares. Without this, the shared library would be the one place
 * a vector could name a method or event that does not exist and still pass
 * validation, which is exactly the kind of silent gap this tool exists to close.
 */
function checkSharedVectorReferences(
  loaded: LoadedVector,
  index: ProfileIdIndex,
  bag: DiagnosticBag,
): void {
  const vector = loaded.vector;
  if (vector === undefined) {
    return;
  }
  const check = (kind: string, id: string, declared: ReadonlySet<string>): void => {
    if (!declared.has(id)) {
      bag.error(
        ErrorCode.REFERENCE_ERROR,
        `Shared vector ${JSON.stringify(vector.id)} references unknown ${kind} ${JSON.stringify(id)} on profile ${JSON.stringify(vector.profile)}.`,
        loaded.location,
      );
    }
  };
  check("method", vector.method, index.methods);
  if (vector.expected.failure !== undefined) {
    check("failure", vector.expected.failure, index.failures);
  }
  for (const invariant of vector.expected.invariants) {
    check("invariant", invariant, index.invariants);
  }
  for (const expectation of vector.expected.events.required) {
    check("event", expectation.event, index.events);
  }
  for (const forbidden of vector.expected.events.forbidden) {
    check("event", forbidden, index.events);
  }
}

function collectYaml(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSyncSafe(directory)) {
    const entryPath = join(directory, entry);
    for (const child of readdirSyncSafe(entryPath)) {
      if (child.endsWith(".yaml") || child.endsWith(".yml")) {
        files.push(join(entryPath, child));
      }
    }
  }
  return files.sort();
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  handleCliError(
    PROGRAM,
    "Validate every Estamora conformance profile bundle.",
    COMMON_FLAGS,
    error,
  );
}
