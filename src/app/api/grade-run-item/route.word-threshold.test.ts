import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const { llm, runner, resolve } = vi.hoisted(() => ({ llm: vi.fn(), runner: vi.fn(async () => null), resolve: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: resolve }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: runner }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { POST } from "./route";
import { LENGTH_DEDUCTION_DIRECTIVE } from "@/lib/grade/prompts";
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
