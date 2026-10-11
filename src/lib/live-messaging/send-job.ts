/**
 * The client-orchestrated send job (LIVE-LMS-STUDENT-MESSAGING W4), as plain
 * logic with every action injected. The browser fans out ONE call per
 * recipient (a Server Action here has the platform's unconfigured duration, so
 * the loop must not live on the server); this module owns the pool, the
 * circuit breaker, the lost-response reconciliation and the tallies.
 *
 * FAIL CLOSED. A response that never arrives is NEVER re-sent: the unit
 * claimed the ledger row before it POSTed, so the worker polls the ledger
 * instead. Whatever the ledger says is final; a row still `sending` or an
 * unreachable ledger reads as unknown (possibly delivered), never as failed.
 */

import { BREAKER_K, MAX_BATCH_RECIPIENTS, SEND_POOL_LIMIT } from "./send-constants";
import type { BatchTargetInput, LiveUnitResult } from "./send-batch";
import type { LiveBatchStatusResult } from "./send-results";
import { isSendable, type RenderedForStudent } from "./template-substitution";

// ---------------------------------------------------------------------------
// Building the batch from rendered previews
// ---------------------------------------------------------------------------

export interface RenderedRecipient {
  /** The table row key (not the send key). */
  rowKey: string;
  courseId: string;
  userId: string;
  rendered: RenderedForStudent;
}

export interface SendPlan {
  targets: BatchTargetInput[];
  /** Rows with a missing or unrecognised variable: never sent. */
  unsendable: number;
  /** The same student in two sections of one course: sent once. */
  duplicateRows: number;
}

/**
 * One target per (courseId, userId), sendable rows only. A row with an
 * unresolved variable is excluded, never sent with a blank.
 */
export function buildSendPlan(recipients: ReadonlyArray<RenderedRecipient>): SendPlan {
  const targets: BatchTargetInput[] = [];
  const seen = new Set<string>();
  let unsendable = 0;
  let duplicateRows = 0;
  for (const r of recipients) {
    if (!isSendable(r.rendered.subject) || !isSendable(r.rendered.body)) {
      unsendable += 1;
      continue;
    }
    const key = sendKey(r.courseId, r.userId);
    if (seen.has(key)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(key);
    targets.push({
      courseId: r.courseId,
      recipientUserId: r.userId,
      subject: r.rendered.subject.text,
      body: r.rendered.body.text,
    });
  }
  return { targets, unsendable, duplicateRows };
}

export function sendKey(courseId: string, userId: string): string {
  return `${courseId}:${userId}`;
}

/**
 * Identity of what the owner is looking at: institution, template and the
 * recipient set. Prepare is valid only for the snapshot it ran against, so an
 * edit or a selection change between Preview and Confirm cannot ride through.
 */
export function snapshotKey(
  institution: string,
  subject: string,
  body: string,
  recipientKeys: ReadonlyArray<string>
): string {
  return JSON.stringify([institution, subject, body, [...recipientKeys].sort()]);
}

// ---------------------------------------------------------------------------
// The confirm gate
// ---------------------------------------------------------------------------

export interface ConfirmGateState {
  /** The snapshot (institution, template, recipients) Prepare was run for. */
  preparedSnapshot: string | null;
  /** The snapshot the modal shows right now. */
  currentSnapshot: string;
  /** The institution frozen at Prepare. */
  frozenInstitution: string | null;
  activeInstitution: string;
  /** Recipients the confirm would send (after exclusions). */
  count: number;
  /** A batch for this snapshot is already starting or running. */
  inFlight: boolean;
}

/** The Send-to-Canvas button is the END of a gate: every condition must hold. */
export function canConfirmSend(state: ConfirmGateState): boolean {
  if (state.preparedSnapshot === null || state.frozenInstitution === null) return false;
  if (state.preparedSnapshot !== state.currentSnapshot) return false;
  if (state.frozenInstitution !== state.activeInstitution) return false;
  if (state.inFlight) return false;
  return Number.isInteger(state.count) && state.count >= 1 && state.count <= MAX_BATCH_RECIPIENTS;
}

/** The count-labelled confirm button text. */
export function confirmLabel(count: number, institution: string): string {
  return `Send to ${count} ${count === 1 ? "student" : "students"}`.concat(institution ? ` at ${institution}` : "");
}

// ---------------------------------------------------------------------------
// Pool, breaker, job
// ---------------------------------------------------------------------------

/**
 * Runs `worker` over `items` with at most `limit` in flight. The worker NEVER
 * throws (a rejection is a bug, caught and surfaced as `undefined` for that
 * slot) so one failure cannot discard the others; `shouldStop` is checked
 * before each dispatch. Results are positional; an undispatched slot is
 * `undefined`.
 */
export async function runPool<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop: () => boolean
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length).fill(undefined);
  let next = 0;
  const lane = async () => {
    while (next < items.length && !shouldStop()) {
      const index = next;
      next += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch {
        results[index] = undefined;
      }
    }
  };
  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: lanes }, () => lane()));
  return results;
}

export type JobOutcome = "accepted" | "refused" | "unknown" | "skipped" | "not-attempted";

export interface JobItemResult {
  key: string;
  outcome: JobOutcome;
  /** An enumerated code only ("ok", "refused-http", ...), never Canvas text. */
  code: string | null;
  refusalKind?: string;
}

/**
 * Pause when the last K COMPLETED results are all non-accepted, or when any
 * result is a not-authorized / ledger-unavailable refusal. Bounds the damage of
 * a revoked token, a Canvas outage or a mis-set host to a handful of rows.
 */
export function shouldPause(completed: ReadonlyArray<JobItemResult>, k: number = BREAKER_K): boolean {
  if (completed.some((r) => r.refusalKind === "not-authorized" || r.refusalKind === "ledger-unavailable")) return true;
  if (completed.length < k) return false;
  return completed.slice(-k).every((r) => r.outcome !== "accepted");
}

export interface JobCounts {
  accepted: number;
  refused: number;
  unknown: number;
  notAttempted: number;
}

/** accepted + refused + unknown + notAttempted = total, always. */
export function tally(results: ReadonlyArray<JobItemResult>, total: number): JobCounts {
  const counts: JobCounts = { accepted: 0, refused: 0, unknown: 0, notAttempted: 0 };
  for (const r of results) {
    if (r.outcome === "accepted") counts.accepted += 1;
    else if (r.outcome === "refused") counts.refused += 1;
    else if (r.outcome === "unknown") counts.unknown += 1;
  }
  counts.notAttempted = Math.max(0, total - counts.accepted - counts.refused - counts.unknown);
  return counts;
}

/** The enumerated codes of the non-accepted results, counted: "2x refused-http". */
export function codeSummary(results: ReadonlyArray<JobItemResult>, outcome: "refused" | "unknown"): string {
  const counts = new Map<string, number>();
  for (const r of results) {
    if (r.outcome !== outcome) continue;
    const code = r.code ?? "unrecorded";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, n]) => `${n}x ${code}`)
    .join(", ");
}

export interface SendItem {
  key: string;
  subject: string;
  body: string;
}

export interface SendJobArgs {
  batchId: string;
  items: ReadonlyArray<SendItem>;
  sendOne(batchId: string, key: string, subject: string, body: string): Promise<LiveUnitResult>;
  pollBatch(batchId: string): Promise<LiveBatchStatusResult>;
  /** External stop (the owner pressed Stop, or the modal went away). */
  shouldStop(): boolean;
  onResult?(result: JobItemResult): void;
  limit?: number;
}

export interface SendJobSummary {
  results: JobItemResult[];
  counts: JobCounts;
  /** True when dispatch halted before every item ran (breaker or Stop). */
  halted: boolean;
}

function fromUnit(unit: LiveUnitResult): JobItemResult {
  if (unit.status === "accepted" || unit.status === "refused" || unit.status === "unknown") {
    return { key: unit.key, outcome: unit.status, code: unit.code, refusalKind: unit.refusalKind };
  }
  if (unit.status === "skipped") return { key: unit.key, outcome: "skipped", code: null };
  return { key: unit.key, outcome: "unknown", code: null };
}

function pre(unit: LiveUnitResult): boolean {
  return unit.status === "refused" && unit.refusalKind !== undefined;
}

/**
 * A unit that refused BEFORE any POST (digest mismatch, ledger unavailable...)
 * has no POST outcome: it stays "not attempted" so the identity holds, but its
 * refusal kind still feeds the breaker.
 */
function fromUnitResult(unit: LiveUnitResult): JobItemResult {
  if (pre(unit)) return { key: unit.key, outcome: "not-attempted", code: null, refusalKind: unit.refusalKind };
  return fromUnit(unit);
}

/** The response was lost or the action threw: resolve from the LEDGER, never by re-sending. */
async function reconcileFromLedger(
  args: SendJobArgs,
  key: string
): Promise<JobItemResult> {
  try {
    const polled = await args.pollBatch(args.batchId);
    if (polled.status === "ok") {
      const row = polled.rows.find((r) => r.key === key);
      if (row && row.status === "pending") return { key, outcome: "not-attempted", code: null };
      if (row && row.status === "accepted") return { key, outcome: "accepted", code: row.code };
      if (row && row.status === "refused") return { key, outcome: "refused", code: row.code };
      if (row) return { key, outcome: "unknown", code: row.code ?? "unknown-no-response" };
    }
  } catch {
    // fall through: an unreachable ledger reads as unknown
  }
  return { key, outcome: "unknown", code: "unknown-no-response" };
}

export async function runSendJob(args: SendJobArgs): Promise<SendJobSummary> {
  const completed: JobItemResult[] = [];
  let paused = false;
  const total = args.items.length;

  const raw = await runPool(
    args.items,
    args.limit ?? SEND_POOL_LIMIT,
    async (item): Promise<JobItemResult> => {
      let result: JobItemResult;
      try {
        result = fromUnitResult(await args.sendOne(args.batchId, item.key, item.subject, item.body));
      } catch {
        result = await reconcileFromLedger(args, item.key);
      }
      completed.push(result);
      if (shouldPause(completed)) paused = true;
      args.onResult?.(result);
      return result;
    },
    () => paused || args.shouldStop()
  );

  const results = raw.filter((r): r is JobItemResult => r !== undefined);
  return { results, counts: tally(results, total), halted: results.length < total };
}
