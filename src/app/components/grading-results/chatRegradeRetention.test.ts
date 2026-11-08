import { describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = []; let cursor = 0;
  return {
    begin: () => { cursor = 0; },
    useState: (init: unknown) => { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init }; const slot = slots[i]; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (value: unknown) => unknown)(slot.value) : next; }]; },
    useRef: (init: unknown) => { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: init } }; return slots[i].value; },
  };
});
vi.mock("react", () => ({ useState: hook.useState, useRef: hook.useRef }));
vi.mock("@/app/actions/grading-chat-intake", () => ({
  resolveChatRunHeaderAction: vi.fn().mockResolvedValue({ kind: "ok", effectiveRubric: "Rubric", criteriaNames: [], rubricUsed: "", rubricFingerprint: "" }),
  prepareChatSubmissionAction: vi.fn(), prepareCompositeSubmissionAction: vi.fn(),
}));
import { useContinuousGradingRun } from "../grading-chat/useContinuousGradingRun";
const row = (score: string) => ({ student: "Ada", overallComment: score, strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: score, feedback: score, mergedFileCount: 1, submittedFiles: [] });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("regrade retention", () => {
  it("preserves the current grade through failures and holds a successful candidate until accepted", async () => {
    let resolveCandidate!: (value: ReturnType<typeof row>) => void;
    const dispatch = vi.fn().mockResolvedValueOnce(row("8/10")).mockRejectedValueOnce(new Error("failed")).mockImplementationOnce(() => new Promise((resolve) => { resolveCandidate = resolve; }));
    const invoke = useContinuousGradingRun;
    const driver = () => { hook.begin(); return invoke({ provider: "gemini", dispatchItem: dispatch }); };
    await driver().beginSession({ assignmentInstructions: "Instructions", rubric: "Rubric" });
    await driver().submit({ kind: "text", content: "work", label: "Ada" });
    await flush();
    expect(driver().run?.results[0].totalScore).toBe("8/10");
    driver().regrade("Ada"); await flush();
    expect(dispatch.mock.calls[1][0]).toMatchObject({ sourceIndex: 0, entry: { student: "Ada" }, rubric: "Rubric" });
    expect(dispatch.mock.calls[1][0].pointsPossible).toBe(dispatch.mock.calls[0][0].pointsPossible);
    expect(driver().run?.results[0].totalScore).toBe("8/10");
    expect(driver().regradeFailures.has("Ada")).toBe(true);
    driver().regrade("Ada");
    expect(driver().run?.results[0].totalScore).toBe("8/10");
    resolveCandidate(row("9/10")); await flush();
    const candidate = driver().regradeCandidates.get("Ada")!;
    expect(candidate.totalScore).toBe("9/10");
    expect(driver().run?.results[0].totalScore).toBe("8/10");
    expect(driver().acceptRegrade("Ada", row("9/10"))).toBe(false);
    expect(driver().acceptRegrade("Ada", candidate)).toBe(true);
    expect(driver().run?.results[0].totalScore).toBe("9/10");
    expect(driver().acceptRegrade("Ada", candidate)).toBe(false);
    expect(driver().dispatchedCount).toBe(1);
    expect(driver().completedCount).toBe(1);
    dispatch.mockResolvedValueOnce(row("9.5/10"));
    driver().regrade("Ada"); await flush();
    const stale = driver().regradeCandidates.get("Ada")!;
    const snapshot = driver().repositoryAdapter.capture({ sessionEpoch: driver().runKey, sourceIndex: 0 })!;
    expect(driver().repositoryAdapter.adopt(snapshot, row("7/10"), snapshot.body.entry)).toBe(true);
    expect(driver().acceptRegrade("Ada", stale)).toBe(false);
    expect(driver().regradeCandidates.has("Ada")).toBe(false);
    expect(driver().regradeFailures.has("Ada")).toBe(true);
    expect(driver().run?.results[0].totalScore).toBe("7/10");
    dispatch.mockImplementationOnce(() => new Promise((resolve) => { resolveCandidate = resolve; }));
    driver().regrade("Ada");
    driver().reset();
    resolveCandidate(row("10/10")); await flush();
    expect(driver().regradeCandidates.size).toBe(0);
    expect(driver().run).toBeNull();
  });
});
