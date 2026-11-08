import { describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = [];
  let cursor = 0;
  return {
    begin: () => { cursor = 0; },
    useState: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init };
      const slot = slots[i];
      return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (value: unknown) => unknown)(slot.value) : next; }];
    },
    useRef: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: { current: init } };
      return slots[i].value;
    },
  };
});
vi.mock("react", () => ({ useState: hook.useState, useRef: hook.useRef }));
const prepare = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/grading-chat-intake", () => ({
  resolveChatRunHeaderAction: vi.fn().mockResolvedValue({ kind: "ok", effectiveRubric: "Rubric", criteriaNames: [], rubricUsed: "", rubricFingerprint: "" }),
  prepareChatSubmissionAction: prepare,
  prepareCompositeSubmissionAction: vi.fn(),
}));
import { useContinuousGradingRun } from "./useContinuousGradingRun";

describe("partial oversized batch admission", () => {
  it("preserves a labelled class student's identity and never retries the batch", async () => {
    const dispatch = vi.fn().mockReturnValue(new Promise(() => {}));
    // React hooks are mocked above; this harness explicitly advances hook slots.
    const invokeDriver = useContinuousGradingRun;
    const driver = () => { hook.begin(); return invokeDriver({ provider: "gemini", dispatchItem: dispatch, maxEntries: 40 }); };
    await driver().beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    const entry = { student: "Same name", content: "ok", mergedFileCount: 0, submittedFiles: [] };
    prepare.mockResolvedValue({ kind: "entries", entries: [entry], pointsPossible: 50, oversizedOmissions: [{ index: 1, student: "Same name" }] });
    const result = await driver().submit({ kind: "url", url: "https://canvas.example.edu/courses/1/assignments/2", label: "Entire class" });
    expect(result).toMatchObject({ kind: "partial", dispatchedCount: 1, refusedCount: 1 });
    if (result.kind === "partial") {
      expect(result.reason).toContain("Same name (item 2)");
      expect(result.reason).toContain("Queued 1");
      expect(result.reason).toContain("Do not resubmit the entire batch");
      expect(result.reason).not.toContain("Graded");
    }
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].entry.student).toBe("Same name");
  });
});
