// U9: covers buildCompleteRunLogText, completeCourseZipRunLog, and the
// completeCourseZipRunLogs orchestrator - closing the gap U8 left (the run
// log embedded in the terminal zip is only ever a SNAPSHOT, because
// save-zip-to-course is not the run's last step). See this module's own
// header comment for why the run's terminal fields (status/finishedAt/
// duration/stepCount/errorCount) are synthesized here rather than trusted
// from the stored row.
//
// getRun/listRunSteps (src/lib/workflow-runs.ts) are mocked directly rather
// than exercised through a hand-rolled fake Supabase query builder - this
// module never touches the query shape itself, only the domain values those
// two functions return, so mocking at that boundary keeps this suite focused
// on THIS module's own logic. Same reasoning for listCourseHubAction /
// appendCourseMaterialFileAction (@/app/actions) and downloadCourseZipBlob /
// uploadCourseZip / removeCourseZip (@/lib/course-files).
//
// jszip is faked as a tiny in-memory JSON "archive" (path -> string content),
// round-tripping through loadAsync/file/generateAsync - the same
// "record what was given, don't produce real zip bytes" approach
// steps.course-setup.storage.test.ts already uses for its own JSZip fake,
// extended here to also support reading an EXISTING archive back out (which
// that suite never needed, since save-zip-to-course only ever builds a fresh
// zip from scratch).

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { WorkflowRunRecord, WorkflowRunStep } from "@/lib/workflow-runs";

vi.mock("@/lib/workflow-runs", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, getRun: vi.fn(), listRunSteps: vi.fn() };
});

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  appendCourseMaterialFileAction: vi.fn(),
}));

vi.mock("@/lib/course-files", () => ({
  downloadCourseZipBlob: vi.fn(),
  uploadCourseZip: vi.fn(),
  removeCourseZip: vi.fn(),
}));

// In-memory fake archive: {path: content} serialized as JSON text inside a
// Blob, so loadAsync can parse it back out and generateAsync can re-emit it -
// a real zip's bytes are irrelevant to this module's own logic (which entry
// gets replaced, which are preserved, when the save happens), only the
// mapping from path to content is.
function fakeArchiveBlob(files: Record<string, string>): Blob {
  return new Blob([JSON.stringify(files)], { type: "application/zip" });
}
async function readFakeArchive(blob: Blob): Promise<Record<string, string>> {
  return JSON.parse(await blob.text());
}

vi.mock("jszip", () => {
  class FakeJSZip {
    files: Record<string, string>;
    constructor(initial: Record<string, string> = {}) {
      this.files = { ...initial };
    }
    // Accepts an ArrayBuffer as well as a Blob (docs/REGRESSION.md entry 241
    // check 13 fix): completeCourseZipRunLog now converts the downloaded
    // Blob to an ArrayBuffer itself (`await existingBlob.arrayBuffer()`)
    // before calling JSZip.loadAsync - see zip-run-log-completion.ts's own
    // comment at that call site for why - so this fake's loadAsync must be
    // able to decode either shape to stay a faithful stand-in.
    static async loadAsync(data: Blob | ArrayBuffer) {
      const text = data instanceof ArrayBuffer ? new TextDecoder().decode(data) : await data.text();
      return new FakeJSZip(JSON.parse(text));
    }
    file(path: string, content: string) {
      this.files[path] = content;
    }
    async generateAsync() {
      return new Blob([JSON.stringify(this.files)], { type: "application/zip" });
    }
  }
  return { default: FakeJSZip };
});

import { getRun, listRunSteps } from "@/lib/workflow-runs";
import { listCourseHubAction, appendCourseMaterialFileAction } from "@/app/actions";
import { downloadCourseZipBlob, uploadCourseZip, removeCourseZip } from "@/lib/course-files";
import {
  buildCompleteRunLogText,
  completeCourseZipRunLog,
  completeCourseZipRunLogs,
} from "./zip-run-log-completion";

const fakeSupabase = {} as unknown as SupabaseClient<Database>;

function baseRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: "run-1",
    userId: "u1",
    workflowId: "wf-1",
    workflowName: "Course Refresh",
    status: "running",
    triggerSource: "manual",
    triggerRef: null,
    createdAt: "2026-07-30T12:00:00.000Z",
    startedAt: "2026-07-30T12:00:00.000Z",
    finishedAt: null,
    durationMs: null,
    stepCount: null,
    errorCount: null,
    detail: null,
    fieldValues: null,
    ...overrides,
  };
}

function step(overrides: Partial<WorkflowRunStep> = {}): WorkflowRunStep {
  return {
    id: "step-1",
    runId: "run-1",
    userId: "u1",
    stepIndex: 0,
    stepType: "save-zip-to-course",
    status: "done",
    error: null,
    summary: null,
    progress: [],
    startedAt: "2026-07-30T12:00:00.000Z",
    finishedAt: "2026-07-30T12:00:01.000Z",
    durationMs: 1000,
    institution: null,
    courseId: null,
    courseName: null,
    inputs: null,
    createdAt: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildCompleteRunLogText", () => {
  it("returns null when the run cannot be found", async () => {
    vi.mocked(getRun).mockResolvedValue(null);
    const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", true);
    expect(text).toBeNull();
    expect(listRunSteps).not.toHaveBeenCalled();
  });

  it("includes every logged step, including ones that ran AFTER save-zip-to-course (U9-AC2)", async () => {
    vi.mocked(getRun).mockResolvedValue(baseRun());
    vi.mocked(listRunSteps).mockResolvedValue([
      step({ stepIndex: 18, stepType: "save-zip-to-course" }),
      step({ stepIndex: 19, stepType: "integrate-source-into-lms" }),
      step({ stepIndex: 20, stepType: "populate-lms-from-class-template" }),
    ]);

    const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", true);
    expect(text).toContain("save-zip-to-course");
    expect(text).toContain("integrate-source-into-lms");
    expect(text).toContain("populate-lms-from-class-template");
  });

  it("synthesizes a genuinely FINISHED run header rather than trusting the still-running stored row", async () => {
    // The stored row (as fetched mid/just-after the workflow body, before the
    // caller's own finishWorkflowRun has run) still says "running" with no
    // finishedAt - embedding that verbatim into a log claiming to be
    // COMPLETE would be self-contradictory ("this run has no finish record"
    // next to a log that is supposedly the complete record of a finished run).
    vi.mocked(getRun).mockResolvedValue(baseRun({ status: "running", finishedAt: null, durationMs: null }));
    vi.mocked(listRunSteps).mockResolvedValue([step()]);

    const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", true);
    expect(text).not.toContain("This run has no finish record");
    expect(text).toContain("Status: ok");
  });

  it("reflects a FAILED run (ok=false) in the synthesized status - U9-AC3, the log matters most here", async () => {
    vi.mocked(getRun).mockResolvedValue(baseRun());
    vi.mocked(listRunSteps).mockResolvedValue([
      step({ stepIndex: 0, status: "done" }),
      step({ stepIndex: 1, status: "error", error: "boom" }),
    ]);

    const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", false);
    expect(text).toContain("Status: error");
    expect(text).toContain("Error count: 1");
  });

  it("counts a needs-interaction step toward the error count, alongside outright errors", async () => {
    vi.mocked(getRun).mockResolvedValue(baseRun());
    vi.mocked(listRunSteps).mockResolvedValue([
      step({ stepIndex: 0, status: "error" }),
      step({ stepIndex: 1, status: "needs-interaction" }),
      step({ stepIndex: 2, status: "done" }),
    ]);

    const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", false);
    expect(text).toContain("Error count: 2");
  });

  // C3 (docs/REGRESSION.md entry 197's "REMAINING, VERIFIED GAP"): the
  // Detail: section used to come out EMPTY on every downloaded zip, in BOTH
  // run loops, deterministically - not racily. getRun always returns
  // detail: null here (see baseRun()) because finishWorkflowRun, the only
  // writer of that column, has not run yet at the point either loop calls
  // this function - the fixture's own header comment used to note this
  // hardcodes detail: null and that nothing covered it. These tests pin the
  // fix: the section is now populated without needing the caller to supply
  // anything, AND a caller that DOES supply the exact text it is about to
  // hand its own finishWorkflowRun call gets that exact text back instead.
  describe("Detail: section (C3 - no longer deterministically empty)", () => {
    it("REPRODUCES the defect's shape: no override supplied, a failing step, run.detail null on the stored row", async () => {
      // This is exactly what both run loops hand this function today: `ok`
      // and the freshly-logged `steps`, nothing else - detailOverride is
      // simply omitted, the same as every call site before the C3 fix.
      vi.mocked(getRun).mockResolvedValue(baseRun({ detail: null }));
      vi.mocked(listRunSteps).mockResolvedValue([
        step({ stepIndex: 0, stepType: "grade-repo", status: "done" }),
        step({ stepIndex: 1, stepType: "post-grades", status: "error", error: "Could not reach the gradebook." }),
      ]);

      const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", false);
      expect(text).toContain("Detail:");
      expect(text).toContain("step 2 post-grades: Could not reach the gradebook.");
    });

    it("never fabricates a detail for a genuinely passing run - stays empty, no Detail: heading at all", async () => {
      vi.mocked(getRun).mockResolvedValue(baseRun({ detail: null }));
      vi.mocked(listRunSteps).mockResolvedValue([step({ stepIndex: 0, status: "done" })]);

      const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", true);
      expect(text).not.toContain("Detail:");
    });

    it("dedupes a failure repeated across a fan-out instead of listing it once per course - proves this routes through joinStepErrorDetail, not a naive join", async () => {
      vi.mocked(getRun).mockResolvedValue(baseRun({ detail: null }));
      vi.mocked(listRunSteps).mockResolvedValue([
        step({ stepIndex: 2, stepType: "grade-repo", status: "error", error: "Provide a repository.", courseId: "c1" }),
        step({ stepIndex: 2, stepType: "grade-repo", status: "error", error: "Provide a repository.", courseId: "c2" }),
        step({ stepIndex: 2, stepType: "grade-repo", status: "error", error: "Provide a repository.", courseId: "c3" }),
      ]);

      const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", false);
      expect(text).toContain("step 3 grade-repo: Provide a repository. (x3)");
    });

    it("uses an explicitly supplied detailOverride verbatim instead of the self-computed fallback", async () => {
      vi.mocked(getRun).mockResolvedValue(baseRun({ detail: null }));
      vi.mocked(listRunSteps).mockResolvedValue([
        step({ stepIndex: 0, status: "error", error: "this would be the fallback text" }),
      ]);

      const text = await buildCompleteRunLogText(
        fakeSupabase,
        "u1",
        "run-1",
        false,
        "5/7 courses ok; 2 failed - step 1 grade-repo: this would be the fallback text"
      );
      expect(text).toContain("5/7 courses ok; 2 failed - step 1 grade-repo: this would be the fallback text");
      // The self-computed fallback's OWN rendering (no course-count prefix)
      // must not ALSO appear - the override replaces it, not supplements it.
      expect(text?.match(/Detail:/g)?.length).toBe(1);
    });

    it("an explicit empty-string override is honored as-is (no Detail: heading), even for a failed run", async () => {
      vi.mocked(getRun).mockResolvedValue(baseRun({ detail: null }));
      vi.mocked(listRunSteps).mockResolvedValue([step({ stepIndex: 0, status: "error", error: "boom" })]);

      const text = await buildCompleteRunLogText(fakeSupabase, "u1", "run-1", false, "");
      expect(text).not.toContain("Detail:");
    });
  });
});

describe("completeCourseZipRunLog", () => {
  const ref = { courseId: "course-1", fileName: "Intro to CS Course Materials.zip" };

  function stubTileWithFile(path = "u1/course-1/existing.zip") {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        {
          id: "course-1",
          materialsFiles: [{ name: ref.fileName, path, size: 100, addedAt: "2026-07-30T12:00:00.000Z" }],
        },
      ] as never,
    });
  }

  it("replaces the run-log entry while preserving every other entry byte for byte (U9-AC2)", async () => {
    stubTileWithFile();
    vi.mocked(downloadCourseZipBlob).mockResolvedValue(
      fakeArchiveBlob({
        "Week 01/Lecture Slides - Week 1.pptx": "week 1 slides content",
        "Course-Wide/Grading Rubric.docx": "rubric content",
        "Course-Wide/Run Log.txt": "OLD SNAPSHOT LOG",
      })
    );
    vi.mocked(uploadCourseZip).mockResolvedValue({ path: "u1/course-1/new-object.zip" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValue({ replacedPath: "u1/course-1/existing.zip" });

    const result = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "COMPLETE LOG TEXT");

    expect(result).toEqual({ ok: true });
    const uploadedBlob = vi.mocked(uploadCourseZip).mock.calls[0][3] as Blob;
    const files = await readFakeArchive(uploadedBlob);
    expect(files["Course-Wide/Run Log.txt"]).toBe("COMPLETE LOG TEXT");
    expect(files["Week 01/Lecture Slides - Week 1.pptx"]).toBe("week 1 slides content");
    expect(files["Course-Wide/Grading Rubric.docx"]).toBe("rubric content");
    expect(Object.keys(files).sort()).toEqual(
      ["Course-Wide/Grading Rubric.docx", "Course-Wide/Run Log.txt", "Week 01/Lecture Slides - Week 1.pptx"].sort()
    );

    // Saved under the SAME course id + file name (replaces, never accumulates).
    expect(vi.mocked(appendCourseMaterialFileAction).mock.calls[0][0]).toBe("course-1");
    expect(vi.mocked(appendCourseMaterialFileAction).mock.calls[0][1]).toMatchObject({ name: ref.fileName });
    // The old object is removed only AFTER the swap succeeded.
    expect(removeCourseZip).toHaveBeenCalledWith(fakeSupabase, "u1/course-1/existing.zip");
  });

  it("adds the run-log entry fresh when the snapshot never got one embedded (U8-AC3 fallback case)", async () => {
    stubTileWithFile();
    vi.mocked(downloadCourseZipBlob).mockResolvedValue(
      fakeArchiveBlob({ "Week 01/Slides.pptx": "content" })
    );
    vi.mocked(uploadCourseZip).mockResolvedValue({ path: "u1/course-1/new-object.zip" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValue({ replacedPath: "u1/course-1/existing.zip" });

    const result = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "COMPLETE LOG TEXT");

    expect(result).toEqual({ ok: true });
    const uploadedBlob = vi.mocked(uploadCourseZip).mock.calls[0][3] as Blob;
    const files = await readFakeArchive(uploadedBlob);
    expect(files["Course-Wide/Run Log.txt"]).toBe("COMPLETE LOG TEXT");
    expect(files["Week 01/Slides.pptx"]).toBe("content");
  });

  it("U9-AC4: never touches the saved zip when the course tile cannot be found", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });

    const result = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "TEXT");

    expect(result.ok).toBe(false);
    expect(downloadCourseZipBlob).not.toHaveBeenCalled();
    expect(uploadCourseZip).not.toHaveBeenCalled();
    expect(appendCourseMaterialFileAction).not.toHaveBeenCalled();
  });

  it("U9-AC4: never touches the saved zip when the exact file name is not on the tile's materials list", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-1", materialsFiles: [{ name: "Some Other File.zip", path: "x", size: 1, addedAt: "" }] }] as never,
    });

    const result = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "TEXT");

    expect(result.ok).toBe(false);
    expect(uploadCourseZip).not.toHaveBeenCalled();
  });

  it("U9-AC4: never touches the saved zip when listCourseHubAction itself errors", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "boom" });

    const result = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "TEXT");

    expect(result).toEqual({ ok: false, reason: "boom" });
    expect(uploadCourseZip).not.toHaveBeenCalled();
  });

  it("U9-AC4: never touches the saved zip when the download itself throws", async () => {
    stubTileWithFile();
    vi.mocked(downloadCourseZipBlob).mockRejectedValue(new Error("network blip"));

    const result = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "TEXT");

    expect(result).toEqual({ ok: false, reason: "network blip" });
    expect(uploadCourseZip).not.toHaveBeenCalled();
    expect(appendCourseMaterialFileAction).not.toHaveBeenCalled();
  });

  it("U9-AC4: rolls back the newly-uploaded object (never leaves an orphan) when the append itself fails", async () => {
    stubTileWithFile();
    vi.mocked(downloadCourseZipBlob).mockResolvedValue(fakeArchiveBlob({ "Course-Wide/Run Log.txt": "old" }));
    vi.mocked(uploadCourseZip).mockResolvedValue({ path: "u1/course-1/new-object.zip" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValue({ error: "append failed" });

    const result = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "TEXT");

    expect(result).toEqual({ ok: false, reason: "append failed" });
    // The freshly-uploaded (now-orphaned) object is cleaned up...
    expect(removeCourseZip).toHaveBeenCalledWith(fakeSupabase, "u1/course-1/new-object.zip");
    // ...and the ORIGINAL saved zip's own object was never touched.
    expect(removeCourseZip).not.toHaveBeenCalledWith(fakeSupabase, "u1/course-1/existing.zip");
  });

  it("U9-AC5: idempotent - completing the same zip twice ends with one entry, not a duplicate or a nested archive", async () => {
    stubTileWithFile();
    // First pass: the snapshot.
    vi.mocked(downloadCourseZipBlob).mockResolvedValueOnce(
      fakeArchiveBlob({ "Week 01/Slides.pptx": "content", "Course-Wide/Run Log.txt": "SNAPSHOT" })
    );
    vi.mocked(uploadCourseZip).mockResolvedValueOnce({ path: "u1/course-1/pass-1.zip" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValueOnce({ replacedPath: "u1/course-1/existing.zip" });

    const first = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "COMPLETE V1");
    expect(first).toEqual({ ok: true });
    const firstUploaded = await readFakeArchive(vi.mocked(uploadCourseZip).mock.calls[0][3] as Blob);

    // Second pass: re-running against what the first pass produced (same
    // (courseId, fileName) - the tile's materials list now points at
    // "pass-1.zip", exactly as appendCourseMaterialFile's dedupe-by-name
    // guarantees).
    vi.mocked(downloadCourseZipBlob).mockResolvedValueOnce(fakeArchiveBlob(firstUploaded));
    vi.mocked(uploadCourseZip).mockResolvedValueOnce({ path: "u1/course-1/pass-2.zip" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValueOnce({ replacedPath: "u1/course-1/pass-1.zip" });

    const second = await completeCourseZipRunLog(fakeSupabase, "u1", ref, "COMPLETE V2");
    expect(second).toEqual({ ok: true });
    const secondUploaded = await readFakeArchive(vi.mocked(uploadCourseZip).mock.calls[1][3] as Blob);

    expect(Object.keys(secondUploaded).sort()).toEqual(["Course-Wide/Run Log.txt", "Week 01/Slides.pptx"]);
    expect(secondUploaded["Course-Wide/Run Log.txt"]).toBe("COMPLETE V2");
    expect(secondUploaded["Week 01/Slides.pptx"]).toBe("content");
    // Both replaced-path removals fired - no orphaned intermediate objects.
    expect(removeCourseZip).toHaveBeenCalledWith(fakeSupabase, "u1/course-1/existing.zip");
    expect(removeCourseZip).toHaveBeenCalledWith(fakeSupabase, "u1/course-1/pass-1.zip");
  });
});

describe("completeCourseZipRunLogs (multi-ref orchestrator)", () => {
  it("returns an empty list and touches nothing when there are no refs", async () => {
    const results = await completeCourseZipRunLogs(fakeSupabase, "u1", "run-1", true, []);
    expect(results).toEqual([]);
    expect(getRun).not.toHaveBeenCalled();
  });

  it("builds the complete log ONCE and applies it to every distinct saved zip", async () => {
    vi.mocked(getRun).mockResolvedValue(baseRun());
    vi.mocked(listRunSteps).mockResolvedValue([step()]);
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        { id: "c1", materialsFiles: [{ name: "a.zip", path: "p1", size: 1, addedAt: "" }] },
        { id: "c2", materialsFiles: [{ name: "b.zip", path: "p2", size: 1, addedAt: "" }] },
      ] as never,
    });
    vi.mocked(downloadCourseZipBlob).mockImplementation(async () => fakeArchiveBlob({}));
    vi.mocked(uploadCourseZip).mockResolvedValue({ path: "new" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValue({ replacedPath: null });

    const results = await completeCourseZipRunLogs(fakeSupabase, "u1", "run-1", true, [
      { courseId: "c1", fileName: "a.zip" },
      { courseId: "c2", fileName: "b.zip" },
    ]);

    expect(getRun).toHaveBeenCalledTimes(1);
    expect(listRunSteps).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.result.ok)).toEqual([true, true]);
  });

  it("reports every ref as failed (without throwing) when the run itself cannot be found", async () => {
    vi.mocked(getRun).mockResolvedValue(null);

    const results = await completeCourseZipRunLogs(fakeSupabase, "u1", "run-1", true, [
      { courseId: "c1", fileName: "a.zip" },
    ]);

    expect(results).toEqual([{ ref: { courseId: "c1", fileName: "a.zip" }, result: { ok: false, reason: "Run not found." } }]);
  });

  // C3: an explicit `detail` argument (passed by server-runner.ts and
  // useWorkflowRun.ts, both of which already know the exact text about to be
  // handed to finishWorkflowRun) reaches the SAVED zip's embedded Course-Wide/
  // Run Log.txt end to end, all the way through buildCompleteRunLogText -
  // proving the wiring, not just buildCompleteRunLogText's own unit tests
  // above.
  it("threads an explicit detail argument all the way into the saved zip's embedded log text", async () => {
    vi.mocked(getRun).mockResolvedValue(baseRun({ detail: null }));
    // The step's own per-step "Error:" line always shows the raw error
    // regardless of any override (that rendering is unrelated to the run-
    // level Detail: section this test is about) - a DIFFERENT message here
    // than the override text keeps the two assertions below unambiguous.
    vi.mocked(listRunSteps).mockResolvedValue([step({ stepIndex: 0, status: "error", error: "per-step error text" })]);
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "c1", materialsFiles: [{ name: "a.zip", path: "p1", size: 1, addedAt: "" }] }] as never,
    });
    vi.mocked(downloadCourseZipBlob).mockImplementation(async () => fakeArchiveBlob({}));
    vi.mocked(uploadCourseZip).mockResolvedValue({ path: "new" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValue({ replacedPath: null });

    await completeCourseZipRunLogs(
      fakeSupabase,
      "u1",
      "run-1",
      false,
      [{ courseId: "c1", fileName: "a.zip" }],
      "3/5 courses ok; 2 failed - step 1 x: root cause"
    );

    const uploadedBlob = vi.mocked(uploadCourseZip).mock.calls[0][3] as Blob;
    const files = await readFakeArchive(uploadedBlob);
    const logText = files["Course-Wide/Run Log.txt"];
    expect(logText).toContain("Detail:");
    expect(logText).toContain("3/5 courses ok; 2 failed - step 1 x: root cause");
    // The self-computed fallback (joinStepErrorDetail over the fetched
    // steps) would have rendered this step's own failure as "step 1
    // save-zip-to-course: per-step error text" in the Detail: section - that
    // must NOT appear, proving the override replaced it rather than the
    // fallback running anyway.
    expect(logText).not.toContain("step 1 save-zip-to-course: per-step error text");
  });

  it("a failure completing ONE zip does not stop the others from completing", async () => {
    vi.mocked(getRun).mockResolvedValue(baseRun());
    vi.mocked(listRunSteps).mockResolvedValue([step()]);
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "c2", materialsFiles: [{ name: "b.zip", path: "p2", size: 1, addedAt: "" }] }] as never,
      // "c1" is deliberately absent, so its own completion fails while c2's succeeds.
    });
    vi.mocked(downloadCourseZipBlob).mockImplementation(async () => fakeArchiveBlob({}));
    vi.mocked(uploadCourseZip).mockResolvedValue({ path: "new" });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValue({ replacedPath: null });

    const results = await completeCourseZipRunLogs(fakeSupabase, "u1", "run-1", true, [
      { courseId: "c1", fileName: "a.zip" },
      { courseId: "c2", fileName: "b.zip" },
    ]);

    const byCourseId = new Map(results.map((r) => [r.ref.courseId, r.result]));
    expect(byCourseId.get("c1")?.ok).toBe(false);
    expect(byCourseId.get("c2")?.ok).toBe(true);
  });
});

// SABOTAGE CHECK (confirmed by hand, restoring the fix immediately after):
// changing completeCourseZipRunLog to call uploadCourseZip/appendCourseMaterialFileAction
// BEFORE downloadCourseZipBlob/JSZip.loadAsync/generateAsync (i.e. writing before the
// replacement blob is fully built) makes the "never touches the saved zip" tests above
// fail to catch a real defect if introduced later - they assert call ABSENCE, which
// still passes if the write happens to occur after an early return, but the
// "rolls back the newly-uploaded object" test specifically pins the ORDER (append
// failing still leaves the ORIGINAL existing.zip alone) and fails if that guarantee
// is broken by reordering.
