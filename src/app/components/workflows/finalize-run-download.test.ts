// AC1/AC2 (defect run 556b49f0's zip-log follow-up): coverage for
// finalizeRunDownload/patchEmbeddedRunLog - the end-of-run download flush
// extracted out of useWorkflowRun.ts (see that module's own header comment).
//
// Mirrors two existing test patterns in this codebase rather than inventing
// a third:
//  - jszip is faked as a tiny in-memory JSON "archive" (path -> content),
//    round-tripping through loadAsync/file/generateAsync - the SAME approach
//    zip-run-log-completion.test.ts already uses for its own JSZip fake,
//    extended here to also support the bare `new JSZip()` constructor (the
//    multi-entry outer-zip path uses that; the log-patch path uses the
//    static loadAsync).
//  - document/URL are stubbed exactly like steps.course-setup.storage.
//    test.ts's own stubDom() helper, so `typeof document !== "undefined"`
//    is true only in the tests that opt into it - this suite's default
//    environment has no `document` global at all (matching the real
//    unattended/server case, which never calls this function in the first
//    place, but is worth proving as a no-op here too).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/app/actions", () => ({
  getCompleteRunLogTextAction: vi.fn(),
}));

// In-memory fake archive: {path: content} serialized as JSON text inside a
// Blob. A blob that is NOT valid JSON (a plain content blob, standing in for
// a real .docx/.pptx/corrupt read) fails to parse - exactly the "not a real
// zip" case patchEmbeddedRunLog must degrade gracefully from.
function fakeArchiveBlob(files: Record<string, string>): Blob {
  return new Blob([JSON.stringify(files)], { type: "application/zip" });
}
async function readFakeArchive(blob: Blob): Promise<Record<string, string>> {
  return JSON.parse(await blob.text());
}

vi.mock("jszip", () => {
  class FakeJSZip {
    // Unlike zip-run-log-completion.test.ts's own fake (which only ever
    // receives strings), the multi-entry outer-zip path here calls
    // `zip.file(entry.name, entry.blob)` with a real Blob for every
    // ORIGINAL pending download - only withTopLevelRunLog's own synthetic
    // top-level entry is a string built from `new Blob([logText])` at the
    // CALLER... no: `entry.blob` for a pending download is itself a Blob,
    // and withTopLevelRunLog's added entry's `.blob` is ALSO a real Blob
    // (`new Blob([logText])`) - so this fake accepts either and resolves
    // Blob content to text lazily, at generateAsync time, mirroring how a
    // real JSZip stores whatever raw content `.file()` was given.
    files: Record<string, Blob | string>;
    constructor(initial: Record<string, string> = {}) {
      this.files = { ...initial };
    }
    static async loadAsync(blob: Blob) {
      const text = await blob.text();
      return new FakeJSZip(JSON.parse(text));
    }
    file(path: string, content: Blob | string) {
      this.files[path] = content;
    }
    async generateAsync() {
      const resolved: Record<string, string> = {};
      for (const [path, content] of Object.entries(this.files)) {
        resolved[path] = typeof content === "string" ? content : await content.text();
      }
      return new Blob([JSON.stringify(resolved)], { type: "application/zip" });
    }
  }
  return { default: FakeJSZip };
});

import { getCompleteRunLogTextAction } from "@/app/actions";
import { finalizeRunDownload, buildAttributedRunDetail, type CourseFailureGroup } from "./finalize-run-download";
import type { RunPendingDownload, CourseOutcome } from "./attended-fanout";
import type { StepErrorDetailInput } from "@/lib/workflows/run-detail";

const fakeUser = { id: "u1" } as never;
const fakeSupabase = {} as never;

/** Stubs a minimal browser `document` + `URL.createObjectURL/revokeObjectURL`
 * so `typeof document !== "undefined"` is true and the download branch's two
 * calls succeed - same shape as steps.course-setup.storage.test.ts's own
 * stubDom(). Returns the spies so tests can inspect what was "downloaded". */
function stubDom() {
  const click = vi.fn();
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const anchor = { href: "", download: "", click };
  const createElement = vi.fn(() => anchor);
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("document", { createElement, body: { appendChild, removeChild } });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  return { click, appendChild, removeChild, createElement, createObjectURL, revokeObjectURL, anchor };
}

function entry(overrides: Partial<RunPendingDownload> = {}): RunPendingDownload {
  return {
    blob: new Blob(["plain content"]),
    fileName: "Assignment.docx",
    ...overrides,
  };
}

function failure(overrides: Partial<StepErrorDetailInput> = {}): StepErrorDetailInput {
  return {
    index: 0,
    type: "grade-repo",
    status: "error",
    error: "Failed to fetch",
    ...overrides,
  };
}

function courseGroup(overrides: Partial<CourseFailureGroup> = {}): CourseFailureGroup {
  return {
    courseId: "c1",
    courseName: "Course A",
    institution: "MCC",
    errors: [failure()],
    ...overrides,
  };
}

function courseOutcome(overrides: Partial<CourseOutcome> = {}): CourseOutcome {
  return {
    courseId: "c1",
    courseName: "Course A",
    status: "failed",
    ...overrides,
  };
}

// AC5 residual (docs/REGRESSION.md entry 203 AC5): buildAttributedRunDetail
// is the pure decision logic behind the wiring tested further down through
// finalizeRunDownload itself - tested directly here so the actual
// attribution/dedup rules (the highest-risk part of this fix) are pinned
// without also depending on the getCompleteRunLogTextAction mock plumbing.
describe("buildAttributedRunDetail", () => {
  it("attributes each course's failure to that course in a multi-course run - a per-course label, not a flat list", () => {
    const detail = buildAttributedRunDetail(
      [courseOutcome({ courseId: "c1", courseName: "Course A", status: "failed" }), courseOutcome({ courseId: "c2", courseName: "Course B", status: "ok" })],
      [
        courseGroup({ courseId: "c1", courseName: "Course A", institution: "MCC", errors: [failure({ error: "Failed to fetch" })] }),
        courseGroup({ courseId: "c2", courseName: "Course B", institution: "MCC", errors: [] }),
      ]
    );
    expect(detail).toContain("MCC: Course A - step 1 grade-repo: Failed to fetch");
    // Course B had no errors, so it never appears as a labeled block.
    expect(detail).not.toContain("Course B");
  });

  it("the SAME failure in TWO different courses reads as two attributed lines, not one deduped '(x2)' line - the deliberate cross-course dedup decision", () => {
    const detail = buildAttributedRunDetail(
      [courseOutcome({ courseId: "c1", courseName: "Course A" }), courseOutcome({ courseId: "c2", courseName: "Course B" })],
      [
        courseGroup({ courseId: "c1", courseName: "Course A", institution: "MCC", errors: [failure({ index: 2, type: "grade-repo", error: "Failed to fetch" })] }),
        courseGroup({ courseId: "c2", courseName: "Course B", institution: "MCC", errors: [failure({ index: 2, type: "grade-repo", error: "Failed to fetch" })] }),
      ]
    );
    // Both courses' own attributed line are present, each naming its course.
    expect(detail).toContain("MCC: Course A - step 3 grade-repo: Failed to fetch");
    expect(detail).toContain("MCC: Course B - step 3 grade-repo: Failed to fetch");
    // NOT collapsed into a single unattributed "(x2)" count - that would
    // hide which two courses actually hit it.
    expect(detail).not.toContain("(x2)");
  });

  it("dedup WITHIN one course still collapses to '(xN)' exactly as AC5 added, even inside a multi-course run", () => {
    const detail = buildAttributedRunDetail(
      [courseOutcome({ courseId: "c1", courseName: "Course A" }), courseOutcome({ courseId: "c2", courseName: "Course B", status: "ok" })],
      [
        courseGroup({
          courseId: "c1",
          courseName: "Course A",
          institution: "MCC",
          errors: [failure({ index: 2, error: "Failed to fetch" }), failure({ index: 2, error: "Failed to fetch" })],
        }),
      ]
    );
    expect(detail).toContain("MCC: Course A - step 3 grade-repo: Failed to fetch (x2)");
  });

  it("dedup WITHIN one course still collapses to '(xN)' for a genuinely single-course run too", () => {
    const detail = buildAttributedRunDetail(undefined, [
      courseGroup({ errors: [failure({ error: "boom" }), failure({ error: "boom" })] }),
    ]);
    expect(detail).toBe("step 1 grade-repo: boom (x2)");
  });

  it("a run with no course context at all (undefined courseOutcomes - not a course fan-out) reads completely plain: no label, no count prefix", () => {
    const noOutcomesAtAll = buildAttributedRunDetail(undefined, [courseGroup({ errors: [failure({ error: "Failed to fetch" })] })]);
    expect(noOutcomesAtAll).toBe("step 1 grade-repo: Failed to fetch");
    expect(noOutcomesAtAll).not.toContain("MCC");
    expect(noOutcomesAtAll).not.toContain("courses");
  });

  it("a course-fan-out scope that resolved to exactly one course gets the SAME count prefix useWorkflowRun.ts already shows for it today, but no per-course label (only one course - nothing to disambiguate)", () => {
    const oneEntry = buildAttributedRunDetail([courseOutcome()], [courseGroup({ errors: [failure({ error: "Failed to fetch" })] })]);
    // buildCourseFanoutDetail's own count summary still applies - matches
    // useWorkflowRun.ts's existing `courseOutcomes.length > 0` gate, which
    // does not special-case a fan-out that happens to resolve to one course.
    expect(oneEntry).toBe("0/1 courses ok; 1 failed - step 1 grade-repo: Failed to fetch");
    // But no per-course label is attached to the failure line itself - only
    // one course is in play, so a label would be pure noise.
    expect(oneEntry).not.toContain("MCC");
    expect(oneEntry).not.toContain("Course A -");
  });

  it("prepends the course-count summary (buildCourseFanoutDetail's own wording) ahead of the attributed failure list for a genuine multi-course run", () => {
    const detail = buildAttributedRunDetail(
      [courseOutcome({ courseId: "c1", status: "failed" }), courseOutcome({ courseId: "c2", status: "ok" }), courseOutcome({ courseId: "c3", status: "ok" })],
      [courseGroup({ courseId: "c1", courseName: "Course A", institution: "MCC", errors: [failure({ error: "Failed to fetch" })] })]
    );
    expect(detail).toBe("2/3 courses ok; 1 failed - MCC: Course A - step 1 grade-repo: Failed to fetch");
  });

  it("omits the institution segment for a course tile with none, matching composedGroupLabel's own convention", () => {
    const detail = buildAttributedRunDetail(
      [courseOutcome({ courseId: "c1" }), courseOutcome({ courseId: "c2", status: "ok" })],
      [courseGroup({ courseId: "c1", courseName: "Course A", institution: null, errors: [failure({ error: "boom" })] })]
    );
    expect(detail).toContain("Course A - step 1 grade-repo: boom");
    expect(detail).not.toContain("null");
  });

  it("returns an empty string when there is nothing to attribute at all", () => {
    expect(buildAttributedRunDetail(undefined, [])).toBe("");
    expect(buildAttributedRunDetail([], [])).toBe("");
  });
});

describe("finalizeRunDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing (never fetches a log, never downloads) when document is not defined - the unattended case", async () => {
    await finalizeRunDownload({
      pendingRunDownloads: [entry()],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    expect(getCompleteRunLogTextAction).not.toHaveBeenCalled();
  });

  it("does nothing when there is nothing pending, even in a browser context", async () => {
    const dom = stubDom();
    await finalizeRunDownload({
      pendingRunDownloads: [],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    expect(getCompleteRunLogTextAction).not.toHaveBeenCalled();
    expect(dom.createObjectURL).not.toHaveBeenCalled();
  });

  it("never fetches the log when signed out (no user/supabase) - still downloads the single pending file unchanged", async () => {
    const dom = stubDom();
    const blob = new Blob(["content"]);

    await finalizeRunDownload({
      pendingRunDownloads: [entry({ blob, fileName: "Assignment.docx" })],
      workflowRunId: "run-1",
      ok: true,
      user: null,
      supabase: null,
      combinedFileName: "Course.zip",
    });

    expect(getCompleteRunLogTextAction).not.toHaveBeenCalled();
    expect(dom.createObjectURL).toHaveBeenCalledWith(blob);
    expect(dom.anchor.download).toBe("Assignment.docx");
  });

  it("downloads the single pending file unchanged when it is not tagged as a save-zip-to-course archive (savedZipRef unset) - AC4's 'do not regress single-step use' still holds", async () => {
    const dom = stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "COMPLETE LOG" });
    const blob = new Blob(["a real docx, not a zip this module would ever open"]);

    await finalizeRunDownload({
      pendingRunDownloads: [entry({ blob, fileName: "Assignment.docx" })],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    // The log WAS fetched (a course zip elsewhere in the run might have
    // needed it) - but this entry, having no savedZipRef, is never opened or
    // rewritten: the SAME blob reaches the download call.
    expect(getCompleteRunLogTextAction).toHaveBeenCalledWith("run-1", true);
    expect(dom.createObjectURL).toHaveBeenCalledWith(blob);
  });

  // Deliberately uses a blob that WOULD parse successfully as an archive if
  // patchEmbeddedRunLog tried to open it (unlike the plain-content blob in
  // the test above, which happens to fail to parse either way and so cannot
  // by itself prove the savedZipRef guard is what stops the patch, only
  // that a patch FAILURE degrades gracefully) - this is the test that
  // actually pins the safety boundary the module's own doc comment
  // describes: an untagged artifact is never opened AT ALL, not "opened and
  // it happened not to change anything".
  it("never even attempts to open an untagged entry, even when its blob WOULD parse as a valid archive", async () => {
    const dom = stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "COMPLETE LOG" });
    const parseableButUntaggedBlob = fakeArchiveBlob({ "some/path.txt": "content" });

    await finalizeRunDownload({
      pendingRunDownloads: [entry({ blob: parseableButUntaggedBlob, fileName: "Blackboard Export.imscc" })],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    // Byte-for-byte the SAME blob object reaches the download - proves it
    // was never round-tripped through JSZip at all (a round trip would
    // still produce equal CONTENT here, but a different Blob instance).
    expect(dom.createObjectURL).toHaveBeenCalledWith(parseableButUntaggedBlob);
  });

  it("patches the embedded run log of the ONE pending file when it IS a save-zip-to-course archive (savedZipRef set)", async () => {
    const dom = stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "COMPLETE LOG TEXT" });
    const archiveBlob = fakeArchiveBlob({
      "Week 01/Slides.pptx": "slides content",
      "Course-Wide/Run Log.txt": "OLD SNAPSHOT",
    });

    await finalizeRunDownload({
      pendingRunDownloads: [
        entry({ blob: archiveBlob, fileName: "Course Materials.zip", savedZipRef: { courseId: "c1", fileName: "Course Materials.zip" } }),
      ],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    expect(dom.createObjectURL).toHaveBeenCalledTimes(1);
    const downloadedBlob = dom.createObjectURL.mock.calls[0][0] as Blob;
    const files = await readFakeArchive(downloadedBlob);
    expect(files["Course-Wide/Run Log.txt"]).toBe("COMPLETE LOG TEXT");
    expect(files["Week 01/Slides.pptx"]).toBe("slides content");
    expect(dom.anchor.download).toBe("Course Materials.zip");
  });

  it("falls back to the original (unpatched) blob when getCompleteRunLogTextAction returns an error", async () => {
    const dom = stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ error: "Run not found." });
    const archiveBlob = fakeArchiveBlob({ "Course-Wide/Run Log.txt": "OLD SNAPSHOT" });

    await finalizeRunDownload({
      pendingRunDownloads: [
        entry({ blob: archiveBlob, fileName: "Course Materials.zip", savedZipRef: { courseId: "c1", fileName: "Course Materials.zip" } }),
      ],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    expect(dom.createObjectURL).toHaveBeenCalledWith(archiveBlob);
  });

  it("falls back to the original (unpatched) blob when getCompleteRunLogTextAction itself rejects", async () => {
    const dom = stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockRejectedValue(new Error("network blip"));
    const archiveBlob = fakeArchiveBlob({ "Course-Wide/Run Log.txt": "OLD SNAPSHOT" });

    await finalizeRunDownload({
      pendingRunDownloads: [
        entry({ blob: archiveBlob, fileName: "Course Materials.zip", savedZipRef: { courseId: "c1", fileName: "Course Materials.zip" } }),
      ],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    expect(dom.createObjectURL).toHaveBeenCalledWith(archiveBlob);
  });

  it("falls back to the original blob when a savedZipRef-tagged entry is not actually a valid archive (a corrupt read)", async () => {
    const dom = stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "COMPLETE LOG" });
    // Not JSON - FakeJSZip.loadAsync's JSON.parse throws, exercising the
    // real module's try/catch fallback.
    const corruptBlob = new Blob(["not actually a zip archive"]);

    await finalizeRunDownload({
      pendingRunDownloads: [
        entry({ blob: corruptBlob, fileName: "Course Materials.zip", savedZipRef: { courseId: "c1", fileName: "Course Materials.zip" } }),
      ],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    expect(dom.createObjectURL).toHaveBeenCalledWith(corruptBlob);
  });

  it("bundles more than one pending file into ONE outer zip, with a top-level Run Log.txt when the log text is available", async () => {
    const dom = stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "COMPLETE LOG TEXT" });

    await finalizeRunDownload({
      pendingRunDownloads: [
        entry({ blob: new Blob(["export bytes"]), fileName: "Blackboard Export.imscc" }),
        entry({
          blob: fakeArchiveBlob({ "Course-Wide/Run Log.txt": "OLD SNAPSHOT" }),
          fileName: "Course Materials.zip",
          savedZipRef: { courseId: "c1", fileName: "Course Materials.zip" },
        }),
      ],
      workflowRunId: "run-1",
      ok: true,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Python - Course Build.zip",
    });

    expect(dom.createObjectURL).toHaveBeenCalledTimes(1);
    const outerBlob = dom.createObjectURL.mock.calls[0][0] as Blob;
    const outerFiles = await readFakeArchive(outerBlob);
    // Every original entry survived, under its own name.
    expect(Object.keys(outerFiles).sort()).toEqual(
      ["Blackboard Export.imscc", "Course Materials.zip", "Run Log.txt"].sort()
    );
    // The top-level copy carries the complete text directly.
    expect(outerFiles["Run Log.txt"]).toBe("COMPLETE LOG TEXT");
    // The nested save-zip-to-course archive ALSO got its own copy patched
    // (still stored as a JSON string in this fake, but readable back out).
    const nestedArchive = JSON.parse(outerFiles["Course Materials.zip"]);
    expect(nestedArchive["Course-Wide/Run Log.txt"]).toBe("COMPLETE LOG TEXT");
    expect(dom.anchor.download).toBe("Python - Course Build.zip");
  });

  it("bundles more than one pending file with NO top-level Run Log.txt when no log text was available", async () => {
    const dom = stubDom();

    await finalizeRunDownload({
      pendingRunDownloads: [
        entry({ blob: new Blob(["a"]), fileName: "a.docx" }),
        entry({ blob: new Blob(["b"]), fileName: "b.docx" }),
      ],
      workflowRunId: "run-1",
      ok: true,
      user: null,
      supabase: null,
      combinedFileName: "Course.zip",
    });

    const outerBlob = dom.createObjectURL.mock.calls[0][0] as Blob;
    const outerFiles = await readFakeArchive(outerBlob);
    expect(Object.keys(outerFiles).sort()).toEqual(["a.docx", "b.docx"]);
  });

  it("passes `ok` straight through to getCompleteRunLogTextAction - a failed run still gets a log fetch attempt", async () => {
    stubDom();
    vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "log" });

    await finalizeRunDownload({
      pendingRunDownloads: [entry()],
      workflowRunId: "run-1",
      ok: false,
      user: fakeUser,
      supabase: fakeSupabase,
      combinedFileName: "Course.zip",
    });

    expect(getCompleteRunLogTextAction).toHaveBeenCalledWith("run-1", false);
  });

  it("cleans up the object URL after triggering the download", async () => {
    const dom = stubDom();
    await finalizeRunDownload({
      pendingRunDownloads: [entry()],
      workflowRunId: "run-1",
      ok: true,
      user: null,
      supabase: null,
      combinedFileName: "Course.zip",
    });

    expect(dom.click).toHaveBeenCalledTimes(1);
    expect(dom.appendChild).toHaveBeenCalledTimes(1);
    expect(dom.removeChild).toHaveBeenCalledTimes(1);
    expect(dom.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  // AC5 residual (docs/REGRESSION.md entry 203 AC5) - wiring: proves
  // finalizeRunDownload actually THREADS courseOutcomes/failureGroups
  // through to getCompleteRunLogTextAction's `detail` override, on top of
  // buildAttributedRunDetail's own unit coverage above.
  describe("AC5 residual - course-fan-out-prefixed detail override", () => {
    it("passes the attributed detail as getCompleteRunLogTextAction's third argument for a failed multi-course run", async () => {
      stubDom();
      vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "log" });

      await finalizeRunDownload({
        pendingRunDownloads: [entry()],
        workflowRunId: "run-1",
        ok: false,
        user: fakeUser,
        supabase: fakeSupabase,
        combinedFileName: "Course.zip",
        courseOutcomes: [courseOutcome({ courseId: "c1", status: "failed" }), courseOutcome({ courseId: "c2", status: "ok" })],
        failureGroups: [
          courseGroup({ courseId: "c1", courseName: "Course A", institution: "MCC", errors: [failure({ error: "Failed to fetch" })] }),
        ],
      });

      expect(getCompleteRunLogTextAction).toHaveBeenCalledWith(
        "run-1",
        false,
        "1/2 courses ok; 1 failed - MCC: Course A - step 1 grade-repo: Failed to fetch"
      );
    });

    it("still calls getCompleteRunLogTextAction with exactly two arguments (today's behavior, unchanged) when the caller supplies no course data - the current, not-yet-wired caller's shape", async () => {
      stubDom();
      vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "log" });

      await finalizeRunDownload({
        pendingRunDownloads: [entry()],
        workflowRunId: "run-1",
        ok: false,
        user: fakeUser,
        supabase: fakeSupabase,
        combinedFileName: "Course.zip",
      });

      expect(getCompleteRunLogTextAction).toHaveBeenCalledWith("run-1", false);
    });

    it("never overrides the builder's own text for a run that succeeded, even if failureGroups were (incorrectly) supplied", async () => {
      stubDom();
      vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "log" });

      await finalizeRunDownload({
        pendingRunDownloads: [entry()],
        workflowRunId: "run-1",
        ok: true,
        user: fakeUser,
        supabase: fakeSupabase,
        combinedFileName: "Course.zip",
        courseOutcomes: [courseOutcome()],
        failureGroups: [courseGroup({ errors: [failure()] })],
      });

      expect(getCompleteRunLogTextAction).toHaveBeenCalledWith("run-1", true);
    });

    it("falls through to the builder's own fallback (no override) when failureGroups is supplied but every course's errors list is empty", async () => {
      stubDom();
      vi.mocked(getCompleteRunLogTextAction).mockResolvedValue({ text: "log" });

      await finalizeRunDownload({
        pendingRunDownloads: [entry()],
        workflowRunId: "run-1",
        ok: false,
        user: fakeUser,
        supabase: fakeSupabase,
        combinedFileName: "Course.zip",
        courseOutcomes: [courseOutcome({ status: "ok" })],
        failureGroups: [courseGroup({ errors: [] })],
      });

      expect(getCompleteRunLogTextAction).toHaveBeenCalledWith("run-1", false);
    });
  });
});
