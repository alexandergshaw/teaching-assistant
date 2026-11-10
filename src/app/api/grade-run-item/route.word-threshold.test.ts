import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const { llm, runner, resolve } = vi.hoisted(() => ({ llm: vi.fn(), runner: vi.fn(async () => null), resolve: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: resolve }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: runner }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { POST } from "./route";
import { LENGTH_DEDUCTION_DIRECTIVE, LENGTH_DEDUCTION_OFF_DIRECTIVE } from "@/lib/grade/prompts";
const base = { sourceIndex: 0, entry: { student: "Student", content: "student words", mergedFileCount: 1, submittedFiles: [] }, assignmentInstructions: "Minimum 500 words", rubric: "Content (10 pts): reasoning", provider: "gemini", pointsPossible: 10 };
const send = (body: unknown) => POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => body } as NextRequest);
beforeEach(() => {
  vi.clearAllMocks();
  llm.mockResolvedValue({ ok: true, text: '{"overallComment":"Clear work","rubricResults":[{"area":"Content","score":"10/10"}]}' });
});
it("actual POST to real engine forwards the frozen numeric grading policy", async () => {
  const body = { ...structuredClone(base), applyLengthDeduction: true, lengthDeductionThresholdWords: 25 };
  const response = await send(body);
  expect(response.status).toBe(200);
  expect(llm).toHaveBeenCalledOnce();
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain("shortfall >= 25 words");
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain("Minimum 500 words");
  expect(body.lengthDeductionThresholdWords).toBe(25);
});
it.each([null, "25", 1.5, NaN, Infinity, 0, -1, 1_000_001, undefined])("rejects explicitly malformed threshold %s before resolution or LLM", async (value) => {
  const response = await send({ ...base, lengthDeductionThresholdWords: value });
  expect(response.status).toBe(400); expect(resolve).not.toHaveBeenCalled(); expect(llm).not.toHaveBeenCalled();
});
it.each([1, 1_000_000])("admits endpoint %s", async (value) => {
  expect((await send({ ...base, applyLengthDeduction: true, lengthDeductionThresholdWords: value })).status).toBe(200);
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain(`shortfall >= ${value} words`);
});
it("omission preserves legacy and OFF makes numeric policy inert", async () => {
  await send({ ...base, applyLengthDeduction: true });
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain(LENGTH_DEDUCTION_DIRECTIVE);
  llm.mockClear(); await send({ ...base, applyLengthDeduction: false, lengthDeductionThresholdWords: 25 });
  expect(JSON.stringify(llm.mock.calls[0][0])).not.toContain("shortfall >=");
  expect(JSON.stringify(llm.mock.calls[0][0])).not.toContain(LENGTH_DEDUCTION_DIRECTIVE);
});

it("explicit Chat off policy reaches the real engine and returns a grade without requesting a length penalty", async () => {
  const response = await send({ ...base, rubric: "Content (10 pts): reasoning; deduct for fewer than 500 words", suppressLengthDeduction: true });
  expect(response.status).toBe(200); expect(JSON.stringify(llm.mock.calls[0][0])).toContain(LENGTH_DEDUCTION_OFF_DIRECTIVE);
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain("deduct for fewer than 500 words");
  const result = await response.json(); expect(JSON.stringify(result)).toContain("10/10");
});
it("leaves legacy callers unchanged and refuses contradictory policies", async () => {
  await send(base); expect(JSON.stringify(llm.mock.calls[0][0])).not.toContain(LENGTH_DEDUCTION_OFF_DIRECTIVE);
  llm.mockClear(); expect((await send({ ...base, applyLengthDeduction: true, suppressLengthDeduction: true })).status).toBe(400); expect(llm).not.toHaveBeenCalled();
});

it("refuses an explicitly reported length penalty only when Chat disables it", async () => {
  llm.mockResolvedValue({ ok: true, text: '{"overallComment":"Deducted 2 points for word count.","rubricResults":[{"area":"Content","score":"8/10"}]}' });
  const blocked = await send({ ...base, suppressLengthDeduction: true });
  expect(blocked.status).toBe(200);
  const body = await blocked.json(); expect(body.result.ungraded.kind).toBe("grading-failed");
  expect(body.result.ungraded.message).toContain("length penalty");
  const allowed = await send({ ...base, applyLengthDeduction: true });
  expect((await allowed.json()).result.ungraded).toBeUndefined();
});
it("refuses a lower score on a length-only criterion while deductions are disabled", async () => {
  llm.mockResolvedValue({ ok: true, text: '{"overallComment":"Good work.","rubricResults":[{"area":"Word Count","score":"4/5","comment":"Reviewed."}]}' });
  const response = await send({ ...base, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed");
});
it.each(["Lost 2 points for word count", "2 points off for word count", "Deducted 2.5 points for word count"])("refuses an explicitly described disabled penalty: %s", async (comment) => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: comment, rubricResults: [{ area: "Content", score: "8/10" }] }) });
  const response = await send({ ...base, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed");
});
it("allows feedback explicitly stating that no points were deducted for word count", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "No points were deducted for word count", rubricResults: [{ area: "Content", score: "10/10" }] }) });
  const response = await send({ ...base, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded).toBeUndefined();
});
