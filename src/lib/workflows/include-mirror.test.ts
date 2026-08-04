import { describe, it, expect } from "vitest";
import { COURSE_REFRESH } from "./presets";
import {
  danglingOutputs,
  toggleSkipStep,
  setRemapEntry,
  sourceStepLabel,
  remapEntryKey,
} from "./include-mirror";
import { getStepDefinition } from "./registry";
import type { WorkflowStepConfig } from "./types";

describe("include-mirror", () => {
  describe("sourceStepLabel", () => {
    it("returns the step definition name for regular steps", () => {
      const step = { type: "load-course-tile", bindings: {} };
      const label = sourceStepLabel(step, 0, [], getStepDefinition);
      expect(label).toBe("Load course tile");
    });

    it("returns 'Include workflow: <name>' for include-type steps", () => {
      const step = {
        type: "include-workflow",
        bindings: {},
        include: {
          workflowId: "course-refresh",
          skipSteps: [],
          remap: {},
        },
      };
      const label = sourceStepLabel(step, 0, [COURSE_REFRESH], getStepDefinition);
      expect(label).toBe("Include workflow: Course Refresh");
    });

    it("falls back to type string for unknown types", () => {
      const step = { type: "unknown-type", bindings: {} };
      const label = sourceStepLabel(step, 0, [], getStepDefinition);
      expect(label).toBe("unknown-type");
    });
  });

  describe("danglingOutputs", () => {
    it("returns empty array when all steps are mirrored (skipSteps is empty)", () => {
      const dangling = danglingOutputs(COURSE_REFRESH.steps, [], getStepDefinition);
      expect(dangling).toEqual([]);
    });

    it("detects dangling outputs when steps 0,1 are skipped from COURSE_REFRESH", () => {
      const dangling = danglingOutputs(COURSE_REFRESH.steps, [0, 1], getStepDefinition);
      const keys = dangling.map((d) => d.key).sort();

      // COURSE_REFRESH has steps 2-13 kept when skipping 0,1:
      // Step 2 (save-csv-to-course) refs: 1.schedule, 1.courseTitle
      // Step 3 (lecture-zip) refs: 0.repo, 1.schedule
      // Step 5 (lms-wipe) refs: 0.course
      // Step 6 (lms-rubric) refs: 0.course, 0.repo, 0.description, 1.title (courseTitle), 1.schedule
      // Step 7 (lms-modules) refs: 0.course, 1.weeks
      // Step 8 (lms-populate) refs: 0.course
      // Step 9 (lms-assignments) refs: 0.course, 1.schedule, 0.repo, 0.startDate
      // Step 10 (blackboard-export) refs: 1.schedule, 0.startDate
      // Step 11 (generate-class-openers) refs: 1.schedule
      // Step 12 (include-workflow) refs: 0.course via bindOverrides
      expect(keys).toEqual([
        "0.course",
        "0.description",
        "0.repo",
        "0.startDate",
        "1.courseTitle",
        "1.schedule",
        "1.weeks",
      ]);
    });

    it("includes 3.files when step 3 is also skipped", () => {
      const dangling = danglingOutputs(COURSE_REFRESH.steps, [0, 1, 3], getStepDefinition);
      const keys = dangling.map((d) => d.key).sort();
      // When also skipping step 3 (lecture-zip), step 4 (generate-class-
      // openers) references 3.files, which becomes dangling. This is
      // unaffected by docs/REGRESSION.md 155 moving save-zip-to-course to
      // the end of course-refresh: save-zip-to-course reads step 6's
      // (generate-test-from-template) accumulated output, never step 3's
      // directly, in either the old or the new step order. All previous
      // dangling outputs still exist.
      expect(keys).toEqual([
        "0.course",
        "0.description",
        "0.repo",
        "0.startDate",
        "1.courseTitle",
        "1.schedule",
        "1.weeks",
        "3.files",
      ]);
    });

    it("deduplicates dangling outputs by key", () => {
      // 0.course is referenced by multiple kept steps (5, 6, 7, 8, 9, 12)
      // but should appear only once in the result
      const dangling = danglingOutputs(COURSE_REFRESH.steps, [0, 1], getStepDefinition);
      const courseRefs = dangling.filter((d) => d.key === "0.course");
      expect(courseRefs).toHaveLength(1);
    });

    it("includes output type and label from step definition", () => {
      const dangling = danglingOutputs(COURSE_REFRESH.steps, [0, 1], getStepDefinition);
      const courseRef = dangling.find((d) => d.key === "0.course");
      expect(courseRef).toBeDefined();
      expect(courseRef!.outputType).toBeTruthy();
      expect(courseRef!.outputLabel).toBeTruthy();
    });

    it("detects dangling outputs referenced only by runIf bindings", () => {
      // Create a fixture with a runIf reference to a skipped step
      const steps: WorkflowStepConfig[] = [
        {
          type: "load-course-tile",
          bindings: {},
        },
        {
          type: "save-csv-to-course",
          bindings: { hubCourse: { source: "runtime", fieldKey: "hubCourse" } },
          // This step has a runIf that references a boolean output from step 0
          runIf: {
            binding: { source: "step", stepIndex: 0, outputKey: "success" },
            expected: true,
          },
        },
      ];

      // Skip step 0, so the runIf reference in step 1 becomes dangling
      const dangling = danglingOutputs(steps, [0], getStepDefinition);
      const keys = dangling.map((d) => d.key);

      // The output from step 0 that is referenced by step 1's runIf should be dangling
      expect(keys).toContain("0.success");
      expect(dangling.find((d) => d.key === "0.success")?.referencedBy).toBe(
        "Step 2 runIf"
      );
    });

    // CHUNK E-a2: a "step" binding within sourceSteps may name its source by
    // id instead of position (once presets carry ids). danglingOutputs must
    // resolve that reference against sourceSteps' OWN id namespace, the same
    // way it already resolves a plain stepIndex.
    it("resolves a stepId binding against sourceSteps and marks it dangling when its target is skipped", () => {
      const steps: WorkflowStepConfig[] = [
        { id: "tile", type: "load-course-tile", bindings: {} },
        {
          type: "save-csv-to-course",
          bindings: {
            hubCourse: { source: "runtime", fieldKey: "hubCourse" },
            course: { source: "step", stepId: "tile", outputKey: "course" },
          },
        },
      ];
      const dangling = danglingOutputs(steps, [0], getStepDefinition);
      const courseRef = dangling.find((d) => d.key === "0.course");
      expect(courseRef, "0.course is dangling").toBeTruthy();
      // The skipped step carries an id, so the entry also records the
      // alternate remap key a preset could already have written it under.
      expect(courseRef!.idKey).toBe("tile.course");
    });

    it("does not report a stepId binding as dangling when its target is kept (not skipped)", () => {
      const steps: WorkflowStepConfig[] = [
        { id: "tile", type: "load-course-tile", bindings: {} },
        {
          type: "save-csv-to-course",
          bindings: {
            hubCourse: { source: "runtime", fieldKey: "hubCourse" },
            course: { source: "step", stepId: "tile", outputKey: "course" },
          },
        },
      ];
      expect(danglingOutputs(steps, [], getStepDefinition)).toEqual([]);
    });

    it("resolves a stepId runIf binding the same way a stepIndex runIf binding is resolved", () => {
      const steps: WorkflowStepConfig[] = [
        { id: "tile", type: "load-course-tile", bindings: {} },
        {
          type: "save-csv-to-course",
          bindings: { hubCourse: { source: "runtime", fieldKey: "hubCourse" } },
          runIf: { binding: { source: "step", stepId: "tile", outputKey: "success" }, expected: true },
        },
      ];
      const dangling = danglingOutputs(steps, [0], getStepDefinition);
      expect(dangling.map((d) => d.key)).toContain("0.success");
      const entry = dangling.find((d) => d.key === "0.success");
      expect(entry?.referencedBy).toBe("Step 2 runIf");
      expect(entry?.idKey).toBe("tile.success");
    });

    it("leaves idKey undefined for a skipped step that carries no id", () => {
      // CHUNK E-b gave every shipped preset's steps an id, so COURSE_REFRESH
      // itself no longer exercises the "no id" branch here - a synthetic
      // fixture (matching the pattern the adjacent stepId tests already use)
      // keeps this test's original intent (a step with no id yields no
      // idKey) independent of that migration.
      const steps: WorkflowStepConfig[] = [
        { type: "load-course-tile", bindings: {} },
        {
          type: "save-csv-to-course",
          bindings: {
            hubCourse: { source: "runtime", fieldKey: "hubCourse" },
            course: { source: "step", stepIndex: 0, outputKey: "course" },
          },
        },
      ];
      const dangling = danglingOutputs(steps, [0], getStepDefinition);
      const courseRef = dangling.find((d) => d.key === "0.course");
      expect(courseRef, "0.course is dangling").toBeTruthy();
      expect(courseRef!.idKey).toBeUndefined();
    });
  });

  describe("toggleSkipStep", () => {
    it("adds a step to skipSteps when unchecking (keep=false)", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [],
        remap: {},
      };
      const next = toggleSkipStep(include, 2, false);
      expect(next.skipSteps).toEqual([2]);
    });

    it("removes a step from skipSteps when checking (keep=true)", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [2],
        remap: {},
      };
      const next = toggleSkipStep(include, 2, true);
      expect(next.skipSteps).toEqual([]);
    });

    it("keeps skipSteps sorted after adding", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [1, 5],
        remap: {},
      };
      const next = toggleSkipStep(include, 3, false);
      expect(next.skipSteps).toEqual([1, 3, 5]);
    });

    it("prunes stale remap entries when re-checking (keep=true)", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [2],
        remap: {
          "2.files": { source: "runtime", fieldKey: "files" },
          "2.schedule": { source: "literal", value: "test" },
          "3.files": { source: "literal", value: "" },
        },
      };
      const next = toggleSkipStep(include, 2, true);
      expect(next.skipSteps).toEqual([]);
      expect(next.remap).toEqual({
        "3.files": { source: "literal", value: "" },
      });
    });

    it("does not modify remap when unchecking", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [],
        remap: {
          "2.files": { source: "runtime", fieldKey: "files" },
        },
      };
      const next = toggleSkipStep(include, 2, false);
      expect(next.remap).toEqual(include.remap);
    });

    // CHUNK E-a2: a remap entry for a skipped step can live under either its
    // numeric key or, once the source step carries an id, its id-prefixed
    // key (see remapEntryKey). Re-checking the box must prune both, or the
    // id-keyed one survives forever.
    it("prunes id-keyed remap entries too when the source step's id is provided", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [2],
        remap: {
          "tile.files": { source: "runtime", fieldKey: "files" },
          "2.schedule": { source: "literal", value: "test" },
          "3.files": { source: "literal", value: "" },
        },
      };
      const next = toggleSkipStep(include, 2, true, "tile");
      expect(next.skipSteps).toEqual([]);
      expect(next.remap).toEqual({
        "3.files": { source: "literal", value: "" },
      });
    });

    it("does not prune an id-keyed remap entry when no source step id is given (backward compatible)", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [2],
        remap: {
          "tile.files": { source: "runtime", fieldKey: "files" },
        },
      };
      const next = toggleSkipStep(include, 2, true);
      expect(next.remap).toEqual(include.remap);
    });
  });

  describe("remapEntryKey", () => {
    it("returns the numeric key when no id-keyed entry exists yet", () => {
      const dangling = { key: "0.course", idKey: "tile.course" };
      expect(remapEntryKey({}, dangling)).toBe("0.course");
      expect(
        remapEntryKey({ "0.course": { source: "runtime", fieldKey: "course" } }, dangling)
      ).toBe("0.course");
    });

    it("returns the id-keyed form when a remap entry already lives there", () => {
      const dangling = { key: "0.course", idKey: "tile.course" };
      const remap = { "tile.course": { source: "literal", value: "x" } as const };
      expect(remapEntryKey(remap, dangling)).toBe("tile.course");
    });

    it("falls back to the numeric key when the dropped step has no id", () => {
      const dangling = { key: "0.course", idKey: undefined };
      expect(remapEntryKey({}, dangling)).toBe("0.course");
    });
  });

  describe("setRemapEntry", () => {
    it("adds a remap entry when binding is provided", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [0],
        remap: {},
      };
      const binding = { source: "runtime", fieldKey: "course" } as const;
      const next = setRemapEntry(include, "0.course", binding);
      expect(next.remap["0.course"]).toEqual(binding);
    });

    it("removes a remap entry when binding is null", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [0],
        remap: {
          "0.course": { source: "runtime", fieldKey: "course" },
        },
      };
      const next = setRemapEntry(include, "0.course", null);
      expect(next.remap["0.course"]).toBeUndefined();
    });

    it("preserves other remap entries when adding", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [0, 1],
        remap: {
          "1.schedule": { source: "runtime", fieldKey: "schedule" },
        },
      };
      const binding = { source: "runtime", fieldKey: "course" } as const;
      const next = setRemapEntry(include, "0.course", binding);
      expect(next.remap["1.schedule"]).toEqual(include.remap["1.schedule"]);
      expect(next.remap["0.course"]).toEqual(binding);
    });

    it("preserves other remap entries when removing", () => {
      const include: NonNullable<WorkflowStepConfig["include"]> = {
        workflowId: "course-refresh",
        skipSteps: [0, 1],
        remap: {
          "0.course": { source: "runtime", fieldKey: "course" },
          "1.schedule": { source: "runtime", fieldKey: "schedule" },
        },
      };
      const next = setRemapEntry(include, "0.course", null);
      expect(next.remap["1.schedule"]).toEqual(include.remap["1.schedule"]);
      expect(next.remap["0.course"]).toBeUndefined();
    });
  });
});
