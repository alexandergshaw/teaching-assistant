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

import { requireOwner } from "@/lib/supabase/auth";
import { listRecentRuns, getRun, listRunSteps, type WorkflowRunRecord } from "@/lib/workflow-runs";
import { buildRunLogText } from "@/lib/workflow-run-log-text";
import { listRecordingFilesForRuns, getRecordingFileById, getRecordingFileUrl } from "@/lib/recording-files";
import type { RecordingFile } from "@/lib/recording-files";
import {
  listAutomationRunsAction,
  listRunsForWorkflowAction,
  getAutomationRunLogAction,
  getAutomationArtifactUrlAction,
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
