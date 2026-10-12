/**
 * N15a Wave 1 (docs/n15-one-upload-per-student-scope.md sections 3-4): the PURE
 * leaf behind "each upload is one student". Everything here is synchronous and
 * side-effect-free - no fetch, no React, no clock - so the two properties the
 * feature exists for are unit-testable without a render:
 *
 *  1. ATTRIBUTION: two uploads never share a student display string or an
 *     ordinal, even when the SERVER hands back identical labels for both
 *     (a generic "scan.jpg" twice). GradingResults.tsx keys every piece of
 *     per-row state on `r.student`, so a duplicate display would cross-wire
 *     an edit cell / post status into a live gradebook write.
 *  2. PACING: the inter-request delay engine.ts pays between entries of ONE
 *     call (engine.ts:502-503) is paid by N separate one-entry calls zero
 *     times, so the client queue must enforce it itself.
 */
import type { GradingRun, StudentSubmissionEntry } from "@/lib/grade/types";
import { assignUnclaimedLabel } from "@/lib/grade/utils";
import { buildIncrementalRun, type ArrivedItemResult } from "./incrementalRunPlan";

export interface UploadIdentity {
  /** 1-based, strictly increasing fold index. sourceIndex is ordinal - 1. */
  readonly ordinal: number;
  /** The server's student label, disambiguated against every earlier display. */
  readonly display: string;
}

export interface IdentityFoldState {
  readonly ordinal: number;
  readonly taken: ReadonlySet<string>;
}

export const EMPTY_IDENTITY_STATE: IdentityFoldState = { ordinal: 0, taken: new Set<string>() };

/** What gradingOneUploadAction returns for one upload (declared here so the
 * "use server" module stays functions-only). */
export type OneUploadBuildResult =
  | {
      readonly ok: true;
      readonly entry: StudentSubmissionEntry;
      /** The server-only GRADE_INTER_REQUEST_DELAY_MS value, for client pacing. */
      readonly interRequestDelayMs: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * One immutable fold step. The ordinal is derived from the INPUT state
 * (`prev.ordinal + 1`), never from hidden enqueue state, and the display is
 * assigned against the accumulated taken-set and THEN added to it - the
 * assign-then-add that makes distinctness hold (same shape as
 * disambiguateCanvasEntries, extraction.ts). `assignUnclaimedLabel` does not
 * mutate its taken-set, so the reducer must.
 */
export function assignNextUploadIdentity(
  prev: IdentityFoldState,
  base: string
): { identity: UploadIdentity; next: IdentityFoldState } {
  const ordinal = prev.ordinal + 1;
  const display = assignUnclaimedLabel(base, prev.taken);
  const taken = new Set(prev.taken);
  taken.add(display);
  return { identity: { ordinal, display }, next: { ordinal, taken } };
}

/** The batch form: a left fold of assignNextUploadIdentity from empty. */
export function assignUploadIdentities(bases: readonly string[]): readonly UploadIdentity[] {
  const identities: UploadIdentity[] = [];
  let state = EMPTY_IDENTITY_STATE;
  for (const base of bases) {
    const step = assignNextUploadIdentity(state, base);
    identities.push(step.identity);
    state = step.next;
  }
  return identities;
}

/**
 * How long the serial worker must still wait before its next dispatch so that
 * consecutive dispatches are at least `interRequestDelayMs` apart. A null
 * `lastDispatchAtMs` (nothing dispatched yet) never waits.
 */
export function nextDispatchWaitMs(
  now: number,
  lastDispatchAtMs: number | null,
  interRequestDelayMs: number
): number {
  if (lastDispatchAtMs === null) return 0;
  return Math.max(0, interRequestDelayMs - (now - lastDispatchAtMs));
}

/** The one status sentence the checkbox shows: progress while uploads are
 * grading, otherwise how the mode works (including the RULING 116 asymmetry:
 * a blank rubric grades against the instructions only). */
export function describeOneUploadStatus(inFlight: number): string {
  if (inFlight > 0) {
    return `${inFlight} upload${inFlight === 1 ? "" : "s"} still grading. Results appear below as each one finishes.`;
  }
  return "Fill in the instructions and rubric once, then pick one file per student. Each pick is graded separately, one at a time. A blank rubric grades against the instructions only.";
}

/**
 * Projects the arrived rows into the ONE GradingRun the shared results mount
 * renders, through the same buildIncrementalRun the A39 route uses (no second
 * merge dialect). RULING 116's thin surface applies: the header is synthesized
 * client-side with the rubric passed through unchanged and unstamped
 * (rubricUsed/rubricFingerprint empty), and no criteria are frozen, so
 * columns follow arrival order while uploads are still landing.
 */
export function projectRun(args: {
  rubric: string;
  arrived: readonly ArrivedItemResult[];
  /** True while any upload is still building, queued or grading. */
  inFlight: boolean;
}): GradingRun {
  return buildIncrementalRun({
    header: {
      kind: "ok",
      effectiveRubric: args.rubric,
      generatedRubric: undefined,
      criteriaNames: [],
      rubricUsed: "",
      rubricFingerprint: "",
    },
    speedGraderUrl: null,
    totalTicketCount: args.arrived.length,
    arrived: args.arrived,
    phase: args.inFlight ? "running" : "complete",
    tier2: null,
  });
}
