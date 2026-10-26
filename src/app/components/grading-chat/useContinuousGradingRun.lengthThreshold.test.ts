import { beforeEach, describe, expect, it, vi } from "vitest";
// Ported no-render slot harness: hook callbacks are real, external actions mocked.
const h = vi.hoisted(() => { const slots: { value: unknown }[] = []; let cursor = 0; return {
  reset() { slots.length = 0; cursor = 0; }, begin() { cursor = 0; },
  useRef(init: unknown) { const i = cursor++; return (slots[i] ??= { value: { current: init } }).value; },
  useState(init: unknown) { const i = cursor++, slot = slots[i] ??= { value: typeof init === "function" ? (init as () => unknown)() : init }; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (old: unknown) => unknown)(slot.value) : next; }]; },
}; });
vi.mock("react", () => ({ useRef: h.useRef, useState: h.useState }));
const header = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/grading-chat-intake", () => ({ resolveChatRunHeaderAction: header, prepareChatSubmissionAction: prepare, prepareCompositeSubmissionAction: vi.fn() }));
import { useContinuousGradingRun } from "./useContinuousGradingRun";
import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
import type { GradeResult } from "@/lib/grade/types";
const grade = (student: string): GradeResult => ({ student, totalScore: "1/1", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], feedback: "", mergedFileCount: 0, submittedFiles: [] });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => { h.reset(); header.mockReset(); prepare.mockReset(); header.mockResolvedValue({ kind: "ok", effectiveRubric: "RUBRIC", rubricFingerprint: "fixed", criteriaNames: [], rubricUsed: "provided" }); });
describe("continuous grading frozen word shortfall threshold", () => {
  it.each([0, -1, 1.5, NaN, Infinity, 1_000_001])("refuses invalid enabled N=%s before resolving or preparing", async (value) => {
    const dispatch = vi.fn(); h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    expect(await driver.beginSession({ assignmentInstructions: "Minimum 500 words", rubric: "RUBRIC", applyLengthDeduction: true, lengthDeductionThresholdWords: value })).toMatchObject({ kind: "refused" });
    expect(header).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
  });
  it.each([false, true])("omitted threshold defaults to one only when length deduction is %s", async (enabled) => {
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => grade(request.entry.student)); h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    await driver.beginSession({ assignmentInstructions: "Minimum 500 words", rubric: "RUBRIC", applyLengthDeduction: enabled }); await driver.submit({ kind: "text", content: "Student", label: "Student" });
    expect(dispatch.mock.calls[0][0].lengthDeductionThresholdWords).toBe(enabled ? 1 : undefined);
  });
  it("ignores invalid unused OFF value and resets the driver default for a new session", async () => {
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => grade(request.entry.student)); h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    expect(await driver.beginSession({ assignmentInstructions: "No minimum", rubric: "RUBRIC", applyLengthDeduction: false, lengthDeductionThresholdWords: NaN })).toEqual({ kind: "ready" });
    await driver.submit({ kind: "text", content: "One", label: "One" }); await flush(); expect(dispatch.mock.calls[0][0]).not.toHaveProperty("lengthDeductionThresholdWords");
    driver.reset(); await driver.beginSession({ assignmentInstructions: "Minimum 500 words", rubric: "RUBRIC", applyLengthDeduction: true }); await driver.submit({ kind: "text", content: "Two", label: "Two" });
    expect(dispatch.mock.calls[1][0].lengthDeductionThresholdWords).toBe(1);
  });
  it("retains N=25 on failed-row retry, files, URL and successful-row regrade without another header call", async () => {
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => grade(request.entry.student)); dispatch.mockRejectedValueOnce(new Error("Fixture retry"));
    prepare.mockResolvedValue({ kind: "entries", entries: [{ student: "From file", content: "FILE", submittedFiles: [], mergedFileCount: 0 }], pointsPossible: 10 });
    h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    const options = { assignmentInstructions: "Minimum 500 words", rubric: "RUBRIC", applyLengthDeduction: true, lengthDeductionThresholdWords: 25 };
    await driver.beginSession(options); options.lengthDeductionThresholdWords = 99;
    await driver.submit({ kind: "text", content: "TEXT", label: "Text" }); await flush(); driver.retry(0); await flush();
    await driver.submit({ kind: "file", file: new File(["FILE"], "student.txt") }); await flush();
    await driver.submit({ kind: "url", url: "https://example.org/work" }); await flush(); driver.regrade("Text"); await flush();
    expect(dispatch).toHaveBeenCalledTimes(5); expect(header).toHaveBeenCalledTimes(1);
    for (const [request] of dispatch.mock.calls) expect(request).toMatchObject({ lengthDeductionThresholdWords: 25, applyLengthDeduction: true });
  });
});
