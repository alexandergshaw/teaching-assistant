import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

vi.mock("@/lib/lecture-concepts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lecture-concepts")>(
    "@/lib/lecture-concepts"
  );
  return { ...actual, planWeekConcepts: vi.fn() };
});

vi.mock("./research", () => ({
  generateWeekOpener: vi.fn(),
}));

import { callLlm } from "@/lib/llm";
import { planWeekConcepts } from "@/lib/lecture-concepts";
import { findWriteCodeViolation } from "@/lib/opener-warmup";
import { generateWeekOpener } from "./research";
import { buildAssignmentPlan, type AssignmentContentBundle, type LectureTemplates } from "./shared";

const BUNDLE: AssignmentContentBundle = {
  name: "week1",
  content:
    "=== README.md ===\n# Week 1\n\nTrace numeric conversions and explain how an overflow changes a result.",
  readmeContent:
    "# Week 1\n\nTrace numeric conversions and explain how an overflow changes a result.",
};

const TEMPLATES: LectureTemplates = {
  introTemplateText: "",
  instructionsTemplateText: "",
  introTemplateHeadings: [],
  instructionsTemplateHeadings: [],
};

const ASSIGNMENT_TEXT = [
  "# Week 1",
  "",
  "## Instructions",
  "- Trace the supplied conversion table.",
  "- Explain where the overflow changes the result.",
].join("\n");

const CONCEPTS = ["Numeric representation", "Integer overflow"];
const ASSIGNED_CASE = {
  organization: "Ariane 5 Flight 501",
  period: "1996",
  hook: "A numeric conversion overflow caused the inertial reference software to fail.",
};
const SAFE_OPENER = [
  "# Class Opener: Week 1",
  "",
  "## Case study discussion (about 15 minutes)",
  "- Ariane 5 Flight 501 illustrates why numeric representation matters.",
  "",
  "## Warm-up exercise (about 10 minutes)",
  "- Complete a trace table for the supplied values, then predict where overflow occurs.",
  "",
  "## Debrief (about 5 minutes)",
  "- Compare the predictions and explain the conversion boundary.",
].join("\n");

function promptText(): string[] {
  return vi.mocked(callLlm).mock.calls.map((call) => {
    const part = call[0].contents[0].parts[0];
    return "text" in part ? part.text : "";
  });
}

function installHappyLlm(events: string[]) {
  vi.mocked(callLlm).mockImplementation(async (request) => {
    const part = request.contents[0].parts[0];
    const prompt = "text" in part ? part.text : "";
    if (prompt.includes("writing a formal assignment instruction sheet")) {
      events.push("instructions");
      return { ok: true, status: 200, body: "", text: ASSIGNMENT_TEXT } as never;
    }
    if (prompt.includes("writing a module introduction")) {
      events.push("intro");
      return { ok: true, status: 200, body: "", text: "# Module Introduction: Week 1\n\nBody" } as never;
    }
    if (prompt.includes("MODULE OBJECTIVES document")) {
      events.push("objectives");
      return {
        ok: true,
        status: 200,
        body: "",
        text: "# Module Objectives: Week 1\n\n- Analyze numeric conversion behavior.",
      } as never;
    }
    events.push("deck");
    return {
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({
        presentationTitle: "Week 1",
        slides: [{ title: "Numeric representation has limits.", bullets: ["Trace the boundary."] }],
      }),
    } as never;
  });
}

describe("buildAssignmentPlan: repo-driven opener-before-deck sequencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planWeekConcepts).mockResolvedValue({
      concepts: CONCEPTS,
      targetCount: 5,
      merged: [],
    });
  });

  it("keeps the historical default-off path: no concept planning or opener, and the deck still starts in the original parallel phase", async () => {
    const events: string[] = [];
    installHappyLlm(events);

    const plan = await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini", 1, ASSIGNED_CASE);

    expect(planWeekConcepts).not.toHaveBeenCalled();
    expect(generateWeekOpener).not.toHaveBeenCalled();
    expect(plan.openerText).toBeUndefined();
    expect(plan.openerFailed).toBeUndefined();
    expect(events.indexOf("deck")).toBeLessThan(events.indexOf("instructions"));

    const deckPrompt = promptText().find((prompt) => prompt.includes("Return ONLY valid JSON"));
    expect(deckPrompt).toBeTruthy();
    expect(deckPrompt).not.toContain("CONCEPT PLAN:");
    expect(deckPrompt).not.toContain("THIS WEEK'S CLASS OPENER");
  });

  it("sequences instructions and one shared concept plan before a read-only coding opener, then grounds the deck in that same case, plan, and opener", async () => {
    const events: string[] = [];
    installHappyLlm(events);

    let releaseOpener!: () => void;
    const openerGate = new Promise<void>((resolve) => {
      releaseOpener = resolve;
    });
    vi.mocked(planWeekConcepts).mockImplementation(async () => {
      events.push("concept-plan");
      return { concepts: CONCEPTS, targetCount: 5, merged: [] };
    });
    vi.mocked(generateWeekOpener).mockImplementation(async () => {
      events.push("opener-start");
      await openerGate;
      events.push("opener-finish");
      return { text: SAFE_OPENER };
    });

    const pending = buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini", 1, ASSIGNED_CASE, true);
    await vi.waitFor(() => expect(events).toContain("opener-start"));

    expect(events).toContain("instructions");
    expect(events).toContain("concept-plan");
    expect(events).not.toContain("deck");
    expect(events).not.toContain("objectives");

    releaseOpener();
    const plan = await pending;

    expect(events.indexOf("instructions")).toBeLessThan(events.indexOf("opener-start"));
    expect(events.indexOf("concept-plan")).toBeLessThan(events.indexOf("opener-start"));
    expect(events.indexOf("opener-finish")).toBeLessThan(events.indexOf("deck"));
    expect(events.indexOf("opener-finish")).toBeLessThan(events.indexOf("objectives"));

    expect(generateWeekOpener).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateWeekOpener).mock.calls[0]).toEqual([
      "Week 1",
      expect.stringContaining("Trace numeric conversions"),
      30,
      "gemini",
      "coding",
      expect.stringContaining("Explain where the overflow changes the result"),
      [],
      ASSIGNED_CASE,
      CONCEPTS,
    ]);
    expect(findWriteCodeViolation(SAFE_OPENER)).toBeNull();
    expect(plan.openerText).toBe(SAFE_OPENER);
    expect(plan.openerFailed).toBeUndefined();

    const deckPrompt = promptText().find((prompt) => prompt.includes("Return ONLY valid JSON"));
    expect(deckPrompt).toContain("Ariane 5 Flight 501");
    expect(deckPrompt).toContain("Period: 1996");
    expect(deckPrompt).toContain("CONCEPT PLAN:");
    expect(deckPrompt).toContain("1. Numeric representation");
    expect(deckPrompt).toContain("2. Integer overflow");
    expect(deckPrompt).toContain("THIS WEEK'S CLASS OPENER");
    expect(deckPrompt).toContain(SAFE_OPENER);
  });

  it("degrades an opener failure without blocking the deck or inventing phantom opener context", async () => {
    const events: string[] = [];
    installHappyLlm(events);
    vi.mocked(generateWeekOpener).mockImplementation(async () => {
      events.push("opener-failed");
      return { error: "opener service unavailable" };
    });

    const plan = await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini", 1, ASSIGNED_CASE, true);

    expect(plan.openerText).toBeUndefined();
    expect(plan.openerFailed).toBe(true);
    expect(plan.slidesFailed).toBe(false);
    expect(plan.slides.length).toBeGreaterThan(0);
    expect(events.indexOf("opener-failed")).toBeLessThan(events.indexOf("deck"));

    const deckPrompt = promptText().find((prompt) => prompt.includes("Return ONLY valid JSON"));
    expect(deckPrompt).toContain("Ariane 5 Flight 501");
    expect(deckPrompt).toContain("CONCEPT PLAN:");
    expect(deckPrompt).not.toContain("THIS WEEK'S CLASS OPENER");
    expect(deckPrompt).not.toContain("opener service unavailable");
  });

  it.each([
    {
      label: "an HTTP refusal",
      failedResult: { ok: false, status: 503, body: "instruction service unavailable" },
    },
    {
      label: "an empty model response",
      failedResult: { ok: true, status: 200, body: "", text: "   " },
    },
  ])(
    "uses a non-empty source-grounded assignment scaffold after $label, then keeps the opener, objectives, and deck grounded in the repo",
    async ({ failedResult }) => {
      vi.mocked(callLlm).mockImplementation(async (request) => {
        const part = request.contents[0].parts[0];
        const prompt = "text" in part ? part.text : "";
        if (prompt.includes("writing a formal assignment instruction sheet")) {
          return failedResult as never;
        }
        if (prompt.includes("writing a module introduction")) {
          return { ok: true, status: 200, body: "", text: "# Module Introduction: Week 1\n\nBody" } as never;
        }
        if (prompt.includes("MODULE OBJECTIVES document")) {
          return {
            ok: true,
            status: 200,
            body: "",
            text: "# Module Objectives: Week 1\n\n- Analyze numeric conversion behavior.",
          } as never;
        }
        return {
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({
            presentationTitle: "Week 1",
            slides: [{ title: "Numeric representation has limits.", bullets: ["Trace the boundary."] }],
          }),
        } as never;
      });
      vi.mocked(generateWeekOpener).mockResolvedValue({ text: SAFE_OPENER });

      const plan = await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini", 1, ASSIGNED_CASE, true);

      expect(plan.instructionsFailed).toBe(true);
      expect(plan.assignmentInstructions.trim().length).toBeGreaterThan(0);
      expect(plan.assignmentInstructions).toContain("Trace numeric conversions");
      expect(plan.openerText).toBe(SAFE_OPENER);
      expect(plan.openerFailed).toBeUndefined();
      expect(plan.moduleObjectives.trim().length).toBeGreaterThan(0);
      expect(plan.slidesFailed).toBe(false);
      expect(plan.slides.length).toBeGreaterThan(0);

      const openerArgs = vi.mocked(generateWeekOpener).mock.calls[0];
      expect(openerArgs[1]).toContain("Trace numeric conversions");
      expect(openerArgs[5]).toContain("Trace numeric conversions");
      expect(openerArgs[5]).not.toContain("instruction service unavailable");

      const objectivesPrompt = promptText().find((prompt) => prompt.includes("MODULE OBJECTIVES document"));
      expect(objectivesPrompt).toContain("Trace numeric conversions");
      expect(objectivesPrompt).not.toContain("instruction service unavailable");

      const deckPrompt = promptText().find((prompt) => prompt.includes("Return ONLY valid JSON"));
      expect(deckPrompt).toContain("Trace numeric conversions");
      expect(deckPrompt).toContain(SAFE_OPENER);
      expect(deckPrompt).not.toContain("instruction service unavailable");
    }
  );

  it("uses a non-empty source-grounded intro scaffold after intro failure and keeps the rest of the opt-in sequence intact", async () => {
    vi.mocked(callLlm).mockImplementation(async (request) => {
      const part = request.contents[0].parts[0];
      const prompt = "text" in part ? part.text : "";
      if (prompt.includes("writing a formal assignment instruction sheet")) {
        return { ok: true, status: 200, body: "", text: ASSIGNMENT_TEXT } as never;
      }
      if (prompt.includes("writing a module introduction")) {
        return { ok: false, status: 502, body: "intro service unavailable" } as never;
      }
      if (prompt.includes("MODULE OBJECTIVES document")) {
        return {
          ok: true,
          status: 200,
          body: "",
          text: "# Module Objectives: Week 1\n\n- Analyze numeric conversion behavior.",
        } as never;
      }
      return {
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          presentationTitle: "Week 1",
          slides: [{ title: "Numeric representation has limits.", bullets: ["Trace the boundary."] }],
        }),
      } as never;
    });
    vi.mocked(generateWeekOpener).mockResolvedValue({ text: SAFE_OPENER });

    const plan = await buildAssignmentPlan(BUNDLE, 0, 50, TEMPLATES, "gemini", 1, ASSIGNED_CASE, true);

    expect(plan.introFailed).toBe(true);
    expect(plan.moduleIntroduction.trim().length).toBeGreaterThan(0);
    expect(plan.moduleIntroduction).toContain("Module Introduction: Week 1");
    expect(plan.moduleIntroduction).toContain("Trace numeric conversions");
    expect(plan.instructionsFailed).toBeUndefined();
    expect(plan.assignmentInstructions).toContain("Explain where the overflow changes the result");
    expect(plan.openerText).toBe(SAFE_OPENER);
    expect(plan.moduleObjectives.trim().length).toBeGreaterThan(0);
    expect(plan.slidesFailed).toBe(false);
    expect(plan.slides.length).toBeGreaterThan(0);
  });
});
