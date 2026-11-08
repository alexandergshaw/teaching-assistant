import type { GradeResult } from "@/lib/grade/types";
import { planVersionedRegrade, type VersionedRegradeRow } from "./chatVersionedRegrade";
import type { ChatSetupHistory } from "./chatVersionedSetup";

export interface CandidateRow extends VersionedRegradeRow {
  /** Increment for every edit, accepted grade, or posting-state change. */
  readonly resultRevision: number;
}
export interface VersionedCandidateTicket {
  readonly session: string;
  readonly attempt: string;
  readonly sourceIndex: number;
  readonly sourceRevision: number;
  readonly resultRevision: number;
  readonly setupVersion: number;
  readonly student: string;
}
export interface VersionedCandidate {
  readonly ticket: VersionedCandidateTicket;
  readonly result: GradeResult;
}
const validToken = (value: string) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

/**
 * A pure admission transition for a single selected row. The owner must commit
 * the returned reservation under its session lock before using the request.
 * Attempt IDs must never be reused, including after failure or reset. This
 * model does not provide a durable store or provider idempotency.
 */
export function admitVersionedCandidate(
  session: string, attempt: string, usedAttempts: ReadonlySet<string>,
  history: ChatSetupHistory, version: number, rows: readonly CandidateRow[], sourceIndex: number,
) {
  if (!validToken(session) || !validToken(attempt) || usedAttempts.has(attempt)) return null;
  const row = rows.find((item) => item.sourceIndex === sourceIndex);
  if (!row || !Number.isSafeInteger(row.resultRevision) || row.resultRevision < 0) return null;
  const plan = planVersionedRegrade(history, version, rows, [sourceIndex]);
  if (!plan) return null;
  try {
    const request = structuredClone(plan[0].request);
    if (typeof request.entry.student !== "string" || !request.entry.student) return null;
    const ticket: VersionedCandidateTicket = Object.freeze({ session, attempt, sourceIndex, sourceRevision: row.sourceRevision, resultRevision: row.resultRevision, setupVersion: version, student: request.entry.student });
    return { ticket, request };
  } catch { return null; }
}

/** The transport must bind this correlation to the actual request, not response data. */
export function captureVersionedCandidate(ticket: VersionedCandidateTicket, responseAttempt: string, result: GradeResult): VersionedCandidate | null {
  if (!validToken(responseAttempt) || responseAttempt !== ticket.attempt || !result || result.ungraded || result.student !== ticket.student) return null;
  try { return { ticket: { ...ticket }, result: structuredClone(result) }; }
  catch { return null; }
}

/**
 * Called only after explicit instructor acceptance, under the same lock as row
 * edits and reservation. It yields a copy; caller must atomically consume the
 * attempt and replace the row result/version. It never modifies edits itself.
 */
export function acceptedVersionedCandidate(
  session: string, row: CandidateRow, activeAttempt: string | null,
  candidate: VersionedCandidate,
): { result: GradeResult; setupVersion: number } | null {
  const ticket = candidate?.ticket;
  if (!ticket || !validToken(session) || ticket.session !== session || !validToken(ticket.attempt) || ticket.attempt !== activeAttempt || row.pending || ticket.sourceIndex !== row.sourceIndex || ticket.sourceRevision !== row.sourceRevision || ticket.resultRevision !== row.resultRevision || !Number.isSafeInteger(ticket.setupVersion) || ticket.setupVersion < 1 || !ticket.student || row.retainedRequest.entry.student !== ticket.student || !candidate.result || candidate.result.ungraded || candidate.result.student !== ticket.student) return null;
  try { return { result: structuredClone(candidate.result), setupVersion: ticket.setupVersion }; }
  catch { return null; }
}
