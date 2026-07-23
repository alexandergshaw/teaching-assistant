import { describe, it, expect, vi } from "vitest";
import { runWorkflowUnattended } from "./server-runner";
import type { StepDefinition, StepRunHelpers } from "./registry";
import type { WorkflowDef } from "./types";
import { resolveFanoutInstitutions, resolveFanoutCourses } from "./fanout";

// Institution, course, and composed (institution "*" + course multiplicity)
// fan-out coverage for runWorkflowUnattended, split out of server-runner.test.ts
// to keep both files under the 1000-line cap (split-test-siblings precedent).
// fakeHelpers/lookupOf below are duplicated verbatim from server-runner.test.ts
// rather than imported, so this file stays a self-contained sibling.

// Keep isInstitutionFanout / isCourseFanout / isComposedFanout / scopeForInstitution
// / scopeForCourse real; only stub the network enumerators so fan-out can be
// exercised without env-configured institutions or course tiles.
vi.mock("./fanout", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("./fanout");
  return { ...actual, resolveFanoutInstitutions: vi.fn(), resolveFanoutCourses: vi.fn() };
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
    loadCourseMaterials: vi.fn(async () => null),
  };
}

function lookupOf(defs: Record<string, StepDefinition>) {
  return (type: string) => defs[type];
}

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
    type InstGroup = { institution: string };
    expect(result.groups?.map((g) => (g as InstGroup).institution)).toEqual(["AAA", "BBB"]);
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

describe("runWorkflowUnattended course fan-out", () => {
  const probeDefs: Record<string, StepDefinition> = {
    probe: {
      type: "probe",
      name: "Probe",
      description: "",
      inputs: [{ key: "course", label: "Course", type: "hubCourse", required: false }],
      outputs: [],
      run: async () => ({ outputs: {}, summary: { kind: "text", text: "ran" } }),
    },
  };
  const fanoutDef: WorkflowDef = {
    id: "co",
    name: "Course FO",
    description: "",
    scope: { hubCourse: "*" },
    steps: [{ type: "probe", bindings: { course: { source: "runtime", fieldKey: "course" } } }],
  };

  it("runs the body once per resolved course, pinning the scope", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "t1", name: "Course A", institution: null },
        { id: "t2", name: "Course B", institution: null },
      ],
    });
    const seen: Array<{ course: unknown }> = [];
    const defs: Record<string, StepDefinition> = {
      probe: {
        ...probeDefs.probe,
        run: async (values) => {
          seen.push({ course: values.course });
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
    expect(seen).toEqual([{ course: "t1" }, { course: "t2" }]);
    type CourseGroup = { courseId: string };
    expect((result.groups ?? []).map((g) => (g as CourseGroup).courseId)).toEqual(["t1", "t2"]);
    expect(result.steps.map((s) => s.courseId)).toEqual(["t1", "t2"]);
  });

  it("errors when no course tiles are resolved", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({ list: [] });
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("no course tiles");
  });

  it("surfaces a resolution error", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({ error: "crash" });
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("Could not list course tiles: crash");
  });

  it("skips courses past the deadline and reports the remainder", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "t1", name: "A", institution: null },
        { id: "t2", name: "B", institution: null },
      ],
    });
    const ran: string[] = [];
    const onCourseDone = vi.fn(async () => true);
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf({
        probe: {
          ...probeDefs.probe,
          run: async () => {
            ran.push("x");
            return { outputs: {}, summary: { kind: "text", text: "" } };
          },
        },
      }),
      deadlineMs: 0,
      onCourseDone,
    });
    expect(ran).toEqual([]);
    expect(onCourseDone).not.toHaveBeenCalled();
    expect(result.fanout?.truncated).toBe(true);
    expect(result.fanout?.remaining).toEqual(["t1", "t2"]);
  });

  it("does not fan out when the course scope is concrete", async () => {
    vi.mocked(resolveFanoutCourses).mockClear();
    const result = await runWorkflowUnattended({
      def: { ...fanoutDef, scope: { hubCourse: "single" } },
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(true);
    expect(result.groups).toBeUndefined();
    expect(resolveFanoutCourses).not.toHaveBeenCalled();
  });

  it("returns ok:false (never throws) when zero course tiles resolve AND saveRunReport is set", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({ list: [] });
    const saveRunReport = vi.fn(async () => {});
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: { ...fakeHelpers(), saveRunReport },
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("no course tiles");
  });

  it("returns ok:false (never throws) when course enumeration errors AND saveRunReport is set", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({ error: "crash" });
    const saveRunReport = vi.fn(async () => {});
    const result = await runWorkflowUnattended({
      def: fanoutDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: { ...fakeHelpers(), saveRunReport },
      stepLookup: lookupOf(probeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("Could not list course tiles: crash");
  });
});

describe("runWorkflowUnattended composed fan-out (institution * + course multiplicity)", () => {
  // Replaces the old "rejects both institution and course fan-out together"
  // guard test (formerly server-runner.test.ts:965-976): the guard is gone,
  // replaced by composed execution - see server-runner.ts's composed branch.
  const composedProbeDefs: Record<string, StepDefinition> = {
    probe: {
      type: "probe",
      name: "Probe",
      description: "",
      inputs: [
        { key: "inst", label: "Institution", type: "institution", required: false },
        { key: "course", label: "Course", type: "hubCourse", required: false },
      ],
      outputs: [],
      run: async () => ({ outputs: {}, summary: { kind: "text", text: "ran" } }),
    },
  };
  const composedDef: WorkflowDef = {
    id: "cfo",
    name: "Composed FO",
    description: "",
    scope: { institution: "*", hubCourse: "*" },
    steps: [
      {
        type: "probe",
        bindings: {
          inst: { source: "runtime", fieldKey: "inst" },
          course: { source: "runtime", fieldKey: "course" },
        },
      },
    ],
  };

  it("runs one group per course, pinning each group's scope to that course's own institution", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "t1", name: "Course A", institution: "AAA" },
        { id: "t2", name: "Course B", institution: "BBB" },
      ],
    });
    const seen: Array<{ active: string | null; inst: unknown; course: unknown }> = [];
    const defs: Record<string, StepDefinition> = {
      probe: {
        ...composedProbeDefs.probe,
        run: async (values, helpers) => {
          seen.push({ active: helpers.activeInstitution, inst: values.inst, course: values.course });
          return { outputs: {}, summary: { kind: "text", text: "ran" } };
        },
      },
    };
    const result = await runWorkflowUnattended({
      def: composedDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });
    expect(result.ok).toBe(true);
    // A composed fan-out enumerates courses across EVERY institution - it
    // calls resolveFanoutCourses with a null activeInstitution, never
    // filtering "*" down to a single one.
    expect(resolveFanoutCourses).toHaveBeenCalledWith(composedDef.scope, null);
    // Both the active-institution helper AND the scoped "institution" input
    // resolve to the OWNING course's institution per group - never a nested
    // institution x course product.
    expect(seen).toEqual([
      { active: "AAA", inst: "AAA", course: "t1" },
      { active: "BBB", inst: "BBB", course: "t2" },
    ]);
    type ComposedGroup = { courseId: string; institution?: string };
    expect((result.groups ?? []).map((g) => (g as ComposedGroup).courseId)).toEqual(["t1", "t2"]);
    expect((result.groups ?? []).map((g) => (g as ComposedGroup).institution)).toEqual(["AAA", "BBB"]);
  });

  it("pins an institution-less course to institution '' (unset), and the group notes it", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [{ id: "t1", name: "Course A", institution: null }],
    });
    const seen: Array<{ active: string | null; inst: unknown }> = [];
    const defs: Record<string, StepDefinition> = {
      probe: {
        ...composedProbeDefs.probe,
        run: async (values, helpers) => {
          seen.push({ active: helpers.activeInstitution, inst: values.inst });
          return { outputs: {}, summary: { kind: "text", text: "ran" } };
        },
      },
    };
    const result = await runWorkflowUnattended({
      def: composedDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });
    expect(result.ok).toBe(true);
    // Unset, not "*" left over, and not silently inheriting a global default.
    expect(seen).toEqual([{ active: null, inst: "" }]);
    type ComposedGroup = { institution?: string };
    expect((result.groups ?? []).map((g) => (g as ComposedGroup).institution)).toEqual([""]);
  });

  it("composes the same way for a multi-line hubCourse list combined with institution *", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "t1", name: "Course A", institution: "AAA" },
        { id: "t2", name: "Course B", institution: "BBB" },
      ],
    });
    const defWithList: WorkflowDef = { ...composedDef, scope: { institution: "*", hubCourse: "t1\nt2" } };
    const seen: Array<{ active: string | null }> = [];
    const defs: Record<string, StepDefinition> = {
      probe: {
        ...composedProbeDefs.probe,
        run: async (_values, helpers) => {
          seen.push({ active: helpers.activeInstitution });
          return { outputs: {}, summary: { kind: "text", text: "ran" } };
        },
      },
    };
    const result = await runWorkflowUnattended({
      def: defWithList,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(defs),
    });
    expect(result.ok).toBe(true);
    expect(seen).toEqual([{ active: "AAA" }, { active: "BBB" }]);
  });

  it("errors when no course tiles resolve", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({ list: [] });
    const result = await runWorkflowUnattended({
      def: composedDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(composedProbeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("no course tiles");
  });

  it("surfaces a resolution error", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({ error: "crash" });
    const result = await runWorkflowUnattended({
      def: composedDef,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(composedProbeDefs),
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0].error).toContain("Could not list course tiles: crash");
  });
});

describe("runWorkflowUnattended composed fan-out checkpointing", () => {
  const def: WorkflowDef = {
    id: "cfo",
    name: "Composed FO",
    description: "",
    scope: { institution: "*", hubCourse: "*" },
    steps: [{ type: "probe", bindings: {} }],
  };
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

  it("skips already-done course groups on resume (doneCourses checkpointing, shared with plain course fan-out)", async () => {
    vi.mocked(resolveFanoutCourses).mockResolvedValue({
      list: [
        { id: "t1", name: "Course A", institution: "AAA" },
        { id: "t2", name: "Course B", institution: "BBB" },
        { id: "t3", name: "Course C", institution: "CCC" },
      ],
    });
    const ran: string[] = [];
    const done: string[] = [];
    const onCourseDone = vi.fn(async (tileId: string) => {
      done.push(tileId);
      return true;
    });
    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: fakeHelpers(),
      stepLookup: lookupOf(makeRecordingDefs(ran)),
      skipCourses: new Set(["t1"]),
      onCourseDone,
    });
    expect(ran).toEqual(["BBB", "CCC"]);
    expect(done).toEqual(["t2", "t3"]);
    expect(result.fanout).toEqual({ total: 3, ranThisTick: ["t2", "t3"], remaining: [], truncated: false });
  });
});
