// Regression coverage for save-zip-to-course's terminal-bundle behavior
// (docs/REGRESSION.md 155): the step now merges the per-week "files" chain
// with an optional rubricFiles input and a CSV built from an optional
// schedule input into ONE zip, organized into "Week NN/" and "Course-Wide/"
// folders with collision-safe paths, and downloads it in an attended run
// (guarded by `typeof document`) in addition to the pre-existing course-tile
// save. See steps.course-setup.storage.ts's save-zip-to-course for the
// implementation this exercises.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/app/actions", () => ({
  setCourseCsvAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  // U8: the run-log fetches save-zip-to-course now makes when
  // helpers.workflowRunId is set (steps.course-setup.storage.test.ts's own
  // "U8" describe block below configures these per test; every OTHER test
  // in this file never sets workflowRunId, so the step's own `if
  // (!helpers.workflowRunId)` guard means these are declared but never
  // actually called there).
  getAutomationRunLogAction: vi.fn(),
  getNotYetRunStepTypesAction: vi.fn(),
  // Only reached by generate-course-guides (imported below for the RCA19
  // cross-step test) on a path this suite never exercises - the degraded
  // "tile not found" early return happens before any of these would be
  // called - but the mock factory still has to name them so the module's
  // real imports resolve to something, even if that something is never
  // invoked.
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  createPageAction: vi.fn(),
  updatePageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  generateCourseFaqAction: vi.fn(),
}));

// JSZip cannot read a native Node Blob back out of a real zip in this
// suite's node test environment (no jsdom/FileReader shim) - see
// registry-helpers.assembleLectureFiles.test.ts's comment on the same
// limitation. save-zip-to-course's interesting logic (the Week NN /
// Course-Wide folder layout and the collision-suffix dedup) happens entirely
// BEFORE the zip.file() call, so a lightweight fake that just records the
// (path, blob) pairs it was given - instead of producing real zip bytes -
// exercises that logic exactly as thoroughly as a real JSZip would, without
// the environment limitation.
// `blob` is the field name throughout this suite for historical reasons, but
// U8's run-log entry is added as a plain STRING (JSZip's own `.file()`
// accepts either) - widened to `Blob | string` rather than renamed, so every
// pre-existing `.blob.text()` call below (real per-week/rubric/CSV file
// content, always a genuine Blob) keeps working unchanged.
const recordedFiles: Array<{ path: string; blob: Blob | string }> = [];
vi.mock("jszip", () => {
  class FakeJSZip {
    file(path: string, blob: Blob | string) {
      recordedFiles.push({ path, blob });
    }
    async generateAsync() {
      return new Blob(["fake-zip-bytes"], { type: "application/zip" });
    }
  }
  return { default: FakeJSZip };
});

/** Reads an entry's content as a string regardless of whether JSZip's
 * `.file()` was given a Blob (every real generated file) or a plain string
 * (U8's embedded run log). */
async function entryText(entry: { blob: Blob | string }): Promise<string> {
  return typeof entry.blob === "string" ? entry.blob : entry.blob.text();
}

import { listCourseHubAction, getAutomationRunLogAction, getNotYetRunStepTypesAction } from "@/app/actions";
import { courseSetupStorageSteps, buildRunLogSnapshotHeader } from "./steps.course-setup.storage";
import { courseGuideSteps } from "./steps.course-guides";
import { runWorkflowUnattended } from "../server-runner";
import { SAVED_ZIP_OUTPUT_KEY } from "../run-logging";
import type { StepDefinition, StepRunHelpers } from "../registry-helpers";
import type { GeneratedCourseFile, WorkflowDef } from "../types";
import type { ScheduleWeekPlan } from "@/app/actions";

const saveZipToCourse = courseSetupStorageSteps.find((s) => s.type === "save-zip-to-course")!;

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    ...overrides,
  };
}

const noProgress = () => {};

function weekFile(
  name: string,
  weekNumber: number,
  overrides: Partial<GeneratedCourseFile> = {}
): GeneratedCourseFile {
  return {
    name,
    blob: new Blob([`content of ${name}`], { type: "text/plain" }),
    mimeType: "text/plain",
    weekNumber,
    sortOrder: 1,
    role: "slides",
    ...overrides,
  };
}

// Stubs a minimal browser `document` + `URL.createObjectURL/revokeObjectURL`
// so `typeof document !== "undefined"` is true and the download branch's two
// calls succeed. The suite's default environment has no `document` global at
// all (the headless/unattended case), so only the attended-path tests below
// call this.
function stubDom() {
  const click = vi.fn();
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const createElement = vi.fn(() => ({ href: "", download: "", click }));
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("document", { createElement, body: { appendChild, removeChild } });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  return { click, appendChild, removeChild, createElement, createObjectURL, revokeObjectURL };
}

describe("save-zip-to-course - terminal bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedFiles.length = 0;
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-1", courseCode: "CS-101", name: "Intro to CS" }] as never,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips with no save when files, rubricFiles, and schedule are all empty", async () => {
    const saveCourseMaterialFile = vi.fn();
    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [] },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(result.summary).toEqual({ kind: "text", text: "Skipped - no generated files to bundle." });
    expect(saveCourseMaterialFile).not.toHaveBeenCalled();
    expect(recordedFiles).toHaveLength(0);
    // U9-AC1: nothing was actually saved on this path, so no saved-zip
    // reference is published either - a downstream reader must never be told
    // a file exists that was never written.
    expect(result.outputs).toEqual({});
  });

  // U9-AC1: the post-run completion stage (server-runner.ts / a server
  // action for the attended path) needs to find the EXACT file this step
  // wrote, not guess at the naming convention - this is what it reads.
  it("U9-AC1: publishes the exact course id and file name it saved, on its outputs", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)], name: "Custom Bundle" },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    const [courseId, , fileName] = saveCourseMaterialFile.mock.calls[0];
    expect(result.outputs).toEqual({ [SAVED_ZIP_OUTPUT_KEY]: { courseId, fileName } });
  });

  it("bundles per-week files into Week NN folders and rubric/CSV into Course-Wide", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    const files: GeneratedCourseFile[] = [
      weekFile("Lecture Slides - Week 1.pptx", 1),
      weekFile("Assignment Instructions - Week 1.docx", 1, { role: "instructions", sortOrder: 2 }),
      weekFile("Lecture Slides - Week 2.pptx", 2),
    ];
    const rubricFiles: GeneratedCourseFile[] = [
      weekFile("Grading Rubric.docx", 0, { role: "instructions", sortOrder: 0 }),
    ];
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Intro", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Loops", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files, rubricFiles, schedule },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    const [courseId, , fileName] = saveCourseMaterialFile.mock.calls[0];
    expect(courseId).toBe("course-1");
    expect(fileName).toMatch(/\.zip$/);

    const paths = recordedFiles.map((f) => f.path).sort();
    expect(paths).toContain("Week 01/Lecture Slides - Week 1.pptx");
    expect(paths).toContain("Week 01/Assignment Instructions - Week 1.docx");
    expect(paths).toContain("Week 02/Lecture Slides - Week 2.pptx");
    expect(paths).toContain("Course-Wide/Grading Rubric.docx");
    expect(paths.some((p) => p.startsWith("Course-Wide/") && p.includes("Course Schedule") && p.endsWith(".csv"))).toBe(true);
    expect(paths.length).toBe(5);

    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("5 file(s)");
    }
  });

  it("de-duplicates two files that land on the identical zip path", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    // Same name AND same week - a real (if rare) collision, e.g. two
    // differently-sourced files that happened to render an identical name.
    const files: GeneratedCourseFile[] = [
      weekFile("Lecture Slides - Week 1.pptx", 1, { blob: new Blob(["first"]) }),
      weekFile("Lecture Slides - Week 1.pptx", 1, { blob: new Blob(["second"]) }),
    ];

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    const paths = recordedFiles.map((f) => f.path).sort();
    expect(paths).toEqual(
      ["Week 01/Lecture Slides - Week 1 (2).pptx", "Week 01/Lecture Slides - Week 1.pptx"].sort()
    );

    // Both distinct contents survived under their own path - neither was
    // silently overwritten before reaching the zip.
    const byPath = new Map(recordedFiles.map((f) => [f.path, f.blob]));
    const first = await entryText({ blob: byPath.get("Week 01/Lecture Slides - Week 1.pptx")! });
    const second = await entryText({ blob: byPath.get("Week 01/Lecture Slides - Week 1 (2).pptx")! });
    expect(new Set([first, second])).toEqual(new Set(["first", "second"]));

    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("2 file(s)");
    }
  });

  it("three-way collision gets (2) and (3) suffixes in order", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    const files: GeneratedCourseFile[] = [
      weekFile("Same Name.docx", 1),
      weekFile("Same Name.docx", 1),
      weekFile("Same Name.docx", 1),
    ];

    await saveZipToCourse.run(
      { hubCourse: "course-1", files },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    const paths = recordedFiles.map((f) => f.path).sort();
    expect(paths).toEqual(
      [
        "Week 01/Same Name (2).docx",
        "Week 01/Same Name (3).docx",
        "Week 01/Same Name.docx",
      ].sort()
    );
  });

  it("downloads the zip when a document is present (attended run)", async () => {
    const dom = stubDom();
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(dom.createObjectURL).toHaveBeenCalledTimes(1);
    expect(dom.click).toHaveBeenCalledTimes(1);
    expect(dom.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("Downloaded");
    }
  });

  it("skips the download but still saves to the course tile when no document is present (unattended run)", async () => {
    // No stubDom() call: this suite's default environment has no `document`
    // global, exactly matching a headless/server run.
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("Saved");
    }
  });

  it("throws when there are files to bundle but no saveCourseMaterialFile helper (sign-in required)", async () => {
    await expect(
      saveZipToCourse.run(
        { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
        testHelpers({ saveCourseMaterialFile: null }),
        noProgress
      )
    ).rejects.toThrow("Sign in to save course materials.");
  });

  it("bundles when only rubricFiles are present (no per-week files, no schedule)", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    const rubricFiles: GeneratedCourseFile[] = [
      weekFile("Grading Rubric.docx", 0, { role: "instructions", sortOrder: 0 }),
    ];

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [], rubricFiles },
      testHelpers({ saveCourseMaterialFile }),
      noProgress
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    const paths = recordedFiles.map((f) => f.path);
    expect(paths).toEqual(["Course-Wide/Grading Rubric.docx"]);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("1 file(s)");
    }
  });
});

describe("buildRunLogSnapshotHeader", () => {
  const snapshotAt = new Date("2026-07-30T12:00:00.000Z");

  it("names the run id and the snapshot timestamp", () => {
    const header = buildRunLogSnapshotHeader("run-1", { ok: true, stepTypes: [] }, snapshotAt);
    expect(header).toContain("Run id: run-1");
    expect(header).toContain("2026-07-30T12:00:00.000Z");
    expect(header).toContain("SNAPSHOT");
  });

  // U9-AC7: the instructor's own browser download of this zip cannot be
  // updated once the run finishes and the SAVED copy's log is completed
  // (server-runner.ts / zip-run-log-completion.ts) - the header must say so
  // plainly, since this same header is embedded in BOTH copies at the
  // moment this step runs.
  it("U9-AC7: says plainly that the downloaded copy's log stops here, but the course-tile copy will be completed", () => {
    const header = buildRunLogSnapshotHeader("run-1", { ok: true, stepTypes: [] }, snapshotAt);
    const lower = header.toLowerCase();
    expect(lower).toContain("this downloaded copy");
    expect(lower).toContain("cannot be updated after the fact");
    expect(lower).toContain("saved to the course tile is updated with the complete log");
  });

  it("lists the not-yet-run step types by name when known", () => {
    const header = buildRunLogSnapshotHeader(
      "run-1",
      { ok: true, stepTypes: ["integrate-source-into-lms", "populate-lms-from-class-template"] },
      snapshotAt
    );
    expect(header).toContain("integrate-source-into-lms");
    expect(header).toContain("populate-lms-from-class-template");
  });

  it("says this step was the last one when the not-yet-run list is genuinely empty", () => {
    const header = buildRunLogSnapshotHeader("run-1", { ok: true, stepTypes: [] }, snapshotAt);
    expect(header.toLowerCase()).toContain("no further steps were expected");
  });

  it("degrades honestly (never silently) when the not-yet-run steps could not be determined", () => {
    const header = buildRunLogSnapshotHeader("run-1", { ok: false }, snapshotAt);
    expect(header.toLowerCase()).toContain("could not be determined");
    // Must not claim the positive fact that this step really was last -
    // that is a different, stronger claim this case cannot back up.
    expect(header.toLowerCase()).not.toContain("no further steps were expected");
  });
});

// U8: the run log itself, embedded in the terminal zip as
// "Course-Wide/Run Log.txt". save-zip-to-course reuses getAutomationRunLogAction
// (the SAME renderer/fetch the Automate panel's "Log" download uses) and the
// new getNotYetRunStepTypesAction (automation-runs.ts) - never a second log
// renderer.
describe("save-zip-to-course - U8: embeds the run log in the terminal zip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedFiles.length = 0;
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-1", courseCode: "CS-101", name: "Intro to CS" }] as never,
    });
  });

  it("adds Course-Wide/Run Log.txt, built from helpers.workflowRunId, when a run id is available", async () => {
    vi.mocked(getAutomationRunLogAction).mockResolvedValue({ text: "the run log body", workflowName: "Course Refresh" });
    vi.mocked(getNotYetRunStepTypesAction).mockResolvedValue({ ok: true, stepTypes: [] });
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    expect(getAutomationRunLogAction).toHaveBeenCalledWith("run-1");
    expect(getNotYetRunStepTypesAction).toHaveBeenCalledWith("run-1");
    const logFile = recordedFiles.find((f) => f.path === "Course-Wide/Run Log.txt");
    expect(logFile).toBeDefined();
    const text = await entryText(logFile!);
    expect(text).toContain("the run log body");
    expect(text).toContain("Run id: run-1");
  });

  it("names the not-yet-run steps in the embedded log's header (the reported run's exact shape)", async () => {
    vi.mocked(getAutomationRunLogAction).mockResolvedValue({ text: "log body", workflowName: "Course Refresh" });
    vi.mocked(getNotYetRunStepTypesAction).mockResolvedValue({
      ok: true,
      stepTypes: ["integrate-source-into-lms", "populate-lms-from-class-template"],
    });
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    const logFile = recordedFiles.find((f) => f.path === "Course-Wide/Run Log.txt");
    const text = await entryText(logFile!);
    expect(text).toContain("integrate-source-into-lms");
    expect(text).toContain("populate-lms-from-class-template");
  });

  it("adds the run log LAST, after every generated file", async () => {
    vi.mocked(getAutomationRunLogAction).mockResolvedValue({ text: "log body", workflowName: "Course Refresh" });
    vi.mocked(getNotYetRunStepTypesAction).mockResolvedValue({ ok: true, stepTypes: [] });
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1), weekFile("Notes.docx", 2)] },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    expect(recordedFiles.length).toBeGreaterThan(1);
    expect(recordedFiles[recordedFiles.length - 1].path).toBe("Course-Wide/Run Log.txt");
  });

  // Loose end (entry 159 AC6): the run-log write used to call zip.file(
  // "Course-Wide/Run Log.txt", ...) directly, bypassing the uniquePath
  // helper entry 155 AC3 introduced specifically because a silent JSZip
  // overwrite quietly drops a file. This proves it is now routed through
  // uniquePath exactly like every other entry: a generated file that
  // happens to collide with the log's own name is renamed to make room,
  // never silently dropped, AND the log itself is never lost either.
  it("routes the run-log write through uniquePath - a colliding Course-Wide file never silently disappears", async () => {
    vi.mocked(getAutomationRunLogAction).mockResolvedValue({ text: "log body", workflowName: "Course Refresh" });
    vi.mocked(getNotYetRunStepTypesAction).mockResolvedValue({ ok: true, stepTypes: [] });
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const rubricFiles: GeneratedCourseFile[] = [
      // Deliberately named to collide with the log's own conventional path.
      weekFile("Run Log.txt", 0, { blob: new Blob(["not the run log"], { type: "text/plain" }) }),
    ];

    await saveZipToCourse.run(
      { hubCourse: "course-1", files: [], rubricFiles },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    const paths = recordedFiles.map((f) => f.path).sort();
    // The FIRST file to claim the name keeps it (rubricFiles are added
    // before the log, per this step's own build order); the run log gets
    // bumped to the next available suffix rather than overwriting it.
    expect(paths).toEqual(["Course-Wide/Run Log (2).txt", "Course-Wide/Run Log.txt"]);

    const byPath = new Map(recordedFiles.map((f) => [f.path, f.blob]));
    expect(await entryText({ blob: byPath.get("Course-Wide/Run Log.txt")! })).toBe("not the run log");
    expect(await entryText({ blob: byPath.get("Course-Wide/Run Log (2).txt")! })).toContain("log body");
  });

  // SABOTAGE CHECK (confirmed by hand): reverting the run-log write to a
  // bare zip.file("Course-Wide/Run Log.txt", ...) call (bypassing
  // uniquePath) makes the test above fail: the log write silently
  // overwrites the rubric file's entry, so "Course-Wide/Run Log (2).txt"
  // never appears, entryText for "Course-Wide/Run Log.txt" reads the log
  // body instead of "not the run log", and the rubric file's content is
  // gone - exactly the silent-drop failure mode this fix exists to prevent.

  it("inherits redaction as-is - never re-processes the already-redacted log text a second time", async () => {
    // buildRunLogText (via getAutomationRunLogAction) already redacted this
    // BEFORE it was ever written - save-zip-to-course must pass it through
    // verbatim, not attempt to redact it again (which could mangle an
    // already-correct "[REDACTED]" marker) or strip it back out.
    vi.mocked(getAutomationRunLogAction).mockResolvedValue({
      text: "Inputs:\n  - apiToken: [REDACTED]\n  - repo: org/repo",
      workflowName: "Course Refresh",
    });
    vi.mocked(getNotYetRunStepTypesAction).mockResolvedValue({ ok: true, stepTypes: [] });
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    const logFile = recordedFiles.find((f) => f.path === "Course-Wide/Run Log.txt");
    const text = await entryText(logFile!);
    expect(text).toContain("apiToken: [REDACTED]");
    expect(text).toContain("repo: org/repo");
  });

  it("U8-AC3: still produces a complete zip, with a note in the summary, when no run id is available", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile }), // no workflowRunId
      noProgress
    );

    expect(getAutomationRunLogAction).not.toHaveBeenCalled();
    expect(recordedFiles.some((f) => f.path === "Course-Wide/Run Log.txt")).toBe(false);
    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("Run log not included");
    }
  });

  it("U8-AC3: still produces a complete zip when the run-log fetch itself returns an error", async () => {
    vi.mocked(getAutomationRunLogAction).mockResolvedValue({ error: "Run not found." });
    vi.mocked(getNotYetRunStepTypesAction).mockResolvedValue({ ok: false });
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    expect(recordedFiles.some((f) => f.path === "Course-Wide/Run Log.txt")).toBe(false);
    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("Run not found");
    }
  });

  it("U8-AC3: still produces a complete zip when the run-log fetch throws", async () => {
    vi.mocked(getAutomationRunLogAction).mockRejectedValue(new Error("network blip"));
    vi.mocked(getNotYetRunStepTypesAction).mockResolvedValue({ ok: false });
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    expect(recordedFiles.some((f) => f.path === "Course-Wide/Run Log.txt")).toBe(false);
    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("network blip");
    }
  });

  // SABOTAGE CHECK: confirmed by hand that wrapping only getAutomationRunLogAction
  // (not getNotYetRunStepTypesAction) in the try/catch - i.e. calling them
  // sequentially with the second one unguarded - makes THIS test fail: a
  // rejection from getNotYetRunStepTypesAction alone would then escape as an
  // unhandled rejection and cost the whole zip, rather than degrading to "no
  // log in this zip" like every other failure mode above.
  it("SABOTAGE-checked: still produces a complete zip when getNotYetRunStepTypesAction itself rejects", async () => {
    vi.mocked(getAutomationRunLogAction).mockResolvedValue({ text: "log body", workflowName: "Course Refresh" });
    vi.mocked(getNotYetRunStepTypesAction).mockRejectedValue(new Error("boom"));
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);

    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [weekFile("Slides.pptx", 1)] },
      testHelpers({ saveCourseMaterialFile, workflowRunId: "run-1" }),
      noProgress
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("Run log not included");
    }
  });
});

// RCA19 (RCA round 4): generate-course-guides used to throw for a missing
// course tile, and server-runner.ts cascades ANY thrown step failure to
// every dependent bound to its `files` output - so "Course tile not found"
// cost the instructor the ENTIRE terminal zip, not just the four guide
// documents. This is an end-to-end proof, using the REAL server-runner and
// the REAL save-zip-to-course step (the actual dependent this defect cost an
// instructor their whole zip over), that a degraded guides step no longer
// drags this step down with it.
describe("save-zip-to-course - receives the upstream files even when generate-course-guides degrades (RCA19)", () => {
  const guidesStep = courseGuideSteps.find((s) => s.type === "generate-course-guides")!;
  const zipStep = courseSetupStorageSteps.find((s) => s.type === "save-zip-to-course")!;

  beforeEach(() => {
    vi.clearAllMocks();
    recordedFiles.length = 0;
    // No course tile matches "missing-course-id" - generate-course-guides
    // degrades instead of throwing; save-zip-to-course's own (unrelated)
    // listCourseHubAction call for naming purposes also just falls back.
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });
  });

  it("a guides step that degrades (tile not found) still lets save-zip-to-course run and receive the upstream files", async () => {
    const saveCourseMaterialFile = vi.fn().mockResolvedValue(undefined);
    const incoming: GeneratedCourseFile[] = [weekFile("Existing.docx", 1, { role: "instructions" })];

    const fakeUpstream: StepDefinition = {
      type: "fake-upstream-files",
      name: "Fake upstream",
      description: "",
      inputs: [],
      outputs: [{ key: "files", label: "Files", type: "files" }],
      run: async () => ({
        outputs: { files: incoming },
        summary: { kind: "text", text: "" },
      }),
    };

    const def: WorkflowDef = {
      id: "guides-then-zip",
      name: "guides-then-zip",
      description: "",
      steps: [
        { type: "fake-upstream-files", bindings: {} },
        {
          type: "generate-course-guides",
          bindings: {
            hubCourse: { source: "literal", value: "missing-course-id" },
            files: { source: "step", stepIndex: 0, outputKey: "files" },
          },
        },
        {
          type: "save-zip-to-course",
          bindings: {
            hubCourse: { source: "literal", value: "missing-course-id" },
            files: { source: "step", stepIndex: 1, outputKey: "files" },
          },
        },
      ],
    };

    const result = await runWorkflowUnattended({
      def,
      resolveWorkflow: () => undefined,
      fieldValues: {},
      disabledTopIndices: new Set(),
      helpers: testHelpers({ saveCourseMaterialFile }),
      stepLookup: (type) =>
        ({
          "fake-upstream-files": fakeUpstream,
          "generate-course-guides": guidesStep,
          "save-zip-to-course": zipStep,
        })[type],
    });

    // Every step finished ("done"), none cascaded into "error"/"skipped" -
    // the exact failure this entry fixes.
    expect(result.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
    expect(result.ok).toBe(true);
    // The dependent step actually processed the pass-through file (not an
    // empty list) - proves the file reached it, not merely that nothing
    // threw.
    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(recordedFiles.map((f) => f.path)).toContain("Week 01/Existing.docx");
  });
});
