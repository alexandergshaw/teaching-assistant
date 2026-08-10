// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers ONLY the
// "syllabus-document" schedule source: extracting text via
// extractSyllabusTextAction and delegating to generateSchedulePlanAction
// (the same action course-description uses, with the extracted text as the
// course description), an explicit sourceMaterial field taking precedence
// over the extracted text, the "applied" courseKind resolution, and every
// resolvedSourceMaterial case - including that TOC derivation genuinely CAN
// fire on this source when the sourceMaterial looks like a bare citation,
// contrary to treating it as a source that "never" derives. See
// steps.course-schedule-from-source.fixtures.ts for the shared
// step/testHelpers helpers every source's split file now imports instead of
// redefining.
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

// Under the new direct-to-Storage transport
// (docs/upload-body-limit-acceptance-criteria.md AC2), this source uploads
// the syllabus file with the browser's own Supabase client before calling
// extractSyllabusTextAction - this mocks that client rather than reaching a
// real Supabase project. auth.getSession() supplies the user id the storage
// path's first segment needs; storage.upload() always succeeds.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
      }),
    },
  }),
}));

import { generateSchedulePlanAction, extractSyllabusTextAction } from "@/app/actions";
import { step, testHelpers } from "./steps.course-schedule-from-source.fixtures";

describe("source: syllabus-document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function syllabusFile(): File {
    return new File(["syllabus text"], "syllabus.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  it("extracts text from the upload and delegates to generateSchedulePlanAction, using the text as sourceMaterial by default", async () => {
    vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "Week 1: Intro\nWeek 2: More" });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "From Syllabus",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
      ],
    });

    const result = await step.run(
      { source: "syllabus-document", syllabus: [syllabusFile()], weeks: "1", tests: "0" },
      testHelpers(),
      () => {}
    );

    expect(extractSyllabusTextAction).toHaveBeenCalledTimes(1);
    const [fileArg] = vi.mocked(extractSyllabusTextAction).mock.calls[0];
    expect(fileArg.name).toBe("syllabus.docx");
    // AC5 item 23 / AC2 item 10: the old base64 payload is gone - this now
    // carries the storage path of an object the browser already uploaded,
    // under the authenticated user's own id (the RLS-required first path
    // segment), never the file's bytes.
    expect(typeof fileArg.storagePath).toBe("string");
    expect(fileArg.storagePath.startsWith("user-1/syllabus-uploads/")).toBe(true);
    expect(fileArg).not.toHaveProperty("base64");

    expect(generateSchedulePlanAction).toHaveBeenCalledWith(
      "Week 1: Intro\nWeek 2: More",
      1,
      0,
      "gemini",
      undefined,
      "Week 1: Intro\nWeek 2: More"
    );
    expect(result.outputs.courseTitle).toBe("From Syllabus");
  });

  it("prefers an explicit sourceMaterial over the extracted syllabus text", async () => {
    vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "extracted text" });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "T",
      schedule: [{ week: 1, topic: "t", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null }],
    });

    await step.run(
      {
        source: "syllabus-document",
        syllabus: [syllabusFile()],
        sourceMaterial: "Explicit Textbook, 3rd Ed.",
      },
      testHelpers(),
      () => {}
    );

    expect(generateSchedulePlanAction).toHaveBeenCalledWith(
      "extracted text",
      0,
      0,
      "gemini",
      undefined,
      "Explicit Textbook, 3rd Ed."
    );
  });

  it("resolves courseKind to 'applied' (not a code-implying source)", async () => {
    vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "Week 1: Intro\nWeek 2: More" });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "From Syllabus",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
      ],
    });

    const result = await step.run(
      { source: "syllabus-document", syllabus: [syllabusFile()] },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.courseKind).toBe("applied");
  });

  // Defect 1: this branch calls the EXACT SAME generateSchedulePlanAction
  // course-description does (just with the extracted syllabus text as the
  // course description) - it is NOT true that this source "never runs TOC
  // derivation." In the default case (no explicit sourceMaterial), the
  // material fed to generation is the syllabus's own extracted text -
  // normally long, parseable prose - so resolvedSourceMaterial is just that
  // text unchanged when generateSchedulePlanAction found no derived TOC.
  it("resolvedSourceMaterial is the syllabus's own extracted text when no explicit sourceMaterial and no derivation occurred", async () => {
    vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "Week 1: Intro\nWeek 2: More" });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "From Syllabus",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
      ],
    });

    const result = await step.run(
      { source: "syllabus-document", syllabus: [syllabusFile()] },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Week 1: Intro\nWeek 2: More");
  });

  // The instructor-typed case: an explicit sourceMaterial value (rather
  // than the extracted text) is what generateSchedulePlanAction actually
  // receives (see the "prefers an explicit sourceMaterial" test above), so
  // when no derivation occurs, resolvedSourceMaterial echoes THAT value,
  // not the extracted text.
  it("resolvedSourceMaterial is the explicit sourceMaterial unchanged when one was given and no derivation occurred", async () => {
    vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "extracted text" });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "T",
      schedule: [{ week: 1, topic: "t", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null }],
    });

    const result = await step.run(
      {
        source: "syllabus-document",
        syllabus: [syllabusFile()],
        sourceMaterial: "Explicit Textbook, 3rd Ed.",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe("Explicit Textbook, 3rd Ed.");
  });

  // Proves derivation genuinely CAN fire on this source (contrary to
  // treating it as a source that "never" derives): when the instructor
  // types an explicit sourceMaterial that looks like a bare citation/URL,
  // generateSchedulePlanAction's own shouldDeriveToc gate can trigger the
  // web-search derivation exactly as it would for course-description, and
  // this branch must forward that derived TOC, not the citation.
  it("resolvedSourceMaterial is the derived TOC when generateSchedulePlanAction found one for an explicit citation-like sourceMaterial", async () => {
    const derivedToc = "Module 1: Introduction\nModule 2: Footprinting";
    vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "extracted text" });
    vi.mocked(generateSchedulePlanAction).mockResolvedValue({
      courseTitle: "CEH v12",
      schedule: [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
      ],
      derivedToc,
      derivedSources: [{ title: "uCertify CEH v12 course outline", uri: "https://example.com/toc" }],
    });

    const result = await step.run(
      {
        source: "syllabus-document",
        syllabus: [syllabusFile()],
        sourceMaterial: "https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1",
      },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.resolvedSourceMaterial).toBe(derivedToc);
  });

  it("fails with a message naming the missing field when no syllabus is uploaded", async () => {
    await expect(
      step.run({ source: "syllabus-document", syllabus: [] }, testHelpers(), () => {})
    ).rejects.toThrow(/Upload a syllabus document/);
    expect(extractSyllabusTextAction).not.toHaveBeenCalled();
  });

  it("propagates an error returned by extractSyllabusTextAction", async () => {
    vi.mocked(extractSyllabusTextAction).mockResolvedValue({ error: "No text found in that file." });
    await expect(
      step.run({ source: "syllabus-document", syllabus: [syllabusFile()] }, testHelpers(), () => {})
    ).rejects.toThrow("No text found in that file.");
    expect(generateSchedulePlanAction).not.toHaveBeenCalled();
  });
});
