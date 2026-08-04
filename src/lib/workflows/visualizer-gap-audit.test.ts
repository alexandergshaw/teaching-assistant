import { describe, it, expect } from "vitest";
import {
  checkConceptsAgainstIndex,
  capGaps,
  buildCoverageReport,
  buildGapTaskTitle,
  buildGapTaskBody,
  findExistingGapTask,
  classifyCoverageOutcome,
  coverageSummaryLabel,
  type WeekConceptInput,
  type GapEntry,
  type GapTaskCandidate,
} from "./visualizer-gap-audit";
import type { VisualizerIndexEntry } from "@/lib/live-class/links";

// A real, "creatable" visualizer topic (python) that resolves ONLY "for
// loops" - every other concept used below is deliberately a gap. Mirrors the
// shape loadVisualizerIndexAction's parseNavItems actually returns.
const PYTHON_INDEX: VisualizerIndexEntry[] = [
  { topicExport: "pythonNavItems", label: "For Loops", value: "for-loops" },
];

describe("checkConceptsAgainstIndex", () => {
  it("a concept that resolves against the visualizer index is NOT a gap", () => {
    const weeks: WeekConceptInput[] = [{ week: 1, topic: "Loops", concepts: ["For Loops"] }];
    const { results, gaps } = checkConceptsAgainstIndex(weeks, PYTHON_INDEX);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBeTruthy();
    expect(gaps).toHaveLength(0);
  });

  it("a concept that resolves to nothing IS a gap", () => {
    const weeks: WeekConceptInput[] = [{ week: 2, topic: "Recursion", concepts: ["Recursive Backtracking"] }];
    const { results, gaps } = checkConceptsAgainstIndex(weeks, PYTHON_INDEX);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBeNull();
    expect(gaps).toEqual([{ concept: "Recursive Backtracking", week: 2, topic: "Recursion" }]);
  });

  it("an empty index makes every concept a gap", () => {
    const weeks: WeekConceptInput[] = [{ week: 1, topic: "Loops", concepts: ["For Loops"] }];
    const { gaps } = checkConceptsAgainstIndex(weeks, []);
    expect(gaps).toHaveLength(1);
  });

  it("dedupes the same gap concept (case/space-insensitive) across weeks, keeping the FIRST week/topic it was seen in", () => {
    const weeks: WeekConceptInput[] = [
      { week: 1, topic: "Intro", concepts: ["Big O Notation"] },
      { week: 5, topic: "Complexity", concepts: ["big o notation"] },
    ];
    const { gaps } = checkConceptsAgainstIndex(weeks, PYTHON_INDEX);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ concept: "Big O Notation", week: 1, topic: "Intro" });
  });

  it("blank/whitespace-only concepts are skipped entirely - never reported as a gap", () => {
    const weeks: WeekConceptInput[] = [{ week: 1, topic: "X", concepts: ["  ", ""] }];
    const { results, gaps } = checkConceptsAgainstIndex(weeks, PYTHON_INDEX);
    expect(results).toHaveLength(0);
    expect(gaps).toHaveLength(0);
  });

  it("a week with no concepts contributes no results and no gaps", () => {
    const weeks: WeekConceptInput[] = [{ week: 1, topic: "X", concepts: [] }];
    const { results, gaps } = checkConceptsAgainstIndex(weeks, PYTHON_INDEX);
    expect(results).toHaveLength(0);
    expect(gaps).toHaveLength(0);
  });
});

describe("capGaps", () => {
  const gaps: GapEntry[] = [1, 2, 3, 4, 5].map((n) => ({ concept: `Concept ${n}`, week: n, topic: "" }));

  it("keeps every gap and reports zero dropped when under the cap", () => {
    const { included, droppedCount } = capGaps(gaps, 10);
    expect(included).toHaveLength(5);
    expect(droppedCount).toBe(0);
  });

  it("truncates to the cap (order-preserving) and reports exactly how many were dropped - never silent", () => {
    const { included, droppedCount } = capGaps(gaps, 2);
    expect(included.map((g) => g.concept)).toEqual(["Concept 1", "Concept 2"]);
    expect(droppedCount).toBe(3);
  });

  it("a non-positive or non-finite cap is treated as no cap at all", () => {
    expect(capGaps(gaps, 0).droppedCount).toBe(0);
    expect(capGaps(gaps, -5).droppedCount).toBe(0);
    expect(capGaps(gaps, NaN).droppedCount).toBe(0);
  });
});

describe("buildCoverageReport", () => {
  it("reports both found and gap concepts by week", () => {
    const report = buildCoverageReport([
      { week: 1, topic: "Loops", concept: "For Loops", url: "https://example.com/for-loops" },
      { week: 2, topic: "Recursion", concept: "Recursive Backtracking", url: null },
    ]);
    expect(report).toContain("Week 1 (Loops) - For Loops: found at https://example.com/for-loops");
    expect(report).toContain("Week 2 (Recursion) - Recursive Backtracking: GAP - no visualizer page");
  });

  it("says so plainly when nothing was planned", () => {
    expect(buildCoverageReport([])).toBe("No concepts were planned for any week.");
  });
});

describe("buildGapTaskTitle", () => {
  it("includes the course name when given", () => {
    expect(buildGapTaskTitle("INFO 1020")).toBe("Visualizer concept gaps: INFO 1020");
  });

  it("falls back to a plain prefix with no course name", () => {
    expect(buildGapTaskTitle("")).toBe("Visualizer concept gaps");
    expect(buildGapTaskTitle("   ")).toBe("Visualizer concept gaps");
  });

  it("is deterministic - the same input always yields the same title, which is what makes it usable as an idempotence key", () => {
    expect(buildGapTaskTitle("INFO 1020")).toBe(buildGapTaskTitle("INFO 1020"));
  });
});

describe("buildGapTaskBody", () => {
  it("lists every included gap with its week/topic context", () => {
    const body = buildGapTaskBody("INFO 1020", [{ concept: "Recursion", week: 3, topic: "Functions" }], 0);
    expect(body).toContain("Recursion (Week 3: Functions)");
    expect(body).not.toContain("NOTE:");
  });

  it("states exactly how many gaps were capped/dropped - a truncated list must never read as complete", () => {
    const body = buildGapTaskBody("INFO 1020", [{ concept: "A", week: 1, topic: "" }], 7);
    expect(body).toMatch(/NOTE: 7 additional gap concepts were found but is not listed above/);
    expect(body).toContain("capped at 1 concept per run");
  });

  it("singular phrasing for exactly one dropped gap", () => {
    const body = buildGapTaskBody("INFO 1020", [{ concept: "A", week: 1, topic: "" }], 1);
    expect(body).toMatch(/NOTE: 1 additional gap concept was found/);
  });
});

describe("findExistingGapTask", () => {
  const title = "Visualizer concept gaps: INFO 1020";
  const tasks: GapTaskCandidate[] = [
    { number: 1, title: "Some other task", state: "OPEN", htmlUrl: "https://x/1" },
    { number: 2, title, state: "CLOSED", htmlUrl: "https://x/2" },
    { number: 3, title, state: "OPEN", htmlUrl: "https://x/3" },
  ];

  it("finds an OPEN task with a matching title - the idempotence check (mirrors ensureCourseProject's hasProject())", () => {
    expect(findExistingGapTask(tasks, title)?.number).toBe(3);
  });

  it("a CLOSED task with the same title does not count - a fresh sweep may still open a new one", () => {
    const closedOnly = tasks.filter((t) => t.number !== 3);
    expect(findExistingGapTask(closedOnly, title)).toBeUndefined();
  });

  it("no match when no task shares the exact title", () => {
    expect(findExistingGapTask(tasks, "Visualizer concept gaps: Some Other Course")).toBeUndefined();
  });

  it("no match against an empty task list", () => {
    expect(findExistingGapTask([], title)).toBeUndefined();
  });
});

// Part 3 of the "make the visualizer coverage audit explicit" work: the four
// distinguishable outcomes a run can land in, and the label each one gets in
// the step's own summary (and, via buildRunReportMarkdown, the persisted run
// report's section for this step - run-step-core.ts).
describe("classifyCoverageOutcome", () => {
  it("zero gaps is its own outcome regardless of the dispatch flag", () => {
    expect(classifyCoverageOutcome(0, false, "")).toBe("no-gaps");
    expect(classifyCoverageOutcome(0, true, "")).toBe("no-gaps");
  });

  it("gaps found, dispatch off: dispatch-off, even if a taskUrl were somehow present", () => {
    expect(classifyCoverageOutcome(3, false, "")).toBe("dispatch-off");
    expect(classifyCoverageOutcome(3, false, "https://x/1")).toBe("dispatch-off");
  });

  it("gaps found, dispatch on, a task URL came back: task-open", () => {
    expect(classifyCoverageOutcome(3, true, "https://github.com/o/r/issues/1")).toBe("task-open");
  });

  it("gaps found, dispatch on, no task URL: copilot-unavailable", () => {
    expect(classifyCoverageOutcome(3, true, "")).toBe("copilot-unavailable");
  });
});

describe("coverageSummaryLabel", () => {
  it("states 0 gaps positively - never reads like the step was skipped", () => {
    const label = coverageSummaryLabel(0, "no-gaps");
    expect(label).toContain("0 gaps");
    expect(label.toLowerCase()).toContain("full coverage");
  });

  it("dispatch-off states explicitly that no task was opened", () => {
    const label = coverageSummaryLabel(4, "dispatch-off");
    expect(label).toContain("4 gaps");
    expect(label.toLowerCase()).toContain("no copilot task opened");
  });

  it("task-open says a task is open", () => {
    const label = coverageSummaryLabel(1, "task-open");
    expect(label).toContain("1 gap");
    expect(label.toLowerCase()).toContain("copilot task open");
  });

  it("copilot-unavailable states explicitly that no task was opened, distinct from dispatch-off's wording", () => {
    const label = coverageSummaryLabel(2, "copilot-unavailable");
    expect(label).toContain("2 gaps");
    expect(label.toLowerCase()).toContain("copilot unavailable");
    expect(label.toLowerCase()).toContain("no task opened");
    expect(label).not.toBe(coverageSummaryLabel(2, "dispatch-off"));
  });

  it("singular/plural 'gap' wording matches the count", () => {
    expect(coverageSummaryLabel(1, "dispatch-off")).toContain("1 gap ");
    expect(coverageSummaryLabel(2, "dispatch-off")).toContain("2 gaps ");
  });
});
