import { describe, expect, it } from "vitest";
import { pipelineRoleDownloadCurrent } from "./pipeline-role-guard";

describe("pipeline role-aware download snapshot", () => {
  it("accepts only the same deck and resolved library choice", () => {
    const snapshot = { revision: 4, selection: 2 };
    expect(pipelineRoleDownloadCurrent(snapshot, 4, 2, false, "library")).toBe(true);
    expect(pipelineRoleDownloadCurrent(snapshot, 5, 2, false, "library")).toBe(false);
    expect(pipelineRoleDownloadCurrent(snapshot, 4, 3, false, "library")).toBe(false);
    expect(pipelineRoleDownloadCurrent(snapshot, 4, 2, true, "library")).toBe(false);
    expect(pipelineRoleDownloadCurrent(snapshot, 4, 2, false, "raw")).toBe(false);
    expect(pipelineRoleDownloadCurrent(null, 4, 2, false, "library")).toBe(false);
  });
});
