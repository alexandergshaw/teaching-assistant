import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordCopilotTask, recordRepositoryPublication } from "./repository-diagnostic";
import { resetSessionDiagnosticLogForTests, readSessionDiagnosticLogState, buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson } from "@/lib/session-diagnostic-log";

describe("repository publication diagnostics", () => {
  it("exports only fixed operation metadata and bounded aggregates, and isolates sink failures", () => {
    resetSessionDiagnosticLogForTests("2026-10-17T00:00:00Z");
    recordRepositoryPublication("success", 25, "READY", 4, 500);
    recordRepositoryPublication("failure", 30, "UNCERTAIN", 4, 500);
    const state = readSessionDiagnosticLogState();
    expect(state.entries).toHaveLength(2);
    expect(state.entries[0]).toMatchObject({ operation: "pipeline_private_snapshot_publish", durationMs: 25, institution: "", course: "", detail: { count: 4, bytes: 500 } });
    const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "/account/diagnostics", browser: "test" }, "2026-10-17T00:00:00Z");
    for (const output of [formatSessionDiagnosticLogCsv(log), formatSessionDiagnosticLogJson(log)]) {
      expect(output).toContain("Publish private deck snapshot");
      for (const forbidden of ["owner/private-repo", "private-context", "Private notes", "homework.txt", "Bearer secret"]) expect(output).not.toContain(forbidden);
    }
    expect(() => recordRepositoryPublication("success", 1, "READY", 1, 10, () => { throw new Error("sink"); })).not.toThrow();
  });
  it("wires publication and separate unavailable task controls without using the generic issue-dispatch helper", () => {
    const root = join(process.cwd(), "src/app/components/presentations/pipeline");
    const panel = readFileSync(join(root, "PipelineRepositoryPanel.tsx"), "utf8");
    const pipeline = readFileSync(join(root, "PipelineTab.tsx"), "utf8");
    expect(pipeline).toContain("<PipelineRepositoryPanel");
    expect(panel).toContain("publishPresentationRepositoryAction(frozen");
    expect(panel).toContain("onClick={() => void startCopilot(\"initial\")}");
    expect(panel).toContain("onClick={() => void startCopilot(\"followup\")}");
    expect(panel).toContain("!copilotEnabled");
    expect(panel).toContain("startPresentationCopilotTaskAction");
    expect(panel).not.toContain("createCopilotTaskAction");
  });

  it("records task outcomes without exporting prompt or repository content", () => {
    resetSessionDiagnosticLogForTests("2026-10-17T00:00:00Z");
    recordCopilotTask("success", 61, "QUEUED", "followup", 140);
    const state = readSessionDiagnosticLogState();
    expect(state.entries[0]).toMatchObject({ operation: "pipeline_copilot_task", outcome: "success", code: "QUEUED", detail: { kind: "followup", promptCharacters: 140 } });
    const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "/account/diagnostics", browser: "test" }, "2026-10-17T00:00:00Z");
    for (const output of [formatSessionDiagnosticLogCsv(log), formatSessionDiagnosticLogJson(log)]) {
      expect(output).toContain("Submit Copilot presentation task");
      for (const forbidden of ["Make a course website", "teacher/deck-project", "private-context", "Bearer secret"]) expect(output).not.toContain(forbidden);
    }
  });
});
