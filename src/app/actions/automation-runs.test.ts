import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ __fake: "supabase" })),
}));

vi.mock("@/lib/workflow-runs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workflow-runs")>("@/lib/workflow-runs");
  return {
    ...actual,
    listRecentRuns: vi.fn(),
    getRun: vi.fn(),
    listRunSteps: vi.fn(),
  };
});

vi.mock("@/lib/workflow-run-log-text", () => ({
  buildRunLogText: vi.fn(() => "the formatted log text"),
}));

vi.mock("@/lib/recording-files", () => ({
  listRecordingFilesForRuns: vi.fn(),
  getRecordingFileById: vi.fn(),
  getRecordingFileUrl: vi.fn(),
}));

// listWorkflowDefs is mocked (a Supabase read); allWorkflows and
// expandWorkflowDef are left REAL (pure functions, already exercised
// elsewhere) so getNotYetRunStepTypesAction's tests exercise the actual
// merge/expand logic, not a second hand-rolled stand-in for it.
vi.mock("@/lib/workflow-defs", () => ({
  listWorkflowDefs: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { listRecentRuns, getRun, listRunSteps, type WorkflowRunRecord, type WorkflowRunStep } from "@/lib/workflow-runs";
import { buildRunLogText } from "@/lib/workflow-run-log-text";
import { listRecordingFilesForRuns, getRecordingFileById, getRecordingFileUrl } from "@/lib/recording-files";
import type { RecordingFile } from "@/lib/recording-files";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import type { WorkflowDef } from "@/lib/workflows/types";
import {
  listAutomationRunsAction,
  listRunsForWorkflowAction,
  getAutomationRunLogAction,
  getAutomationArtifactUrlAction,
  getNotYetRunStepTypesAction,
} from "./automation-runs";

function makeRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: "run-1",
    userId: "u1",
    workflowId: "wf-1",
    workflowName: "Weekly Announcement",
    status: "ok",
    triggerSource: "schedule",
    triggerRef: "sched-9",
    createdAt: "2026-07-27T10:00:00.000Z",
    startedAt: "2026-07-27T10:00:00.000Z",
    finishedAt: "2026-07-27T10:00:05.000Z",
    durationMs: 5000,
    stepCount: 2,
    errorCount: 0,
    detail: null,
    fieldValues: null,
    ...overrides,
  };
}

function makeLoggedStep(overrides: Partial<WorkflowRunStep> = {}): WorkflowRunStep {
  return {
    id: "step-x",
    runId: "run-1",
    userId: "u1",
    stepIndex: 0,
    stepType: "some-step",
    status: "done",
    error: null,
    summary: null,
    progress: [],
    startedAt: "2026-07-27T10:00:00.000Z",
    finishedAt: "2026-07-27T10:00:01.000Z",
    durationMs: 1000,
    institution: null,
    courseId: null,
    courseName: null,
    inputs: null,
    createdAt: "2026-07-27T10:00:01.000Z",
    ...overrides,
  };
}

function customDef(id: string, stepTypes: string[]): WorkflowDef {
  return {
    id,
    name: id,
    description: "",
    steps: stepTypes.map((type) => ({ type, bindings: {} })),
  };
}

function makeFile(overrides: Partial<RecordingFile> = {}): RecordingFile {
  return {
    id: "file-1",
    name: "Gradebook.csv",
    kind: "file",
    mimeType: "text/csv",
    sizeBytes: 100,
    durationSec: null,
    storagePath: "u1/file-1.csv",
    source: null,
    origin: "unattended",
    workflowName: "Weekly Announcement",
    workflowId: "wf-1",
    workflowRunId: "run-1",
    createdAt: "2026-07-27T10:00:01.000Z",
    ...overrides,
  };
}

describe("automation-runs actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "u1", email: "owner@example.com" } as never);
  });

  describe("listAutomationRunsAction", () => {
    it("passes triggerRef and limit through to listRecentRuns, scoped to the owner", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([]);

      await listAutomationRunsAction("sched-9", 10);

      expect(listRecentRuns).toHaveBeenCalledWith(expect.anything(), "u1", { triggerRef: "sched-9", limit: 10 });
    });

    it("attaches each run's own artifacts by matching workflowRunId", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([makeRun({ id: "run-1" }), makeRun({ id: "run-2" })]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([
        makeFile({ id: "f1", workflowRunId: "run-1" }),
        makeFile({ id: "f2", workflowRunId: "run-2" }),
      ]);

      const result = await listAutomationRunsAction("sched-9", 5);
      expect("runs" in result).toBe(true);
      if (!("runs" in result)) return;
      expect(result.runs.find((r) => r.id === "run-1")?.artifacts.map((a) => a.id)).toEqual(["f1"]);
      expect(result.runs.find((r) => r.id === "run-2")?.artifacts.map((a) => a.id)).toEqual(["f2"]);
    });

    it("gives a run with no matching artifacts an empty array, not undefined", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([makeRun({ id: "run-1" })]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([]);

      const result = await listAutomationRunsAction("sched-9", 5);
      expect("runs" in result).toBe(true);
      if (!("runs" in result)) return;
      expect(result.runs[0].artifacts).toEqual([]);
    });

    it("calls listRecordingFilesForRuns with exactly the fetched run ids, in one call", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([makeRun({ id: "run-1" }), makeRun({ id: "run-2" })]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([]);

      await listAutomationRunsAction("sched-9", 5);
      expect(listRecordingFilesForRuns).toHaveBeenCalledTimes(1);
      expect(listRecordingFilesForRuns).toHaveBeenCalledWith(expect.anything(), "u1", ["run-1", "run-2"]);
    });

    it("returns an error rather than throwing when requireOwner rejects", async () => {
      vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));
      const result = await listAutomationRunsAction("sched-9", 5);
      expect("error" in result).toBe(true);
      if ("error" in result) expect(result.error).toContain("Not authorized");
      expect(listRecentRuns).not.toHaveBeenCalled();
    });

    it("returns an error rather than throwing when listRecentRuns throws", async () => {
      vi.mocked(listRecentRuns).mockRejectedValue(new Error("db down"));
      const result = await listAutomationRunsAction("sched-9", 5);
      expect(result).toEqual({ error: "db down" });
    });
  });

  describe("listRunsForWorkflowAction", () => {
    it("passes workflowId and limit through to listRecentRuns, scoped to the owner", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([]);

      await listRunsForWorkflowAction("wf-1", 10);

      expect(listRecentRuns).toHaveBeenCalledWith(expect.anything(), "u1", { workflowId: "wf-1", limit: 10 });
    });

    it("attaches each run's own artifacts by matching workflowRunId, same as listAutomationRunsAction", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([makeRun({ id: "run-1" }), makeRun({ id: "run-2" })]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([
        makeFile({ id: "f1", workflowRunId: "run-1" }),
        makeFile({ id: "f2", workflowRunId: "run-2" }),
      ]);

      const result = await listRunsForWorkflowAction("wf-1", 5);
      expect("runs" in result).toBe(true);
      if (!("runs" in result)) return;
      expect(result.runs.find((r) => r.id === "run-1")?.artifacts.map((a) => a.id)).toEqual(["f1"]);
      expect(result.runs.find((r) => r.id === "run-2")?.artifacts.map((a) => a.id)).toEqual(["f2"]);
    });

    it("gives a run with no matching artifacts an empty array, not undefined", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([makeRun({ id: "run-1" })]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([]);

      const result = await listRunsForWorkflowAction("wf-1", 5);
      expect("runs" in result).toBe(true);
      if (!("runs" in result)) return;
      expect(result.runs[0].artifacts).toEqual([]);
    });

    it("includes a manual run with no triggerRef - the reason this sibling action exists", async () => {
      vi.mocked(listRecentRuns).mockResolvedValue([
        makeRun({ id: "run-1", triggerSource: "manual", triggerRef: null }),
      ]);
      vi.mocked(listRecordingFilesForRuns).mockResolvedValue([]);

      const result = await listRunsForWorkflowAction("wf-1", 5);
      expect("runs" in result).toBe(true);
      if (!("runs" in result)) return;
      expect(result.runs.map((r) => r.id)).toEqual(["run-1"]);
    });

    it("returns an error rather than throwing when requireOwner rejects", async () => {
      vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));
      const result = await listRunsForWorkflowAction("wf-1", 5);
      expect("error" in result).toBe(true);
      if ("error" in result) expect(result.error).toContain("Not authorized");
      expect(listRecentRuns).not.toHaveBeenCalled();
    });

    it("returns an error rather than throwing when listRecentRuns throws", async () => {
      vi.mocked(listRecentRuns).mockRejectedValue(new Error("db down"));
      const result = await listRunsForWorkflowAction("wf-1", 5);
      expect(result).toEqual({ error: "db down" });
    });
  });

  describe("getAutomationRunLogAction", () => {
    it("scopes getRun and listRunSteps to the owner and the given run id", async () => {
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1" }));
      vi.mocked(listRunSteps).mockResolvedValue([]);

      await getAutomationRunLogAction("run-1");
      expect(getRun).toHaveBeenCalledWith(expect.anything(), "u1", "run-1");
      expect(listRunSteps).toHaveBeenCalledWith(expect.anything(), "u1", "run-1");
    });

    it("returns the text from buildRunLogText plus the run's workflowName", async () => {
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1", workflowName: "Grade sync" }));
      vi.mocked(listRunSteps).mockResolvedValue([]);

      const result = await getAutomationRunLogAction("run-1");
      expect(result).toEqual({ text: "the formatted log text", workflowName: "Grade sync" });
    });

    it("returns an error - never another user's data - when getRun finds no owned row", async () => {
      vi.mocked(getRun).mockResolvedValue(null);
      const result = await getAutomationRunLogAction("someone-elses-run");
      expect("error" in result).toBe(true);
      expect(listRunSteps).not.toHaveBeenCalled();
      expect(buildRunLogText).not.toHaveBeenCalled();
    });

    it("returns an error rather than throwing when requireOwner rejects", async () => {
      vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));
      const result = await getAutomationRunLogAction("run-1");
      expect("error" in result).toBe(true);
      if ("error" in result) expect(result.error).toContain("Not authorized");
    });
  });

  // U8-AC2: reused by save-zip-to-course to name the steps that ran AFTER it
  // in the terminal zip's embedded run log, rather than silently omitting
  // them (the exact shape from the reported run: save-zip-to-course was step
  // 19 of 22 - integrate-source-into-lms and populate-lms-from-class-template
  // both ran after it).
  describe("getNotYetRunStepTypesAction", () => {
    it("names the steps that ran after this one, from the run's own workflow definition (the reported run's exact shape)", async () => {
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1", workflowId: "wf-course-refresh" }));
      // Two steps already logged ("a" and "b") - save-zip-to-course itself
      // (index 2) is currently running and has not logged its own row yet.
      vi.mocked(listRunSteps).mockResolvedValue([
        makeLoggedStep({ id: "s0", stepIndex: 0, stepType: "a" }),
        makeLoggedStep({ id: "s1", stepIndex: 1, stepType: "b" }),
      ]);
      vi.mocked(listWorkflowDefs).mockResolvedValue([
        customDef("wf-course-refresh", [
          "a",
          "b",
          "save-zip-to-course",
          "integrate-source-into-lms",
          "populate-lms-from-class-template",
        ]),
      ]);

      const result = await getNotYetRunStepTypesAction("run-1");
      expect(result).toEqual({
        ok: true,
        stepTypes: ["integrate-source-into-lms", "populate-lms-from-class-template"],
      });
    });

    it("returns ok: true with an EMPTY array when this step genuinely is the last one - not the same as ok: false", async () => {
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1", workflowId: "wf-solo" }));
      vi.mocked(listRunSteps).mockResolvedValue([makeLoggedStep({ id: "s0", stepIndex: 0, stepType: "a" })]);
      vi.mocked(listWorkflowDefs).mockResolvedValue([customDef("wf-solo", ["a", "save-zip-to-course"])]);

      const result = await getNotYetRunStepTypesAction("run-1");
      expect(result).toEqual({ ok: true, stepTypes: [] });
    });

    it("returns ok: false when the run is not found (never guesses for a missing/foreign run)", async () => {
      vi.mocked(getRun).mockResolvedValue(null);
      const result = await getNotYetRunStepTypesAction("someone-elses-run");
      expect(result).toEqual({ ok: false });
      expect(listWorkflowDefs).not.toHaveBeenCalled();
    });

    it("returns ok: false when the run's workflow definition cannot be resolved (e.g. a deleted custom workflow)", async () => {
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1", workflowId: "wf-deleted" }));
      vi.mocked(listRunSteps).mockResolvedValue([]);
      vi.mocked(listWorkflowDefs).mockResolvedValue([]);

      const result = await getNotYetRunStepTypesAction("run-1");
      expect(result).toEqual({ ok: false });
    });

    it("returns ok: false (never a wrong guess) when the logged step count does not fit inside the resolved definition's step count", async () => {
      // Simulates a fan-out run (or any structural mismatch) where the
      // logged-step-count-as-position assumption breaks down.
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1", workflowId: "wf-mismatch" }));
      vi.mocked(listRunSteps).mockResolvedValue([
        makeLoggedStep({ id: "s0", stepIndex: 0 }),
        makeLoggedStep({ id: "s1", stepIndex: 0 }),
        makeLoggedStep({ id: "s2", stepIndex: 0 }),
      ]);
      vi.mocked(listWorkflowDefs).mockResolvedValue([customDef("wf-mismatch", ["a", "save-zip-to-course"])]);

      const result = await getNotYetRunStepTypesAction("run-1");
      expect(result).toEqual({ ok: false });
    });

    it("returns ok: false rather than throwing when requireOwner rejects", async () => {
      vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));
      const result = await getNotYetRunStepTypesAction("run-1");
      expect(result).toEqual({ ok: false });
    });

    it("returns ok: false rather than throwing when an underlying call rejects", async () => {
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1", workflowId: "wf-x" }));
      vi.mocked(listRunSteps).mockRejectedValue(new Error("db down"));
      const result = await getNotYetRunStepTypesAction("run-1");
      expect(result).toEqual({ ok: false });
    });

    // SABOTAGE CHECK: confirmed by hand that changing the +1 offset to +0
    // (i.e. no longer skipping the currently-running step itself) makes the
    // first test above return `["save-zip-to-course", "integrate-source-into-lms",
    // "populate-lms-from-class-template"]` instead - wrongly claiming
    // save-zip-to-course itself "had not yet run", which is nonsensical since
    // it is what is asking the question. The +1 is load-bearing, not
    // cosmetic.
    it("SABOTAGE-checked: the currently-running step is excluded from its own not-yet-run list", async () => {
      vi.mocked(getRun).mockResolvedValue(makeRun({ id: "run-1", workflowId: "wf-course-refresh" }));
      vi.mocked(listRunSteps).mockResolvedValue([
        makeLoggedStep({ id: "s0", stepIndex: 0, stepType: "a" }),
        makeLoggedStep({ id: "s1", stepIndex: 1, stepType: "b" }),
      ]);
      vi.mocked(listWorkflowDefs).mockResolvedValue([
        customDef("wf-course-refresh", ["a", "b", "save-zip-to-course", "integrate-source-into-lms"]),
      ]);

      const result = await getNotYetRunStepTypesAction("run-1");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.stepTypes).not.toContain("save-zip-to-course");
    });
  });

  describe("getAutomationArtifactUrlAction", () => {
    it("scopes getRecordingFileById to the owner and the given file id", async () => {
      vi.mocked(getRecordingFileById).mockResolvedValue(makeFile({ id: "file-1" }));
      vi.mocked(getRecordingFileUrl).mockResolvedValue("https://signed.example/file-1");

      await getAutomationArtifactUrlAction("file-1");
      expect(getRecordingFileById).toHaveBeenCalledWith(expect.anything(), "u1", "file-1");
    });

    it("returns the signed URL from getRecordingFileUrl", async () => {
      vi.mocked(getRecordingFileById).mockResolvedValue(makeFile({ id: "file-1" }));
      vi.mocked(getRecordingFileUrl).mockResolvedValue("https://signed.example/file-1");

      const result = await getAutomationArtifactUrlAction("file-1");
      expect(result).toEqual({ url: "https://signed.example/file-1" });
    });

    it("returns an error - never another user's data - when the file is not found/owned", async () => {
      vi.mocked(getRecordingFileById).mockResolvedValue(null);
      const result = await getAutomationArtifactUrlAction("someone-elses-file");
      expect("error" in result).toBe(true);
      expect(getRecordingFileUrl).not.toHaveBeenCalled();
    });

    it("returns an error rather than throwing when requireOwner rejects", async () => {
      vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));
      const result = await getAutomationArtifactUrlAction("file-1");
      expect("error" in result).toBe(true);
      if ("error" in result) expect(result.error).toContain("Not authorized");
    });
  });
});
