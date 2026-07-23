// Pure policy model for the lecture-building steps' material-source
// resolution: WHICH sources to check, in what ORDER, and what STRATEGY to
// apply. No side effects, no imports of anything server- or browser-only -
// safe to import from client steps, server actions, and the headless runner
// alike.
//
// DEFAULT_SOURCE_POLICY reproduces exactly today's gatherModuleMaterials
// chain (live LMS -> course export -> tile topics/description, stopping at
// the first source that yields something) - an unset/legacy value must
// resolve to this and change nothing about existing behavior.

export type SourceKind =
  | "live-lms"
  | "course-export"
  | "source-url"
  | "materials-zip"
  | "repo"
  | "tile-meta";

export type SourceStrategy = "first-success" | "merge-all" | "until-failure";

export interface SourcePolicy {
  /** Ordered, deduped subset of SourceKind - the sources to check, in order. */
  order: SourceKind[];
  strategy: SourceStrategy;
}

export const ALL_SOURCE_KINDS: readonly SourceKind[] = [
  "live-lms",
  "course-export",
  "source-url",
  "materials-zip",
  "repo",
  "tile-meta",
];

export const ALL_SOURCE_STRATEGIES: readonly SourceStrategy[] = [
  "first-success",
  "merge-all",
  "until-failure",
];

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  "live-lms": "Live LMS connection",
  "course-export": "Course LMS export",
  "source-url": "Source platform URL",
  "materials-zip": "Uploaded materials zip",
  repo: "Repository digest",
  "tile-meta": "Tile topics/description",
};

export const SOURCE_STRATEGY_LABELS: Record<SourceStrategy, string> = {
  "first-success": "Stop at the first success",
  "merge-all": "Check every source, merge results",
  "until-failure": "Accumulate until a source errors",
};

// EXACTLY today's gatherModuleMaterials chain: live LMS, then the course
// export, then the tile's topics/description as a terminal fallback, using
// the first source that yields material.
export const DEFAULT_SOURCE_POLICY: SourcePolicy = {
  order: ["live-lms", "course-export", "tile-meta"],
  strategy: "first-success",
};

const KIND_SET = new Set<string>(ALL_SOURCE_KINDS);
const STRATEGY_SET = new Set<string>(ALL_SOURCE_STRATEGIES);

/** Ordered, deduped, unknown-kind-dropped subset of SourceKind. */
function normalizeOrder(order: unknown): SourceKind[] {
  if (!Array.isArray(order)) return [];
  const seen = new Set<SourceKind>();
  const out: SourceKind[] = [];
  for (const entry of order) {
    if (typeof entry === "string" && KIND_SET.has(entry) && !seen.has(entry as SourceKind)) {
      seen.add(entry as SourceKind);
      out.push(entry as SourceKind);
    }
  }
  return out;
}

/** Encode a policy to the compact JSON string stored as the workflow value. */
export function encodeSourcePolicy(policy: SourcePolicy): string {
  return JSON.stringify({
    order: normalizeOrder(policy.order),
    strategy: STRATEGY_SET.has(policy.strategy) ? policy.strategy : "first-success",
  });
}

/**
 * Decode a policy from its stored string. Tolerant: unknown source kinds are
 * dropped, an unknown/missing strategy falls back to "first-success", and any
 * malformed input (bad JSON, non-object, empty order after dropping unknown
 * kinds) returns null - the caller treats null the same as "unset".
 */
export function decodeSourcePolicy(raw: string | null | undefined): SourcePolicy | null {
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const order = normalizeOrder((parsed as { order?: unknown }).order);
  if (order.length === 0) return null;
  const strategyRaw = (parsed as { strategy?: unknown }).strategy;
  const strategy: SourceStrategy =
    typeof strategyRaw === "string" && STRATEGY_SET.has(strategyRaw)
      ? (strategyRaw as SourceStrategy)
      : "first-success";
  return { order, strategy };
}

/**
 * The effective policy for a run: the decoded stored value, or
 * DEFAULT_SOURCE_POLICY when unset/legacy/unparseable - the single point
 * every consumer uses so "no policy configured" behaves exactly like today.
 */
export function resolveSourcePolicy(raw: string | null | undefined): SourcePolicy {
  return decodeSourcePolicy(raw) ?? DEFAULT_SOURCE_POLICY;
}

/** Whether a policy is exactly the default chain (order + strategy). */
export function isDefaultSourcePolicy(policy: SourcePolicy): boolean {
  return (
    policy.strategy === DEFAULT_SOURCE_POLICY.strategy &&
    policy.order.length === DEFAULT_SOURCE_POLICY.order.length &&
    policy.order.every((k, i) => k === DEFAULT_SOURCE_POLICY.order[i])
  );
}

/** One source kind's attempt: its contributed text (if any), the notes it
 * wants surfaced (in order), and whether it counts as a "success" for
 * first-success / merge-all purposes. `error` marks a genuine failure
 * (as opposed to "nothing here") - only `until-failure` reacts to it. */
export interface SourceGatherOutcome {
  text: string;
  notes: string[];
  ok: boolean;
  error?: boolean;
}

export type SourceGatherer = (kind: SourceKind) => Promise<SourceGatherOutcome>;

export interface SourcePolicyResult {
  text: string;
  notes: string[];
  usedKinds: SourceKind[];
  truncated: boolean;
}

/**
 * Run a source policy: walk policy.order, dispatching each kind to `gather`,
 * applying the strategy. Pure with respect to its inputs - all domain logic
 * (what each SourceKind actually does) lives in the caller's `gather`
 * callback, so this loop is testable with fake gatherers.
 *
 * Strategy semantics:
 * - first-success: try in order, stop at the first source that succeeds.
 * - merge-all: try every listed source, concatenating every success
 *   (capped); failures/empties just contribute their notes.
 * - until-failure: accumulate in order, stopping at the first source whose
 *   outcome is a genuine error (its note is kept; prior successes are kept).
 */
export async function runSourcePolicy(
  policy: SourcePolicy,
  gather: SourceGatherer,
  cap: number
): Promise<SourcePolicyResult> {
  const notes: string[] = [];
  const usedKinds: SourceKind[] = [];
  const chunks: string[] = [];
  let total = 0;
  let truncated = false;

  const push = (text: string) => {
    if (!text) return;
    if (total >= cap) {
      truncated = true;
      return;
    }
    const slice = text.slice(0, cap - total);
    if (slice.length < text.length) truncated = true;
    chunks.push(slice);
    total += slice.length;
  };

  for (const kind of policy.order) {
    const outcome = await gather(kind);
    notes.push(...outcome.notes);
    if (outcome.ok) {
      push(outcome.text);
      usedKinds.push(kind);
      if (policy.strategy === "first-success") break;
    } else if (outcome.error && policy.strategy === "until-failure") {
      break;
    }
  }

  return { text: chunks.join(""), notes, usedKinds, truncated };
}
