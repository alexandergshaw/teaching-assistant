// Deliverable resilience for COURSE_BUILD (and, through its include, the
// COURSE_REFRESH chain it expands into).
//
// WHY THIS FILE EXISTS
// Real unattended run 90415cd8: "course-schedule-from-source" failed and 47 of
// the run's 49 errors were "Skipped - depends on step N" cascades; 0 of 3
// courses produced anything. The root cause of the BREADTH (not of that
// particular run, whose root failure was legitimately fatal) is that the
// "files" accumulator is a strict chain - each generator binds the
// IMMEDIATELY PREVIOUS generator's "files" output, and BOTH terminals (the
// Common Cartridge export and the course zip) read the tail of that chain. One
// mid-chain generator failing therefore costs every later generator AND both
// terminals, i.e. the entire run's output.
//
// These tests state the TARGET behavior:
//   - a mid-chain generator failing costs only that generator: both terminals
//     still run and still receive everything the other generators produced;
//   - the failed generator is still REPORTED (status "error", run not ok) -
//     resilience must never become silence;
//   - the SCHEDULE step failing is still fatal - with no schedule there is
//     nothing to generate, so that one cascade is correct;
//   - deselecting an output family (COURSE_BUILD's own output selector) keeps
//     behaving exactly as it does today.
//
// HOW IT TESTS
// The REAL presets are expanded and executed by the REAL unattended runner;
// only the step CATALOG is faked, via runWorkflowUnattended's stepLookup
// override. Each fake step keeps the real step's declared inputs/outputs (so
// every binding in the real presets resolves exactly as it does in production)
// and replaces only `run`. No LLM, no network, no Supabase. A step that
// declares a "files" output and a "files" input is treated as a chain
// generator: it appends one file named after itself and passes everything it
// received through - which is what the real generators do. A step that
// declares a "files" input and no "files" output is a consumer (the cartridge
// export, the zip) and records what it was handed, which is the observable
// behavior these tests assert on.

import { describe, it, expect, vi } from "vitest";
import { runWorkflowUnattended, type StepRunOutcome } from "./server-runner";
import { getStepDefinition, type StepDefinition, type StepRunHelpers } from "./registry";
import { isGeneratorSelected } from "./registry-helpers";
import { COURSE_BUILD } from "./presets/course-build";
import { COURSE_REFRESH } from "./presets/course-setup";
import { STARTER_MATERIALS } from "./presets/course-setup-tools";
import type { WorkflowDef } from "./types";

const CARTRIDGE = "blackboard-export";
const ZIP = "save-zip-to-course";
const SCHEDULE_STEP = "course-schedule-from-source";

/** Every step type that contributes a file to the accumulator in an
 * unnarrowed COURSE_BUILD run, in chain order. Derived from the real presets
 * (see the expansion): the head plus eight generators. */
const CHAIN_GENERATORS = [
  "lecture-materials-from-schedule",
  "generate-assignment-from-template",
  "generate-test-from-template",
  "generate-course-guides",
  "generate-weekly-announcements",
  "generate-knowledge-checks",
  "generate-weekly-significance",
  "generate-instructor-notes",
  "fetch-deliverable-images",
];

const fileNameFor = (type: string) => `${type}.docx`;

interface FakeFile {
  name: string;
}

interface Harness {
  /** Step types whose run() throws, simulating a real generator failure. */
  fail: Set<string>;
  /** select-course-outputs boolean output keys forced OFF for this run. */
  deselect: Set<string>;
  /** Step type -> the file names its "files" input was handed. */
  received: Map<string, string[]>;
  /** Step types whose run() actually executed, in order. */
  ran: string[];
}

function harness(opts: { fail?: string[]; deselect?: string[] } = {}): Harness {
  return {
    fail: new Set(opts.fail ?? []),
    deselect: new Set(opts.deselect ?? []),
    received: new Map(),
    ran: [],
  };
}

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

const resolveWorkflow = (id: string): WorkflowDef | undefined => {
  if (id === "course-refresh") return COURSE_REFRESH;
  if (id === "starter-materials") return STARTER_MATERIALS;
  return undefined;
};

/** A fake catalog that keeps every real step's declared input/output specs
 * (so the real presets' bindings resolve unchanged) and replaces only run(). */
function fakeCatalog(h: Harness): (type: string) => StepDefinition | undefined {
  return (type: string) => {
    const real = getStepDefinition(type);
    if (!real) return undefined;
    const takesFiles = real.inputs.some((i) => i.key === "files");
    const emitsFiles = real.outputs.some((o) => o.key === "files");
    const takesSelected = real.inputs.some((i) => i.key === "selected");

    return {
      ...real,
      run: async (values) => {
        h.ran.push(type);
        if (h.fail.has(type)) {
          throw new Error(`Simulated failure in "${type}".`);
        }

        const incoming: FakeFile[] = Array.isArray(values.files) ? (values.files as FakeFile[]) : [];
        if (takesFiles) {
          h.received.set(type, incoming.map((f) => f.name));
        }

        const outputs: Record<string, unknown> = {};
        for (const spec of real.outputs) {
          if (spec.key === "files") continue;
          if (type === "select-course-outputs") {
            outputs[spec.key] = h.deselect.has(spec.key) ? "" : "1";
          } else if (spec.type === "files") {
            outputs[spec.key] = [];
          } else {
            outputs[spec.key] = "";
          }
        }

        if (emitsFiles) {
          // Mirrors the real generators' contract: a deselected generator does
          // no work and passes its "files" through unchanged (registry-
          // helpers.ts's isGeneratorSelected, which treats an unbound value as
          // "generate").
          const selected = isGeneratorSelected(takesSelected ? values.selected : undefined);
          outputs.files = selected ? [...incoming, { name: fileNameFor(type) }] : incoming;
        }

        return { outputs, summary: { kind: "text", text: "" } };
      },
    };
  };
}

async function runCourseBuild(h: Harness) {
  return runWorkflowUnattended({
    def: COURSE_BUILD,
    resolveWorkflow,
    fieldValues: {},
    disabledTopIndices: new Set<number>(),
    helpers: fakeHelpers(),
    stepLookup: fakeCatalog(h),
  });
}

const statusOf = (steps: StepRunOutcome[], type: string) => steps.find((s) => s.type === type)?.status;
const errorsIn = (steps: StepRunOutcome[]) => steps.filter((s) => s.status === "error");

describe("COURSE_BUILD deliverable resilience", () => {
  it("still produces the cartridge and the zip when a mid-chain generator fails", async () => {
    const h = harness({ fail: ["generate-knowledge-checks"] });
    const result = await runCourseBuild(h);

    expect(statusOf(result.steps, CARTRIDGE)).toBe("done");
    expect(statusOf(result.steps, ZIP)).toBe("done");
  });

  it("hands the cartridge and the zip everything the surviving generators produced", async () => {
    const h = harness({ fail: ["generate-knowledge-checks"] });
    await runCourseBuild(h);

    const survivors = CHAIN_GENERATORS.filter((t) => t !== "generate-knowledge-checks").map(fileNameFor);

    for (const terminal of [CARTRIDGE, ZIP]) {
      const got = h.received.get(terminal);
      expect(got, `${terminal} never received a files input`).toBeDefined();
      expect(got).toEqual(expect.arrayContaining(survivors));
      // The one generator that actually failed contributes nothing - its
      // absence is the honest outcome, not a silent hole in the others.
      expect(got).not.toContain(fileNameFor("generate-knowledge-checks"));
    }
  });

  it("reports the failed generator and fails the run, without cascading", async () => {
    const h = harness({ fail: ["generate-knowledge-checks"] });
    const result = await runCourseBuild(h);

    const failed = errorsIn(result.steps);
    // Exactly one error - the step that really failed. Today this is six:
    // the generator plus a "Skipped - depends on step N" cascade through
    // significance, instructor notes, images, the cartridge, and the zip.
    expect(failed.map((s) => s.type)).toEqual(["generate-knowledge-checks"]);
    expect(failed[0]?.error).toContain("generate-knowledge-checks");
    // Resilience must never become silence: the run is still not ok.
    expect(result.ok).toBe(false);
  });

  it("keeps the schedule step fatal - no schedule means nothing to generate", async () => {
    const h = harness({ fail: [SCHEDULE_STEP] });
    const result = await runCourseBuild(h);

    expect(statusOf(result.steps, SCHEDULE_STEP)).toBe("error");
    expect(statusOf(result.steps, CARTRIDGE)).toBe("error");
    expect(statusOf(result.steps, ZIP)).toBe("error");
    expect(result.ok).toBe(false);
    expect(h.received.has(ZIP)).toBe(false);
  });

  it("keeps output deselection working: a deselected generator passes through and everything else ships", async () => {
    const h = harness({ deselect: ["selectedKnowledgeChecks"] });
    const result = await runCourseBuild(h);

    // Deselection is not failure: the step still runs, still reports done.
    expect(statusOf(result.steps, "generate-knowledge-checks")).toBe("done");
    expect(statusOf(result.steps, CARTRIDGE)).toBe("done");
    expect(statusOf(result.steps, ZIP)).toBe("done");
    expect(result.ok).toBe(true);

    const survivors = CHAIN_GENERATORS.filter((t) => t !== "generate-knowledge-checks").map(fileNameFor);
    const got = h.received.get(ZIP);
    expect(got).toEqual(expect.arrayContaining(survivors));
    expect(got).not.toContain(fileNameFor("generate-knowledge-checks"));
  });

  it("still produces the cartridge and the zip when the LMS module list fails, and actually EXECUTES the three per-week generators that used to depend on it (not merely passes them through)", async () => {
    // Second cascade axis, not in the original report: lms-modules used to
    // feed "modules" to the knowledge-check, significance, and
    // instructor-note generators, all of which sit IN the files chain. An
    // LMS outage therefore cost the local deliverables too. Those three
    // steps now depend only on schedule-from-repo (step 1), not on
    // lms-modules (see presets/course-setup.ts's COURSE_REFRESH bindings
    // for generate-knowledge-checks/generate-weekly-significance/
    // generate-instructor-notes), so an lms-modules failure must no longer
    // cascade into them - they must actually RUN and contribute their own
    // file to the chain, not just be skipped with the incoming files passed
    // through unchanged (which would satisfy a weaker assertion that only
    // checks the zip's contents via arrayContaining without checking which
    // steps ran).
    const h = harness({ fail: ["lms-modules"] });
    const result = await runCourseBuild(h);

    expect(statusOf(result.steps, CARTRIDGE)).toBe("done");
    expect(statusOf(result.steps, ZIP)).toBe("done");

    for (const type of ["generate-knowledge-checks", "generate-weekly-significance", "generate-instructor-notes"]) {
      expect(h.ran, `${type} must actually execute when lms-modules fails`).toContain(type);
    }

    const got = h.received.get(ZIP);
    expect(got).toEqual(
      expect.arrayContaining([
        fileNameFor("lecture-materials-from-schedule"),
        fileNameFor("generate-course-guides"),
        fileNameFor("generate-weekly-announcements"),
        fileNameFor("generate-knowledge-checks"),
        fileNameFor("generate-weekly-significance"),
        fileNameFor("generate-instructor-notes"),
        fileNameFor("fetch-deliverable-images"),
      ])
    );
  });
});
