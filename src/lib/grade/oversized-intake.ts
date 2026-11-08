import { estimateNeededWireBytes, ITEM_REQUEST_BYTE_BUDGET, stripUnneededRawBase64 } from "@/app/components/grading/incrementalRunPlan";
import type { StudentSubmissionEntry } from "./types";

/** A lower bound for the eventual request; headers and rubric add more bytes. */
export function oversizedEntry(entry: StudentSubmissionEntry, budget = ITEM_REQUEST_BYTE_BUDGET): boolean {
  if (estimateNeededWireBytes(entry) > budget) return true;
  const entryBytes = new TextEncoder().encode(JSON.stringify({ entry: stripUnneededRawBase64(entry) })).byteLength;
  return entryBytes > budget;
}

/** Keep source positions so duplicate student names never collapse omissions. */
export function partitionOversizedEntries(entries: readonly StudentSubmissionEntry[], budget = ITEM_REQUEST_BYTE_BUDGET): {
  readonly admitted: readonly StudentSubmissionEntry[];
  readonly omitted: readonly { readonly index: number; readonly student: string }[];
} {
  const admitted: StudentSubmissionEntry[] = [];
  const omitted: { index: number; student: string }[] = [];
  entries.forEach((entry, index) => {
    if (oversizedEntry(entry, budget)) omitted.push({ index, student: entry.student });
    else admitted.push(entry);
  });
  return { admitted, omitted };
}

/** A bounded refusal names affected entries without emitting or grading any. */
export function oversizedIntakeReason(entries: readonly StudentSubmissionEntry[]): string | null {
  const oversized = partitionOversizedEntries(entries).omitted;
  if (!oversized.length) return null;
  const names = oversized.slice(0, 10).map((entry) => entry.student.replace(/\s+/g, " ").trim().slice(0, 100) || "Unnamed submission");
  const more = oversized.length > names.length ? ` and ${oversized.length - names.length} more` : "";
  return `No submissions were queued. Too large to grade: ${names.join(", ")}${more}.`;
}
