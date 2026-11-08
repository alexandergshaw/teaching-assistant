import { describe, expect, it } from "vitest";
import type { GradeResult } from "../../../lib/grade/types";
import { evidencePostRefusal, incompleteEvidenceReason } from "../../../lib/grade/evidence-review";
const row = (extra: Partial<GradeResult> = {}): GradeResult => ({ student: "Alice", totalScore: "1/1", rubricAreas: [], overallComment: "ok", ...extra } as GradeResult);
describe("incomplete evidence review", () => {
  it("explains failed or unfetched links and truncation, but accepts complete evidence", () => {
    expect(incompleteEvidenceReason(row())).toBeNull();
    expect(incompleteEvidenceReason(row({ evidenceProvenanceUnknown: true }))).toMatch(/provenance is unknown/);
    expect(incompleteEvidenceReason(row({ linkFetch: "ok" }))).toBeNull();
    expect(incompleteEvidenceReason(row({ linkFetch: "failed", submissionTruncated: true }))).toMatch(/could not be fetched.*truncated/);
    expect(incompleteEvidenceReason(row({ linkFetch: "flagged" }))).toMatch(/not fully available/);
  });
  it("reviews only the precise result, never another student or replacement grade", () => {
    const first = row({ linkFetch: "failed" }), other = row({ student: "Bob", linkFetch: "failed" });
    const reviewed = new Set([first]);
    expect(evidencePostRefusal(first, reviewed)).toBeNull();
    expect(evidencePostRefusal(other, reviewed)).not.toBeNull();
    expect(evidencePostRefusal({ ...first }, reviewed)).not.toBeNull();
    expect(evidencePostRefusal(row(), reviewed)).toBeNull();
  });
});
