/**
 * Result shapes of the live-send server actions (LIVE-LMS-STUDENT-MESSAGING W4).
 * Types only, in their own leaf because a "use server" module may export only
 * async functions. Nothing here carries a name, a subject or a body: recipients
 * are the opaque `courseId:userId` key.
 */

import type { LedgerStatus } from "./send-ledger";
import type { LiveSendRefusal } from "./send-batch";

export interface ExcludedRecipient {
  key: string;
  /** The blocking ledger status: possibly or definitely already sent. */
  dupStatus: LedgerStatus;
}

export type LivePrepareResult =
  | { status: "ready"; institution: string; count: number; digest: string; excluded: ExcludedRecipient[] }
  | LiveSendRefusal;

export interface StartedRecipientResult {
  key: string;
  outcome: "inserted" | "duplicate";
  dupStatus: LedgerStatus | null;
}

export type LiveStartResult =
  | { status: "started"; batchId: string; recipients: StartedRecipientResult[] }
  | LiveSendRefusal;

export interface LiveBatchRowStatus {
  key: string;
  status: LedgerStatus;
  code: string | null;
  httpStatus: number | null;
  attempt: number;
}

export type LiveBatchStatusResult = { status: "ok"; rows: LiveBatchRowStatus[] } | LiveSendRefusal;

export type LiveRequeueResult = { status: "requeued"; count: number } | LiveSendRefusal;
