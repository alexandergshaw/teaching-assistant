// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "course-cartridge" (.imscc upload) schedule source: mapping the parsed
// cartridge's modules through the shared courseStructureToSchedule
// normalizer, title fallbacks (hubCourse tile name, then a generic default),
// required-field validation, the "applied" courseKind resolution (a
// cartridge carries no coding signal), resolvedSourceMaterial pass-through,
// and (docs/REGRESSION.md entries 196/202/206) the self-consumption guard
// that refuses an upload carrying Course Build's own
// ta-cartridge-generated.json stamp. See
// steps.course-schedule-from-source.fixtures.ts for the shared
// step/testHelpers/scheduleSummary/cartridgeFile helpers - cartridgeFile in
// particular is shared with the placeholder-topic-guard split file, which
// exercises this SAME source.
//
// Only parseCartridgeBlob is mocked here (via importOriginal, below) -
// detectAppGeneratedCartridge is left as the REAL function from
// src/lib/cartridge-import.ts. This lets the "self-consumption guard"
// describe block below exercise the actual stamp-reading logic against a
// real JSZip-built fixture (hand-forged with buildCartridgeStampJson, the
// exact writer-side helper cartridge-import-stamp.ts exposes for this
// purpose - see that describe block's own comment for why this file uses
// the hand-forged route rather than the real buildCommonCartridge writer)
// instead of a test merely asserting the step calls a mocked boolean. It
// also means every PRE-EXISTING test below - which all upload cartridgeFile()
// from the shared fixtures module, a fake `File(["zip-bytes"], ...)` that is
// not a valid zip at all - keeps passing unchanged for free:
// detectAppGeneratedCartridge's own contract (cartridge-import.ts:487) is to
// resolve false, never throw, on exactly this kind of unparseable input, the
// same "not app-generated" answer these tests already needed before the
// guard existed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { buildCartridgeStampJson, CARTRIDGE_STAMP_PATH } from "@/lib/cartridge-import-stamp";

vi.mock("@/app/actions", () => ({
  generateSchedulePlanAction: vi.fn(),
  generateSchedulePlanFromRepoAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  extractSyllabusTextAction: vi.fn(),
}));

vi.mock("@/lib/cartridge-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cartridge-import")>();
  return { ...actual, parseCartridgeBlob: vi.fn() };
});

import { listCourseHubAction } from "@/app/actions";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { step, testHelpers, scheduleSummary, cartridgeFile } from "./steps.course-schedule-from-source.fixtures";

describe("source: course-cartridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the parsed cartridge's modules through the shared normalizer", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Biology 101",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [
        { name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }, { title: "  ", type: "" }] },
        { name: "Module 2", position: 2, items: [{ title: "Reading", type: "" }] },
      ],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    expect(parseCartridgeBlob).toHaveBeenCalledTimes(1);
    expect(result.outputs.courseTitle).toBe("Biology 101");
    expect(result.outputs.weeks).toBe(2);
    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({ week: 1, topic: "Module 1", summary: "Covers: Syllabus" });
    expect(summary.schedule[1]).toMatchObject({ week: 2, topic: "Module 2", summary: "Covers: Reading" });
    // Defect 2: a cartridge carries no coding signal, so it keeps today's
    // "applied" default - only "codebase" implies a programming course.
    expect(result.outputs.courseKind).toBe("applied");
  });

  it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Biology 101",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }] }],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      {
        source: "course-cartridge",
        cartridge: [cartridgeFile()],
        sourceMaterial: "Hand-pasted TOC the instructor typed",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
  });

  it("falls back to the hubCourse tile's name when the cartridge has no title", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: null,
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 1", position: 1, items: [] }],
      rubrics: [],
      hasCourseSettings: true,
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "tile-1", name: "Fallback Course Name" } as never],
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()], hubCourse: "tile-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseTitle).toBe("Fallback Course Name");
  });

  it("falls back to a generic title when the cartridge has no title and no hubCourse is bound", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: null,
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 1", position: 1, items: [] }],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseTitle).toBe("Course");
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("fails with a message naming the missing field when no cartridge is uploaded", async () => {
    await expect(
      step.run({ source: "course-cartridge", cartridge: [] }, testHelpers(), () => {})
    ).rejects.toThrow(/Upload a course cartridge/);
    expect(parseCartridgeBlob).not.toHaveBeenCalled();
  });

  it("fails rather than reporting success when the cartridge has no modules", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Empty Course",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [],
      rubrics: [],
      hasCourseSettings: true,
    });

    await expect(
      step.run({ source: "course-cartridge", cartridge: [cartridgeFile()] }, testHelpers(), () => {})
    ).rejects.toThrow(/no weeks were produced/);
  });
});

// docs/REGRESSION.md entries 196/202/206: entry 202's DB `generated`/
// hasOnlyGeneratedExports flag (src/lib/courses-table-helpers.ts) only
// protects the sibling "tile-export" branch in
// steps.course-schedule-from-source.ts, because that branch reads a course
// tile's saved exports list - a row that HAS a DB flag. This source has no
// course tile at all (a fresh upload has no DB row for a flag to live on),
// so entry 206's stamp defense (readCartridgeStamp,
// cartridge-import-stamp.ts) is the only mechanism that can catch a
// downloaded-then-re-uploaded Course Build cartridge here, and before this
// guard nothing wired it into this branch at all - see
// steps.course-schedule-from-source.ts's own comment on this guard, just
// above its call site in the "course-cartridge" branch.
//
// Fixture choice: buildCommonCartridge (common-cartridge.ts) is the "real
// writer" that stamps unconditionally, and would in principle be the
// stronger fixture (a test that stays true even if the stamp FORMAT ever
// changes, not just its file path). It is not used here because
// common-cartridge.ts is being edited concurrently by another agent in this
// same repo at the time this test was written, and this file's own
// pre-existing describe block for the OTHER production call site of this
// guard (steps.weekly-announcement-schedule.test.ts's "AC1 item 5" block)
// already hand-forges the stamp directly with buildCartridgeStampJson rather
// than routing through the real writer - so this mirrors that already-
// established, already-reviewed pattern rather than inventing a third way.
// detectAppGeneratedCartridge itself (the reader half) is exercised for
// real, unmocked - see this file's own header comment.
describe("self-consumption guard (docs/REGRESSION.md entries 196/202/206): course-cartridge refuses Course Build's own output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses an app-generated cartridge (real stamp) with the exact message, and never reaches parseCartridgeBlob", async () => {
    const zip = new JSZip();
    zip.file(CARTRIDGE_STAMP_PATH, buildCartridgeStampJson({ title: "Some course" }));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "export.imscc", { type: "application/octet-stream" });

    await expect(
      step.run({ source: "course-cartridge", cartridge: [file] }, testHelpers(), () => {})
    ).rejects.toThrow(
      "The uploaded course cartridge was produced by Course Build itself, not exported from a real course - using it as a course source would feed the app its own generated output back in as input. Upload the LMS's own export instead (or pick a different source) before using the Course cartridge source."
    );
    expect(parseCartridgeBlob).not.toHaveBeenCalled();
  });

  // The anti-regression half - matters as much as the refusal above: a
  // genuine (unstamped) upload must still reach parseCartridgeBlob and build
  // a schedule exactly as every other test in this file already proves,
  // now routed through a REAL (not fake-bytes) zip so the real
  // detectAppGeneratedCartridge has actual zip content to inspect and
  // correctly resolves false rather than merely failing to unzip.
  it("still parses a genuine (unstamped) cartridge and builds a schedule exactly as before", async () => {
    const zip = new JSZip();
    zip.file(
      "course_settings/module_meta.xml",
      `<?xml version="1.0"?><modules xmlns="http://canvas.instructure.com/xsd/cccv1p0"><module identifier="m1"><title>Module 1</title><items></items></module></modules>`
    );
    zip.file(
      "imsmanifest.xml",
      `<?xml version="1.0"?><manifest identifier="man1"><resources></resources></manifest>`
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "export.imscc", { type: "application/octet-stream" });

    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "Real Course",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }] }],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run({ source: "course-cartridge", cartridge: [file] }, testHelpers(), () => {});

    expect(parseCartridgeBlob).toHaveBeenCalledTimes(1);
    expect(result.outputs.courseTitle).toBe("Real Course");
    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({ week: 1, topic: "Module 1", summary: "Covers: Syllabus" });
  });
});
