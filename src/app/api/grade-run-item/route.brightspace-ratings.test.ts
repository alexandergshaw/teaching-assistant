import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
const { llm } = vi.hoisted(() => ({ llm: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { POST } from "./route";
const rubric = ["Criteria", "Meets Expectations (100%)", "Partially Meets Expectations (70%)", "Does Not Meet Expectations (0%)", "Value", "Reasoning", "Complete", "Partial", "Missing", "25", "Content", "Complete", "Partial", "Missing", "75", "Total:", "100%"].join("\n");
const send = () => POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => ({ sourceIndex: 0, entry: { student: "Synthetic", content: "Example", mergedFileCount: 1, submittedFiles: [] }, assignmentInstructions: "Explain.", rubric, provider: "gemini", pointsPossible: 100 }) } as NextRequest);
const reply = (scores: { area: string; score: string }[], totalScore = "0/100") => ({ ok: true, text: JSON.stringify({ overallComment: "Feedback", rubricResults: scores, totalScore }) });
beforeEach(() => vi.clearAllMocks());
it("holds an off-tier score instead of rounding it", async () => {
  llm.mockResolvedValue(reply([{ area: "Reasoning", score: "12.5/25" }, { area: "Content", score: "75/75" }]));
  const row = (await (await send()).json()).result;
  expect(row.ungraded.kind).toBe("grading-failed"); expect(row.ungraded.message).toMatch(/allowed ratings/i); expect(row.totalScore).toBe("");
});
it("accepts exact tiers and derives the total from validated criteria", async () => {
  llm.mockResolvedValue(reply([{ area: "Reasoning", score: "17.5/25" }, { area: "Content", score: "75/75" }], "100/100"));
  const row = (await (await send()).json()).result;
  expect(row.ungraded).toBeUndefined(); expect(row.totalScore).toBe("92.50/100");
});
it.each([[{ area: "Reasoning", score: "25/25" }], [{ area: "Reasoning", score: "25/25" }, { area: "Reasoning", score: "25/25" }], [{ area: "Reasoning", score: "70%" }, { area: "Content", score: "75/75" }], [{ area: "Reasoning", score: "17.5/30" }, { area: "Content", score: "75/75" }]])("holds missing, duplicate or unparseable criteria", async (scores) => {
  llm.mockResolvedValue(reply(scores)); expect((await (await send()).json()).result.ungraded.kind).toBe("grading-failed");
});
