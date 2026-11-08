import type { GradeResult } from "@/lib/grade/types";
import { acceptedVersionedCandidate, captureVersionedCandidate, type CandidateRow, type VersionedCandidate, type VersionedCandidateTicket } from "./chatVersionedCandidate";

/** Session-local model; persistence, locking and provider idempotency are external. */
export type CandidateState =
  | { readonly status: "pending"; readonly ticket: VersionedCandidateTicket }
  | { readonly status: "ready"; readonly candidate: VersionedCandidate }
  | { readonly status: "failed" | "consumed"; readonly ticket: VersionedCandidateTicket };

/** Trusted transport correlation must come from the dispatched request context. */
export function settleVersionedCandidate(state: CandidateState, attempt: string, result: GradeResult): CandidateState | null {
  if (state.status !== "pending" || state.ticket.attempt !== attempt) return null;
  const candidate = captureVersionedCandidate(state.ticket, attempt, result);
  return candidate ? { status: "ready", candidate } : { status: "failed", ticket: state.ticket };
}

/**
 * Explicit acceptance returns a consumed state and replacement together. The
 * caller must persist both atomically with the current row, under the same
 * lock that protects row edits, source revision and attempt reservation.
 */
export function consumeVersionedCandidate(state: CandidateState, session: string, row: CandidateRow, activeAttempt: string | null): { state: CandidateState; replacement: { result: GradeResult; setupVersion: number } } | null {
  if (state.status !== "ready") return null;
  const replacement = acceptedVersionedCandidate(session, row, activeAttempt, state.candidate);
  if (!replacement) return null;
  return { state: { status: "consumed", ticket: state.candidate.ticket }, replacement };
}
