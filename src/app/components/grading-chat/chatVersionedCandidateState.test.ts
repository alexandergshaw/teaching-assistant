import { describe, expect, it } from "vitest";
import type { GradeResult } from "@/lib/grade/types";
import { appendChatSetupVersion } from "./chatVersionedSetup";
import { admitVersionedCandidate } from "./chatVersionedCandidate";
import { consumeVersionedCandidate, settleVersionedCandidate, type CandidateState } from "./chatVersionedCandidateState";

const setup = { assignmentInstructions: "Instructions", rubric: "Rubric", provider: "gemini" as const, pointsPossible: 10 };
const history = appendChatSetupVersion({ current: 0, versions: [] }, 0, setup)!;
const row = { sourceIndex: 0, sourceRevision: 2, resultRevision: 3, pending: false, retainedRequest: { ...setup, sourceIndex: 0, entry: { student: "Student", content: "Source", submittedFiles: [], mergedFileCount: 0 } } };
const result: GradeResult = { student: "Student", totalScore: "8/10", strengths: "Good", improvements: "Improve", resubmitNotice: "", overallComment: "Good", feedback: "Good", rubricAreas: [], mergedFileCount: 0, submittedFiles: [] };
const ticket = admitVersionedCandidate("session", "attempt1", new Set(), history, 1, [row], 0)!.ticket;
const pending: CandidateState = { status: "pending", ticket };

describe("versioned candidate state", () => {
  it("requires a matching response and explicit acceptance, and consumes only once", () => {
    expect(settleVersionedCandidate(pending, "other", result)).toBeNull();
    const ready = settleVersionedCandidate(pending, "attempt1", result)!;
    expect(ready.status).toBe("ready");
    expect(settleVersionedCandidate(ready, "attempt1", result)).toBeNull();
    expect(consumeVersionedCandidate(ready, "session", { ...row, resultRevision: 4 }, "attempt1")).toBeNull();
    const accepted = consumeVersionedCandidate(ready, "session", row, "attempt1")!;
    expect(accepted.replacement).toMatchObject({ setupVersion: 1, result: { totalScore: "8/10" } });
    expect(consumeVersionedCandidate(accepted.state, "session", row, "attempt1")).toBeNull();
  });
  it("does not make a mismatched student's response available", () => {
    const failed = settleVersionedCandidate(pending, "attempt1", { ...result, student: "Other" })!;
    expect(failed.status).toBe("failed");
    expect(consumeVersionedCandidate(failed, "session", row, "attempt1")).toBeNull();
  });
});
