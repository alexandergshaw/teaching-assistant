// Part 2/3 of "make the visualizer coverage audit explicit": the
// "audit-visualizer-coverage" step's own summary construction
// (steps.visualizer.ts) - which becomes this step's dedicated section in the
// persisted run report via buildRunReportMarkdown (run-step-core.ts, not
// under test here - it renders whatever "summary" a step returns verbatim).
// The gap-detection/cap/idempotence DECISION logic itself is exercised
// elsewhere (visualizer-gap-audit.test.ts directly, visualizer-coverage.test.ts
// against the "use server" orchestration); this file mocks
// auditVisualizerCoverageAction entirely and asserts only on what the STEP
// does with its result - the summary must always be a "list" (never a bare
// "link" that discards the explicit copilotNote), with a label that
// distinguishes all four outcomes from CoverageOutcome (visualizer-gap-audit.ts).
//
// The barrel mock below is required even though this step never calls those
// six actions itself - getStepDefinition loads the whole registry, which
// pulls in every other export from steps.visualizer.ts (including
// ensure-visualizer-pages-for-deck, which DOES call them at module scope via
// import), so an incomplete/missing mock would leave those imports
// undefined. See registry.ensure-visualizer-pages-for-deck.test.ts's own
// header comment for the same established pattern.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
  findVisualizerConceptAction: vi.fn(),
  createVisualizerConceptAction: vi.fn(),
  extractPptxSlidesAction: vi.fn(),
  extractDeckConceptsAction: vi.fn(),
}));

vi.mock("@/app/actions/visualizer-coverage", () => ({
  auditVisualizerCoverageAction: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditVisualizerCoverageAction, type AuditVisualizerCoverageResult } from "@/app/actions/visualizer-coverage";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { ScheduleWeekPlan } from "@/app/actions-types";

const schedule: ScheduleWeekPlan[] = [
  { week: 1, topic: "Loops", summary: "Intro to loops", assignmentTitle: null, assignmentSlug: null, testName: null },
];

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
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
    ...overrides,
  };
}

function actionResult(overrides: Partial<AuditVisualizerCoverageResult> = {}): AuditVisualizerCoverageResult {
  return {
    report: "report text",
    gaps: "",
    gapCount: 0,
    droppedCount: 0,
    dispatchedCount: 0,
    taskUrl: "",
    copilotNote: "No gaps found - every planned concept resolved to a visualizer page. Full coverage; no Copilot task needed.",
    ...overrides,
  };
}

describe("audit-visualizer-coverage step - summary construction", () => {
  const def = getStepDefinition("audit-visualizer-coverage")!;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("zero gaps: a list summary, positively labeled, never reading as skipped", async () => {
    vi.mocked(auditVisualizerCoverageAction).mockResolvedValue(actionResult());

    const result = await def.run({ schedule, dispatch: "" }, testHelpers(), () => {});

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind !== "list") return;
    expect(result.summary.label).toContain("0 gaps");
    expect(result.summary.label.toLowerCase()).toContain("full coverage");
    expect(result.summary.items).toContain(
      "No gaps found - every planned concept resolved to a visualizer page. Full coverage; no Copilot task needed."
    );
    // No "N gap concept(s) found." count line when there is nothing to count.
    expect(result.summary.items.some((i) => i.includes("gap concept(s) found"))).toBe(false);
  });

  it("gaps found, dispatch off: states explicitly that no task was opened", async () => {
    vi.mocked(auditVisualizerCoverageAction).mockResolvedValue(
      actionResult({
        gapCount: 3,
        gaps: "A\nB\nC",
        copilotNote:
          'Dispatch is off - 3 gap concept(s) found; no Copilot task was opened. Turn on "Dispatch Copilot task for gaps" to open one on a future run.',
      })
    );

    const result = await def.run({ schedule, dispatch: "" }, testHelpers(), () => {});

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind !== "list") return;
    expect(result.summary.label).toContain("3 gaps");
    expect(result.summary.label.toLowerCase()).toContain("no copilot task opened");
    expect(result.summary.items.some((i) => i.includes("no Copilot task was opened"))).toBe(true);
  });

  it("gaps found, dispatch on, a task opened (new): the summary is a list carrying the task URL, not a bare link", async () => {
    const taskUrl = "https://github.com/alexandergshaw/programming-concept-visualizer/issues/9";
    vi.mocked(auditVisualizerCoverageAction).mockResolvedValue(
      actionResult({
        gapCount: 2,
        gaps: "A\nB",
        taskUrl,
        dispatchedCount: 2,
        copilotNote: `Opened a new Copilot task (#9) naming 2 gap concept(s) at ${taskUrl}.`,
      })
    );

    const result = await def.run({ schedule, dispatch: "1" }, testHelpers(), () => {});

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind !== "list") return;
    expect(result.summary.label).toContain("2 gaps");
    expect(result.summary.label.toLowerCase()).toContain("copilot task open");
    expect(result.summary.items.some((i) => i.includes(taskUrl))).toBe(true);
    expect(result.outputs.taskUrl).toBe(taskUrl);
  });

  it("gaps found, dispatch on, Copilot unavailable: states explicitly that no task was opened, distinct from dispatch-off", async () => {
    vi.mocked(auditVisualizerCoverageAction).mockResolvedValue(
      actionResult({
        gapCount: 1,
        gaps: "A",
        copilotNote:
          "Dispatch is on, but no Copilot task was opened - Copilot coding agent is not available for this repository.",
      })
    );

    const result = await def.run({ schedule, dispatch: "1" }, testHelpers(), () => {});

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind !== "list") return;
    expect(result.summary.label).toContain("1 gap");
    expect(result.summary.label.toLowerCase()).toContain("copilot unavailable");
    expect(result.summary.items.some((i) => i.includes("no Copilot task was opened"))).toBe(true);
  });

  it("no schedule: skipped, not one of the four dispatch outcomes", async () => {
    const result = await def.run({ schedule: [], dispatch: "" }, testHelpers(), () => {});

    expect(result.summary.kind).toBe("text");
    if (result.summary.kind !== "text") return;
    expect(result.summary.text).toMatch(/Skipped/);
    expect(auditVisualizerCoverageAction).not.toHaveBeenCalled();
  });
});
