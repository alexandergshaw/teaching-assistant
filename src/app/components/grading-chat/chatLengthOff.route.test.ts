import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const h = vi.hoisted(() => { const slots: { value: unknown }[] = []; let cursor = 0; return { reset() { slots.length = 0; cursor = 0; }, rewind() { cursor = 0; }, useRef(init: unknown) { const i = cursor++; return (slots[i] ??= { value: { current: init } }).value; }, useState(init: unknown) { const i = cursor++, slot = slots[i] ??= { value: typeof init === "function" ? (init as () => unknown)() : init }; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (old: unknown) => unknown)(slot.value) : next; }]; } }; });
const llm = vi.hoisted(() => vi.fn());
vi.mock("react", () => ({ useRef: h.useRef, useState: h.useState }));
vi.mock("@/app/actions/grading-chat-intake", () => ({ resolveChatRunHeaderAction: vi.fn(async () => ({ kind: "ok", effectiveRubric: "Content (10 pts): reasoning.\nLength (5 pts): deduct points if fewer than 500 words.", rubricFingerprint: "fixed", criteriaNames: [], rubricUsed: "provided" })), prepareChatSubmissionAction: vi.fn(), prepareCompositeSubmissionAction: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn() }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { useContinuousGradingRun } from "./useContinuousGradingRun";
import { POST } from "@/app/api/grade-run-item/route";
import { LENGTH_DEDUCTION_OFF_DIRECTIVE } from "@/lib/grade/prompts";
import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";

beforeEach(() => { h.reset(); llm.mockReset(); llm.mockResolvedValue({ ok: true, text: '{"overallComment":"Clear work","rubricResults":[{"area":"Content","score":"10/10"}]}' }); });
it("carries the unchecked session setting through the real item route to the model request and grade", async () => {
  const results: unknown[] = [];
  const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: async (request: GradeRunItemRequestBody) => {
    const response = await POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => request } as NextRequest);
    expect(response.status).toBe(200); const body = await response.json(); results.push(body.result); return body.result;
  } });
  expect(await driver.beginSession({ assignmentInstructions: "Explain your reasoning.", rubric: "Content (10 pts): reasoning.\nLength (5 pts): deduct points if fewer than 500 words.", applyLengthDeduction: false })).toEqual({ kind: "ready" });
  await driver.submit({ kind: "text", content: "A short, complete answer.", label: "Student" });
  await vi.waitFor(() => expect(results).toHaveLength(1));
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain(LENGTH_DEDUCTION_OFF_DIRECTIVE);
  expect(JSON.stringify(results[0])).toContain("15/15");
});
it("reports an actual route refusal as failed in the run diagnostics", async () => {
  const results: unknown[] = [];
  const options = { provider: "gemini" as const, dispatchItem: async (request: GradeRunItemRequestBody) => {
    const response = await POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => request } as NextRequest);
    const body = await response.json(); results.push(body.result); return body.result;
  } };
  const driver = useContinuousGradingRun(options);
  expect(await driver.beginSession({ assignmentInstructions: "Minimum 500 words", rubric: "Content (10 pts): reasoning.\nLength (5 pts): deduct points if fewer than 500 words.", applyLengthDeduction: false })).toEqual({ kind: "ready" });
  await driver.submit({ kind: "text", content: "A short answer.", label: "Student" });
  await vi.waitFor(() => expect(results).toHaveLength(1));
  expect(results[0]).toMatchObject({ ungraded: { kind: "grading-failed" } });
  h.rewind(); const rerendered = useContinuousGradingRun(options);
  expect(rerendered.diagnostics).toHaveLength(1);
  expect(rerendered.diagnostics[0].outcome).toBe("failed");
});
