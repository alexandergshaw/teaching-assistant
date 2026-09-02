import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors src/app/api/lms-generation/deck/route.test.ts's own mocking
// approach exactly (read in full before writing this file): every
// collaborator mocked at the EXACT specifier route.ts imports it from, so an
// inert mock fails loudly rather than silently falling through to a real
// implementation. Deliberately no mock for "@/lib/lms-generation/materials"
// or "@/app/actions/canvas-modules"/"@/app/actions/canvas-files-bulk"/
// "@/app/actions/grading" here - unlike the sibling route, this one never
// imports any of them (see this route's own header comment for why: there is
// no selection to gather materials from).
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({ __fake: "supabase" })) }));
vi.mock("@/app/actions/lms-syllabus-buttons", () => ({
  resolveLmsCourseRowAction: vi.fn(),
  resolveLmsCourseRowByIdAction: vi.fn(),
}));
vi.mock("@/app/actions/media", () => ({
  getDeckTemplateAction: vi.fn(),
  generateDeckFromTemplateAction: vi.fn(),
}));
vi.mock("@/lib/supabase/generated-artifacts", () => ({ saveGeneratedArtifactVersion: vi.fn() }));

import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { getDeckTemplateAction, generateDeckFromTemplateAction } from "@/app/actions/media";
import { saveGeneratedArtifactVersion } from "@/lib/supabase/generated-artifacts";
import { buildCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";
import { POST } from "./route";

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

async function readJson(res: Response) {
  return res.json();
}

const COURSE_URL = "https://canvas.example.edu/courses/100";

const FAKE_COURSE = { id: "course-1", name: "Intro to Widgets", canvasUrl: COURSE_URL, institution: "MIT", courseKind: null };

const NOT_LINKED_ERROR = {
  error: buildCourseNotLinkedMessage(COURSE_URL),
};

const FAKE_TEMPLATE = {
  id: "preset-classic-lecture",
  name: "Classic Lecture",
  description: "",
  audience: "Any level",
  tone: "clear",
  slides: [{ id: "s1", role: "title", title: "", notes: "", includeCode: false, codeLanguage: "", maxBullets: 0, loopGroupId: null, depth: "standard" }],
  loops: [],
  theme: { backgroundKind: "solid", backgroundColor: "#fff", backgroundColor2: "#eee", gradientAngle: 135, fontColor: "#000" },
};

function mockOwner() {
  vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
}
function mockResolvedCourse() {
  vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({ course: FAKE_COURSE } as never);
}
const FAKE_EXPORT_ONLY_COURSE = { id: "export-course-1", name: "WNCC Intro to Widgets", canvasUrl: null, institution: null, courseKind: null };
function mockResolvedCourseById() {
  vi.mocked(resolveLmsCourseRowByIdAction).mockResolvedValue({ course: FAKE_EXPORT_ONLY_COURSE } as never);
}
function mockTemplate() {
  vi.mocked(getDeckTemplateAction).mockResolvedValue({ template: FAKE_TEMPLATE } as never);
}
function mockSavedArtifact() {
  vi.mocked(saveGeneratedArtifactVersion).mockResolvedValue({ id: "artifact-1", version: 1 } as never);
}
function mockDeck(slides: Array<{ title: string; bullets: string[] }> = [{ title: "Loops", bullets: ["for", "while"] }]) {
  vi.mocked(generateDeckFromTemplateAction).mockResolvedValue({ presentationTitle: "Week 3: Loops", slides } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

describe("POST /api/lms-generation/deck-from-capture", () => {
  it("THE NO-TEMPLATE CASE: refuses a blank templateId with a named reason, before resolving the course", async () => {
    const res = await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured text", templateId: "" }));
    const body = await readJson(res);
    expect(body).toEqual({ error: "Pick a template before generating a deck." });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(getDeckTemplateAction).not.toHaveBeenCalled();
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("refuses when templateId is omitted entirely", async () => {
    const res = await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured text" }));
    const body = await readJson(res);
    expect(body).toEqual({ error: "Pick a template before generating a deck." });
  });

  it("the course-not-linked path returns the named error and calls no generator", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const res = await POST(
      makeReq({ courseUrl: COURSE_URL, materialsText: "captured text", templateId: "preset-classic-lecture" })
    );
    const body = await readJson(res);

    expect(body).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(getDeckTemplateAction).not.toHaveBeenCalled();
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  // THE HIGHEST-VALUE REFUSAL FOR THIS ROUTE: a blank materialsText must be
  // refused, and refused AFTER course resolution but BEFORE the template
  // lookup - the exact ordering AC7/AM-J specify.
  it("THE BLANK-MATERIALS CASE: refuses whitespace-only materialsText after resolving the course, before looking up the template", async () => {
    mockResolvedCourse();

    const res = await POST(
      makeReq({ courseUrl: COURSE_URL, materialsText: "   ", templateId: "preset-classic-lecture" })
    );
    const body = await readJson(res);

    expect(body).toEqual({ error: "The capture had no usable material to ground generation on." });
    expect(resolveLmsCourseRowAction).toHaveBeenCalledTimes(1);
    expect(getDeckTemplateAction).not.toHaveBeenCalled();
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("refuses when materialsText is omitted entirely", async () => {
    mockResolvedCourse();
    const res = await POST(makeReq({ courseUrl: COURSE_URL, templateId: "preset-classic-lecture" }));
    const body = await readJson(res);
    expect(body).toEqual({ error: "The capture had no usable material to ground generation on." });
  });

  it("a template id that resolves to nothing is refused with getDeckTemplateAction's own named reason", async () => {
    mockResolvedCourse();
    vi.mocked(getDeckTemplateAction).mockResolvedValue({ error: 'No deck template matches "bogus-id".' } as never);

    const res = await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured text", templateId: "bogus-id" }));
    const body = await readJson(res);

    expect(body).toEqual({ error: 'No deck template matches "bogus-id".' });
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  // THE PPTX GATE (AM-A): a successful generation must save `structured`
  // populated with the deck's own slides, never null and never omitted -
  // that is the ONLY thing artifactDownloadFormats gates the .pptx download
  // on. This test would still pass if `structured` were accidentally left
  // undefined and the assertion below were weaker - the explicit
  // `toEqual([...])` on the parsed slide shape is what actually proves the
  // gate is satisfied, not merely that `saveGeneratedArtifactVersion` was
  // called.
  it("a successful generation saves exactly ONE version with BOTH text and structured populated (the .pptx gate)", async () => {
    mockResolvedCourse();
    mockTemplate();
    mockDeck([{ title: "Loops", bullets: ["for", "while"] }]);
    mockSavedArtifact();

    const res = await POST(
      makeReq({
        courseUrl: COURSE_URL,
        materialsText: "captured walkthrough text",
        templateId: "preset-classic-lecture",
        moduleLabel: "Week 3",
      })
    );
    const body = await readJson(res);

    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, userId, input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(input).toMatchObject({ courseId: "course-1", kind: "deck", title: "Week 3: Loops" });
    expect(input.text).toBe("# Week 3: Loops\n\n## Loops\n- for\n- while");
    expect(input.structured).toEqual([{ title: "Loops", bullets: ["for", "while"] }]);
    expect(body).toEqual({ artifact: { id: "artifact-1", version: 1 } });
  });

  it("resolves an export selection by courseId, never by courseUrl", async () => {
    mockResolvedCourseById();
    mockTemplate();
    mockDeck([{ title: "Loops", bullets: ["for", "while"] }]);
    mockSavedArtifact();

    const res = await POST(
      makeReq({
        courseUrl: "",
        courseId: "export-course-1",
        materialsText: "captured walkthrough text",
        templateId: "preset-classic-lecture",
      })
    );
    const body = await readJson(res);

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect("error" in body).toBe(false);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "export-course-1" });
  });

  it("passes the resolved template's name into the saved prompt, grounded on materialsText", async () => {
    mockResolvedCourse();
    mockTemplate();
    mockDeck();
    mockSavedArtifact();

    await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured walkthrough text", templateId: "preset-classic-lecture" }));

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.prompt).toContain("Classic Lecture");
    expect(input.prompt).toContain("captured walkthrough text");
  });

  it("does not save a version when generation succeeds but returns zero slides", async () => {
    mockResolvedCourse();
    mockTemplate();
    mockDeck([]);

    const res = await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured walkthrough text", templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(body).toEqual({ error: "The model returned no slides for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("propagates a generator error without saving a version", async () => {
    mockResolvedCourse();
    mockTemplate();
    vi.mocked(generateDeckFromTemplateAction).mockResolvedValue({ error: "LLM quota exhausted" } as never);

    const res = await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured walkthrough text", templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(body).toEqual({ error: "LLM quota exhausted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("AN OVER-LONG GENERATION FAILS CLEANLY: an exception (e.g. the platform killing a slow call) is caught and reported, never a partial save", async () => {
    mockResolvedCourse();
    mockTemplate();
    vi.mocked(generateDeckFromTemplateAction).mockRejectedValue(new Error("The operation was aborted"));

    const res = await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured walkthrough text", templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "The operation was aborted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("an unexpected auth failure returns a 500 with the error message rather than throwing", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));

    const res = await POST(makeReq({ courseUrl: COURSE_URL, materialsText: "captured walkthrough text", templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toContain("Not authorized");
  });
});
