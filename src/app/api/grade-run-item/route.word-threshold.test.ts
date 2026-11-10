import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const { llm, runner, resolve } = vi.hoisted(() => ({ llm: vi.fn(), runner: vi.fn(async () => null), resolve: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: resolve }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: runner }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { POST } from "./route";
import { LENGTH_DEDUCTION_DIRECTIVE, LENGTH_DEDUCTION_OFF_DIRECTIVE } from "@/lib/grade/prompts";
const base = { sourceIndex: 0, entry: { student: "Student", content: "student words", mergedFileCount: 1, submittedFiles: [] }, assignmentInstructions: "Explain your reasoning.", rubric: "Content (10 pts): reasoning", provider: "gemini", pointsPossible: 10 };
const send = (body: unknown) => POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => body } as NextRequest);
beforeEach(() => {
  vi.clearAllMocks();
  llm.mockResolvedValue({ ok: true, text: '{"overallComment":"Clear work","rubricResults":[{"area":"Content","score":"10/10"}]}' });
});
it("actual POST to real engine forwards the frozen numeric grading policy", async () => {
  const body = { ...structuredClone(base), assignmentInstructions: "Minimum 500 words", applyLengthDeduction: true, lengthDeductionThresholdWords: 25 };
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

it("refuses an inseparable length rule before grading when deductions are disabled", async () => {
  const response = await send({ ...base, rubric: "Content (10 pts): reasoning; deduct for fewer than 500 words", suppressLengthDeduction: true });
  expect(response.status).toBe(200); expect(llm).not.toHaveBeenCalled();
  const result = await response.json(); expect(result.result.ungraded.kind).toBe("grading-failed");
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
it("awards full credit for the explicitly disabled length-only criterion and grades substantive criteria", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Accurate.", totalScore: "10/10", rubricResults: [{ area: "Accuracy", score: "10/10", comment: "Correct." }] }) });
  const response = await send({ ...base, assignmentInstructions: "State the freezing point of water.", entry: { ...base.entry, content: "Water freezes at 0 degrees Celsius at standard atmospheric pressure." }, rubric: "Accuracy (10 pts): state the freezing point of water correctly.\nLength (5 pts): deduct points if fewer than 200 words.", pointsPossible: 15, suppressLengthDeduction: true });
  expect(response.status).toBe(200);
  const result = (await response.json()).result;
  expect(result.ungraded).toBeUndefined(); expect(result.totalScore).toBe("15/15");
  expect(result.rubricAreas).toEqual(expect.arrayContaining([expect.objectContaining({ area: "Accuracy", score: "10/10" }), expect.objectContaining({ area: "Length", score: "5/5", comment: "Length deductions are disabled." })]));
  expect(JSON.stringify(llm.mock.calls[0][0])).not.toContain("deduct points if fewer than 200 words");
});
it("grades the exact live setup with its standalone assignment length sentence disabled", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Accurate.", totalScore: "10/10", rubricResults: [{ area: "Accuracy", score: "10/10", comment: "Correct." }] }) });
  const response = await send({ ...base, assignmentInstructions: "Explain the freezing point of water. The assignment requests at least 200 words.", entry: { ...base.entry, content: "Water freezes at 0 degrees Celsius at standard atmospheric pressure." }, rubric: "Accuracy (10 pts): state the freezing point of water correctly.\nLength (5 pts): deduct points if fewer than 200 words.", pointsPossible: 15, suppressLengthDeduction: true });
  const result = (await response.json()).result; expect(result.ungraded).toBeUndefined(); expect(result.totalScore).toBe("15/15");
  const prompt = JSON.stringify(llm.mock.calls[0][0]); expect(prompt).toContain("Explain the freezing point of water."); expect(prompt).not.toContain("The assignment requests at least 200 words.");
  expect(result.overallComment).toContain("Length requirements were not used for scoring.");
});
it.each(["Explain the freezing point. The assignment requests at least 200 words and citations.", "The assignment requests at least 200 words, with citations."])("refuses to discard a mixed assignment sentence: %s", async (assignmentInstructions) => {
  const response = await send({ ...base, assignmentInstructions, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed"); expect(llm).not.toHaveBeenCalled();
});
it("leaves the same length criterion with the model when length deductions are enabled", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Deducted points for word count.", rubricResults: [{ area: "Accuracy", score: "10/10" }, { area: "Length", score: "3/5" }] }) });
  const response = await send({ ...base, rubric: "Accuracy (10 pts): correct.\nLength (5 pts): deduct points if fewer than 200 words.", pointsPossible: 15, applyLengthDeduction: true });
  const result = (await response.json()).result;
  expect(result.ungraded).toBeUndefined(); expect(result.totalScore).toBe("13/15");
  expect(JSON.stringify(llm.mock.calls[0][0])).toContain("deduct points if fewer than 200 words");
});
it("does not grant full credit when a length criterion also grades substantive content", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Deducted 2 points for word count", rubricResults: [{ area: "Accuracy", score: "10/10" }, { area: "Length", score: "3/5" }] }) });
  const response = await send({ ...base, rubric: "Accuracy (10 pts): correct.\nLength (5 pts): deduct points if fewer than 200 words and assess clarity.", pointsPossible: 15, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed");
});
it("does not grant full credit when a continuation adds substantive length-criterion requirements", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Deducted 2 points for word count", rubricResults: [{ area: "Accuracy", score: "10/10" }, { area: "Length", score: "3/5" }] }) });
  const response = await send({ ...base, rubric: "Accuracy (10 pts): correct.\nLength (5 pts): deduct points if fewer than 200 words.\n  Also assess clarity.", pointsPossible: 15, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed");
});
it("refuses when a second substantive criterion also contains a length rule", async () => {
  const response = await send({ ...base, rubric: "Accuracy (10 pts): deduct if fewer than 100 words; assess correctness.\nLength (5 pts): deduct points if fewer than 200 words.", pointsPossible: 15, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed"); expect(llm).not.toHaveBeenCalled();
});
it("fails closed when substantive scores are missing or use an unexpected scale", async () => {
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Good work.", rubricResults: [{ area: "Accuracy", score: "5/5" }] }) });
  const response = await send({ ...base, rubric: "Accuracy (10 pts): correct.\nLength (5 pts): deduct points if fewer than 200 words.", pointsPossible: 15, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed");
});
it("grades separate initial and reply axes with a disabled initial length criterion", async () => {
  llm.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ overallComment: "Correct initial.", rubricResults: [{ area: "Accuracy", score: "10/10" }] }) });
  llm.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ overallComment: "Relevant reply.", rubricResults: [{ area: "Engagement", score: "7/10" }] }) });
  const initialPostContent = "=== INITIAL POST ===\nInitial response.";
  const replyContent = "=== REPLIES TO CLASSMATES ===\n--- Reply 1 ---\nThoughtful response.";
  const response = await send({ ...base, entry: { ...base.entry, content: `${initialPostContent}\n\n${replyContent}`, discussionAxes: { initialPostContent, replyContent, replyCount: 1 } }, rubric: "Accuracy (10 pts): correct.\nLength (5 pts): deduct points if fewer than 200 words.\nReply section:\nEngagement (10 pts): relevant.", pointsPossible: 25, suppressLengthDeduction: true });
  expect(response.status).toBe(200); const result = (await response.json()).result;
  expect(result.ungraded).toBeUndefined(); expect(result.totalScore).toBe("22/25");
  expect(result.rubricAreas).toEqual(expect.arrayContaining([expect.objectContaining({ area: "Length", score: "5/5" }), expect.objectContaining({ area: "Engagement", score: "7/10" })]));
  expect(llm).toHaveBeenCalledTimes(2);
});
it("grades separate initial and reply axes with a disabled reply length criterion", async () => {
  llm.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ overallComment: "Correct initial.", rubricResults: [{ area: "Accuracy", score: "10/10" }] }) });
  llm.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ overallComment: "Relevant reply.", rubricResults: [{ area: "Engagement", score: "7/10" }] }) });
  const initialPostContent = "=== INITIAL POST ===\nInitial response.";
  const replyContent = "=== REPLIES TO CLASSMATES ===\n--- Reply 1 ---\nThoughtful response.";
  const response = await send({ ...base, entry: { ...base.entry, content: `${initialPostContent}\n\n${replyContent}`, discussionAxes: { initialPostContent, replyContent, replyCount: 1 } }, rubric: "Accuracy (10 pts): correct.\nReply section:\nEngagement (10 pts): relevant.\nLength (5 pts): deduct points if fewer than 200 words.", pointsPossible: 25, suppressLengthDeduction: true });
  expect(response.status).toBe(200); const result = (await response.json()).result;
  expect(result.ungraded).toBeUndefined(); expect(result.totalScore).toBe("22/25"); expect(llm).toHaveBeenCalledTimes(2);
});
it("does not award reply length credit when there are no replies", async () => {
  const initialPostContent = "=== INITIAL POST ===\nInitial response.";
  const response = await send({ ...base, entry: { ...base.entry, content: initialPostContent, discussionAxes: { initialPostContent, replyContent: "", replyCount: 0 } }, rubric: "Accuracy (10 pts): correct.\nReply section:\nEngagement (10 pts): relevant.\nLength (5 pts): deduct points if fewer than 200 words.", pointsPossible: 25, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed"); expect(llm).not.toHaveBeenCalled();
});
it.each(["Minimum 500 words", "A 500-word minimum applies.", "Explain the answer and deduct points if fewer than 200 words."])("refuses an inseparable assignment instruction: %s", async (assignmentInstructions) => {
  const response = await send({ ...base, assignmentInstructions, suppressLengthDeduction: true });
  expect((await response.json()).result.ungraded.kind).toBe("grading-failed"); expect(llm).not.toHaveBeenCalled();
});
it("neutralizes independent length-only clauses in the observed Canvas discussion instructions", async () => {
  const assignmentInstructions = "Submit a 100-150 word initial discussion post by the end of Unit 1. Respond to 3 peers by the end of Unit 2. Create a 250 - 350 word discussion post that contains an introduction. Explain your reasoning (200-300 words). Each response should be 100-150 words.";
  const response = await send({ ...base, assignmentInstructions, suppressLengthDeduction: true });
  const result = (await response.json()).result; expect(result.ungraded).toBeUndefined();
  const prompt = JSON.stringify(llm.mock.calls[0][0]);
  expect(prompt).toContain("Submit an initial discussion post by the end of Unit 1");
  expect(prompt).toContain("Respond to 3 peers"); expect(prompt).toContain("Explain your reasoning");
  expect(prompt).not.toContain("250 - 350 word"); expect(prompt).not.toContain("100-150 words");
  expect(result.overallComment).toContain("Length requirements were not used for scoring.");
});
it.each(["Each response should be 100 words and include analysis.", "Each response should be 100 words, cite sources.", "Each response should be 100 words or identify two cases."])("refuses a mixed instruction without losing its substantive obligation: %s", async (assignmentInstructions) => {
  const response = await send({ ...base, assignmentInstructions, suppressLengthDeduction: true });
  const result = (await response.json()).result; expect(result.ungraded.kind).toBe("grading-failed");
  expect(llm).not.toHaveBeenCalled();
});
it("removes only the observed length phrases from NIST rating tiers and preserves substantive requirements", async () => {
  const rubric = "NIST Framework Analysis (20 points): evaluate the analysis.\n20 pts Outstanding 250 words. An analysis of how the NIST frameworks apply to real security work, covering the framework's benefits, its systematic approach to assessment, and how it improves professional communication. All the prompts are addressed clearly.\n19 pts Exceeds Standard 250 words. Strong analysis of NIST framework applications with good understanding of professional security work applications.\n17 pts Meets Standard 250 words. Adequate analysis covering basic NIST framework applications. Shows understanding but may lack depth or insight.\n15 pts Approaches Standard Slightly off word count or limited analysis. Basic understanding of NIST frameworks but lacks detail or professional context.\n13 pts Below Standard Significantly off word count or minimal analysis. Poor understanding of NIST framework applications.\n0 pts No Evidence No analysis submitted.";
  llm.mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "The analysis addresses the framework.", rubricResults: [{ area: "NIST Framework Analysis", score: "18/20" }] }) });
  const response = await send({ ...base, rubric, pointsPossible: 20, suppressLengthDeduction: true });
  const result = (await response.json()).result; expect(result.ungraded).toBeUndefined(); expect(result.totalScore).toBe("18/20");
  const prompt = JSON.stringify(llm.mock.calls[0][0]); expect(prompt).not.toContain("250 words."); expect(prompt).not.toContain("off word count");
  expect(prompt).toContain("systematic approach to assessment"); expect(prompt).toContain("limited analysis"); expect(prompt).toContain("minimal analysis"); expect(prompt).toContain("15 pts Approaches Standard");
  expect(result.overallComment).toContain("Length requirements were not used for scoring.");
});
