// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers the step's
// registration contract: the input/output shape declared on the step object
// itself, and the top-level "no source chosen" failure, none of which are
// tied to any one schedule source. Every per-source behavior (codebase,
// course-description, course-cartridge, syllabus-document,
// existing-lms-course, tile-export, tile-repo) has its own sibling test
// file; this one is what is left once those are pulled out.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  generateSchedulePlanAction: vi.fn(),
  generateSchedulePlanFromRepoAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  extractSyllabusTextAction: vi.fn(),
}));

vi.mock("@/lib/cartridge-import", () => ({
  parseCartridgeBlob: vi.fn(),
}));

import { step, testHelpers } from "./steps.course-schedule-from-source.fixtures";

describe("course-schedule-from-source step - contract (registration, output declaration, invalid source)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

    it("is registered with a source select and every visibleWhen-gated per-source input required", () => {
      expect(step, "course-schedule-from-source is registered").toBeTruthy();
      const inputByKey = new Map(step.inputs.map((i) => [i.key, i]));

      expect(inputByKey.get("source")).toMatchObject({
        type: "text",
        required: true,
        options: [
          "codebase",
          "course-description",
          "course-cartridge",
          "syllabus-document",
          "existing-lms-course",
          "tile-export",
          "tile-repo",
        ],
      });
      // B1 (run-form cleanup): the run form renders these labels, not the
      // raw kebab-case option strings above.
      expect(inputByKey.get("source")?.optionLabels).toMatchObject({
        codebase: expect.any(String),
        "course-description": expect.any(String),
        "course-cartridge": expect.any(String),
        "syllabus-document": expect.any(String),
        "existing-lms-course": expect.any(String),
        "tile-export": expect.any(String),
        "tile-repo": expect.any(String),
      });
      // AC5: the seventh source (the tile's own linked repository) needs no
      // input of its own - it reuses the existing "hubCourse" input every
      // other source can already fall back to. Pinning the exact key set here
      // means an accidental new input (e.g. a stray "tileRepo" field) fails
      // this test immediately rather than silently growing the run form.
      expect(step.inputs.map((i) => i.key)).toEqual([
        "source",
        "repo",
        "description",
        "cartridge",
        "syllabus",
        "lmsCourse",
        "weeks",
        "tests",
        "context",
        "sourceMaterial",
        "hubCourse",
      ]);
      // B3 (run-form cleanup): each per-source input gated by `visibleWhen`
      // is now required - it can only ever block Run while its OWN source is
      // selected (isFieldVisible/validate-run-form.ts skip a hidden required
      // field), so this is never a dead required question for the other six
      // sources. "description" carries no visibleWhen at all (course-build
      // never binds it to a runtime field - see this step's own header
      // comment), so it is unaffected and stays optional.
      expect(inputByKey.get("repo")).toMatchObject({ type: "repo", required: true });
      expect(inputByKey.get("description")).toMatchObject({ type: "longtext", required: false });
      expect(inputByKey.get("cartridge")).toMatchObject({
        type: "uploads",
        required: true,
        accept: ".imscc",
      });
      expect(inputByKey.get("syllabus")).toMatchObject({ type: "uploads", required: true });
      expect(inputByKey.get("lmsCourse")).toMatchObject({ type: "lmsCourse", required: true });
      expect(inputByKey.get("weeks")).toMatchObject({ type: "number", required: false });
      expect(inputByKey.get("tests")).toMatchObject({ type: "number", required: false });
      expect(inputByKey.get("context")).toMatchObject({ type: "longtext", required: false });
      expect(inputByKey.get("sourceMaterial")).toMatchObject({ type: "longtext", required: false });
      expect(inputByKey.get("hubCourse")).toMatchObject({ type: "hubCourse", required: false });
    });

    it("declares the three schedule-from-repo outputs, plus resolvedSourceMaterial, courseKind, repo, and isCodebase", () => {
      expect(step.outputs.map((o) => [o.key, o.type])).toEqual([
        ["schedule", "schedule"],
        ["courseTitle", "text"],
        ["weeks", "number"],
        ["resolvedSourceMaterial", "longtext"],
        ["courseKind", "text"],
        ["repo", "repo"],
        ["isCodebase", "boolean"],
      ]);
    });

    it("fails with a clear message when no (or an unrecognized) source is chosen", async () => {
      await expect(step.run({ source: "" }, testHelpers(), () => {})).rejects.toThrow(
        /Choose a course structure source/
      );
      await expect(step.run({ source: "smoke-signal" }, testHelpers(), () => {})).rejects.toThrow(
        /Choose a course structure source/
      );
    });
});
