import { estimateNeededWireBytes, ITEM_REQUEST_BYTE_BUDGET } from "@/app/components/grading/incrementalRunPlan";
import type { StudentSubmissionEntry } from "./types";

/** A bounded refusal names affected entries without emitting or grading any. */
export function oversizedIntakeReason(entries: readonly StudentSubmissionEntry[]): string | null {
  const oversized = entries.filter((entry) => estimateNeededWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET);
  if (!oversized.length) return null;
  const names = oversized.slice(0, 10).map((entry) => entry.student.replace(/\s+/g, " ").trim().slice(0, 100) || "Unnamed submission");
  const more = oversized.length > names.length ? ` and ${oversized.length - names.length} more` : "";
  return `No submissions were queued. Too large to grade: ${names.join(", ")}${more}.`;
}
