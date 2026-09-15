#!/usr/bin/env node
/**
 * Validate the vector corpus.
 *
 * `validate-profiles` answers whether a profile's documents agree with each
 * other. This entry point answers a different question: whether the vectors are
 * actually trustworthy as artifacts. A vector can be structurally valid and still
 * be useless, and the failure modes are specific:
 *
 * - it names a fixture account that the fixture block never declares, so the
 *   runner has nothing to bind the reference to;
 * - it supplies an address where the method declares an integer amount, so the
 *   vector describes a call the contract cannot receive;
 * - it states an amount as a decimal or in exponent notation, where the schema
 *   only requires a string, so the value silently loses precision;
 * - it declares an expectation against an event with the wrong number of topics,
 *   so the assertion can never match;
 * - a profile has no negative vectors at all, which is the case Estamora exists
 *   to make impossible, because a suite of only successful calls cannot establish
 *   behavioural conformance.
 *
 * It also computes a digest of the whole corpus, which is the identity the runner
 * records in a conformance receipt so that a result can be attributed to an exact
 * set of vectors rather than to "whatever was in the repository at the time".
 */

import {
  booleanFlag,
  combineDigests,
  COMMON_FLAGS,
  DiagnosticBag,
  digestOfValue,
  discoverProfileDirectories,
  discoverSharedVectorSets,
  ErrorCode,
  EXIT_CODES,
  getSchemaRegistry,
  handleCliError,
  isJsonObject,
  loadProfileBundle,
  loadVectors,
  note,
  parseArgs,
  prettyJson,
  PROFILES_DIR,
  reportSummary,
  usage,
  WILDCARD_PROFILE,
  type LoadedVector,
  type MethodDefinition,
  type ProfileBundle,
  type TypeExpr,
  type ValueExpr,
} from "./lib/index.ts";

const PROGRAM = "estamora-check-vectors";

/** Vector kinds whose absence makes a profile unable to establish conformance. */
const MANDATORY_KINDS = ["negative"] as const;

/** Vector kinds whose absence is recorded but does not fail the run. */
const EXPECTED_KINDS = [
  "positive",
  "negative",
  "authorization",
  "event",
  "state",
  "invariant",
] as const;

/** Integer primitive names, which must receive exact integer values. */
const INTEGER_PRIMITIVES = new Set(["i128", "u128", "i64", "u64", "i32", "u32"]);

/** Address primitive names, which must receive fixture actor references. */
const ADDRESS_PRIMITIVES = new Set(["address", "muxed_address"]);

function main(argv: readonly string[]): number {
  const args = parseArgs(argv, COMMON_FLAGS);
  if (booleanFlag(args, "help")) {
    process.stdout.write(
      `${usage(PROGRAM, "Validate the Estamora vector corpus for internal consistency.", COMMON_FLAGS)}\n`,
    );
    return EXIT_CODES.SUCCESS;
  }

  const bag = new DiagnosticBag();
  const registry = getSchemaRegistry();

  // Bundles are loaded with a throwaway diagnostic bag: profile-level defects are
  // `validate-profiles`'s responsibility, and duplicating them here would report
  // the same problem twice from two different commands.
  const bundles = discoverProfileDirectories(PROFILES_DIR).map((directory) =>
    loadProfileBundle(directory, registry, new DiagnosticBag()),
  );

  const sharedVectors: LoadedVector[] = [];
  for (const [, files] of discoverSharedVectorSets(new DiagnosticBag())) {
    sharedVectors.push(...loadVectors(files, registry, bag));
  }

  const bundleVectors: { bundle: ProfileBundle; vector: LoadedVector }[] = [];
  for (const bundle of bundles) {
    for (const vector of loadVectors(bundle.vectorFiles, registry, bag)) {
      bundleVectors.push({ bundle, vector });
    }
  }

  for (const { bundle, vector } of bundleVectors) {
    checkVectorIntegrity(vector, bundle, bag);
  }
  for (const vector of sharedVectors) {
    checkSharedVectorIntegrity(vector, bag);
  }

  checkProfileCoverage(bundles, bundleVectors, bag);
  checkOrphanVectors(sharedVectors, bundles, bag);

  const corpusDigest = digestCorpus([
    ...bundleVectors.map((entry) => entry.vector),
    ...sharedVectors,
  ]);
  note(`vector corpus digest: ${corpusDigest}`);

  const total = bundleVectors.length + sharedVectors.length;
  const ok = reportSummary(`vector checks across ${total} vector(s)`, bag);
  if (booleanFlag(args, "json")) {
    process.stdout.write(
      prettyJson({ ok, corpus_digest: corpusDigest, diagnostics: bag.toJSON() }),
    );
  }
  return ok ? EXIT_CODES.SUCCESS : EXIT_CODES.DEFECTS_FOUND;
}

/** Check a vector that lives inside a profile bundle. */
function checkVectorIntegrity(
  loaded: LoadedVector,
  bundle: ProfileBundle,
  bag: DiagnosticBag,
): void {
  if (!loaded.valid || loaded.vector === undefined) {
    return;
  }
  const vector = loaded.vector;
  const file = loaded.location;
  const method = bundle.methods?.find((candidate) => candidate.id === vector.method);

  checkFixtureIntegrity(loaded, bag);
  if (method !== undefined) {
    checkInputTypes(vector, method, bag, file);
    checkReturnType(vector, method, bag, file);
    checkEventArity(vector, bundle, bag, file);
  }
}

/** Check a vector from the shared library, which has no bundle context. */
function checkSharedVectorIntegrity(loaded: LoadedVector, bag: DiagnosticBag): void {
  if (!loaded.valid || loaded.vector === undefined) {
    return;
  }
  checkFixtureIntegrity(loaded, bag);
}

/**
 * Check that fixture references resolve and that amounts are exact integers.
 *
 * Both checks exist because the schema deliberately keeps amounts as free-form
 * strings. That is the right choice for precision, but it means nothing prevents
 * a fixture from writing `1.5` or `1e3`, and a value that loses precision
 * silently weakens every assertion that reads it.
 */
function checkFixtureIntegrity(loaded: LoadedVector, bag: DiagnosticBag): void {
  const vector = loaded.vector;
  if (vector === undefined) {
    return;
  }
  const file = loaded.location;
  const declared = new Set(vector.fixtures.actors.map((actor) => actor.name));

  const checkAccountName = (name: string, where: string): void => {
    if (!declared.has(name)) {
      bag.error(
        ErrorCode.REFERENCE_ERROR,
        `Vector ${JSON.stringify(vector.id)} refers to account ${JSON.stringify(name)} in ${where}, which the fixtures block does not declare. The runner has nothing to bind the reference to.`,
        file,
      );
    }
  };

  for (const name of Object.keys(vector.fixtures.balances)) {
    checkAccountName(name, "fixtures.balances");
  }
  for (const name of Object.keys(vector.fixtures.authorization)) {
    checkAccountName(name, "fixtures.authorization");
  }
  for (const allowance of vector.fixtures.allowances) {
    checkAccountName(allowance.from, "fixtures.allowances[].from");
    checkAccountName(allowance.spender, "fixtures.allowances[].spender");
  }

  for (const actor of vector.authorization.actors) {
    checkAccountName(actor, "authorization.actors");
  }
  for (const actor of vector.authorization.substituted_for ?? []) {
    checkAccountName(actor, "authorization.substituted_for");
  }

  for (const name of collectActorRefs(vector)) {
    checkAccountName(name, "an expression");
  }

  const amountFields: readonly (readonly [string, string])[] = [
    ...Object.entries(vector.fixtures.balances),
    ...vector.fixtures.allowances.map(
      (allowance) => [`${allowance.from}->${allowance.spender}`, allowance.amount] as const,
    ),
  ];
  for (const [label, amount] of amountFields) {
    if (!/^(0|-?[1-9][0-9]*)$/.test(amount)) {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vector.id)} states the amount ${JSON.stringify(amount)} for ${label}, which is not an exact integer. Amounts are strings precisely so they cannot lose precision, and a non-integer defeats that.`,
        file,
      );
    }
  }
}

/** Check an input's value form against the method's declared argument type. */
function checkInputTypes(
  vector: NonNullable<LoadedVector["vector"]>,
  method: MethodDefinition,
  bag: DiagnosticBag,
  file: string,
): void {
  for (const argument of method.args) {
    const value = vector.inputs[argument.name];
    if (value === undefined) {
      continue;
    }
    checkValueAgainstType(vector.id, argument.name, value, argument.type, bag, file);
  }
}

/** Check the expected return against the method's declared return type. */
function checkReturnType(
  vector: NonNullable<LoadedVector["vector"]>,
  method: MethodDefinition,
  bag: DiagnosticBag,
  file: string,
): void {
  const expected = vector.expected.returns;
  if (expected === undefined) {
    if (method.returns.type.kind !== "prim" || method.returns.type.name === "void") {
      return;
    }
    // A vector may assert the returned value through a state assertion that
    // reads the same method instead of through `expected.returns`. Warning in
    // that case would be noise, because the value is checked either way.
    const readMethods = collectReadMethods(vector.expected.state_assertions);
    for (const assertion of vector.assertions) {
      for (const name of collectReadMethods(assertion.predicate)) {
        readMethods.add(name);
      }
    }
    if (readMethods.has(method.name)) {
      return;
    }
    bag.warn(
      ErrorCode.VECTOR_ERROR,
      `Vector ${JSON.stringify(vector.id)} does not assert a return value, but method ${JSON.stringify(method.id)} declares one of type ${describeType(method.returns.type)}. A vector that ignores the return value cannot detect an accessor that returns the wrong thing.`,
      file,
    );
    return;
  }
  if (method.returns.type.kind === "prim" && method.returns.type.name === "void") {
    bag.error(
      ErrorCode.VECTOR_ERROR,
      `Vector ${JSON.stringify(vector.id)} asserts a return value, but method ${JSON.stringify(method.id)} declares a void return.`,
      file,
    );
    return;
  }
  checkValueAgainstType(vector.id, "expected.returns", expected, method.returns.type, bag, file);
}

/** Check that an expected event's topics and data match its declaration. */
function checkEventArity(
  vector: NonNullable<LoadedVector["vector"]>,
  bundle: ProfileBundle,
  bag: DiagnosticBag,
  file: string,
): void {
  for (const expectation of vector.expected.events.required) {
    const declared = bundle.events?.find((event) => event.id === expectation.event);
    if (declared === undefined) {
      continue;
    }
    if (expectation.topics.length !== declared.topics.length) {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vector.id)} supplies ${String(expectation.topics.length)} topic(s) for event ${JSON.stringify(expectation.event)}, which declares ${String(declared.topics.length)}. A positional expectation with the wrong arity can never match, so the assertion would silently never hold.`,
        file,
      );
    }
    // Data arity is a range, not a fixed count, because a payload field may be
    // legitimately absent: the multiplexing id of a destination is present only
    // when the address carries one, and requiring it would reject conforming
    // observations.
    const requiredFields = declared.data.fields.filter((field) => !field.optional).length;
    const maximumFields = declared.data.fields.length;
    if (expectation.data.length < requiredFields || expectation.data.length > maximumFields) {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vector.id)} supplies ${String(expectation.data.length)} data entr(ies) for event ${JSON.stringify(expectation.event)}, which accepts between ${String(requiredFields)} and ${String(maximumFields)}. A payload expectation with the wrong arity can never match, so the assertion would silently never hold.`,
        file,
      );
    }
  }
}

/** Report profiles whose vector suite cannot establish conformance. */
function checkProfileCoverage(
  bundles: readonly ProfileBundle[],
  bundleVectors: readonly { bundle: ProfileBundle; vector: LoadedVector }[],
  bag: DiagnosticBag,
): void {
  for (const bundle of bundles) {
    if (!bundle.valid || bundle.identity === undefined) {
      continue;
    }
    const kinds = new Set<string>();
    const coveredMethods = new Set<string>();
    for (const entry of bundleVectors) {
      if (entry.bundle.directory !== bundle.directory || entry.vector.vector === undefined) {
        continue;
      }
      kinds.add(entry.vector.vector.kind);
      coveredMethods.add(entry.vector.vector.method);
    }

    for (const kind of MANDATORY_KINDS) {
      if (!kinds.has(kind)) {
        bag.error(
          ErrorCode.VECTOR_ERROR,
          `Profile ${JSON.stringify(bundle.identity.id)} has no ${JSON.stringify(kind)} vectors. Negative vectors are mandatory because behavioural conformance cannot be established by testing only successful calls: a contract that silently succeeds where the specification requires a rejection is invisible to a suite of positive cases.`,
          bundle.location,
        );
      }
    }
    for (const kind of EXPECTED_KINDS) {
      if (!kinds.has(kind)) {
        bag.warn(
          ErrorCode.VECTOR_ERROR,
          `Profile ${JSON.stringify(bundle.identity.id)} has no ${JSON.stringify(kind)} vector. The dimension is only represented in the rules, never exercised by a vector.`,
          bundle.location,
        );
      }
    }

    for (const method of bundle.methods ?? []) {
      if (method.requirement === "required" && !coveredMethods.has(method.id)) {
        bag.warn(
          ErrorCode.VECTOR_ERROR,
          `Required method ${JSON.stringify(method.id)} of profile ${JSON.stringify(bundle.identity.id)} has no vector of its own. Its requirements are stated but never executed.`,
          bundle.location,
        );
      }
    }
  }
}

/** Warn about shared vectors that no profile declares. */
function checkOrphanVectors(
  sharedVectors: readonly LoadedVector[],
  bundles: readonly ProfileBundle[],
  bag: DiagnosticBag,
): void {
  const consumed = new Set<string>();
  for (const bundle of bundles) {
    for (const set of bundle.profile?.includes.shared_vectors ?? []) {
      consumed.add(set);
    }
  }
  for (const vector of sharedVectors) {
    if (vector.vector === undefined) {
      continue;
    }
    const profile = vector.vector.profile;
    if (profile !== WILDCARD_PROFILE && !consumed.has(profile)) {
      bag.warn(
        ErrorCode.VECTOR_ERROR,
        `Shared vector ${JSON.stringify(vector.vector.id)} belongs to set ${JSON.stringify(profile)}, which no profile declares in includes.shared_vectors. It would never be executed.`,
        vector.location,
      );
    }
  }
  for (const bundle of bundles) {
    for (const set of bundle.profile?.includes.shared_vectors ?? []) {
      if (set === "common") {
        continue;
      }
      const known = bundles.some((candidate) => candidate.identity?.id === set);
      if (!known) {
        bag.error(
          ErrorCode.REFERENCE_ERROR,
          `Profile ${JSON.stringify(bundle.identity?.id ?? bundle.location)} consumes shared vector set ${JSON.stringify(set)}, which no profile in this repository declares.`,
          bundle.location,
        );
      }
    }
  }
}

/** Compare a value expression's form against a declared type. */
function checkValueAgainstType(
  vectorId: string,
  label: string,
  value: ValueExpr,
  type: TypeExpr,
  bag: DiagnosticBag,
  file: string,
): void {
  if (type.kind !== "prim") {
    return;
  }
  const primitive = type.name;

  if (INTEGER_PRIMITIVES.has(primitive)) {
    if (value.kind === "actor") {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vectorId)} supplies an account reference for ${JSON.stringify(label)}, which the method declares as ${primitive}. The runner would pass an address where a quantity is expected.`,
        file,
      );
      return;
    }
    if (value.kind === "literal" && typeof value.value === "string") {
      if (!/^(0|-?[1-9][0-9]*)$/.test(value.value)) {
        bag.error(
          ErrorCode.VECTOR_ERROR,
          `Vector ${JSON.stringify(vectorId)} supplies ${JSON.stringify(value.value)} for ${JSON.stringify(label)}, which the method declares as ${primitive}. Integer amounts must be written as exact integer strings so they cannot lose precision.`,
          file,
        );
      }
    }
    if (value.kind === "literal" && typeof value.value === "boolean") {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vectorId)} supplies a boolean for ${JSON.stringify(label)}, which the method declares as ${primitive}.`,
        file,
      );
    }
    return;
  }

  if (ADDRESS_PRIMITIVES.has(primitive)) {
    if (value.kind === "literal") {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vectorId)} supplies the literal ${JSON.stringify(value.value)} for ${JSON.stringify(label)}, which the method declares as ${primitive}. Addresses must be referenced through the fixtures block so that the same account is used consistently across vectors.`,
        file,
      );
    }
    return;
  }

  if (primitive === "bool") {
    if (value.kind === "literal" && typeof value.value !== "boolean") {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vectorId)} supplies a non-boolean value for ${JSON.stringify(label)}, which the method declares as bool.`,
        file,
      );
    }
    return;
  }

  if (primitive === "symbol" || primitive === "string") {
    if (value.kind === "literal" && typeof value.value !== "string") {
      bag.error(
        ErrorCode.VECTOR_ERROR,
        `Vector ${JSON.stringify(vectorId)} supplies a non-string value for ${JSON.stringify(label)}, which the method declares as ${primitive}.`,
        file,
      );
    }
  }
}

/** Render a type expression compactly for a diagnostic message. */
function describeType(type: TypeExpr): string {
  switch (type.kind) {
    case "prim":
      return type.width === undefined ? type.name : `${type.name}<${String(type.width)}>`;
    case "vec":
      return `vec<${describeType(type.element)}>`;
    case "option":
      return `option<${describeType(type.some)}>`;
    case "map":
      return `map<${describeType(type.key)}, ${describeType(type.value)}>`;
    case "tuple":
      return `tuple(${type.elements.map(describeType).join(", ")})`;
    case "result":
      return `result<${describeType(type.ok)}, ${describeType(type.err)}>`;
    case "custom":
      return type.name;
  }
}

/**
 * Collect the contract methods read anywhere inside an expression tree.
 *
 * A generic walk is used rather than a typed traversal because predicates nest
 * arbitrarily through `all_of`, `any_of` and `not`, and a typed walk would need
 * updating every time the predicate vocabulary grows.
 */
function collectReadMethods(root: unknown): Set<string> {
  const methods = new Set<string>();
  const seen = new Set<unknown>();

  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null || seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const element of node) {
        visit(element);
      }
      return;
    }
    if (isJsonObject(node)) {
      if (node["kind"] === "read" && typeof node["method"] === "string") {
        methods.add(node["method"]);
      }
      for (const member of Object.values(node)) {
        visit(member);
      }
    }
  };

  visit(root);
  return methods;
}

/** Collect every fixture actor name referenced anywhere in a vector. */
function collectActorRefs(root: unknown): ReadonlySet<string> {
  const refs = new Set<string>();
  const seen = new Set<unknown>();

  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null || seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const element of node) {
        visit(element);
      }
      return;
    }
    if (isJsonObject(node) && node["kind"] === "actor" && typeof node["ref"] === "string") {
      refs.add(node["ref"]);
    }
    for (const member of Object.values(node)) {
      visit(member);
    }
  };

  visit(root);
  return refs;
}

/**
 * Digest the whole corpus so a receipt can name the exact vector set it was
 * measured against. Vectors are sorted by id and hashed individually first, so
 * that adding a vector to one set does not perturb the contribution of any
 * other, which makes a changed digest easy to attribute.
 */
function digestCorpus(vectors: readonly LoadedVector[]): string {
  const byId = new Map<string, string>();
  for (const vector of vectors) {
    if (vector.vector === undefined) {
      continue;
    }
    byId.set(vector.vector.id, digestOfValue(vector.vector));
  }
  const ordered = [...byId.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return combineDigests(ordered.map(([, digest]) => digest as `sha256:${string}`));
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  handleCliError(
    PROGRAM,
    "Validate the Estamora vector corpus for internal consistency.",
    COMMON_FLAGS,
    error,
  );
}
