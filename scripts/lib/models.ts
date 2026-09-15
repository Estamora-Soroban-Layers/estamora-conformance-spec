/**
 * The Estamora domain model.
 *
 * These types are the TypeScript mirror of the `schema/` JSON Schemas. They
 * exist for two reasons:
 *
 * 1. They let the validators reason about a loaded profile with real types
 *    instead of casting `unknown` at every use site.
 * 2. They are the contract between this repository and the runner. If a
 *    schema changes and these types do not, `tsc --noEmit` fails.
 *
 * Every union below is discriminated by a `kind` member. That is a deliberate
 * choice over the terser single-key form (`{actor: alice}`) because it keeps
 * YAML unambiguous and lets JSON Schema's `discriminator` keyword produce
 * precise error messages.
 */

import type { JsonValue } from "./json.ts";

/* -------------------------------------------------------------------------- */
/* Identity and lifecycle                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Lifecycle status of a profile.
 *
 * - `draft` — under active authoring; requirements may change without notice.
 * - `experimental` — complete enough to execute, not yet reviewed as stable.
 * - `stable` — reviewed; behavioural changes require a version bump.
 * - `deprecated` — retained for historical results; must name a successor.
 */
export type ProfileStatus = "draft" | "experimental" | "stable" | "deprecated";

/** Lifecycle status of a single requirement inside a profile. */
export type RequirementStatus = "required" | "optional" | "forbidden";

/** Version of the Estamora *format* a document is written against. */
export type SpecFormatVersion = string;

/* -------------------------------------------------------------------------- */
/* Type expressions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Soroban-compatible primitive type names.
 *
 * The list is intentionally closed. An open list would let profiles invent
 * type names that the runner cannot map onto `soroban-sdk` types, and an
 * unmappable type is a requirement nobody can check.
 */
export type PrimitiveTypeName =
  | "address"
  | "muxed_address"
  | "i128"
  | "u128"
  | "i64"
  | "u64"
  | "i32"
  | "u32"
  | "bool"
  | "symbol"
  | "string"
  | "bytes"
  | "bytes_n"
  | "void"
  | "val"
  | "timepoint"
  | "duration";

/**
 * A machine-readable representation of a contract parameter or return type.
 *
 * This is a small structural type language, not a Rust parser. It is
 * deliberately language-neutral: the runner maps these nodes onto
 * `soroban_sdk::Spec` type descriptors, and a profile author never writes
 * Rust to describe an interface.
 */
export type TypeExpr =
  | { readonly kind: "prim"; readonly name: PrimitiveTypeName; readonly width?: number }
  | { readonly kind: "vec"; readonly element: TypeExpr }
  | { readonly kind: "option"; readonly some: TypeExpr }
  | { readonly kind: "map"; readonly key: TypeExpr; readonly value: TypeExpr }
  | { readonly kind: "tuple"; readonly elements: readonly TypeExpr[] }
  | { readonly kind: "result"; readonly ok: TypeExpr; readonly err: TypeExpr }
  | { readonly kind: "custom"; readonly name: string; readonly description?: string };

/* -------------------------------------------------------------------------- */
/* Value expressions and predicates                                           */
/* -------------------------------------------------------------------------- */

/**
 * A value evaluated during a conformance run.
 *
 * The algebra is total and non-Turing-complete on purpose. A profile must be
 * able to say "Alice's balance decreases by the transferred amount" without
 * shipping executable code, because a profile is untrusted input.
 */
export type ValueExpr =
  | { readonly kind: "literal"; readonly value: string | number | boolean | null }
  /** A named account or contract declared in the vector's fixtures. */
  | { readonly kind: "actor"; readonly ref: string }
  /** A value bound to an argument of the operation under test. */
  | { readonly kind: "input"; readonly name: string }
  /** A read-only invocation of the contract, e.g. `balance(alice)`. */
  | {
      readonly kind: "read";
      readonly method: string;
      readonly args: readonly ValueExpr[];
    }
  /** Aggregate over a resource set, e.g. the sum of all balances. */
  | { readonly kind: "sum"; readonly over: string }
  /** The ledger sequence fixed by the vector fixture. */
  | { readonly kind: "ledger_sequence" }
  /** The ledger at which a fixture-declared allowance expires. */
  | {
      readonly kind: "allowance_expiry";
      readonly from: ValueExpr;
      readonly spender: ValueExpr;
    }
  /** The current member of the resource set an invariant ranges over. */
  | { readonly kind: "resource_member" }
  | { readonly kind: "field"; readonly of: ValueExpr; readonly field: string }
  | {
      readonly kind: "arithmetic";
      readonly op: "+" | "-" | "*" | "/";
      readonly operands: readonly ValueExpr[];
    };

/** A comparison evaluated against the observed execution. */
export type Predicate =
  | { readonly kind: "equal"; readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly kind: "not_equal"; readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly kind: "less_than"; readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly kind: "less_or_equal"; readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly kind: "greater_than"; readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly kind: "greater_or_equal"; readonly left: ValueExpr; readonly right: ValueExpr }
  | { readonly kind: "one_of"; readonly value: ValueExpr; readonly allowed: readonly ValueExpr[] }
  | {
      readonly kind: "in_range";
      readonly value: ValueExpr;
      readonly min: ValueExpr;
      readonly max: ValueExpr;
    }
  /**
   * Relative assertion: the observed value changed in a given direction,
   * optionally by an exact amount. This is how a profile states "Bob's
   * balance increased by 250" without re-stating Bob's absolute balance.
   */
  | {
      readonly kind: "delta";
      readonly target: ValueExpr;
      readonly direction: "increase" | "decrease" | "unchanged";
      readonly by?: ValueExpr;
    }
  | { readonly kind: "unchanged"; readonly target: ValueExpr }
  | { readonly kind: "all_of"; readonly predicates: readonly Predicate[] }
  | { readonly kind: "any_of"; readonly predicates: readonly Predicate[] }
  | { readonly kind: "not"; readonly predicate: Predicate };

/* -------------------------------------------------------------------------- */
/* Methods                                                                    */
/* -------------------------------------------------------------------------- */

/** Whether invoking the method mutates contract state. */
export type Mutability = "readonly" | "mutating";

/** One parameter of a contract method. */
export interface MethodArgument {
  readonly name: string;
  readonly type: TypeExpr;
  /** Human-readable meaning, required because names alone are ambiguous. */
  readonly semantics: string;
  /**
   * Whether this argument must be covered by the caller's authorization.
   * `undefined` means "not an authorization-bearing argument".
   */
  readonly authorization?: ArgumentAuthorization;
}

/** How an argument participates in authorization. */
export interface ArgumentAuthorization {
  /** Whether this argument must appear in the authorization payload. */
  readonly required: boolean;
  /** Why, in terms of the upstream specification. */
  readonly semantics: string;
}

/** The declared return of a contract method. */
export interface MethodReturn {
  readonly type: TypeExpr;
  /** Human-readable meaning of the returned value. */
  readonly semantics: string;
}

/** How the contract is expected to be reached during a run. */
export type InvocationMode = "invoke" | "read_only" | "simulate";

/** A method requirement inside a profile. */
export interface MethodDefinition {
  readonly id: string;
  readonly name: string;
  readonly requirement: RequirementStatus;
  readonly summary: string;
  readonly description?: string;
  readonly args: readonly MethodArgument[];
  readonly returns: MethodReturn;
  readonly mutability: Mutability;
  readonly invocation: InvocationMode;
  /** Ids of `authorization.yaml` rules that govern this method. */
  readonly authorization: readonly string[];
  /** Ids of `events.yaml` definitions this method may emit. */
  readonly events: readonly string[];
  /** Ids of `failures.yaml` definitions reachable from this method. */
  readonly failures: readonly string[];
  /** Ids of `behavior.yaml` rules attached to this method. */
  readonly behaviors: readonly string[];
  readonly notes?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Authorization                                                              */
/* -------------------------------------------------------------------------- */

/** Which principal is expected to authorize an invocation. */
export type AuthorizationActor =
  | { readonly kind: "argument"; readonly argument: string }
  | { readonly kind: "invoker" }
  | { readonly kind: "none" };

/** How the set of authorizing arguments must relate to the required set. */
export type AuthorizationCoverageMode = "exact" | "at_least" | "at_most";

/** Expected outcome of an authorization-related invocation. */
export type AuthorizationOutcome =
  { readonly kind: "succeed" } | { readonly kind: "fail"; readonly failure: string };

/** A first-class authorization requirement. */
export interface AuthorizationRule {
  readonly id: string;
  readonly summary: string;
  readonly description?: string;
  /** Method ids this rule governs. */
  readonly methods: readonly string[];
  readonly actor: AuthorizationActor;
  readonly coverage: {
    readonly mode: AuthorizationCoverageMode;
    readonly arguments: readonly string[];
  };
  /** What happens when no valid authorization is supplied. */
  readonly unauthorized: AuthorizationOutcome;
  /** What happens when a different principal authorizes. */
  readonly wrong_actor: AuthorizationOutcome;
  /** Whether replaying the same authorization must be rejected. */
  readonly replay_sensitive: boolean;
  readonly notes?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/** The encoded shape of an event's data payload. */
export type EventDataFormat = "scalar" | "vec" | "map" | "either";

/** Where an event field's expected value comes from. */
export type EventBinding =
  | { readonly kind: "literal"; readonly value: string | number | boolean | null }
  | { readonly kind: "actor"; readonly ref: string }
  | { readonly kind: "input"; readonly name: string }
  | { readonly kind: "state_after"; readonly resource: string; readonly target: string }
  | { readonly kind: "read"; readonly method: string; readonly args: readonly ValueExpr[] };

/** One position within an event's topic list. */
export interface EventTopic {
  readonly index: number;
  readonly type: TypeExpr;
  readonly binding: EventBinding;
  readonly semantics: string;
}

/** One named entry of an event's data payload. */
export interface EventDataField {
  readonly name: string;
  readonly type: TypeExpr;
  readonly binding: EventBinding;
  readonly semantics: string;
  /** Whether the field may be absent, as muxed-account payloads can be. */
  readonly optional: boolean;
}

/** When an event must appear relative to the outcome of an operation. */
export type EventOccurrence = "on_success" | "on_failure" | "always";

/** A machine-readable event requirement. */
export interface EventDefinition {
  readonly id: string;
  /** The symbol actually emitted, e.g. `transfer`. */
  readonly name: string;
  readonly requirement: RequirementStatus;
  readonly summary: string;
  readonly description?: string;
  readonly occurrence: EventOccurrence;
  readonly topics: readonly EventTopic[];
  readonly data: {
    readonly format: EventDataFormat;
    readonly fields: readonly EventDataField[];
  };
  readonly cardinality: {
    readonly min: number;
    readonly max: number;
  };
  /** Ordering constraints relative to other event ids. */
  readonly ordering: readonly { readonly before: string; readonly strict: boolean }[];
  /** Invariant ids that this event's values must be consistent with. */
  readonly correlations: readonly string[];
  readonly notes?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Behavior                                                                   */
/* -------------------------------------------------------------------------- */

/** Whether a behavioral rule describes a success or a failure path. */
export type BehaviorKind = "success" | "failure";

/** A declarative behavioral rule, independent of any concrete input. */
export interface BehaviorRule {
  readonly id: string;
  readonly summary: string;
  readonly description?: string;
  readonly method: string;
  readonly kind: BehaviorKind;
  readonly preconditions: readonly Predicate[];
  readonly postconditions: readonly Predicate[];
  /** Ids of `failures.yaml` definitions this failure path must produce. */
  readonly expect_failures: readonly string[];
  /** Event ids that must be observed. */
  readonly expect_events: readonly string[];
  /** Event ids that must not be observed. */
  readonly forbid_events: readonly string[];
  /** Invariant ids that must hold. */
  readonly invariants: readonly string[];
  readonly notes?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Invariants                                                                 */
/* -------------------------------------------------------------------------- */

/** The family of check an invariant performs. */
export type InvariantKind =
  | "conservation"
  | "state_unchanged"
  | "authorization_blocks_mutation"
  | "monotonic"
  | "bounds"
  | "predicate";

/** When an invariant is required to hold. */
export interface InvariantScope {
  readonly methods: readonly string[];
  readonly outcomes: readonly ("success" | "failure")[];
}

/** A reusable, independently identifiable invariant. */
export interface InvariantDefinition {
  readonly id: string;
  readonly title: string;
  readonly kind: InvariantKind;
  readonly severity: "error" | "warning";
  readonly summary: string;
  readonly description?: string;
  readonly scope: InvariantScope;
  /** Conservation measure, e.g. `balances`. */
  readonly resource?: string;
  /** Expected direction for `monotonic` invariants. */
  readonly direction?: "non_increasing" | "non_decreasing";
  /** Predicate form, used when `kind` is `predicate` or `bounds`. */
  readonly predicate?: Predicate;
  readonly rationale: string;
  readonly references?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Semantic failure categories.
 *
 * Estamora standardises *meaning*, not error codes. Soroban contracts signal
 * failure by trapping, and the trap payload is implementation-defined, so
 * pinning an exact symbol would reject conforming contracts. Profiles may
 * additionally constrain the observed payload, opt-in, via `error_codes`.
 */
export type FailureCategory =
  | "insufficient_balance"
  | "insufficient_allowance"
  | "unauthorized"
  | "missing_authorization"
  | "wrong_actor"
  | "invalid_amount"
  | "invalid_address"
  | "invalid_argument"
  | "invalid_state"
  | "uninitialized"
  | "expired"
  | "unsupported_operation"
  | "arithmetic_overflow"
  | "custom";

/** How strictly the trap payload is constrained. */
export type ErrorCodePolicy = "semantic_only" | "exact_required" | "tolerated";

/** A declared, expected failure. */
export interface FailureDefinition {
  readonly id: string;
  readonly category: FailureCategory;
  readonly summary: string;
  readonly description?: string;
  /** Method ids from which this failure is reachable. */
  readonly methods: readonly string[];
  readonly trigger: string;
  readonly expected: {
    readonly outcome: "failure";
    /** How the contract signals failure. */
    readonly signal: "trap" | "panic" | "host_error" | "either";
    readonly state_effect: "reverted" | "unchanged" | "unspecified";
    readonly events_emitted: "none" | "unspecified";
  };
  readonly error_codes: {
    readonly policy: ErrorCodePolicy;
    readonly allowed: readonly string[];
  };
  readonly rationale: string;
  readonly references?: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Vectors                                                                    */
/* -------------------------------------------------------------------------- */

/** The intent of a vector. Negative and boundary vectors are first-class. */
export type VectorKind =
  "positive" | "negative" | "boundary" | "authorization" | "event" | "state" | "invariant";

/** A declared account or contract used by a vector. */
export interface FixtureActor {
  readonly name: string;
  readonly kind: "account" | "contract";
  /** Optional link into the shared vector library, e.g. `common/addresses/alice`. */
  readonly ref?: string;
  readonly description?: string;
}

/** An allowance present before the operation under test. */
export interface FixtureAllowance {
  readonly from: string;
  readonly spender: string;
  readonly amount: string;
  readonly live_until_ledger?: number;
}

/** The deterministic world a vector starts in. */
export interface VectorFixtures {
  readonly actors: readonly FixtureActor[];
  readonly balances: Readonly<Record<string, string>>;
  readonly allowances: readonly FixtureAllowance[];
  readonly total_supply?: string;
  readonly ledger: {
    readonly sequence: number;
    readonly timestamp: string;
  };
  /** Whether any actor is expected to hold token-level authorization. */
  readonly authorization: Readonly<Record<string, boolean>>;
}

/** A first-class, executable specification artifact. */
export interface VectorDefinition {
  readonly id: string;
  readonly profile: string;
  readonly profile_version: string;
  readonly title: string;
  readonly description: string;
  readonly kind: VectorKind;
  readonly method: string;
  readonly tags: readonly string[];
  readonly fixtures: VectorFixtures;
  /** Argument name to value. Must cover the method's required arguments. */
  readonly inputs: Readonly<Record<string, ValueExpr>>;
  /** Which actors sign the invocation, and on whose authorization behalf. */
  readonly authorization: {
    readonly actors: readonly string[];
    readonly expected: "accepted" | "rejected" | "not_required";
  };
  readonly expected: {
    readonly outcome: "success" | "failure";
    /**
     * Required when `outcome` is `failure`, unless `failure_category` is used
     * instead, which is the case for profile-independent wildcard vectors.
     */
    readonly failure: string | undefined;
    /** Semantic category, used by wildcard vectors that cannot name a profile id. */
    readonly failure_category: FailureCategory | undefined;
    readonly returns: ValueExpr | undefined;
    readonly state_assertions: readonly StateAssertion[];
    readonly events: {
      readonly required: readonly EventExpectation[];
      readonly forbidden: readonly string[];
    };
    readonly invariants: readonly string[];
  };
  readonly assertions: readonly Predicate[];
  readonly rationale: string;
  readonly references: readonly string[];
}

/** A concrete expected state after the operation. */
export interface StateAssertion {
  readonly id: string;
  readonly description?: string;
  readonly resource: StateResourceRef;
  readonly predicate: Predicate;
}

/** Identifies a piece of contract state an assertion refers to. */
export type StateResourceRef =
  | { readonly kind: "balance"; readonly account: string }
  | { readonly kind: "allowance"; readonly from: string; readonly spender: string }
  | { readonly kind: "total_supply" }
  | { readonly kind: "ledger_sequence" }
  | { readonly kind: "custom"; readonly name: string; readonly read: ValueExpr };

/** A concrete expected event, matched positionally against the emission log. */
export interface EventExpectation {
  readonly event: string;
  readonly topics: readonly ValueExpr[];
  readonly data: readonly ValueExpr[];
}

/* -------------------------------------------------------------------------- */
/* Profile and report documents                                               */
/* -------------------------------------------------------------------------- */

/** The upstream specification a profile encodes. */
export interface SpecificationReference {
  readonly name: string;
  readonly title: string;
  readonly version: string;
  readonly status: string;
  readonly url: string;
  readonly updated: string;
}

/** A document that describes every requirement for one interface. */
export interface ProfileDocument {
  readonly estamora_spec_version: SpecFormatVersion;
  readonly profile: {
    readonly id: string;
    readonly version: string;
    readonly title: string;
    readonly status: ProfileStatus;
    readonly summary: string;
    readonly description: string;
    readonly license: string;
    readonly specification: SpecificationReference;
    readonly supersedes?: string;
    readonly superseded_by?: string;
    readonly maintainers: readonly string[];
    readonly compatibility: {
      readonly interface: "full" | "partial";
      readonly notes: readonly string[];
    };
    readonly provenance: {
      readonly source: string;
      readonly derived_from: string;
      readonly interpretation_notes: readonly string[];
    };
  };
  readonly includes: {
    readonly methods: string;
    readonly authorization: string;
    readonly events: string;
    readonly behavior: string;
    readonly invariants: string;
    readonly failures: string;
    /** Operation directory names inside the profile bundle's own `vectors/`. */
    readonly vectors: readonly string[];
    /**
     * Names of shared vector sets under the repository-level `vectors/`
     * directory that this profile consumes, e.g. `["common", "sep-41"]`.
     */
    readonly shared_vectors: readonly string[];
  };
}

/** Final conformance status. Collapsing these into one boolean is forbidden. */
export type ConformanceStatus =
  | "CONFORMANT"
  | "PARTIALLY_CONFORMANT"
  | "NON_CONFORMANT"
  | "INCONCLUSIVE"
  | "EXECUTION_ERROR"
  | "PROFILE_ERROR";

/** The normative conformance report model produced by Repository 2. */
export interface ConformanceReport {
  readonly estamora_spec_version: SpecFormatVersion;
  readonly runner: { readonly name: string; readonly version: string };
  readonly generated_at: string;
  readonly target: {
    readonly contract: string;
    readonly network: string;
    readonly wasm_hash: string | null;
    readonly metadata: Readonly<Record<string, JsonValue>>;
  };
  readonly profile: {
    readonly id: string;
    readonly version: string;
    readonly digest: string;
  };
  readonly vectors: { readonly digest: string; readonly count: number };
  readonly configuration: Readonly<Record<string, JsonValue>>;
  readonly results: readonly VectorResult[];
  readonly summary: Readonly<Record<string, AssertionSummary>>;
  readonly status: ConformanceStatus;
}

/** Per-category assertion tallies. */
export interface AssertionSummary {
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
}

/** The structured result of one vector. */
export interface VectorResult {
  readonly vector_id: string;
  readonly category: string;
  readonly status: "passed" | "failed" | "error" | "skipped";
  readonly assertions: readonly AssertionOutcome[];
  readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
}

/** The outcome of a single assertion. */
export interface AssertionOutcome {
  readonly id: string;
  readonly category: string;
  readonly status: "passed" | "failed";
  readonly expected: string;
  readonly observed: string;
  readonly detail?: string;
}
