// AC5: the coding kickoff (COURSE_KICKOFF) and a repo-bound Course Refresh
// both build their materials through the repo-driven pipeline
// (generateLecturePlansAction -> buildAssignmentPlan, shared.ts), a
// DIFFERENT function from the schedule-driven buildScheduleWeekPlan the
// no-code kickoff uses. Objectives must reach this pipeline too, or "both
// kickoffs" would be false. This pipeline is always "coding" by construction
// (an uploaded codebase's READMEs/unit tests - see the courseKind comments
// on generateSlidesForAssignment/buildAssignmentPlan), so there is no
// applied/courseKind branching to prove here - that is covered by
// module-objectives.test.ts against the shared prompt builder directly.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { buildAssignmentPlan, type AssignmentContentBundle, type LectureTemplates } from "./shared";
import { BLOOM_OBJECTIVES_CONTRACT } from "@/lib/bloom-taxonomy";

function callLlmPrompts(): string[] {
  return vi.mocked(callLlm).mock.calls.map((call) => {
    const part = call[0].contents[0].parts[0];
    return "text" in part ? part.text : "";
  });
}

const BUNDLE: AssignmentContentBundle = {
  name: "week1",
  content: "=== README.md ===\n# Week 1\n\nBuild a stakeholder register from the provided roster.",
  readmeContent: "# Week 1\n\nBuild a stakeholder register from the provided roster.",
};

const TEMPLATES: LectureTemplates = {
  introTemplateText: "",
  instructionsTemplateText: "",
  introTemplateHeadings: [],
  instructionsTemplateHeadings: [],
};

const ASSIGNMENT_TEXT = "# Week 1\n\n## Instructions\n- Interview three stakeholders\n- Draft a stakeholder register";

function mockHappyPath() {
  vi.mocked(callLlm).mockImplementation(async (req) => {
    const part = req.contents[0].parts[0];
    const text = "text" in part ? part.text : "";
    if (text.includes("writing a formal assignment instruction sheet")) {
      return { ok: true, status: 200, body: "", text: ASSIGNMENT_TEXT } as never;
    }
    if (text.includes("writing a module introduction")) {
      return { ok: true, status: 200, body: "", text: "# Module Introduction: Week 1\n\nBody" } as never;
    }
    if (text.includes("MODULE OBJECTIVES document")) {
      return {
        ok: true,
        status: 200,
        body: "",
        text: "# Module Objectives: Week 1\n\n## Learning Objectives\n- Build a stakeholder register",
      } as never;
    }
    // The lecture-slide-deck prompt (generateSlidesForAssignment).
    return {
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({ presentationTitle: "Week 1", slides: [{ title: "Slide 1", bullets: ["b"] }] }),
    } as never;
  });
}

describe("buildAssignmentPlan - module objectives (AC1/AC5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("populates moduleObjectives alongside slides/intro/instructions", async () => {
    mockHappyPath();

    const plan = await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini");

    expect(plan.moduleObjectives).toContain("Module Objectives");
    expect(plan.objectivesFailed).toBeUndefined();
    expect(plan.slidesFailed).toBe(false);
  });

  // AC1: "the assignment is what proves the objective" - this pipeline
  // grounds objectives in the REAL generated assignment instructions
  // (generated first, then objectives reads its resolved text), not just
  // the README source every other artifact here shares.
  it("grounds the objectives prompt in the REAL generated assignment instructions, not just the README", async () => {
    mockHappyPath();

    await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini");

    const prompts = callLlmPrompts();
    const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
    expect(objectivesPrompt).toBeTruthy();
    expect(objectivesPrompt).toContain("THIS MODULE'S ASSIGNMENT");
    expect(objectivesPrompt).toContain("Interview three stakeholders");
  });

  it("objectives generation runs AFTER instructions resolves (sequenced, not merely parallel)", async () => {
    mockHappyPath();

    await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini");

    const calls = vi.mocked(callLlm).mock.calls;
    const instructionsIdx = calls.findIndex((c) => {
      const part = c[0].contents[0].parts[0];
      return "text" in part && part.text.includes("writing a formal assignment instruction sheet");
    });
    const objectivesIdx = calls.findIndex((c) => {
      const part = c[0].contents[0].parts[0];
      return "text" in part && part.text.includes("MODULE OBJECTIVES document");
    });
    expect(instructionsIdx).toBeGreaterThan(-1);
    expect(objectivesIdx).toBeGreaterThan(-1);
    expect(objectivesIdx).toBeGreaterThan(instructionsIdx);
  });

  // AC7: instructions failing must not abort the run or leave objectives
  // fake-grounded in a placeholder - it falls back to the README/source
  // content instead, and the week's other artifacts still ship.
  it("falls back to the README/source content when instructions generation failed", async () => {
    vi.mocked(callLlm).mockImplementation(async (req) => {
      const part = req.contents[0].parts[0];
      const text = "text" in part ? part.text : "";
      if (text.includes("writing a formal assignment instruction sheet")) {
        return { ok: false, status: 503, body: "unavailable" } as never;
      }
      if (text.includes("writing a module introduction")) {
        return { ok: true, status: 200, body: "", text: "# Module Introduction: Week 1\n\nBody" } as never;
      }
      if (text.includes("MODULE OBJECTIVES document")) {
        return {
          ok: true,
          status: 200,
          body: "",
          text: "# Module Objectives: Week 1\n\n## Learning Objectives\n- Register stakeholders",
        } as never;
      }
      return {
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({ presentationTitle: "Week 1", slides: [{ title: "Slide 1", bullets: ["b"] }] }),
      } as never;
    });

    const plan = await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini");

    expect(plan.moduleObjectives.length).toBeGreaterThan(0);
    expect(plan.objectivesFailed).toBeUndefined();
    const prompts = callLlmPrompts();
    const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
    expect(objectivesPrompt).not.toContain("THIS MODULE'S ASSIGNMENT");
    expect(objectivesPrompt).toContain("Build a stakeholder register from the provided roster");
  });

  // AC7: objectives generation itself failing degrades visibly with the
  // scaffold, never an empty document or an aborted week.
  it("objectivesFailed is set and the scaffold still ships when objectives generation itself fails", async () => {
    vi.mocked(callLlm).mockImplementation(async (req) => {
      const part = req.contents[0].parts[0];
      const text = "text" in part ? part.text : "";
      if (text.includes("MODULE OBJECTIVES document")) {
        return { ok: false, status: 500, body: "boom" } as never;
      }
      if (text.includes("writing a formal assignment instruction sheet")) {
        return { ok: true, status: 200, body: "", text: ASSIGNMENT_TEXT } as never;
      }
      if (text.includes("writing a module introduction")) {
        return { ok: true, status: 200, body: "", text: "# Module Introduction: Week 1\n\nBody" } as never;
      }
      return {
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({ presentationTitle: "Week 1", slides: [{ title: "Slide 1", bullets: ["b"] }] }),
      } as never;
    });

    const plan = await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini");

    expect(plan.objectivesFailed).toBe(true);
    expect(plan.moduleObjectives.length).toBeGreaterThan(0);
    expect(plan.slidesFailed).toBe(false);
    expect(plan.assignmentInstructions).toContain("Interview three stakeholders");
  });
});

// AC6/AC9 (Bloom's Taxonomy, docs/REGRESSION.md 145/146): this pipeline calls
// the SAME generateModuleObjectivesForAssignment builder as the schedule-driven
// path, so it must carry the same shared Bloom contract and term-position wiring.
describe("buildAssignmentPlan - Bloom's Taxonomy (AC5/AC6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carries the Bloom's Taxonomy contract in the objectives prompt", async () => {
    mockHappyPath();

    await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini");

    const prompts = callLlmPrompts();
    const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
    expect(objectivesPrompt).toContain(BLOOM_OBJECTIVES_CONTRACT);
  });

  it("states the term position when a totalWeeks count is supplied", async () => {
    mockHappyPath();

    // BUNDLE.name is "week1", so buildAssignmentPlan resolves weekNumber to 1.
    await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini", 5);

    const prompts = callLlmPrompts();
    const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
    expect(objectivesPrompt).toContain("TERM POSITION");
    expect(objectivesPrompt).toContain("week 1 of 5");
  });

  it("omits the term-position line when totalWeeks is left at its default", async () => {
    mockHappyPath();

    await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini");

    const prompts = callLlmPrompts();
    const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
    expect(objectivesPrompt).not.toContain("TERM POSITION");
  });
});
