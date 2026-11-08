import type { IngestSkip } from "@/lib/grade/ndjson-ingest-parser";

/** No paid grading started, so the original batch may safely be retried. */
export function noBatchAdmittedNotice(skipped: readonly IngestSkip[]): string {
  const names = skipped.slice(0, 10).map((item) => `${item.student} (${item.reason})`).join("; ");
  const more = skipped.length > 10 ? ` and ${skipped.length - 10} more (see the submission list)` : "";
  return `No submissions were queued. Not queued: ${names}${more}. Correct the files and retry the batch.`;
}

/** A queued entry may still fail; never describe admission as a completed grade. */
export function partialBatchNotice(admitted: number, eligible: number, cap: number, oversized: readonly IngestSkip[], clipped: readonly IngestSkip[]): string {
  const missing = [...oversized, ...clipped];
  const detail = missing.length ? ` Not queued: ${missing.map((item) => `${item.student} (${item.reason})`).join("; ")}.` : "";
  const heading = clipped.length
    ? `Queued the first ${admitted} of ${eligible} submissions; the session's ${cap}-submission limit was reached. Start a new session to grade the rest.`
    : `Queued ${admitted} of ${admitted + oversized.length} submissions.`;
  return heading + detail + " Do not resubmit the entire batch; submit only the omitted work after correcting it.";
}
