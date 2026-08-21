import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors src/app/actions/lms-generation.test.ts's own mocking approach
// (read in full before writing this file): every collaborator mocked at the
// EXACT specifier route.ts imports it from, so an inert mock fails loudly
// rather than silently falling through to a real implementation.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({ __fake: "supabase" })) }));
vi.mock("@/app/actions/lms-syllabus-buttons", () => ({
  resolveLmsCourseRowAction: vi.fn(),
  resolveLmsCourseRowByIdAction: vi.fn(),
}));
vi.mock("@/app/actions/canvas-files-bulk", () => ({ getPageAction: vi.fn(), previewFileAction: vi.fn() }));
vi.mock("@/app/actions/grading", () => ({ fetchCanvasMetaAction: vi.fn() }));
vi.mock("@/app/actions/canvas-modules", () => ({ listCourseContentAction: vi.fn() }));
vi.mock("@/app/actions/media", () => ({
  getDeckTemplateAction: vi.fn(),
  generateDeckFromTemplateAction: vi.fn(),
}));
vi.mock("@/lib/supabase/generated-artifacts", () => ({ saveGeneratedArtifactVersion: vi.fn() }));
vi.mock("@/lib/lms-generation/materials", () => ({
  gatherSelectionMaterials: vi.fn(),
  expandModuleSelection: vi.fn(),
}));

import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { listCourseContentAction } from "@/app/actions/canvas-modules";
import { getDeckTemplateAction, generateDeckFromTemplateAction } from "@/app/actions/media";
import { saveGeneratedArtifactVersion } from "@/lib/supabase/generated-artifacts";
import { gatherSelectionMaterials, expandModuleSelection } from "@/lib/lms-generation/materials";
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

// M15 (adversarial review, WAVE 11C, DEFECT 1): built from the real
// buildCourseNotLinkedMessage rather than hand-spelled - course-not-linked.ts
// is the sole owner of this message's wording (see that file's own header
// comment), so a future rewording updates this fixture for free instead of
// needing a hand-edit here too.
const NOT_LINKED_ERROR = {
  error: buildCourseNotLinkedMessage(COURSE_URL),
};

const SOME_ITEM = {
  source: "live" as const,
  key: "live:10:1",
  moduleId: 10,
  item: {
    id: 1,
    moduleId: 10,
    title: "x",
    type: "Page",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: null,
    contentId: null,
    dueAt: null,
    pointsPossible: null,
    htmlUrl: null,
    externalUrl: null,
  },
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

// AC1/AC2 defect fix (docs/REGRESSION.md - "generate from an export
// selection" defect): a saved course with no Canvas connection at all,
// resolvable only via resolveLmsCourseRowByIdAction (the courseId path) -
// resolveLmsCourseRowAction (the courseUrl path) could never match it, since
// ContentTab.tsx sends "" for `courseUrl` on every export-sourced selection.
const FAKE_EXPORT_ONLY_COURSE = { id: "export-course-1", name: "WNCC Intro to Widgets", canvasUrl: null, institution: null, courseKind: null };
function mockResolvedCourseById() {
  vi.mocked(resolveLmsCourseRowByIdAction).mockResolvedValue({ course: FAKE_EXPORT_ONLY_COURSE } as never);
}
function mockMaterials(materialsText: string, notes: string[] = []) {
  vi.mocked(gatherSelectionMaterials).mockResolvedValue({ materialsText, notes } as never);
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

describe("POST /api/lms-generation/deck", () => {
  it("rejects an empty selection without resolving the course or picking a template", async () => {
    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [], templateId: "preset-classic-lecture" }));
    const body = await readJson(res);
    expect(body).toEqual({ error: "Select at least one item to generate from." });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
  });

  it("THE NO-TEMPLATE CASE: refuses a blank templateId with a named reason and calls no generator", async () => {
    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "" }));
    const body = await readJson(res);
    expect(body).toEqual({ error: "Pick a template before generating a deck." });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(getDeckTemplateAction).not.toHaveBeenCalled();
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("refuses when templateId is omitted entirely", async () => {
    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM] }));
    const body = await readJson(res);
    expect(body).toEqual({ error: "Pick a template before generating a deck." });
  });

  it("the course-not-linked path returns the named error and calls no generator", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const res = await POST(
      makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "preset-classic-lecture" })
    );
    const body = await readJson(res);

    expect(body).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("reports the no-usable-material error and calls no generator when materials gathering finds nothing", async () => {
    mockResolvedCourse();
    mockMaterials("   ", []);

    const res = await POST(
      makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "preset-classic-lecture" })
    );
    const body = await readJson(res);

    expect(body).toEqual({ error: "The selected item(s) had no usable material to ground generation on." });
    expect(getDeckTemplateAction).not.toHaveBeenCalled();
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
  });

  it("a template id that resolves to nothing is refused with getDeckTemplateAction's own named reason", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(getDeckTemplateAction).mockResolvedValue({ error: 'No deck template matches "bogus-id".' } as never);

    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "bogus-id" }));
    const body = await readJson(res);

    expect(body).toEqual({ error: 'No deck template matches "bogus-id".' });
    expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("a successful generation saves exactly ONE version with BOTH text and structured populated", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a note"]);
    mockTemplate();
    mockDeck([
      { title: "Loops", bullets: ["for", "while"] },
    ]);
    mockSavedArtifact();

    const res = await POST(
      makeReq({
        courseUrl: COURSE_URL,
        items: [SOME_ITEM],
        templateId: "preset-classic-lecture",
        moduleLabel: "Week 3",
      })
    );
    const body = await readJson(res);

    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, userId, input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(input).toMatchObject({ courseId: "course-1", kind: "deck", title: "Week 3: Loops" });
    // THE STRUCTURED SEAM: both halves saved from ONE generation.
    expect(input.text).toBe("# Week 3: Loops\n\n## Loops\n- for\n- while");
    expect(input.structured).toEqual([{ title: "Loops", bullets: ["for", "while"] }]);
    expect(body).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: ["a note"] });
  });

  // AC1/AC2 defect fix: an export-sourced selection has no Canvas URL at all
  // (`courseUrl` is always "" - ContentTab.tsx), so it must resolve via
  // `courseId` instead of the URL-matching resolveLmsCourseRowAction, which
  // could never succeed against an empty string.
  it("resolves an export selection by courseId, never by courseUrl", async () => {
    mockResolvedCourseById();
    mockMaterials("grounded materials", []);
    mockTemplate();
    mockDeck([{ title: "Loops", bullets: ["for", "while"] }]);
    mockSavedArtifact();

    const res = await POST(
      makeReq({
        courseUrl: "",
        courseId: "export-course-1",
        items: [SOME_ITEM],
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

  it("passes the resolved template's name into the saved prompt", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockTemplate();
    mockDeck();
    mockSavedArtifact();

    await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "preset-classic-lecture" }));

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.prompt).toContain("Classic Lecture");
  });

  it("does not save a version when generation succeeds but returns zero slides", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockTemplate();
    mockDeck([]);

    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(body).toEqual({ error: "The model returned no slides for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("propagates a generator error without saving a version", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockTemplate();
    vi.mocked(generateDeckFromTemplateAction).mockResolvedValue({ error: "LLM quota exhausted" } as never);

    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(body).toEqual({ error: "LLM quota exhausted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("AN OVER-LONG GENERATION FAILS CLEANLY: an exception (e.g. the platform killing a slow call) is caught and reported, never a partial save", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockTemplate();
    vi.mocked(generateDeckFromTemplateAction).mockRejectedValue(new Error("The operation was aborted"));

    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "The operation was aborted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  describe("whole-module selections", () => {
    const FAKE_MODULES = [{ id: 10, name: "Week 1", position: 1, published: true, itemsCount: 1, items: [] }];

    it("a module-only selection fetches the live course content and expands it before gathering materials", async () => {
      mockResolvedCourse();
      vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "Intro to Widgets", modules: FAKE_MODULES, pages: [] } as never);
      vi.mocked(expandModuleSelection).mockReturnValue([SOME_ITEM] as never);
      mockMaterials("grounded materials from the whole module");
      mockTemplate();
      mockDeck();
      mockSavedArtifact();

      const res = await POST(
        makeReq({ courseUrl: COURSE_URL, items: [], moduleIds: [10], templateId: "preset-classic-lecture" })
      );
      const body = await readJson(res);

      expect(listCourseContentAction).toHaveBeenCalledWith(COURSE_URL, "MIT");
      expect(expandModuleSelection).toHaveBeenCalledWith([], ["live:10"], FAKE_MODULES);
      expect(gatherSelectionMaterials).toHaveBeenCalledWith([SOME_ITEM], expect.anything());
      expect(body).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
    });

    it("propagates a listCourseContentAction failure without calling the generator", async () => {
      mockResolvedCourse();
      vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);

      const res = await POST(
        makeReq({ courseUrl: COURSE_URL, items: [], moduleIds: [10], templateId: "preset-classic-lecture" })
      );
      const body = await readJson(res);

      expect(body).toEqual({ error: "Canvas is down" });
      expect(gatherSelectionMaterials).not.toHaveBeenCalled();
      expect(generateDeckFromTemplateAction).not.toHaveBeenCalled();
      expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
    });
  });

  it("an unexpected auth failure returns a 500 with the error message rather than throwing", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));

    const res = await POST(makeReq({ courseUrl: COURSE_URL, items: [SOME_ITEM], templateId: "preset-classic-lecture" }));
    const body = await readJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toContain("Not authorized");
  });
});
