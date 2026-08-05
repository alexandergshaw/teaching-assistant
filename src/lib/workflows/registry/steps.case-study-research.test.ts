// research-course-case-studies: exercises the step's own core promises - it
// calls researchCourseCaseStudiesAction exactly once for the whole schedule
// (never per week, never on an empty schedule), sends the action only the
// week/topic/summary fields it actually needs, propagates a returned error
// by throwing (so the run surfaces the failure instead of reporting success),
// and drops nothing the action reports - every bucket count and every note -
// from the step summary. Also covers the step's registry/headless wiring and
// its deliberate absence of a "files" input/output (see this step's own doc
// comment in steps.case-study-research.ts on why it sits outside the
// mid-chain files accumulator). Mirrors the mocking idiom of
// steps.course-build-current-events.test.ts / steps.weekly-significance.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { CaseStudyResearchSummary } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";

vi.mock("@/app/actions", () => ({
  researchCourseCaseStudiesAction: vi.fn(),
}));

import { researchCourseCaseStudiesAction } from "@/app/actions";
import { caseStudyResearchSteps } from "./steps.case-study-research";
import { STEP_REGISTRY } from "@/lib/workflows/registry";
import { HEADLESS_SAFE_STEP_TYPES } from "@/lib/workflows/headless";

const step = caseStudyResearchSteps.find((s) => s.type === "research-course-case-studies")!;

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    ...overrides,
  };
}

function schedule(): ScheduleWeekPlan[] {
  return [
    {
      week: 1,
      topic: "Project Risk Management",
      summary: "Intro to risk.",
      assignmentTitle: "Risk Memo",
      assignmentSlug: "week-01-risk-memo",
      testName: null,
    },
    {
      week: 2,
      topic: "Earned Value",
      summary: "",
      assignmentTitle: null,
      assignmentSlug: null,
      testName: "Test 1",
    },
  ];
}

function successResult(overrides: Partial<CaseStudyResearchSummary> = {}): CaseStudyResearchSummary {
  return {
    stored: 2,
    corroborated: 1,
    uncorroborated: 1,
    skipped: 1,
    organizations: ["NASA", "Boeing"],
    notes: [
      "1 corroborated, 1 uncorroborated, 1 skipped.",
      '"Boeing" stored but not fully corroborated (no year stated) - see /knowledge to complete it.',
    ],
    ...overrides,
  };
}

describe("research-course-case-studies step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(researchCourseCaseStudiesAction).mockResolvedValue(successResult());
  });

  it("empty schedule short-circuits: zeroed outputs, a text summary, and no action call", async () => {
    const result = await step.run({ schedule: [] }, testHelpers(), () => {});
    expect(researchCourseCaseStudiesAction).not.toHaveBeenCalled();
    expect(result.outputs).toEqual({
      stored: 0,
      corroborated: 0,
      uncorroborated: 0,
      skipped: 0,
      organizations: "",
    });
    expect(result.summary).toEqual({ kind: "text", text: "No schedule to research case studies for." });
  });

  it("sends the action only week/topic/summary per week, dropping the assignment/test fields", async () => {
    await step.run({ schedule: schedule(), courseDescription: "An intro course." }, testHelpers(), () => {});
    expect(researchCourseCaseStudiesAction).toHaveBeenCalledTimes(1);
    const [weeksArg] = vi.mocked(researchCourseCaseStudiesAction).mock.calls[0];
    expect(weeksArg).toEqual([
      { week: 1, topic: "Project Risk Management", summary: "Intro to risk." },
      { week: 2, topic: "Earned Value", summary: "" },
    ]);
  });

  it("throws with the action's error message instead of reporting success", async () => {
    vi.mocked(researchCourseCaseStudiesAction).mockResolvedValue({ error: "search unavailable" });
    await expect(step.run({ schedule: schedule() }, testHelpers(), () => {})).rejects.toThrow(
      "search unavailable"
    );
  });

  it("surfaces every bucket count and every note from the action in the summary items, verbatim", async () => {
    const result = await step.run({ schedule: schedule() }, testHelpers(), () => {});
    expect(result.summary.kind).toBe("list");
    const items = result.summary.kind === "list" ? result.summary.items : [];
    expect(items).toContain("1 corroborated, 1 uncorroborated, 1 skipped.");
    expect(items).toContain(
      '"Boeing" stored but not fully corroborated (no year stated) - see /knowledge to complete it.'
    );
  });

  it("outputs stored/corroborated/uncorroborated/skipped as numbers, and organizations newline-joined", async () => {
    const result = await step.run({ schedule: schedule() }, testHelpers(), () => {});
    expect(result.outputs).toEqual({
      stored: 2,
      corroborated: 1,
      uncorroborated: 1,
      skipped: 1,
      organizations: "NASA\nBoeing",
    });
  });

  it("labels the summary singular for one case study stored", async () => {
    vi.mocked(researchCourseCaseStudiesAction).mockResolvedValue(
      successResult({ stored: 1, organizations: ["NASA"] })
    );
    const result = await step.run({ schedule: schedule() }, testHelpers(), () => {});
    const label = result.summary.kind === "list" ? result.summary.label : "";
    expect(label).toBe("1 case study stored");
  });

  it("labels the summary plural for more than one case study stored", async () => {
    const result = await step.run({ schedule: schedule() }, testHelpers(), () => {});
    const label = result.summary.kind === "list" ? result.summary.label : "";
    expect(label).toBe("2 case studies stored");
  });

  it("is registered in STEP_REGISTRY and classified headless-safe", () => {
    expect(STEP_REGISTRY.some((s) => s.type === "research-course-case-studies")).toBe(true);
    expect(HEADLESS_SAFE_STEP_TYPES.has("research-course-case-studies")).toBe(true);
  });

  // Deliberate: this step never sits in the mid-chain "files" accumulator, so
  // a failure here can never cascade into the terminal cartridge/zip - see
  // steps.case-study-research.ts's own doc comment. If someone later adds a
  // files output, this test should make them stop and reconsider.
  it("declares no files input or output", () => {
    expect(step.inputs.some((i) => i.key === "files")).toBe(false);
    expect(step.outputs.some((o) => o.key === "files")).toBe(false);
  });
});
