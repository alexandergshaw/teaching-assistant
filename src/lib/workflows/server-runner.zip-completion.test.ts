// U9 coverage for runWorkflowUnattended's post-run zip-log-completion stage:
// once the workflow body finishes, any course zip(s) "save-zip-to-course"
// saved during the run get their embedded log completed via
// completeCourseZipRunLogs (zip-run-log-completion.ts) - mocked here so this
// suite focuses purely on server-runner.ts's OWN wiring (when it is called,
// with what arguments, and that it can never fail or block the run itself),
// not on that module's own fetch/replace/save logic (covered by
// zip-run-log-completion.test.ts).
//
// Split out of server-runner.run-log.test.ts (which already covers the
// per-step logging this stage builds on) to keep both files under the
// 1000-line cap - same split-test-siblings precedent as
// server-runner.fanout.test.ts. fakeHelpers/lookupOf/fakeSupabase/runLogOf
// duplicated verbatim rather than imported, so this file stays a
// self-contained sibling (same rationale server-runner.run-log.test.ts's own
// header comment gives for its own duplication).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWorkflowUnattended } from "./server-runner";
import type { StepDefinition, StepRunHelpers } from "./registry";
import type { WorkflowDef } from "./types";
import type { RunLogContext } from "./run-logging";
import { SAVED_ZIP_OUTPUT_KEY } from "./run-logging";
import { resolveFanoutCourses } from "./fanout";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

vi.mock("./fanout", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("./fanout");
  return { ...actual, resolveFanoutInstitutions: vi.fn(), resolveFanoutCourses: vi.fn() };
});

vi.mock("./zip-run-log-completion", () => ({ completeCourseZipRunLogs: vi.fn() }));

import { completeCourseZipRunLogs } from "./zip-run-log-completion";

function fakeHelpers(): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: vi.fn(async () => {}),
    saveCourseMaterialFile: vi.fn(async () => {}),
    saveCourseCastletopFile: vi.fn(async () => {}),
    saveCourseExportFile: vi.fn(async () => {}),
    loadCommonResources: vi.fn(async () => []),
    getLibraryFile: vi.fn(async () => null),
    getInstitutionFields: vi.fn(async () => []),
    loadCourseExport: vi.fn(async () => null),
    loadCourseMaterials: vi.fn(async () => null),
  };
}

function lookupOf(defs: Record<string, StepDefinition>) {
  return (type: string) => defs[type];
}

function fakeSupabase() {
  const client = { from: () => ({ insert: async () => ({ error: null }) }) };
  return client as unknown as SupabaseClient<Database>;
}

function runLogOf(runId = "run-1"): RunLogContext {
  return { supabase: fakeSupabase(), userId: "u1", runId };
}

/** A step that behaves exactly like save-zip-to-course's success path: it
 * publishes SAVED_ZIP_OUTPUT_KEY on its own outputs. */
function zipStepDef(courseId: string, fileName: string): StepDefinition {
  return {
    type: "save-zip-to-course",
    name: "Save contents zip to course tile",
    description: "",
    inputs: [],
    outputs: [],
    run: async () => ({
      outputs: { [SAVED_ZIP_OUTPUT_KEY]: { courseId, fileName } },
      summary: { kind: "text", text: "Saved." },
    }),
  };
}

const okStep: StepDefinition = {
  type: "ok",
  name: "Ok",
  description: "",
  inputs: [],
  outputs: [],
  run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
};

const failStep: StepDefinition = {
  type: "fails",
  name: "Fails",
  description: "",
  inputs: [],
  outputs: [],
  run: async () => {
    throw new Error("boom");
  },
};

describe("runWorkflowUnattended - U9 post-run zip log completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes the zip for a step that published SAVED_ZIP_OUTPUT_KEY, with ok=true for a clean run", async () => {
    vi.mocked(completeCourseZipRunLogs).mockResolvedValue([]);
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "save-zip-to-course", bindings: {} }],
    };
    const runLog = runLogOf("run-1");

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf({ "save-zip-to-course": zipStepDef("course-1", "Materials.zip") }),
      runLog,
    });

    expect(result.ok).toBe(true);
    expect(completeCourseZipRunLogs).toHaveBeenCalledTimes(1);
    // C3: a clean run passes detail: "" - never fabricated for a passing run.
    expect(completeCourseZipRunLogs).toHaveBeenCalledWith(
      runLog.supabase, runLog.userId, runLog.runId, true, [{ courseId: "course-1", fileName: "Materials.zip" }], ""
    );
  });

  it("U9-AC3: still completes the zip for a FAILED run (ok=false) - not gated on run success", async () => {
    vi.mocked(completeCourseZipRunLogs).mockResolvedValue([]);
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "save-zip-to-course", bindings: {} }, { type: "fails", bindings: {} }],
    };
    const runLog = runLogOf("run-1");

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf({ "save-zip-to-course": zipStepDef("course-1", "Materials.zip"), fails: failStep }),
      runLog,
    });

    expect(result.ok).toBe(false);
    // C3: a failed run's detail is computed from the SAME steps this stage
    // already has in hand, using the identical "ok ? '' : joinStepErrorDetail
    // (steps)" formula every unattended entry point (cron/run-now/webhook/
    // triggers route) independently computes for its own finishWorkflowRun
    // call - see server-runner.ts's own comment at this call site. Before the
    // C3 fix, this stage passed no detail at all, and buildCompleteRunLogText
    // read the still-unwritten run.detail column back as null, so the
    // downloaded zip's Detail: section came out empty.
    expect(completeCourseZipRunLogs).toHaveBeenCalledWith(
      runLog.supabase, runLog.userId, runLog.runId, false, [{ courseId: "course-1", fileName: "Materials.zip" }], "step 2 fails: boom"
    );
  });

  it("does nothing when no step published a saved-zip reference", async () => {
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "ok", bindings: {} }] };

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf({ ok: okStep }), runLog: runLogOf(),
    });

    expect(completeCourseZipRunLogs).not.toHaveBeenCalled();
  });

  it("does nothing when there is no run-log context at all (no runId to complete against)", async () => {
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "save-zip-to-course", bindings: {} }] };

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf({ "save-zip-to-course": zipStepDef("course-1", "Materials.zip") }),
      // no runLog
    });

    expect(completeCourseZipRunLogs).not.toHaveBeenCalled();
  });

  it("collects saved-zip refs from EVERY course fan-out group into one call", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "c1", name: "Course A", institution: null },
        { id: "c2", name: "Course B", institution: null },
      ],
    });
    vi.mocked(completeCourseZipRunLogs).mockResolvedValue([]);
    const def: WorkflowDef = {
      id: "co", name: "Course FO", description: "", scope: { hubCourse: "*" },
      steps: [{ type: "save-zip-to-course", bindings: {} }],
    };

    // Each course fan-out iteration "saves" a DIFFERENT zip for its own
    // course - a plain counter stands in for "which iteration is this" since
    // the step declares no inputs of its own to read the scoped course id
    // from.
    let call = 0;
    const courseIdsSeen = ["c1", "c2"];

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf({
        "save-zip-to-course": {
          type: "save-zip-to-course", name: "", description: "", inputs: [], outputs: [],
          run: async () => ({
            outputs: { [SAVED_ZIP_OUTPUT_KEY]: { courseId: courseIdsSeen[call++], fileName: "x.zip" } },
            summary: { kind: "text", text: "" },
          }),
        },
      }),
      runLog: runLogOf(),
    });

    expect(completeCourseZipRunLogs).toHaveBeenCalledTimes(1);
    const refs = vi.mocked(completeCourseZipRunLogs).mock.calls[0][4];
    expect(refs).toHaveLength(2);
  });

  it("U9-AC4: never fails or throws out of the run when completeCourseZipRunLogs itself rejects", async () => {
    vi.mocked(completeCourseZipRunLogs).mockRejectedValue(new Error("network blip"));
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "save-zip-to-course", bindings: {} }] };

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf({ "save-zip-to-course": zipStepDef("course-1", "Materials.zip") }),
      runLog: runLogOf(),
    });

    // The run itself is unaffected - it already finished successfully before
    // this best-effort stage ran at all.
    expect(result.ok).toBe(true);
  });

  it("skips completion entirely for a TRUNCATED fan-out tick (more courses remain for a later tick)", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "c1", name: "Course A", institution: null },
        { id: "c2", name: "Course B", institution: null },
      ],
    });
    const def: WorkflowDef = {
      id: "co", name: "Course FO", description: "", scope: { hubCourse: "*" },
      steps: [{ type: "save-zip-to-course", bindings: {} }],
    };

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      // c1 actually runs (and saves a zip) before the deadline; c2 is left
      // for a later tick because onCourseDone (checkpointing) is present.
      stepLookup: lookupOf({
        "save-zip-to-course": {
          type: "save-zip-to-course", name: "", description: "", inputs: [], outputs: [],
          run: async () => {
            await new Promise((r) => setTimeout(r, 30));
            return { outputs: { [SAVED_ZIP_OUTPUT_KEY]: { courseId: "c1", fileName: "x.zip" } }, summary: { kind: "text", text: "" } };
          },
        },
      }),
      deadlineMs: Date.now() + 10,
      onCourseDone: vi.fn(async () => true),
      runLog: runLogOf(),
    });

    expect(result.fanout?.truncated).toBe(true);
    // c1's own outcome IS in `steps` (it genuinely ran and saved a zip), so
    // this proves the skip is specifically about truncation, not merely
    // "no saved-zip refs were ever collected".
    expect(result.steps.some((s) => s.type === "save-zip-to-course" && s.status === "done")).toBe(true);
    expect(completeCourseZipRunLogs).not.toHaveBeenCalled();
  });

  // SABOTAGE CHECK (confirmed by hand, restoring the fix immediately after):
  // gating the completion call on `ok` (e.g. `if (opts.runLog && ok && ...)`)
  // makes the "still completes the zip for a FAILED run" test above fail -
  // completeCourseZipRunLogs would never be called for the two-step run
  // above, whose second step throws.
});
