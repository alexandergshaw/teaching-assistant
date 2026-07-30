// AC1/AC5/AC7/AC8: generateModuleObjectivesForAssignment (shared.ts) - the
// single prompt builder both buildScheduleWeekPlan (schedule-driven kickoffs/
// refresh) and buildAssignmentPlan (repo-driven coding kickoff) call, so it
// is the one place course-kind awareness, assignment grounding, and the
// applied tool-commitment rule need proving.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { generateModuleObjectivesForAssignment } from "./shared";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

describe("generateModuleObjectivesForAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embedded provider scaffolds deterministically and never calls the LLM", async () => {
    const result = await generateModuleObjectivesForAssignment(
      "week-01",
      "Week 1",
      "# Real assignment\n\n- Build a stakeholder register",
      "",
      "embedded"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.text).toContain("Module Objectives: Week 1");
    expect(callLlm).not.toHaveBeenCalled();
  });

  // AC1: "the assignment is what proves the objective" - the assignment text
  // is the PRIMARY grounding, not a secondary add-on the way it is for the
  // intro (upcomingAssignmentContext there is optional context, this is the
  // objectives' whole source).
  it("grounds the prompt in the assignment text when one is provided", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "# Module Objectives: Week 1\n\nBody" } as never);

    await generateModuleObjectivesForAssignment(
      "week-01",
      "Week 1",
      "# Build a stakeholder register\n\nStudents will interview three stakeholders.",
      "fallback topic text",
      "gemini"
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("THIS MODULE'S ASSIGNMENT");
    expect(prompt).toContain("Build a stakeholder register");
    expect(prompt).not.toContain("fallback topic text");
  });

  // AC7: an empty assignmentText (the assignment itself failed to generate)
  // must never fake-ground the objectives in a placeholder - it falls back
  // to the topic/summary content instead, exactly like the intro does.
  it("falls back to the fallback content, with different framing, when assignmentText is empty", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "# Module Objectives: Week 1\n\nBody" } as never);

    await generateModuleObjectivesForAssignment(
      "week-01",
      "Week 1",
      "",
      "Topic: Stakeholder Analysis\nMapping stakeholders.",
      "gemini"
    );

    const prompt = promptFromCall();
    expect(prompt).not.toContain("THIS MODULE'S ASSIGNMENT");
    expect(prompt).toContain("MODULE CONTENT");
    expect(prompt).toContain("Stakeholder Analysis");
  });

  // AC5: an applied (no-code) course's objectives must carry the applied
  // contract - the same courseKindContract every other generator here uses -
  // so an objective can never imply writing/running code.
  it("applied courseKind carries the no-code contract; coding does not", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "x" } as never)
      .mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "y" } as never);

    await generateModuleObjectivesForAssignment("w1", "Week 1", "assignment", "", "gemini", "applied");
    await generateModuleObjectivesForAssignment("w1", "Week 1", "assignment", "", "gemini", "coding");

    const appliedPrompt = promptFromCall(0);
    const codingPrompt = promptFromCall(1);
    expect(appliedPrompt).toContain("NOT a programming course");
    expect(codingPrompt).not.toContain("NOT a programming course");
  });

  // AC5: the same real-tool commitment the assignment/deck already respect
  // for an applied week (selectRequiredTools) must reach the objectives too,
  // so an objective can name the SAME tool rather than a generic skill.
  it("a non-blank requiredTools asks for a tool-specific objective; blank asks for nothing extra", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "x" } as never)
      .mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "y" } as never);

    await generateModuleObjectivesForAssignment("w1", "Week 1", "assignment", "", "gemini", "applied", "Trello (free plan)");
    await generateModuleObjectivesForAssignment("w1", "Week 1", "assignment", "", "gemini", "applied");

    const withTool = promptFromCall(0);
    const withoutTool = promptFromCall(1);
    expect(withTool).toContain("REQUIRED TOOL(S)");
    expect(withTool).toContain("Trello (free plan)");
    expect(withoutTool).not.toContain("REQUIRED TOOL(S)");
  });

  it("returns an error when the LLM call fails, without throwing", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 503, body: "unavailable" } as never);

    const result = await generateModuleObjectivesForAssignment("w1", "Week 1", "assignment", "", "gemini");

    expect("error" in result).toBe(true);
  });

  it("returns an error when the LLM returns an empty response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "   " } as never);

    const result = await generateModuleObjectivesForAssignment("w1", "Week 1", "assignment", "", "gemini");

    expect("error" in result).toBe(true);
  });
});
