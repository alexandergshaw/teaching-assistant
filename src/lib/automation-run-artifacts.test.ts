import { describe, it, expect } from "vitest";
import { groupArtifactsByRun } from "./automation-run-artifacts";
import type { RecordingFile } from "./recording-files";

function makeFile(overrides: Partial<RecordingFile> = {}): RecordingFile {
  return {
    id: "file-1",
    name: "Gradebook export",
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
    createdAt: "2026-07-27T10:00:00.000Z",
    ...overrides,
  };
}

describe("groupArtifactsByRun", () => {
  it("groups files under their workflowRunId", () => {
    const files = [
      makeFile({ id: "a", workflowRunId: "run-1" }),
      makeFile({ id: "b", workflowRunId: "run-2" }),
      makeFile({ id: "c", workflowRunId: "run-1" }),
    ];
    const grouped = groupArtifactsByRun(files);
    expect(grouped.get("run-1")?.map((f) => f.id).sort()).toEqual(["a", "c"]);
    expect(grouped.get("run-2")?.map((f) => f.id)).toEqual(["b"]);
  });

  it("drops files with no workflowRunId rather than grouping them under a synthetic key", () => {
    const files = [makeFile({ id: "a", workflowRunId: null }), makeFile({ id: "b", workflowRunId: "run-1" })];
    const grouped = groupArtifactsByRun(files);
    expect(grouped.size).toBe(1);
    expect(grouped.get("run-1")?.map((f) => f.id)).toEqual(["b"]);
  });

  it("returns an empty map for an empty input", () => {
    expect(groupArtifactsByRun([]).size).toBe(0);
  });

  it("sorts each run's artifacts newest first", () => {
    const files = [
      makeFile({ id: "old", workflowRunId: "run-1", createdAt: "2026-07-27T09:00:00.000Z" }),
      makeFile({ id: "new", workflowRunId: "run-1", createdAt: "2026-07-27T11:00:00.000Z" }),
      makeFile({ id: "mid", workflowRunId: "run-1", createdAt: "2026-07-27T10:00:00.000Z" }),
    ];
    const grouped = groupArtifactsByRun(files);
    expect(grouped.get("run-1")?.map((f) => f.id)).toEqual(["new", "mid", "old"]);
  });

  it("maps each entry to exactly {id, name, createdAt}", () => {
    const files = [makeFile({ id: "a", workflowRunId: "run-1", name: "Gradebook.csv" })];
    const grouped = groupArtifactsByRun(files);
    const entry = grouped.get("run-1")?.[0];
    expect(entry && Object.keys(entry).sort()).toEqual(["createdAt", "id", "name"]);
  });
});
