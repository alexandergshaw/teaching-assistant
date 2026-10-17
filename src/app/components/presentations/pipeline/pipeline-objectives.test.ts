import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isObjectiveRevisionCurrent, makeObjectiveDraft, objectiveGenerationResult, recordPipelineDiagnostic, selectedObjectiveTexts, validateHomework } from "./pipeline-objectives";
import { buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";

function createDownload() {
  const state = readSessionDiagnosticLogState();
  return buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "", browser: "test" }, "2026-01-01T00:00:01.000Z");
}

describe("pipeline objectives", () => {
  it("wires applied objectives into every stage run including run-to-end and slide regeneration", () => {
    const tab = readFileSync(join(process.cwd(), "src/app/components/presentations/pipeline/PipelineTab.tsx"), "utf8");
    const logic = readFileSync(join(process.cwd(), "src/app/components/presentations/pipeline/panel-logic.ts"), "utf8");
    const regen = readFileSync(join(process.cwd(), "src/app/components/presentations/pipeline/SlideRegenView.tsx"), "utf8");
    expect(tab).toContain("runStage(stage, pipelineState, contextText, appliedObjectives)");
    expect(tab).toContain("runStage(stage, current, contextText, appliedObjectives)");
    expect(logic).toContain("buildContext(state, contextText, regenExtras?.objectives)");
    expect(regen).toContain("objectives: appliedObjectives");
  });
  it("records fixed aggregate diagnostics without pipeline content in entries or downloads", () => {
    resetSessionDiagnosticLogForTests("2026-01-01T00:00:00.000Z");
    recordPipelineDiagnostic("pipeline_objective_generation", "success", 12, 2);
    recordPipelineDiagnostic("pipeline_slide_save", "success", 0, 1, 4);
    recordPipelineDiagnostic("pipeline_slide_candidate_accept", "success", 0, 1, 2);
    recordPipelineDiagnostic("pipeline_slide_candidate_discard", "success", 0, 1);
    const log = createDownload();
    const serialized = `${JSON.stringify(readSessionDiagnosticLogState().entries)}${formatSessionDiagnosticLogJson(log)}${formatSessionDiagnosticLogCsv(log)}`;
    expect(serialized).toContain("pipeline_objective_generation");
    expect(serialized).toContain("pipeline_slide_candidate_accept");
    expect(serialized).toContain("pipeline_slide_candidate_discard");
    expect(serialized).toContain('"count":2');
    for (const secret of ["distinctive homework", "distinctive objective", "slide secret", "speaker note secret", "prompt secret", "candidate secret", "provider exception"]) expect(serialized).not.toContain(secret);
  });
  it("keeps diagnostics sink failure from interrupting the user's edit", () => {
    const failingWriter = () => { throw new Error("private exception"); };
    expect(() => recordPipelineDiagnostic("pipeline_slide_save", "success", 0, 1, 1, undefined, failingWriter)).not.toThrow();
  });
  it("validates blank and oversized homework without truncating", () => {
    expect(validateHomework(" \n ")).toMatch(/Paste the homework/);
    expect(validateHomework("x".repeat(20_001))).toMatch(/20,000/);
    expect(validateHomework("x".repeat(20_000))).toBeNull();
  });
  it("starts suggestions selected and applies only selected nonempty edited text", () => {
    const drafts = makeObjectiveDraft(["Explain the result", ""]);
    drafts[0].text = "Explain the result with evidence";
    drafts[1].selected = false;
    expect(selectedObjectiveTexts(drafts)).toEqual(["Explain the result with evidence"]);
  });
  it("preserves prior suggestions for malformed output and rejects a late old-homework result", () => {
    const previous = ["Prior accepted suggestion"];
    expect(objectiveGenerationResult("old", "new", ["late"])).toEqual({ kind: "stale" });
    expect(objectiveGenerationResult("same", "same", null)).toEqual({ kind: "failure" });
    expect(previous).toEqual(["Prior accepted suggestion"]);
  });
  it("discards pipeline responses after applied objectives change and disables conflicting controls", () => {
    const tab = readFileSync(join(process.cwd(), "src/app/components/presentations/pipeline/PipelineTab.tsx"), "utf8");
    expect(isObjectiveRevisionCurrent(4, 4)).toBe(true);
    expect(isObjectiveRevisionCurrent(4, 5)).toBe(false);
    expect(tab).toContain("if (isObjectiveRevisionCurrent(objectiveRevisionAtStart, objectiveRevision.current)) setPipelineState(next)");
    expect(tab).toContain("if (!isObjectiveRevisionCurrent(objectiveRevisionAtStart, objectiveRevision.current)) return");
    expect(tab).toContain("disabled={objectiveBusy || busy}");
    expect(tab).toContain("objectiveRevision.current += 1");
  });
});
