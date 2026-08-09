// Dedicated no-mock-jszip coverage for generate-class-openers' zip write
// site (steps.content-lectures.ts), part of docs/REGRESSION.md entry 241
// check 13's fix: jszip cannot convert a Blob to bytes under Node - it gates
// on `typeof FileReader !== "undefined"` (node_modules/jszip/lib/utils.js:457),
// which is never true under Node - so a raw Blob handed to zip.file() used
// to reject with "Can't read the data of ...". See common-cartridge.ts's
// emitContentItems for the full mechanism this sidesteps
// (`await file.blob.arrayBuffer()` before the data ever reaches jszip).
//
// registry.generate-class-openers.test.ts (this step's main coverage) mocks
// "jszip" entirely with a fake whose `.file()` ignores its content argument
// (see that file's own header comment) specifically to avoid the same
// Blob/Node limitation - which means it never actually proves the zip write
// survives a real jszip round trip. THIS file deliberately installs NO
// jszip mock, so the dynamic `await import("jszip")` inside the step's own
// "Assembling zip..." block resolves to the real package - the same one
// production code loads - and no globalThis.FileReader polyfill is
// installed anywhere in this file or this repo for this path either.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  getRepoZipAction: vi.fn(),
  generateLecturePlansAction: vi.fn(),
  generateLectureMaterialsFromScheduleAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  generateLectureFromMaterialsAction: vi.fn(),
  regenerateAnnouncementAction: vi.fn(),
  generateWeekOpener: vi.fn(),
  saveLibraryFileAction: vi.fn(),
}));

// buildDocxFromPlainText is mocked to a deterministic, real ArrayBuffer - the
// step wraps this in a REAL `new Blob(...)` (steps.content-lectures.ts's
// generate-class-openers run()), so this exercises the exact same Blob
// object shape a real docx build would hand to zip.file(), just with fixed
// content so the round-trip assertion below is exact.
vi.mock("@/lib/docx", () => ({
  buildDocxFromPlainText: vi.fn(async () => new Uint8Array([9, 8, 7, 6]).buffer),
}));

// Deliberately NO jszip mock here.

import { generateWeekOpener } from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { ScheduleWeekPlan } from "@/app/actions-types";

const step = getStepDefinition("generate-class-openers")!;

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

const SCHEDULE: ScheduleWeekPlan[] = [
  {
    week: 1,
    topic: "Stakeholder Analysis",
    summary: "Mapping stakeholders.",
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
  },
];

describe("generate-class-openers - Blob file round-trip under Node, real jszip, no FileReader polyfill (entry 241 check 13 fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateWeekOpener).mockResolvedValue({
      text: "# Class Opener: Stakeholder Analysis\n\nBody",
    });
  });

  it("typeof FileReader is undefined in this vitest node environment", () => {
    expect(typeof FileReader).toBe("undefined");
  });

  it("builds the openers zip with the real (unmocked) jszip package and the docx entry's bytes round-trip back exactly", async () => {
    let capturedZipBlob: Blob | null = null;
    const saveBundle = vi.fn<NonNullable<StepRunHelpers["saveBundle"]>>(async (blob) => {
      capturedZipBlob = blob;
    });

    // Before the fix, "Assembling zip..." -> zip.generateAsync() rejected
    // under Node with jszip's "Can't read the data of ...' - proven by the
    // sabotage check recorded in this task's own report.
    const result = await step.run({ schedule: SCHEDULE }, testHelpers({ saveBundle }), () => {});

    expect(result.outputs.count).toBe(1);
    expect(capturedZipBlob).toBeTruthy();

    const files = result.outputs.files as Array<{ name: string; role: string }>;
    const openerFile = files.find((f) => f.role === "opener");
    expect(openerFile).toBeDefined();

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await capturedZipBlob!.arrayBuffer());
    const entry = zip.file(openerFile!.name);
    expect(entry).toBeTruthy();
    const roundTripped = await entry!.async("arraybuffer");
    expect(Array.from(new Uint8Array(roundTripped))).toEqual([9, 8, 7, 6]);
  });
});
