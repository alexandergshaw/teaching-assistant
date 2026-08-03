// auditVisualizerCoverageAction is the "use server" orchestration for the
// Course Build "audit-visualizer-coverage" step. The actual gap-detection/
// cap/report/idempotence DECISION logic is pure and tested directly in
// src/lib/workflows/visualizer-gap-audit.test.ts; this file exercises the
// orchestration itself with the LLM (planWeekConcepts) and GitHub boundaries
// mocked - idempotence via listCopilotTasks, the cap-and-report behaviour,
// and the degradation path when Copilot is unavailable.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/lecture-concepts", () => ({
  planWeekConcepts: vi.fn(),
}));

vi.mock("./live-class", () => ({
  loadVisualizerIndexAction: vi.fn(),
}));

vi.mock("./course-hub-core", () => ({
  listCourseHubAction: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  createCopilotAgentTask: vi.fn(),
  listCopilotTasks: vi.fn(),
}));

import { auditVisualizerCoverageAction } from "./visualizer-coverage";
import { planWeekConcepts } from "@/lib/lecture-concepts";
import { loadVisualizerIndexAction } from "./live-class";
import { listCourseHubAction } from "./course-hub-core";
import { createCopilotAgentTask, listCopilotTasks, type CopilotTask } from "@/lib/github";
import type { ScheduleWeekPlan } from "../actions-types";

const schedule: ScheduleWeekPlan[] = [
  { week: 1, topic: "Loops", summary: "Intro to loops", assignmentTitle: null, assignmentSlug: null, testName: null },
  {
    week: 2,
    topic: "Recursion",
    summary: "Intro to recursion",
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
  },
];

// Resolves ONLY "For Loops" - every other planned concept below is
// deliberately a gap, matching the fixture used in visualizer-gap-audit.test.ts.
const INDEX = [{ topicExport: "pythonNavItems", label: "For Loops", value: "for-loops" }];

function mockPlan(weekToConcepts: Record<number, string[]>) {
  vi.mocked(planWeekConcepts).mockImplementation(async (topic: string) => {
    const week = schedule.find((w) => w.topic === topic);
    const concepts = week ? (weekToConcepts[week.week] ?? []) : [];
    return { concepts, targetCount: concepts.length, merged: [] };
  });
}

function openTask(overrides: Partial<CopilotTask>): CopilotTask {
  return {
    number: 1,
    title: "",
    state: "OPEN",
    htmlUrl: "",
    isPullRequest: false,
    createdAt: "",
    updatedAt: "",
    labels: [],
    pr: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadVisualizerIndexAction).mockResolvedValue({ entries: INDEX });
  vi.mocked(listCourseHubAction).mockResolvedValue({
    courses: [{ id: "course-1", name: "INFO 1020" }] as never,
  });
});

describe("auditVisualizerCoverageAction", () => {
  it("an empty schedule is an error, not a silent empty success", async () => {
    const r = await auditVisualizerCoverageAction([], 50, 20, false, "", "gemini");
    expect("error" in r).toBe(true);
  });

  it("gaps found, dispatch OFF: reports the gaps but never calls the Copilot APIs", async () => {
    mockPlan({ 1: ["For Loops"], 2: ["Recursive Backtracking"] });

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, false, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(r.gapCount).toBe(1);
    expect(r.gaps).toContain("Recursive Backtracking");
    expect(r.taskUrl).toBe("");
    expect(r.copilotNote).toMatch(/Dispatch is off/);
    expect(listCopilotTasks).not.toHaveBeenCalled();
    expect(createCopilotAgentTask).not.toHaveBeenCalled();
  });

  it("no gaps found: never attempts Copilot even with dispatch ON", async () => {
    mockPlan({ 1: ["For Loops"], 2: ["For Loops"] });

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, true, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(r.gapCount).toBe(0);
    expect(r.copilotNote).toMatch(/No gaps found/);
    expect(listCopilotTasks).not.toHaveBeenCalled();
    expect(createCopilotAgentTask).not.toHaveBeenCalled();
  });

  it("gaps found, dispatch ON, no existing task: checks listCopilotTasks FIRST (idempotence), then opens ONE batched task", async () => {
    mockPlan({ 1: ["For Loops"], 2: ["Recursive Backtracking", "Dynamic Programming"] });
    vi.mocked(listCopilotTasks).mockResolvedValue([]);
    vi.mocked(createCopilotAgentTask).mockResolvedValue({
      issueUrl: "https://github.com/alexandergshaw/programming-concept-visualizer/issues/9",
      issueNumber: 9,
    });

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, true, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(listCopilotTasks).toHaveBeenCalledWith("alexandergshaw", "programming-concept-visualizer");
    expect(createCopilotAgentTask).toHaveBeenCalledTimes(1);
    const [owner, repo, title, body] = vi.mocked(createCopilotAgentTask).mock.calls[0];
    expect(owner).toBe("alexandergshaw");
    expect(repo).toBe("programming-concept-visualizer");
    expect(title).toBe("Visualizer concept gaps: INFO 1020");
    expect(body).toContain("Recursive Backtracking");
    expect(body).toContain("Dynamic Programming");
    expect(r.taskUrl).toBe("https://github.com/alexandergshaw/programming-concept-visualizer/issues/9");
    expect(r.dispatchedCount).toBe(2);
    expect(r.droppedCount).toBe(0);
  });

  it("gaps found, dispatch ON, an OPEN task with the same title already exists: idempotent - does NOT open a duplicate", async () => {
    mockPlan({ 1: ["For Loops"], 2: ["Recursive Backtracking"] });
    vi.mocked(listCopilotTasks).mockResolvedValue([
      openTask({
        number: 42,
        title: "Visualizer concept gaps: INFO 1020",
        htmlUrl: "https://github.com/alexandergshaw/programming-concept-visualizer/issues/42",
      }),
    ]);

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, true, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(createCopilotAgentTask).not.toHaveBeenCalled();
    expect(r.taskUrl).toBe("https://github.com/alexandergshaw/programming-concept-visualizer/issues/42");
    expect(r.copilotNote).toMatch(/already open/);
    expect(r.dispatchedCount).toBe(1);
  });

  it("a CLOSED task with the same title does not block a fresh dispatch", async () => {
    mockPlan({ 1: ["For Loops"], 2: ["Recursive Backtracking"] });
    vi.mocked(listCopilotTasks).mockResolvedValue([
      openTask({ number: 42, title: "Visualizer concept gaps: INFO 1020", state: "CLOSED" }),
    ]);
    vi.mocked(createCopilotAgentTask).mockResolvedValue({
      issueUrl: "https://github.com/alexandergshaw/programming-concept-visualizer/issues/50",
      issueNumber: 50,
    });

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, true, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(createCopilotAgentTask).toHaveBeenCalledTimes(1);
    expect(r.taskUrl).toBe("https://github.com/alexandergshaw/programming-concept-visualizer/issues/50");
  });

  it("degradation: Copilot unavailable is a NOTE on the result, never a thrown failure - the coverage sweep itself still succeeded", async () => {
    mockPlan({ 1: ["For Loops"], 2: ["Recursive Backtracking"] });
    vi.mocked(listCopilotTasks).mockResolvedValue([]);
    vi.mocked(createCopilotAgentTask).mockRejectedValue(
      new Error("Copilot coding agent is not available for this repository.")
    );

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, true, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success, not a top-level error");

    expect(r.gapCount).toBe(1);
    expect(r.taskUrl).toBe("");
    expect(r.copilotNote).toMatch(/Copilot coding agent is not available/);
  });

  it("caps the gaps named in the Copilot task and reports exactly how many were dropped - never silent", async () => {
    mockPlan({ 1: ["For Loops"], 2: ["Gap A", "Gap B", "Gap C"] });
    vi.mocked(listCopilotTasks).mockResolvedValue([]);
    vi.mocked(createCopilotAgentTask).mockResolvedValue({
      issueUrl: "https://github.com/alexandergshaw/programming-concept-visualizer/issues/1",
      issueNumber: 1,
    });

    const r = await auditVisualizerCoverageAction(schedule, 50, 2, true, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(r.gapCount).toBe(3);
    expect(r.droppedCount).toBe(1);
    expect(r.dispatchedCount).toBe(2);
    const [, , , body] = vi.mocked(createCopilotAgentTask).mock.calls[0];
    expect(body).toMatch(/1 additional gap concept was found/);
  });

  it("a per-week concept-planning failure is folded into the report as a note and does not abort the rest of the sweep", async () => {
    vi.mocked(planWeekConcepts).mockImplementation(async (topic: string) => {
      if (topic === "Loops") throw new Error("quota exhausted");
      return { concepts: ["Recursive Backtracking"], targetCount: 1, merged: [] };
    });

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, false, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(r.report).toContain("quota exhausted");
    expect(r.gapCount).toBe(1);
    expect(r.gaps).toContain("Recursive Backtracking");
  });

  it("a failed visualizer-index load degrades to an empty index (every concept reads as a gap) with a note, rather than failing the sweep", async () => {
    vi.mocked(loadVisualizerIndexAction).mockResolvedValue({ error: "network error" });
    mockPlan({ 1: ["For Loops"], 2: [] });

    const r = await auditVisualizerCoverageAction(schedule, 50, 20, false, "course-1", "gemini");
    if ("error" in r) throw new Error("expected success");

    expect(r.gapCount).toBe(1);
    expect(r.report).toContain("Visualizer index: network error");
  });
});
