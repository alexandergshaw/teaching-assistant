// Dedicated no-mock-jszip coverage for the READ side of docs/REGRESSION.md
// entry 241 check 13's fix: completeCourseZipRunLog (zip-run-log-completion.ts)
// calls `JSZip.loadAsync` on a Blob downloaded from storage. jszip's own
// Blob-to-bytes conversion gates on `typeof FileReader !== "undefined"`
// (node_modules/jszip/lib/utils.js:457), which is never true under Node, so
// this call rejected with "Can't read the data of ..." on every real
// unattended run before this fix - see zip-run-log-completion.ts's own
// comment at the JSZip.loadAsync call for the full mechanism, and for why
// this defect was silent: completeCourseZipRunLog's own try/catch swallowed
// the rejection into an `{ ok: false, reason: "Can't read the data of ..." }`
// result, and server-runner.ts (its only caller, at the post-run completion
// stage) discards the returned per-zip result array entirely without
// inspecting it (`await completeCourseZipRunLogs(...)` with no capture) -
// so the embedded run log in every unattended-run saved zip has most likely
// never actually been upgraded from its SNAPSHOT NOTICE header to the
// complete log, with no visible error anywhere.
//
// zip-run-log-completion.test.ts (this module's main coverage) fakes jszip
// entirely with an in-memory JSON "archive" (see that file's own header
// comment) specifically so its own tests never depend on real zip bytes -
// which means it never actually exercised jszip's real Blob-reading path
// either. THIS file deliberately installs NO jszip mock, so it uses the
// real "jszip" package throughout: building a real zip (with a real
// Blob-backed file entry) up front, handing it to completeCourseZipRunLog
// as the "downloaded" blob, and reopening the result - to prove the read
// side survives a real round trip with no globalThis.FileReader polyfill
// installed anywhere in this file or this repo for this path.
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

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

// Deliberately NO jszip mock here.

import { listCourseHubAction, appendCourseMaterialFileAction } from "@/app/actions";
import { downloadCourseZipBlob, uploadCourseZip, removeCourseZip } from "@/lib/course-files";
import { completeCourseZipRunLog, RUN_LOG_ENTRY_PATH } from "./zip-run-log-completion";

const fakeSupabase = {} as unknown as SupabaseClient<Database>;

describe("completeCourseZipRunLog - Blob round-trip under Node, real jszip, no FileReader polyfill (entry 241 check 13 fix)", () => {
  it("typeof FileReader is undefined in this vitest node environment", () => {
    expect(typeof FileReader).toBe("undefined");
  });

  it("loads a real Blob-backed saved zip, replaces the run-log entry, and every other entry's bytes survive exactly", async () => {
    const { default: JSZip } = await import("jszip");
    const realBytes = new Uint8Array([5, 6, 7, 8, 9, 200, 250, 251]);

    const sourceZip = new JSZip();
    sourceZip.file("Week 01/Handout.bin", realBytes);
    sourceZip.file(RUN_LOG_ENTRY_PATH, "OLD SNAPSHOT LOG");
    const realExistingBlob = await sourceZip.generateAsync({ type: "blob" });

    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        {
          id: "course-1",
          materialsFiles: [
            {
              name: "Materials.zip",
              path: "u1/course-1/existing.zip",
              size: realExistingBlob.size,
              addedAt: "2026-07-30T12:00:00.000Z",
            },
          ],
        },
      ] as never,
    });
    // The "downloaded" blob is a REAL Blob produced by the real jszip above
    // (never a mocked/fake JSON archive) - this is the exact type
    // completeCourseZipRunLog receives in production from
    // downloadCourseZipBlob (course-files.ts), a real Supabase Storage
    // download.
    vi.mocked(downloadCourseZipBlob).mockResolvedValue(realExistingBlob);

    let uploadedBlob: Blob | null = null;
    vi.mocked(uploadCourseZip).mockImplementation(async (_supabase, _userId, _courseId, blob) => {
      uploadedBlob = blob;
      return { path: "u1/course-1/new-object.zip" };
    });
    vi.mocked(appendCourseMaterialFileAction).mockResolvedValue({ replacedPath: "u1/course-1/existing.zip" });
    vi.mocked(removeCourseZip).mockResolvedValue(undefined);

    // Before the fix, this call rejected under Node with jszip's "Can't
    // read the data of ...", caught by completeCourseZipRunLog's own
    // try/catch and returned as `{ ok: false, reason: "Can't read the data
    // of ..." }` - proven by the sabotage check recorded in this task's own
    // report.
    const result = await completeCourseZipRunLog(
      fakeSupabase,
      "u1",
      { courseId: "course-1", fileName: "Materials.zip" },
      "COMPLETE LOG TEXT"
    );

    expect(result).toEqual({ ok: true });
    expect(uploadedBlob).toBeTruthy();

    const reopened = await JSZip.loadAsync(await uploadedBlob!.arrayBuffer());
    expect(await reopened.file(RUN_LOG_ENTRY_PATH)!.async("string")).toBe("COMPLETE LOG TEXT");
    const roundTrippedHandout = await reopened.file("Week 01/Handout.bin")!.async("uint8array");
    expect(Array.from(roundTrippedHandout)).toEqual(Array.from(realBytes));
  });
});
