import type { GradeResult } from "./types";

/** Evidence acknowledgement is tied to a specific result object so regrading
 * or replacing a row requires a new review. */
export function incompleteEvidenceReason(row: Pick<GradeResult, "linkFetch" | "submissionTruncated" | "evidenceProvenanceUnknown">): string | null {
  const problems: string[] = [];
  if (row.evidenceProvenanceUnknown) problems.push("saved evidence provenance is unknown");
  if (row.linkFetch === "failed") problems.push("a submitted link could not be fetched");
  if (row.linkFetch === "flagged") problems.push("a linked submission was not fully available");
  if (row.submissionTruncated) problems.push("submission content was truncated");
  return problems.length ? `Review before posting: ${problems.join("; ")}.` : null;
}

export function evidencePostRefusal(row: GradeResult, reviewed: ReadonlySet<GradeResult>): string | null {
  const reason = incompleteEvidenceReason(row);
  return reason && !reviewed.has(row) ? reason : null;
}
