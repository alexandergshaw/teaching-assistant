/**
 * Fixed owner-facing copy for the live send (LIVE-LMS-STUDENT-MESSAGING W4).
 * Pure strings so a test can scan them. The rule that matters: an unconfirmed
 * or refused outcome is never worded as delivered, received, emailed or sent,
 * because for an unconfirmed one nobody knows.
 */

import type { JobItemResult } from "./send-job";
import type { LedgerStatus } from "./send-ledger";

export const OUTCOME_LABELS = {
  accepted: "Accepted by Canvas",
  refused: "Refused by Canvas. You can retry.",
  unknown: "Unconfirmed. Check your Canvas inbox before trying again.",
  skipped: "Skipped. An identical message is already on record.",
  "not-attempted": "Not attempted",
} as const satisfies Record<JobItemResult["outcome"], string>;

/** Why a recipient was excluded by default at the confirm step. */
export function describeDuplicate(status: LedgerStatus): string {
  if (status === "accepted") return "Canvas already accepted an identical message in the last 24 hours.";
  return "An identical message may already be with Canvas (unconfirmed) in the last 24 hours.";
}

export const PAUSED_COPY =
  "Stopped early because several messages in a row did not go through, or your session needs attention. The remaining messages were not attempted.";
