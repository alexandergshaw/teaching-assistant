// Dedicated no-mock-jszip coverage for save-zip-to-course's terminal zip
// write site (steps.course-setup.storage.ts), part of docs/REGRESSION.md
// entry 241 check 13's fix: jszip cannot convert a Blob to bytes under Node
// - it gates on `typeof FileReader !== "undefined"`
// (node_modules/jszip/lib/utils.js:457), which is never true under Node -
// so a raw Blob handed to zip.file() used to reject with "Can't read the
// data of ...". See common-cartridge.ts's emitContentItems for the full
// mechanism this sidesteps (`await file.blob.arrayBuffer()` before the data
// ever reaches jszip).
//
// steps.course-setup.storage.test.ts (this step's main coverage) fakes jszip
// entirely with a lightweight (path, blob) recorder that never produces real
// zip bytes (see that file's own header comment for why) specifically to
// avoid the same Blob/Node limitation - which means it never actually
// proves the terminal zip survives a real jszip round trip. THIS file
// deliberately installs NO jszip mock, so the step's own dynamic `await
// import("jszip")` resolves to the real package throughout (both the write
// and, in this test, the reopen) - and no globalThis.FileReader polyfill is
// installed anywhere in this file or this repo for this path either.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  setCourseCsvAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  getAutomationRunLogAction: vi.fn(),
  getNotYetRunStepTypesAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  createPageAction: vi.fn(),
  updatePageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  generateCourseFaqAction: vi.fn(),
}));

// Deliberately NO jszip mock here.

import { listCourseHubAction } from "@/app/actions";
import { courseSetupStorageSteps } from "./steps.course-setup.storage";
import type { StepRunHelpers } from "../registry-helpers";
import type { GeneratedCourseFile } from "../types";

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

describe("save-zip-to-course - Blob file round-trip under Node, real jszip, no FileReader polyfill (entry 241 check 13 fix)", () => {
  it("typeof FileReader is undefined in this vitest node environment", () => {
    expect(typeof FileReader).toBe("undefined");
  });

  it("bundles a real Blob-backed generated file with the real jszip package and the entry's bytes round-trip back exactly", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-1", courseCode: "CS-101", name: "Intro to CS" }] as never,
    });

    const realBytes = new Uint8Array([10, 20, 30, 40, 200, 250, 251, 252]);
    const file: GeneratedCourseFile = {
      name: "Handout.bin",
      blob: new Blob([realBytes]),
      mimeType: "application/octet-stream",
      weekNumber: 1,
      sortOrder: 1,
      role: "slides",
    };

    let capturedZipBlob: Blob | null = null;
    const saveCourseMaterialFile = vi.fn<NonNullable<StepRunHelpers["saveCourseMaterialFile"]>>(
      async (_courseId, blob) => {
        capturedZipBlob = blob;
      }
    );

    // Before the fix, this run() call rejected under Node with jszip's
    // "Can't read the data of 'Week 01/Handout.bin'. Is it in a supported
    // JavaScript type (String, Blob, ArrayBuffer, etc) ?" - proven by the
    // sabotage check recorded in this task's own report.
    const result = await saveZipToCourse.run(
      { hubCourse: "course-1", files: [file] },
      testHelpers({ saveCourseMaterialFile }),
      () => {}
    );

    expect(saveCourseMaterialFile).toHaveBeenCalledTimes(1);
    expect(capturedZipBlob).toBeTruthy();
    expect(result.summary.kind).toBe("text");

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await capturedZipBlob!.arrayBuffer());
    const entry = zip.file("Week 01/Handout.bin");
    expect(entry).toBeTruthy();
    const roundTripped = await entry!.async("arraybuffer");
    expect(Array.from(new Uint8Array(roundTripped))).toEqual(Array.from(realBytes));
  });
});
