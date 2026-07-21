import { describe, it, expect, vi } from "vitest";
import { runWorkflowUnattended, buildRunReportMarkdown, type StepRunOutcome } from "./server-runner";
import type { StepDefinition, StepRunHelpers } from "./registry";
import type { WorkflowDef } from "./types";
import { resolveFanoutInstitutions } from "./fanout";

// Keep isInstitutionFanout / scopeForInstitution real; only stub the network
// enumerator so fan-out can be exercised without env-configured institutions.
vi.mock("./fanout", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("./fanout");
  return { ...actual, resolveFanoutInstitutions: vi.fn() };
});

// A tiny fake step catalog + fake helpers, injected via runWorkflowUnattended's
// stepLookup override, so the run loop (binding resolution, disabled-step
// cascade, dependency-failure cascade, requireInput abort) is exercised with
// no network calls and none of registry.ts's real (heavy) step catalog.

function fakeHelpers(): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: vi.fn(async () => {}),
    saveCourseMaterialFile: vi.fn(async () => {}),
    saveCourseExportFile: vi.fn(async () => {}),
    loadCommonResources: vi.fn(async () => []),
    getLibraryFile: vi.fn(async () => null),
    getInstitutionFields: vi.fn(async () => []),
    loadCourseExport: vi.fn(async () => null),
  };
}

function lookupOf(defs: Record<string, StepDefinition>) {
  return (type: string) => defs[type];
}

describe("runWorkflowUnattended", () => {
  it("resolves runtime, step-output, and literal bindings in order", async () => {
    const defs: Record<string, StepDefinition> = {
      greet: {
        type: "greet",
        name: "Greet",
        description: "",
        inputs: [{ key: "name", label: "Name", type: "text", required: true }],
        outputs: [{ key: "greeting", label: "Greeting", type: "text" }],
        run: async (values) => ({
          outputs: { greeting: `Hello ${values.name}` },
          summary: { kind: "text", text: "" },
        }),
      },
      echo: {
        type: "echo",
        name: "Echo",
        description: "",
        inputs: [
          { key: "text", label: "Text", type: "text", required: true },
          { key: "suffix", label: "Suffix", type: "text", required: false },
        ],
        outputs: [{ key: "out", label: "Out", type: "text" }],
        run: async (values) => ({
          outputs: { out: `${values.text}${values.suffix}` },
          summary: { kind: "text", text: "" },
        }),
      },
    };

    const def: WorkflowDef = {
      id: "test",
      name: "Test",
      description: "",
      steps: [
        { type: "greet", bindings: { name: { source: "runtime", fieldKey: "who" } } },
        {
          type: "echo",
          bindings: {
            text: { source: "step", stepIndex: 0, outputKey: "greeting" },
            suffix: { source: "literal", value: "!" },
          },
        },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: { who: "World" },
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.status)).toEqual(["done", "done"]);
  });

  it("resolves an uploads-type runtime binding to an empty array (uploads are never snapshotted)", async () => {
    let captured: unknown = "not set";
    const defs: Record<string, StepDefinition> = {
      needsFiles: {
        type: "needsFiles",
        name: "Needs files",
        description: "",
        inputs: [{ key: "files", label: "Files", type: "uploads", required: false }],
        outputs: [],
        run: async (values) => {
          captured = values.files;
          return { outputs: {}, summary: { kind: "text", text: "" } };
        },
      },
    };
    const def: WorkflowDef = {
      id: "t",
      name: "t",
      description: "",
      steps: [{ type: "needsFiles", bindings: { files: { source: "runtime", fieldKey: "upload" } } }],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(captured).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fills an UNBOUND input from the workflow scope when the scope covers its family", async () => {
    // A workflow authored before the step gained the input has no binding for
    // it; a scope-level target (e.g. Modules ahead) must still reach the step.
    let captured: Record<string, unknown> = {};
    const defs: Record<string, StepDefinition> = {
      moduleStep: {
        type: "moduleStep",
        name: "Module step",
        description: "",
        inputs: [
          { key: "topic", label: "Topic", type: "text", required: false },
          { key: "modulesAhead", label: "Modules ahead", type: "moduleOffset", required: false },
        ],
        outputs: [],
        run: async (values) => {
          captured = values;
          return { outputs: {}, summary: { kind: "text", text: "" } };
        },
      },
    };
    const def: WorkflowDef = {
      id: "t",
      name: "t",
      description: "",
      // NO binding for modulesAhead (and none for topic either).
      steps: [{ type: "moduleStep", bindings: {} }],
      scope: { moduleOffset: "2" },
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(result.ok).toBe(true);
    // Scope-covered family fills the unbound input; an uncovered unbound
    // input (topic - no text family) stays unresolved.
    expect(captured.modulesAhead).toBe("2");
    expect(captured.topic).toBeUndefined();
  });

  it("cascade-skips a step that depends on a disabled step, but still runs an independent later step", async () => {
    const defs: Record<string, StepDefinition> = {
      a: {
        type: "a",
        name: "A",
        description: "",
        inputs: [],
        outputs: [{ key: "v", label: "V", type: "text" }],
        run: async () => ({ outputs: { v: "x" }, summary: { kind: "text", text: "" } }),
      },
      b: {
        type: "b",
        name: "B",
        description: "",
        inputs: [{ key: "v", label: "V", type: "text", required: true }],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
      c: {
        type: "c",
        name: "C",
        description: "",
        inputs: [],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t",
      name: "t",
      description: "",
      steps: [
        { type: "a", bindings: {} },
        { type: "b", bindings: { v: { source: "step", stepIndex: 0, outputKey: "v" } } },
        { type: "c", bindings: {} },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set([0]),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(result.steps[0].status).toBe("disabled");
    expect(result.steps[1].status).toBe("error");
    expect(result.steps[1].error).toContain("disabled");
    expect(result.steps[2].status).toBe("done");
    // Step b genuinely could not run (its input producer was disabled), so
    // this run is reported as not fully successful - only the disabled step
    // ITSELF is exempted from counting against `ok`, not steps that cascade
    // from it.
    expect(result.ok).toBe(false);
  });

  it("marks the run ok when a disabled step has no enabled dependents", async () => {
    const defs: Record<string, StepDefinition> = {
      a: {
        type: "a",
        name: "A",
        description: "",
        inputs: [],
        outputs: [{ key: "v", label: "V", type: "text" }],
        run: async () => ({ outputs: { v: "x" }, summary: { kind: "text", text: "" } }),
      },
      c: {
        type: "c",
        name: "C",
        description: "",
        inputs: [],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t",
      name: "t",
      description: "",
      steps: [
        { type: "a", bindings: {} },
        { type: "c", bindings: {} },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set([0]),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(result.steps[0].status).toBe("disabled");
    expect(result.steps[1].status).toBe("done");
    expect(result.ok).toBe(true);
  });

  it("cascade-skips a step that depends on a runIf-skipped step, and keeps the run ok", async () => {
    const defs: Record<string, StepDefinition> = {
      boolProvider: {
        type: "boolProvider",
        name: "Bool Provider",
        description: "",
        inputs: [],
        outputs: [{ key: "enabled", label: "Enabled", type: "text" }],
        run: async () => ({ outputs: { enabled: "false" }, summary: { kind: "text", text: "" } }),
      },
      gated: {
        type: "gated",
        name: "Gated",
        description: "",
        inputs: [{ key: "flag", label: "Flag", type: "text", required: true }],
        outputs: [{ key: "result", label: "Result", type: "text" }],
        run: async (values) => ({
          outputs: { result: `gated-${values.flag}` },
          summary: { kind: "text", text: "" },
        }),
      },
      dependent: {
        type: "dependent",
        name: "Dependent",
        description: "",
        inputs: [{ key: "input", label: "Input", type: "text", required: true }],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t",
      name: "t",
      description: "",
      steps: [
        { type: "boolProvider", bindings: {} },
        {
          type: "gated",
          bindings: { flag: { source: "step", stepIndex: 0, outputKey: "enabled" } },
          runIf: { binding: { source: "step", stepIndex: 0, outputKey: "enabled" }, expected: true },
        },
        {
          type: "dependent",
          bindings: { input: { source: "step", stepIndex: 1, outputKey: "result" } },
        },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(result.steps[0].status).toBe("done");
    expect(result.steps[1].status).toBe("skipped");
    expect(result.steps[2].status).toBe("skipped");
    expect(result.ok).toBe(true);
  });

  it("aborts the whole run instead of hanging when a step unexpectedly requires input", async () => {
    const defs: Record<string, StepDefinition> = {
      pauser: {
        type: "pauser",
        name: "Pauser",
        description: "",
        inputs: [],
        outputs: [],
        run: async () => ({
          outputs: {},
          summary: { kind: "text", text: "" },
          requireInput: { message: "need a value", key: "x", kind: "text" },
        }),
      },
      after: {
        type: "after",
        name: "After",
        description: "",
        inputs: [],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t",
      name: "t",
      description: "",
      steps: [
        { type: "pauser", bindings: {} },
        { type: "after", bindings: {} },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    // The run stopped at the pausing step - "after" never ran at all.
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe("needs-interaction");
    expect(result.ok).toBe(false);
  });

  it("aborts the whole run when a step unexpectedly requires confirmation", async () => {
    const defs: Record<string, StepDefinition> = {
      confirmer: {
        type: "confirmer",
        name: "Confirmer",
        description: "",
        inputs: [],
        outputs: [],
        run: async () => ({
          outputs: {},
          summary: { kind: "text", text: "" },
          requireConfirmation: "Are you sure?",
        }),
      },
    };
    const def: WorkflowDef = { id: "t", name: "t", description: "", steps: [{ type: "confirmer", bindings: {} }] };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(result.steps[0].status).toBe("needs-interaction");
    expect(result.ok).toBe(false);
  });

  it("fails a step whose type is not in the step catalog, and cascades to its dependents", async () => {
    const defs: Record<string, StepDefinition> = {
      after: {
        type: "after",
        name: "After",
        description: "",
        inputs: [{ key: "v", label: "V", type: "text", required: false }],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "t",
      name: "t",
      description: "",
      steps: [
        { type: "unknown-step", bindings: {} },
        { type: "after", bindings: { v: { source: "step", stepIndex: 0, outputKey: "out" } } },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });

    expect(result.steps[0].status).toBe("error");
    expect(result.steps[1].status).toBe("error");
    expect(result.ok).toBe(false);
  });

  it("reports a run error instead of throwing when the workflow has an unresolvable include", async () => {
    const def: WorkflowDef = {
      id: "broken",
      name: "Broken",
      description: "",
      steps: [
        {
          type: "include-workflow",
          bindings: {},
          include: { workflowId: "missing", skipSteps: [], remap: {} },
        },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf({}),
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0].status).toBe("error");
  });
});

describe("buildRunReportMarkdown", () => {
  const names: Record<string, string> = {
    greet: "Greet",
    list: "List step",
    link: "Link step",
    sched: "Schedule step",
  };
  const name = (t: string) => names[t] ?? t;

  it("renders text, list, and link summaries and skips schedules, errors, and empties", () => {
    const outcomes: StepRunOutcome[] = [
      { index: 0, type: "greet", status: "done", error: null, summary: { kind: "text", text: "Hello world" } },
      { index: 1, type: "list", status: "done", error: null, summary: { kind: "list", label: "Items", items: ["a", "b"] } },
      { index: 2, type: "link", status: "done", error: null, summary: { kind: "link", label: "Open", url: "https://x.test" } },
      { index: 3, type: "sched", status: "done", error: null, summary: { kind: "schedule", courseTitle: "C", schedule: [], csv: "" } },
      { index: 4, type: "greet", status: "error", error: "boom", summary: null },
      { index: 5, type: "greet", status: "done", error: null, summary: { kind: "text", text: "   " } },
    ];
    const md = buildRunReportMarkdown("My Workflow", "2026-07-15T00:00:00.000Z", outcomes, name);
    expect(md).toBeTruthy();
    expect(md).toContain("# My Workflow");
    expect(md).toContain("_Generated 2026-07-15T00:00:00.000Z_");
    expect(md).toContain("## 1. Greet\n\nHello world");
    expect(md).toContain("## 2. List step\n\n**Items**\n\n- a\n- b");
    expect(md).toContain("## 3. Link step\n\n[Open](https://x.test)");
    expect(md).not.toContain("Schedule step");
    expect(md).not.toContain("## 5");
    expect(md).not.toContain("## 6");
  });

  it("returns null when there is no substantive text deliverable", () => {
    expect(buildRunReportMarkdown("W", "t", [], (t) => t)).toBeNull();
    const onlySchedule: StepRunOutcome[] = [
      { index: 0, type: "sched", status: "done", error: null, summary: { kind: "schedule", courseTitle: "C", schedule: [], csv: "" } },
    ];
    expect(buildRunReportMarkdown("W", "t", onlySchedule, (t) => t)).toBeNull();
  });

  it("labels the institution in section headers for a fan-out report", () => {
    const outcomes: StepRunOutcome[] = [
      { index: 0, type: "greet", status: "done", error: null, institution: "AAA", summary: { kind: "text", text: "hi A" } },
      { index: 0, type: "greet", status: "done", error: null, institution: "BBB", summary: { kind: "text", text: "hi B" } },
    ];
    const md = buildRunReportMarkdown("W", "t", outcomes, () => "Greet");
    expect(md).toContain("## 1. Greet (AAA)\n\nhi A");
    expect(md).toContain("## 1. Greet (BBB)\n\nhi B");
  });
});

describe("runWorkflowUnattended report capture", () => {
  it("saves a run report when a step produces a text deliverable", async () => {
    const defs: Record<string, StepDefinition> = {
      writeup: {
        type: "writeup",
        name: "Writeup",
        description: "",
        inputs: [],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "The deliverable body" } }),
      },
    };
    const def: WorkflowDef = {
      id: "rep",
      name: "Report WF",
      description: "",
      steps: [{ type: "writeup", bindings: {} }],
    };
    const saveRunReport = vi.fn(async (_name: string, _markdown: string) => {});
    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: { ...fakeHelpers(), saveRunReport },
      stepLookup: lookupOf(defs),
    });
    expect(result.ok).toBe(true);
    expect(saveRunReport).toHaveBeenCalledTimes(1);
    const [reportName, md] = saveRunReport.mock.calls[0];
    expect(reportName).toBe("Report WF report");
    expect(md).toContain("The deliverable body");
  });

  it("does not save a report when no step produces a text deliverable", async () => {
    const defs: Record<string, StepDefinition> = {
      silent: {
        type: "silent",
        name: "Silent",
        description: "",
        inputs: [],
        outputs: [],
        run: async () => ({ outputs: {}, summary: { kind: "text", text: "" } }),
      },
    };
    const def: WorkflowDef = {
      id: "s",
      name: "Silent WF",
      description: "",
      steps: [{ type: "silent", bindings: {} }],
    };
    const saveRunReport = vi.fn(async () => {});
    await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: { ...fakeHelpers(), saveRunReport },
      stepLookup: lookupOf(defs),
    });
    expect(saveRunReport).not.toHaveBeenCalled();
  });
});

describe("runWorkflowUnattended institution fan-out", () => {
  const probeDefs: Record<string, StepDefinition> = {
    probe: {
      type: "probe",
      name: "Probe",
      description: "",
      inputs: [{ key: "inst", label: "Institution", type: "institution", required: false }],
      outputs: [],
      run: async () => ({ outputs: {}, summary: { kind: "text", text: "ran" } }),
    },
  };
  const fanoutDef: WorkflowDef = {
    id: "fo",
    name: "Fanout WF",
    description: "",
    scope: { institution: "*" },
    steps: [{ type: "probe", bindings: { inst: { source: "runtime", fieldKey: "inst" } } }],
  };

  it("runs the body once per configured institution, pinning the active institution and scope", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ list: ["AAA", "BBB"] });
    const seen: Array<{ active: string | null; inst: unknown }> = [];
    const defs: Record<string, StepDefinition> = {
      probe: {
        ...probeDefs.probe,
        run: async (values, helpers) => {
          seen.push({ active: helpers.activeInstitution, inst: values.inst });
          return { outputs: {}, summary: { kind: "text", text: "ran" } };
        },
      },
    };
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });
    expect(result.ok).toBe(true);
    // The institution is pinned per iteration - active context AND the scoped
    // institution input both resolve to the concrete acronym.
    expect(seen).toEqual([
      { active: "AAA", inst: "AAA" },
      { active: "BBB", inst: "BBB" },
    ]);
    expect(result.groups?.map((g) => g.institution)).toEqual(["AAA", "BBB"]);
    expect(result.steps.map((s) => s.institution)).toEqual(["AAA", "BBB"]);
  });

  it("errors (never silently succeeds) when no institutions are configured", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ list: [] });
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("No institutions");
  });

  it("surfaces an enumeration error", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ error: "boom" });
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("Could not list institutions: boom");
  });

  it("skips institutions past the time-budget deadline", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ list: ["AAA", "BBB"] });
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(probeDefs),
      deadlineMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.groups?.every((g) => !g.ok)).toBe(true);
    expect(result.steps.every((s) => (s.error ?? "").includes("time budget"))).toBe(true);
  });

  it("does not fan out (nor enumerate) when the institution scope is concrete", async () => {
    vi.mocked(resolveFanoutInstitutions).mockClear();
    const result = await runWorkflowUnattended({
      def: { ...fanoutDef, scope: { institution: "MCC" } },
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(true);
    expect(result.groups).toBeUndefined();
    expect(resolveFanoutInstitutions).not.toHaveBeenCalled();
  });
});

describe("runWorkflowUnattended fan-out checkpointing", () => {
  const makeRecordingDefs = (ran: string[]): Record<string, StepDefinition> => ({
    probe: {
      type: "probe",
      name: "Probe",
      description: "",
      inputs: [],
      outputs: [],
      run: async (_values, helpers) => {
        ran.push(helpers.activeInstitution ?? "");
        return { outputs: {}, summary: { kind: "text", text: "ran" } };
      },
    },
  });
  const def: WorkflowDef = {
    id: "fo",
    name: "F",
    description: "",
    scope: { institution: "*" },
    steps: [{ type: "probe", bindings: {} }],
  };

  it("skips already-done institutions and checkpoints each new one (resume)", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ list: ["AAA", "BBB", "CCC"] });
    const ran: string[] = [];
    const done: string[] = [];
    const onInstitutionDone = vi.fn(async (acronym: string) => {
      done.push(acronym);
      return true;
    });
    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(makeRecordingDefs(ran)),
      skipInstitutions: new Set(["AAA"]),
      onInstitutionDone,
    });
    expect(ran).toEqual(["BBB", "CCC"]);
    expect(done).toEqual(["BBB", "CCC"]);
    expect(result.fanout).toEqual({ total: 3, ranThisTick: ["BBB", "CCC"], remaining: [], truncated: false });
  });

  it("truncates cleanly past the deadline (no error rows) and reports the remainder", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ list: ["AAA", "BBB"] });
    const ran: string[] = [];
    const onInstitutionDone = vi.fn(async () => true);
    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(makeRecordingDefs(ran)),
      deadlineMs: 0,
      onInstitutionDone,
    });
    expect(ran).toEqual([]);
    expect(onInstitutionDone).not.toHaveBeenCalled();
    expect(result.fanout?.truncated).toBe(true);
    expect(result.fanout?.remaining).toEqual(["AAA", "BBB"]);
    expect(result.steps).toEqual([]);
  });

  it("stops the fan-out when a checkpoint is lost (onInstitutionDone false)", async () => {
    vi.mocked(resolveFanoutInstitutions).mockResolvedValue({ list: ["AAA", "BBB", "CCC"] });
    const ran: string[] = [];
    const onInstitutionDone = vi.fn(async () => false);
    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(makeRecordingDefs(ran)),
      onInstitutionDone,
    });
    expect(ran).toEqual(["AAA"]);
    expect(onInstitutionDone).toHaveBeenCalledTimes(1);
    expect(result.fanout?.remaining).toEqual(["BBB", "CCC"]);
    expect(result.fanout?.truncated).toBe(true);
  });
});
