import { describe, it, expect, vi } from "vitest";
import { runWorkflowUnattended } from "./server-runner";
import type { StepDefinition, StepRunHelpers } from "./registry";
import type { WorkflowDef } from "./types";
import type { RunLogContext } from "./run-logging";
import { resolveFanoutInstitutions, resolveFanoutCourses } from "./fanout";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Per-step run-log integration coverage for runWorkflowUnattended, split out
// of server-runner.test.ts to keep both files under the 1000-line cap (same
// split-test-siblings precedent as server-runner.fanout.test.ts). Covers R2
// (per-step rows written as the run proceeds), R3 (timings), R4 (progress
// capture + cap), R5 (fan-out institution/courseId attribution), and R6 (a
// rejecting log write never fails the run) from the run-logs feature.
//
// fakeHelpers/lookupOf duplicated verbatim from server-runner.test.ts rather
// than imported, so this file stays a self-contained sibling.

vi.mock("./fanout", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("./fanout");
  return { ...actual, resolveFanoutInstitutions: vi.fn(), resolveFanoutCourses: vi.fn() };
});

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

// Same hand-rolled fake Supabase client shape as workflow-runs.test.ts /
// run-logging.test.ts: records every insert payload in call order.
interface RecordedInsert {
  table: string;
  row: Record<string, unknown>;
}

function fakeSupabase(opts?: { rejectInsert?: boolean }) {
  const inserts: RecordedInsert[] = [];
  const client = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        if (opts?.rejectInsert) throw new Error("insert rejected");
        return { error: null };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient<Database>, inserts };
}

function runLogOf(client: SupabaseClient<Database>, runId = "run-1"): RunLogContext {
  return { supabase: client, userId: "u1", runId };
}

describe("runWorkflowUnattended per-step run logging", () => {
  it("writes a step row for EACH step as the loop proceeds (not batched at the end)", async () => {
    const order: number[] = [];
    const defs: Record<string, StepDefinition> = {
      a: {
        type: "a", name: "A", description: "", inputs: [], outputs: [],
        run: async () => {
          order.push(0);
          return { outputs: {}, summary: { kind: "text", text: "first" } };
        },
      },
      b: {
        type: "b", name: "B", description: "", inputs: [], outputs: [],
        run: async () => {
          order.push(1);
          return { outputs: {}, summary: { kind: "text", text: "second" } };
        },
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "a", bindings: {} }, { type: "b", bindings: {} }],
    };
    const { client, inserts } = fakeSupabase();

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].row).toMatchObject({ step_index: 0, step_type: "a", status: "done", summary: "first" });
    expect(inserts[1].row).toMatchObject({ step_index: 1, step_type: "b", status: "done", summary: "second" });
  });

  it("has already written step 0's row by the time step 1 STARTS running (proves incremental, not batched-at-the-end)", async () => {
    const { client, inserts } = fakeSupabase();
    let insertCountWhenStepBStarted = -1;
    const defs: Record<string, StepDefinition> = {
      a: {
        type: "a", name: "A", description: "", inputs: [], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "first" } }),
      },
      b: {
        type: "b", name: "B", description: "", inputs: [], outputs: [],
        run: async () => {
          insertCountWhenStepBStarted = inserts.length;
          return { outputs: {}, summary: { kind: "text", text: "second" } };
        },
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "a", bindings: {} }, { type: "b", bindings: {} }],
    };

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    // If step rows were batched and written only after the whole run
    // finished, this would be 0 (nothing written yet when step b starts).
    expect(insertCountWhenStepBStarted).toBe(1);
  });

  it("captures startedAt/finishedAt per step from one consistent clock", async () => {
    const defs: Record<string, StepDefinition> = {
      slow: {
        type: "slow", name: "Slow", description: "", inputs: [], outputs: [],
        run: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { outputs: {}, summary: { kind: "text", text: "" } };
        },
      },
    };
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "slow", bindings: {} }] };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    const row = inserts[0].row;
    expect(typeof row.started_at).toBe("string");
    expect(typeof row.finished_at).toBe("string");
    expect(new Date(row.finished_at as string).getTime()).toBeGreaterThanOrEqual(new Date(row.started_at as string).getTime());
  });

  it("records the FULL error text (untruncated) and the step's real index on failure", async () => {
    const longError = "boom ".repeat(500); // well beyond any 500-char cap used elsewhere in this codebase
    const defs: Record<string, StepDefinition> = {
      ok: {
        type: "ok", name: "Ok", description: "", inputs: [], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
      fails: {
        type: "fails", name: "Fails", description: "", inputs: [], outputs: [],
        run: async () => { throw new Error(longError); },
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "ok", bindings: {} }, { type: "fails", bindings: {} }],
    };
    const { client, inserts } = fakeSupabase();

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(result.ok).toBe(false);
    expect(inserts[1].row).toMatchObject({ step_index: 1, step_type: "fails", status: "error" });
    expect(inserts[1].row.error).toBe(longError);
    expect((inserts[1].row.error as string).length).toBe(longError.length);
  });

  it("collects onProgress messages into the step's row (unattended runs no longer discard them)", async () => {
    const defs: Record<string, StepDefinition> = {
      chatty: {
        type: "chatty", name: "Chatty", description: "", inputs: [], outputs: [],
        run: async (_values, _helpers, onProgress) => {
          onProgress("starting");
          onProgress("halfway");
          onProgress("done");
          return { outputs: {}, summary: { kind: "text", text: "" } };
        },
      },
    };
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "chatty", bindings: {} }] };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(inserts[0].row.progress).toEqual(["starting", "halfway", "done"]);
  });

  it("caps collected progress messages so a chatty step cannot bloat its row", async () => {
    const defs: Record<string, StepDefinition> = {
      veryChatty: {
        type: "veryChatty", name: "Very Chatty", description: "", inputs: [], outputs: [],
        run: async (_values, _helpers, onProgress) => {
          for (let i = 0; i < 250; i++) onProgress(`msg-${i}`);
          return { outputs: {}, summary: { kind: "text", text: "" } };
        },
      },
    };
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "veryChatty", bindings: {} }] };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect((inserts[0].row.progress as string[]).length).toBe(200);
  });

  it("logs disabled and skipped steps too, with empty progress and no error", async () => {
    const defs: Record<string, StepDefinition> = {
      a: {
        type: "a", name: "A", description: "", inputs: [], outputs: [{ key: "v", label: "V", type: "text" }],
        run: async () => ({ outputs: { v: "x" }, summary: { kind: "text", text: "" } }),
      },
      b: {
        type: "b", name: "B", description: "", inputs: [{ key: "v", label: "V", type: "text", required: true }], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "a", bindings: {} }, { type: "b", bindings: { v: { source: "step", stepIndex: 0, outputKey: "v" } } }],
    };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set([0]),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(inserts[0].row).toMatchObject({ step_index: 0, status: "disabled", progress: [], error: null });
    expect(inserts[1].row).toMatchObject({ step_index: 1, status: "error" }); // cascades - genuinely fails, not "skipped"
  });

  it("runs normally with no crash when runLog is omitted (logging is simply off)", async () => {
    const defs: Record<string, StepDefinition> = {
      a: {
        type: "a", name: "A", description: "", inputs: [], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "a", bindings: {} }] };

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs),
    });

    expect(result.ok).toBe(true);
    expect(result.steps[0].status).toBe("done");
  });

  it("never fails the run when the log write rejects (R6)", async () => {
    const defs: Record<string, StepDefinition> = {
      a: {
        type: "a", name: "A", description: "", inputs: [], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "a", bindings: {} }] };
    const { client } = fakeSupabase({ rejectInsert: true });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(result.ok).toBe(true);
    expect(result.steps[0].status).toBe("done");
    consoleSpy.mockRestore();
  });
});

describe("runWorkflowUnattended per-step resolved-input logging (AC1/AC6)", () => {
  it("records the RESOLVED runtime-bound input value on the step's row, not just the binding", async () => {
    const defs: Record<string, StepDefinition> = {
      grade: {
        type: "grade", name: "Grade", description: "",
        inputs: [{ key: "repo", label: "Repo", type: "repo", required: true }],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "grade", bindings: { repo: { source: "runtime", fieldKey: "repoField" } } }],
    };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: { repoField: "org/my-repo" }, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect((inserts[0].row.inputs as Record<string, string>).repo).toBe("org/my-repo");
  });

  it("records a runtime-bound input that resolved to EMPTY visibly, not omitted - this is the incident this feature exists to catch", async () => {
    const defs: Record<string, StepDefinition> = {
      grade: {
        type: "grade", name: "Grade", description: "",
        inputs: [{ key: "repo", label: "Repo", type: "repo", required: true }],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "grade", bindings: { repo: { source: "runtime", fieldKey: "repoField" } } }],
    };
    const { client, inserts } = fakeSupabase();

    // repoField deliberately absent from fieldValues - mirrors the reported
    // "the Repository input resolved to empty" failure.
    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    const written = inserts[0].row.inputs as Record<string, string>;
    expect(Object.keys(written)).toContain("repo");
    expect(written.repo).toBe("(empty)");
  });

  it("redacts a credential-shaped fieldValue bound into a step's input before it is ever written", async () => {
    const defs: Record<string, StepDefinition> = {
      grade: {
        type: "grade", name: "Grade", description: "",
        inputs: [{ key: "apiToken", label: "API Token", type: "text", required: true }],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "grade", bindings: { apiToken: { source: "runtime", fieldKey: "tokenField" } } }],
    };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: { tokenField: "super-secret-value" }, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    const written = inserts[0].row.inputs as Record<string, string>;
    expect(written.apiToken).toBe("[REDACTED]");
    expect(JSON.stringify(written)).not.toContain("super-secret-value");
  });

  it("records inputs: null for a step with no inputs at all", async () => {
    const defs: Record<string, StepDefinition> = {
      probe: {
        type: "probe", name: "Probe", description: "", inputs: [], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "probe", bindings: {} }] };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(inserts[0].row.inputs).toBeNull();
  });

  it("records no inputs (null) for a disabled step - it never reached input resolution", async () => {
    const defs: Record<string, StepDefinition> = {
      grade: {
        type: "grade", name: "Grade", description: "",
        inputs: [{ key: "repo", label: "Repo", type: "repo", required: true }],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "grade", bindings: { repo: { source: "literal", value: "org/repo" } } }],
    };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set([0]),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(inserts[0].row).toMatchObject({ status: "disabled", inputs: null });
  });

  it("still records what WAS resolved when a later step throws mid-run (a failed step's inputs are diagnostic too)", async () => {
    const defs: Record<string, StepDefinition> = {
      grade: {
        type: "grade", name: "Grade", description: "",
        inputs: [{ key: "repo", label: "Repo", type: "repo", required: true }],
        outputs: [],
        run: async () => { throw new Error("boom"); },
      },
    };
    const def: WorkflowDef = {
      id: "t", name: "t", description: "",
      steps: [{ type: "grade", bindings: { repo: { source: "literal", value: "org/repo" } } }],
    };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(inserts[0].row.status).toBe("error");
    expect((inserts[0].row.inputs as Record<string, string>).repo).toBe("org/repo");
  });
});

describe("runWorkflowUnattended fan-out run logging (R5)", () => {
  it("tags each institution fan-out group's step rows with that institution", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ list: ["AAA", "BBB"] });
    const defs: Record<string, StepDefinition> = {
      probe: {
        type: "probe", name: "Probe", description: "", inputs: [], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "ran" } }),
      },
    };
    const def: WorkflowDef = {
      id: "fo", name: "Fanout WF", description: "", scope: { institution: "*" },
      steps: [{ type: "probe", bindings: {} }],
    };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(inserts).toHaveLength(2);
    expect(inserts.map((i) => i.row.institution)).toEqual(["AAA", "BBB"]);
    // Same step_index in both rows - only institution disambiguates them, so
    // a per-institution failure is attributable without flattening the list.
    expect(inserts.every((i) => i.row.step_index === 0)).toBe(true);
  });

  it("tags each course fan-out group's step rows with that courseId", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "c1", name: "Course A", institution: null },
        { id: "c2", name: "Course B", institution: null },
      ],
    });
    const defs: Record<string, StepDefinition> = {
      probe: {
        type: "probe", name: "Probe", description: "", inputs: [], outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "ran" } }),
      },
    };
    const def: WorkflowDef = {
      id: "co", name: "Course FO", description: "", scope: { hubCourse: "*" },
      steps: [{ type: "probe", bindings: {} }],
    };
    const { client, inserts } = fakeSupabase();

    await runWorkflowUnattended({
      def, resolveWorkflow: () => undefined, fieldValues: {}, disabledTopIndices: new Set(),
      helpers: fakeHelpers(), stepLookup: lookupOf(defs), runLog: runLogOf(client),
    });

    expect(inserts.map((i) => i.row.course_id)).toEqual(["c1", "c2"]);
  });
});
