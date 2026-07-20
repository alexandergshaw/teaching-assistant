import { describe, it, expect } from "vitest";
import { groupRecordingFiles } from "./recording-file-groups";
import type { RecordingFile } from "./recording-files";

function makeFile(overrides: Partial<RecordingFile>): RecordingFile {
  return {
    id: "file-1",
    name: "test",
    kind: "recording",
    mimeType: "video/webm",
    sizeBytes: 1000,
    durationSec: null,
    storagePath: "path",
    source: null,
    origin: null,
    workflowName: null,
    workflowId: null,
    workflowRunId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("groupRecordingFiles", () => {
  it("groups files by workflow_run_id", () => {
    const now = new Date();
    const hour = 60 * 60 * 1000;

    const files: RecordingFile[] = [
      makeFile({
        id: "f1",
        workflowRunId: "run-1",
        workflowId: "wf-1",
        workflowName: "Workflow 1",
        createdAt: new Date(now.getTime()).toISOString(),
      }),
      makeFile({
        id: "f2",
        workflowRunId: "run-1",
        workflowId: "wf-1",
        workflowName: "Workflow 1",
        createdAt: new Date(now.getTime() - hour).toISOString(),
      }),
      makeFile({
        id: "f3",
        workflowRunId: "run-2",
        workflowId: "wf-2",
        workflowName: "Workflow 2",
        createdAt: new Date(now.getTime() - 2 * hour).toISOString(),
      }),
    ];

    const result = groupRecordingFiles(files);

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].key).toBe("run-1");
    expect(result.groups[0].files).toHaveLength(2);
    expect(result.groups[1].key).toBe("run-2");
    expect(result.groups[1].files).toHaveLength(1);
  });

  it("orders groups newest-first by most recent file", () => {
    const now = new Date();
    const hour = 60 * 60 * 1000;

    const files: RecordingFile[] = [
      makeFile({
        id: "f1",
        workflowRunId: "run-1",
        workflowId: "wf-1",
        workflowName: "Workflow 1",
        createdAt: new Date(now.getTime() - 3 * hour).toISOString(),
      }),
      makeFile({
        id: "f2",
        workflowRunId: "run-2",
        workflowId: "wf-2",
        workflowName: "Workflow 2",
        createdAt: new Date(now.getTime() - hour).toISOString(),
      }),
    ];

    const result = groupRecordingFiles(files);

    expect(result.groups[0].key).toBe("run-2");
    expect(result.groups[1].key).toBe("run-1");
  });

  it("separates ungrouped files without workflow_run_id", () => {
    const files: RecordingFile[] = [
      makeFile({
        id: "f1",
        workflowRunId: "run-1",
        workflowId: "wf-1",
      }),
      makeFile({
        id: "f2",
        workflowRunId: null,
      }),
      makeFile({
        id: "f3",
        workflowRunId: null,
      }),
    ];

    const result = groupRecordingFiles(files);

    expect(result.groups).toHaveLength(1);
    expect(result.ungrouped).toHaveLength(2);
  });

  it("derives group header fields from first file in group", () => {
    const files: RecordingFile[] = [
      makeFile({
        id: "f1",
        workflowRunId: "run-1",
        workflowId: "wf-abc",
        workflowName: "My Workflow",
        name: "file1",
        createdAt: new Date(2024, 0, 1).toISOString(),
      }),
      makeFile({
        id: "f2",
        workflowRunId: "run-1",
        workflowId: "wf-abc",
        workflowName: "My Workflow",
        name: "file2",
        createdAt: new Date(2024, 0, 2).toISOString(),
      }),
    ];

    const result = groupRecordingFiles(files);

    expect(result.groups).toHaveLength(1);
    const group = result.groups[0];
    expect(group.workflowId).toBe("wf-abc");
    expect(group.workflowName).toBe("My Workflow");
    expect(group.newest).toBe(new Date(2024, 0, 2).toISOString());
  });

  it("handles empty file list", () => {
    const result = groupRecordingFiles([]);

    expect(result.groups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(0);
  });

  it("handles all ungrouped files", () => {
    const files = [makeFile({ id: "f1" }), makeFile({ id: "f2" })];

    const result = groupRecordingFiles(files);

    expect(result.groups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(2);
  });
});
