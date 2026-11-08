import { describe, expect, it } from "vitest";
import type { GradeResult } from "@/lib/grade/types";
import { appendChatSetupVersion } from "./chatVersionedSetup";
import { acceptedVersionedCandidate, admitVersionedCandidate, captureVersionedCandidate } from "./chatVersionedCandidate";

const setup = { assignmentInstructions: "Instructions", rubric: "Rubric", provider: "gemini" as const, pointsPossible: 10 };
const history = appendChatSetupVersion({ current: 0, versions: [] }, 0, setup)!;
const row = { sourceIndex: 0, sourceRevision: 2, resultRevision: 3, pending: false, retainedRequest: { ...setup, sourceIndex: 0, entry: { student: "Student", content: "Old source", submittedFiles: [], mergedFileCount: 0 } } };
const result: GradeResult = { student: "Student", totalScore: "8/10", strengths: "Good", improvements: "Improve", resubmitNotice: "", overallComment: "Good", feedback: "Good", rubricAreas: [], mergedFileCount: 0, submittedFiles: [] };

describe("versioned candidate admission", () => {
  it("captures the source and holds a candidate until explicit acceptance", () => {
    const admission = admitVersionedCandidate("session", "attempt1", new Set(), history, 1, [row], 0)!;
    const candidate = captureVersionedCandidate(admission.ticket, "attempt1", result)!;
    expect(candidate.result).not.toBe(result);
    expect(admission.request.entry).not.toBe(row.retainedRequest.entry);
    expect(acceptedVersionedCandidate("session", row, "attempt1", candidate)).toMatchObject({ setupVersion: 1, result: { totalScore: "8/10" } });
    expect(row.retainedRequest.entry.content).toBe("Old source");
  });
  it("rejects reused attempts, pending rows and stale candidates after edits or source changes", () => {
    expect(admitVersionedCandidate("session", "attempt1", new Set(["attempt1"]), history, 1, [row], 0)).toBeNull();
    expect(admitVersionedCandidate("session", "attempt1", new Set(), history, 1, [{ ...row, pending: true }], 0)).toBeNull();
    const admission = admitVersionedCandidate("session", "attempt1", new Set(), history, 1, [row], 0)!;
    const candidate = captureVersionedCandidate(admission.ticket, "attempt1", result)!;
    expect(acceptedVersionedCandidate("session", { ...row, resultRevision: 4 }, "attempt1", candidate)).toBeNull();
    expect(acceptedVersionedCandidate("session", { ...row, sourceRevision: 3 }, "attempt1", candidate)).toBeNull();
    expect(acceptedVersionedCandidate("other-session", row, "attempt1", candidate)).toBeNull();
    expect(acceptedVersionedCandidate("session", row, null, candidate)).toBeNull();
    expect(captureVersionedCandidate(admission.ticket, "attempt1", { student: "Student", totalScore: "", strengths: "", improvements: "", resubmitNotice: "", overallComment: "", feedback: "", rubricAreas: [], mergedFileCount: 0, submittedFiles: [], ungraded: { kind: "grading-failed", sourceIndex: 0, student: "Student", message: "Failed" } })).toBeNull();
    expect(captureVersionedCandidate(admission.ticket, "attempt2", result)).toBeNull();
    expect(captureVersionedCandidate(admission.ticket, "attempt1", { ...result, student: "Different student" })).toBeNull();
    expect(acceptedVersionedCandidate("session", row, "attempt1", { ...candidate, result: { ...result, student: "Different student" } })).toBeNull();
  });
});
