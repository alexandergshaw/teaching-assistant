import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking discipline as selection-chat-context.test.ts (read in full
// before this file was written): every module this action imports for I/O
// is mocked at its exact import specifier, so an inert mock fails loudly
// rather than silently falling through to a real implementation.
//
// NOT mocked, per that same precedent's own rule ("pure leaves are imported
// for real, only I/O is mocked"):
//   - @/lib/visualizer (matchConcept/VISUALIZER_TOPICS/topicByKey/
//     creatableTopics) - an existing, pure, dependency-free module.
//   - @/lib/live-class/links (resolveVisualizerLinks) - likewise pure.
//   - @/lib/course-canvas-url-match (normalizeCanvasAcronymInput) - likewise.
//   - @/lib/visualizer/selection-coverage - Contract 1's pure classification
//     leaf, owned by sibling file set A and built concurrently with this
//     file. Until that module lands, this file cannot compile - the same
//     situation selection-chat-context.test.ts documents in its own closing
//     comment for its sibling dependency.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/app/actions/lms-syllabus-buttons", () => ({
  resolveLmsCourseRowAction: vi.fn(),
  resolveLmsCourseRowByIdAction: vi.fn(),
}));
vi.mock("@/app/actions/canvas-modules", () => ({
  listCourseContentAction: vi.fn(),
  createModuleItemAction: vi.fn(),
}));
vi.mock("@/app/actions/canvas-files-bulk", () => ({ getPageAction: vi.fn(), previewFileAction: vi.fn() }));
vi.mock("@/app/actions/grading", () => ({ fetchCanvasMetaAction: vi.fn() }));
vi.mock("@/lib/lms-generation/materials", () => ({
  gatherSelectionMaterials: vi.fn(),
  expandModuleSelection: vi.fn(),
}));
vi.mock("@/app/actions/live-class", () => ({ loadVisualizerIndexAction: vi.fn() }));
// createVisualizerConceptAction is mocked here NOT because this file calls it
// (createVisualizerPagesForGapsAction, the one caller, moved to
// src/app/api/visualizer/create/route.ts - see that route's own test file
// for its coverage) but because linkVisualizerPagesIntoModuleAction's own
// C7 test below asserts this action is NEVER called from this file.
vi.mock("@/app/actions/visualizer", () => ({ createVisualizerConceptAction: vi.fn() }));
vi.mock("@/app/actions/visualization-concepts-generator", () => ({ extractVisualizationConceptsAction: vi.fn() }));

import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { listCourseContentAction, createModuleItemAction } from "@/app/actions/canvas-modules";
import { gatherSelectionMaterials, expandModuleSelection } from "@/lib/lms-generation/materials";
import { loadVisualizerIndexAction } from "@/app/actions/live-class";
import { createVisualizerConceptAction } from "@/app/actions/visualizer";
import { extractVisualizationConceptsAction } from "@/app/actions/visualization-concepts-generator";
import { visualizerLinkTitle, VISUALIZER_LINK_MAX_ITEMS, type CoveredConcept, type GapConcept } from "@/lib/visualizer/selection-coverage";
import {
  scanSelectionForVisualizerCoverageAction,
  linkVisualizerPagesIntoModuleAction,
} from "./visualizer-selection";
import {
  COURSE_URL,
  FAKE_MODULES,
  NOT_LINKED_ERROR,
  mockCourseContent,
  mockOwner,
  mockResolvedCourse,
  mockResolvedCourseById,
} from "./lms-generation.fixtures";
import fs from "fs";
import path from "path";
import { VISUALIZER_SCAN_MAX_CONCEPTS } from "@/lib/visualizer/selection-coverage";

// Same shape as selection-chat-context.test.ts's own makeLiveItem - one
// resolved live selection entry, the shape gatherSelectionMaterials/
// expandModuleSelection actually consume (D6).
function makeLiveItem(id: number) {
  return {
    source: "live" as const,
    key: `live:10:${id}`,
    moduleId: 10,
    item: {
      id,
      moduleId: 10,
      title: `Item ${id}`,
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
}

function mockMaterials(materialsText: string, notes: string[] = []) {
  vi.mocked(gatherSelectionMaterials).mockResolvedValue({ materialsText, notes } as never);
}

// Real navItems shapes (VisualizerIndexEntry - the parseNavItems output
// shape, D6): "python" is a creatable topic (VISUALIZER_TOPICS), "html" is
// one of the five UnderConstruction stubs (see src/lib/visualizer.ts's own
// doc comment) - a deliberate pairing so one fixture index exercises both an
// A4 "covered" outcome and an A4 "topic-not-creatable" outcome without any
// hand-rolled topic data of this file's own.
const FOR_LOOPS_URL = "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops";
const INDEX_ENTRIES = [
  { topicExport: "pythonNavItems", label: "For Loops", value: "for-loops" },
  { topicExport: "htmlNavItems", label: "Semantic Tags", value: "semantic-tags" },
];

function mockIndex(entries: typeof INDEX_ENTRIES = INDEX_ENTRIES) {
  vi.mocked(loadVisualizerIndexAction).mockResolvedValue({ entries } as never);
}

function mockExtracted(concepts: Array<{ concept: string; evidence: string }>) {
  vi.mocked(extractVisualizationConceptsAction).mockResolvedValue({ concepts } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

describe("scanSelectionForVisualizerCoverageAction", () => {
  it("is owner-scoped - requireOwner is called even on the earliest (empty-selection) refusal", async () => {
    await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [] });
    expect(requireOwner).toHaveBeenCalled();
  });

  it("A6: rejects an empty selection (no items, no moduleIds) without resolving the course", async () => {
    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [] });

    expect("error" in result).toBe(true);
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("propagates a course-resolution error verbatim, with NO courseNotLinked flag widening the error arm", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect(result).toEqual(NOT_LINKED_ERROR);
    expect("courseNotLinked" in (result as object)).toBe(false);
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("resolves an export-sourced selection by courseId, never by courseUrl", async () => {
    mockResolvedCourseById();
    mockMaterials("some material");
    mockExtracted([{ concept: "For Loops", evidence: "ev" }]);
    mockIndex();

    await scanSelectionForVisualizerCoverageAction({
      courseUrl: "",
      courseId: "export-course-1",
      items: [makeLiveItem(1)],
    });

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
  });

  it("threads a host-less courseUrl's acronym through to resolveLmsCourseRowAction", async () => {
    mockResolvedCourse();
    mockMaterials("some material");
    mockExtracted([{ concept: "For Loops", evidence: "ev" }]);
    mockIndex();

    await scanSelectionForVisualizerCoverageAction({
      courseUrl: "/courses/10287",
      acronym: "WNCC",
      items: [makeLiveItem(1)],
    });

    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith("/courses/10287", "WNCC");
  });

  it("A2: a whole-module selection fetches a FRESH module tree and expands it before gathering", async () => {
    mockResolvedCourse();
    mockCourseContent();
    vi.mocked(expandModuleSelection).mockReturnValue([makeLiveItem(1), makeLiveItem(2)] as never);
    mockMaterials("grounded materials");
    mockExtracted([{ concept: "For Loops", evidence: "ev" }]);
    mockIndex();

    await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [], moduleIds: [10] });

    expect(listCourseContentAction).toHaveBeenCalledWith(COURSE_URL, "MIT");
    expect(expandModuleSelection).toHaveBeenCalledWith([], ["live:10"], FAKE_MODULES);
    expect(gatherSelectionMaterials).toHaveBeenCalledWith([makeLiveItem(1), makeLiveItem(2)], expect.anything());
  });

  it("an items-only selection never fetches the live course content (no repo-sourced key can reach the server payload via this path)", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockExtracted([{ concept: "For Loops", evidence: "ev" }]);
    mockIndex();

    await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(expandModuleSelection).not.toHaveBeenCalled();
  });

  it("propagates a listCourseContentAction failure without calling gatherSelectionMaterials", async () => {
    mockResolvedCourse();
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [], moduleIds: [10] });

    expect(result).toEqual({ error: "Canvas is down" });
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("A6: a gather that produces no usable text is refused before extraction runs", async () => {
    mockResolvedCourse();
    mockMaterials("   ");

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect("error" in result).toBe(true);
    expect(extractVisualizationConceptsAction).not.toHaveBeenCalled();
  });

  it("A6: an extractor error is propagated, and the visualizer index is never loaded", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(extractVisualizationConceptsAction).mockResolvedValue({ error: "extraction failed" } as never);

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect(result).toEqual({ error: "extraction failed" });
    expect(loadVisualizerIndexAction).not.toHaveBeenCalled();
  });

  it("A6: an extraction that finds zero concepts is refused distinctly from every other refusal", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockExtracted([]);

    const emptySelectionResult = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [] });
    const noTextResult = await (async () => {
      vi.clearAllMocks();
      mockOwner();
      mockResolvedCourse();
      mockMaterials("   ");
      return scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });
    })();
    vi.clearAllMocks();
    mockOwner();
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockExtracted([]);
    const noConceptsResult = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect("error" in noConceptsResult).toBe(true);
    // A6's four refusals must each be a SPECIFIC, distinguishable message -
    // pinned here as pairwise inequality (never rendering "found nothing" as
    // the same message as any other refusal), not as prose spelling (D7).
    expect((noConceptsResult as { error: string }).error).not.toEqual((emptySelectionResult as { error: string }).error);
    expect((noConceptsResult as { error: string }).error).not.toEqual((noTextResult as { error: string }).error);
  });

  it("A6/A4: an unreachable visualizer index is its own distinguishable refusal, never a silent all-gaps fallback", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockExtracted([{ concept: "For Loops", evidence: "ev" }]);
    vi.mocked(loadVisualizerIndexAction).mockResolvedValue({ error: "GitHub is unreachable" } as never);

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect(result).toEqual({ error: "GitHub is unreachable" });
  });

  it("A4/A5: classifies covered (creatable match), topic-not-creatable gap, and no-match gap correctly, surfaces notes verbatim, and writes nothing", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a gather note"]);
    mockExtracted([
      { concept: "For Loops", evidence: "loop evidence" },
      { concept: "Semantic Tags", evidence: "tag evidence" },
      { concept: "Quantum Foo", evidence: "foo evidence" },
    ]);
    mockIndex();

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect("error" in result).toBe(false);
    const success = result as { covered: CoveredConcept[]; gaps: GapConcept[]; notes: string[] };
    expect(success.covered).toEqual([
      expect.objectContaining({ concept: "For Loops", url: FOR_LOOPS_URL, topicKey: "python" }),
    ]);
    expect(success.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ concept: "Semantic Tags", reason: "topic-not-creatable" }),
        expect.objectContaining({ concept: "Quantum Foo", reason: "no-match" }),
      ])
    );
    expect(success.gaps).toHaveLength(2);
    expect(success.notes).toEqual(["a gather note"]);

    // A5: a report, not a mutation.
    expect(createModuleItemAction).not.toHaveBeenCalled();
    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
  });

  // SHOULD-FIX 6: the real ceiling (clampDeckConcepts' own max of 20) must
  // actually be requested, not left to silently fall back to the default of
  // 8 by passing `undefined`.
  it("SHOULD-FIX 6: passes VISUALIZER_SCAN_MAX_CONCEPTS (20) as maxConcepts to the extractor, never undefined", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockExtracted([{ concept: "For Loops", evidence: "ev" }]);
    mockIndex();

    await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect(extractVisualizationConceptsAction).toHaveBeenCalledWith(
      "grounded materials",
      VISUALIZER_SCAN_MAX_CONCEPTS,
      undefined
    );
  });

  it("SHOULD-FIX 6: notes a truncated extraction when the extractor returns exactly the cap, so a scan never silently under-reports", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a gather note"]);
    mockExtracted(
      Array.from({ length: VISUALIZER_SCAN_MAX_CONCEPTS }, (_, i) => ({ concept: `Concept ${i}`, evidence: "ev" }))
    );
    mockIndex([]);

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect("error" in result).toBe(false);
    const success = result as { notes: string[] };
    expect(success.notes).toContain("a gather note");
    expect(success.notes.some((n) => n.includes(String(VISUALIZER_SCAN_MAX_CONCEPTS)))).toBe(true);
  });

  it("SHOULD-FIX 6: does NOT add a truncation note when the extraction returns fewer than the cap", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a gather note"]);
    mockExtracted([{ concept: "For Loops", evidence: "ev" }]);
    mockIndex();

    const result = await scanSelectionForVisualizerCoverageAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect("error" in result).toBe(false);
    const success = result as { notes: string[] };
    expect(success.notes).toEqual(["a gather note"]);
  });
});

describe("linkVisualizerPagesIntoModuleAction", () => {
  const MODULE_ID = 20;

  function coveredConcept(concept: string, url: string): CoveredConcept {
    return { concept, url, topicKey: "python", label: concept };
  }

  function mockModuleWithExistingItems(externalUrls: string[]) {
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Intro to Widgets",
      modules: [
        {
          id: MODULE_ID,
          name: "Week 1",
          position: 1,
          published: true,
          itemsCount: externalUrls.length,
          items: externalUrls.map((url, i) => ({
            id: 900 + i,
            moduleId: MODULE_ID,
            title: `Existing link ${i}`,
            type: "ExternalUrl",
            position: i + 1,
            indent: 0,
            published: true,
            pageUrl: null,
            contentId: null,
            dueAt: null,
            pointsPossible: null,
            htmlUrl: null,
            externalUrl: url,
          })),
        },
      ],
      pages: [],
    } as never);
  }

  it("is owner-scoped", async () => {
    mockModuleWithExistingItems([]);
    await linkVisualizerPagesIntoModuleAction({ courseUrl: COURSE_URL, moduleId: MODULE_ID, concepts: [] });
    expect(requireOwner).toHaveBeenCalled();
  });

  it("refuses an empty concept list without reading the module", async () => {
    const result = await linkVisualizerPagesIntoModuleAction({ courseUrl: COURSE_URL, moduleId: MODULE_ID, concepts: [] });

    expect("error" in result).toBe(true);
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });

  it("propagates a listCourseContentAction failure without calling createModuleItemAction (fresh-read requirement)", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);

    const result = await linkVisualizerPagesIntoModuleAction({
      courseUrl: COURSE_URL,
      moduleId: MODULE_ID,
      concepts: [coveredConcept("For Loops", FOR_LOOPS_URL)],
    });

    expect(result).toEqual({ error: "Canvas is down" });
    expect(createModuleItemAction).not.toHaveBeenCalled();
  });

  it("refuses when the target module cannot be found in the fresh read", async () => {
    mockModuleWithExistingItems([]);

    const result = await linkVisualizerPagesIntoModuleAction({
      courseUrl: COURSE_URL,
      moduleId: 999999,
      concepts: [coveredConcept("For Loops", FOR_LOOPS_URL)],
    });

    expect("error" in result).toBe(true);
    expect(createModuleItemAction).not.toHaveBeenCalled();
  });

  it("C5/C3: skips a concept already linked in the module (by url, freshly re-read) and links only the remainder, with the exact ExternalUrl shape", async () => {
    mockModuleWithExistingItems([FOR_LOOPS_URL]);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);
    const LIST_COMP_URL = "https://programming-concept-visualizer.vercel.app/languages/python?concept=list-comprehension";

    const result = await linkVisualizerPagesIntoModuleAction({
      courseUrl: COURSE_URL,
      moduleId: MODULE_ID,
      concepts: [coveredConcept("For Loops", FOR_LOOPS_URL), coveredConcept("List Comprehension", LIST_COMP_URL)],
    });

    expect(result).toEqual({
      linked: ["List Comprehension"],
      skipped: ["For Loops"],
      failed: [],
    });
    // Never a second insertion for the already-linked concept - a re-run
    // must insert nothing for it (C5's own "proving a re-run inserts
    // nothing" requirement).
    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      MODULE_ID,
      { type: "ExternalUrl", externalUrl: LIST_COMP_URL, title: visualizerLinkTitle("List Comprehension") },
      undefined
    );
  });

  it("caps processing at VISUALIZER_LINK_MAX_ITEMS - concepts beyond the cap are neither linked, skipped, nor failed", async () => {
    mockModuleWithExistingItems([]);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);
    const many = Array.from({ length: VISUALIZER_LINK_MAX_ITEMS + 5 }, (_, i) =>
      coveredConcept(`Concept ${i}`, `https://programming-concept-visualizer.vercel.app/languages/python?concept=c${i}`)
    );

    const result = await linkVisualizerPagesIntoModuleAction({ courseUrl: COURSE_URL, moduleId: MODULE_ID, concepts: many });

    expect("error" in result).toBe(false);
    const success = result as { linked: string[]; skipped: string[]; failed: unknown[] };
    expect(success.linked.length + success.skipped.length + success.failed.length).toBe(VISUALIZER_LINK_MAX_ITEMS);
    expect(success.linked).not.toContain(`Concept ${VISUALIZER_LINK_MAX_ITEMS + 4}`);
  });

  it("C6: one failed insertion is isolated and does not block the rest", async () => {
    mockModuleWithExistingItems([]);
    vi.mocked(createModuleItemAction)
      .mockResolvedValueOnce({ error: "Canvas rejected the item" } as never)
      .mockResolvedValueOnce({ ok: true } as never);
    const urlA = "https://programming-concept-visualizer.vercel.app/languages/python?concept=a";
    const urlB = "https://programming-concept-visualizer.vercel.app/languages/python?concept=b";

    const result = await linkVisualizerPagesIntoModuleAction({
      courseUrl: COURSE_URL,
      moduleId: MODULE_ID,
      concepts: [coveredConcept("A", urlA), coveredConcept("B", urlB)],
    });

    expect(result).toEqual({
      linked: ["B"],
      skipped: [],
      failed: [{ concept: "A", error: "Canvas rejected the item" }],
    });
  });

  it("C7: writes to Canvas ONLY - never calls the visualizer-repo write", async () => {
    mockModuleWithExistingItems([]);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    await linkVisualizerPagesIntoModuleAction({
      courseUrl: COURSE_URL,
      moduleId: MODULE_ID,
      concepts: [coveredConcept("For Loops", FOR_LOOPS_URL)],
    });

    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
  });

  // NIT 13: unlinkedConcepts only compares against the MODULE's existing
  // items - two differently-normalized concepts in THIS RUN's own input that
  // resolve to the same url must still be linked only once.
  it("NIT 13: two concepts in the same run that resolve to the same normalized url are linked only once, not duplicated", async () => {
    mockModuleWithExistingItems([]);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);
    const urlA = "https://programming-concept-visualizer.vercel.app/languages/python?concept=for-loops";
    // Trailing-slash variant of the same normalized url (the exact
    // normalization case selection-coverage.test.ts's own unlinkedConcepts
    // suite pins).
    const urlB = "https://programming-concept-visualizer.vercel.app/languages/python/?concept=for-loops";

    const result = await linkVisualizerPagesIntoModuleAction({
      courseUrl: COURSE_URL,
      moduleId: MODULE_ID,
      concepts: [coveredConcept("For Loops", urlA), coveredConcept("for loops (dup)", urlB)],
    });

    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      linked: ["For Loops"],
      skipped: ["for loops (dup)"],
      failed: [],
    });
  });

  // NIT 14: `skipped` used to be computed by concept NAME while `toLink` was
  // filtered by URL - harmless while every concept name in a run is unique,
  // but two DIFFERENT concept objects that happen to share a display name
  // (same "Ambiguous" label, different urls - one already linked, one new)
  // would previously vanish from BOTH `linked` and `skipped` instead of being
  // correctly split between them. Computing `skipped` by object identity
  // (this file's `toLinkSet`) keeps the two concepts distinguishable even
  // though their names collide.
  it("NIT 14: two concepts sharing the same display name but different urls are still correctly split between linked and skipped", async () => {
    const alreadyPresentUrl = "https://programming-concept-visualizer.vercel.app/languages/python?concept=already-present";
    const newUrl = "https://programming-concept-visualizer.vercel.app/languages/python?concept=brand-new";
    mockModuleWithExistingItems([alreadyPresentUrl]);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await linkVisualizerPagesIntoModuleAction({
      courseUrl: COURSE_URL,
      moduleId: MODULE_ID,
      concepts: [coveredConcept("Ambiguous", alreadyPresentUrl), coveredConcept("Ambiguous", newUrl)],
    });

    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      linked: ["Ambiguous"],
      skipped: ["Ambiguous"],
      failed: [],
    });
  });
});

// createVisualizerPagesForGapsAction (the third action Contract 3 originally
// described) MOVED off this Server Action file and onto a Route Handler -
// src/app/api/visualizer/create/route.ts - see this file's own header
// comment for why, and that route's own test file
// (src/app/api/visualizer/create/route.test.ts) for the create-specific
// coverage that used to live here (owner-scoping, the topic-not-creatable
// filter enforced server-side even against a hand-crafted payload, B4's
// fresh-index re-check, B2/B3's evidence-passing and per-gap isolation, and
// the BLOCKER 2 / VISUALIZER_CREATE_MAX_PAGES cap tests) - ported over
// verbatim, adapted only to call the route's POST handler instead of this
// file's removed action.

// SHOULD-FIX 8: linkVisualizerPagesIntoModuleAction imports
// createModuleItemAction (Canvas write) at MODULE scope - there is no import
// barrier keeping it from also calling a visualizer-repo write, only
// function-body discipline (createVisualizerPagesForGapsAction's own mirror
// image of this guard now lives in the route's own test file, since that
// write moved there too). The mock-based "not called" assertion above (C7)
// only proves today's code path never happens to call the wrong write; it
// would keep passing even if this function grew a direct `putFile` call that
// this test file does not mock. This source-text guard reads the REAL file
// text and asserts the forbidden call is absent from the function's own
// body, the same fs.readFileSync-driven-real-source idiom
// src/lib/use-server-exports.test.ts uses for its own cross-cutting guard.
describe("cross-write isolation (source-text guard, SHOULD-FIX 8)", () => {
  const SOURCE_PATH = path.resolve(process.cwd(), "src/app/actions/visualizer-selection.ts");
  const source = fs.readFileSync(SOURCE_PATH, "utf-8");

  /**
   * Slice out one exported async function's own body text: from its
   * `export async function NAME(` line through the function's true closing
   * brace. Found LINE-BASED, not by depth-counting individual `{`/`}`
   * characters across the whole text: this file's Server Action signatures
   * span multiple lines and their return-type annotations contain their own
   * brace pairs (e.g. `): Promise<VisualizerCreateSuccess | { error: string
   * }> {`), so naive char-by-char depth counting closes on the FIRST such
   * pair and returns a near-empty "body" that trivially passes every
   * assertion below without checking anything real - exactly the "silently
   * matched nothing" failure mode this repo's emoji-scan lesson warns about
   * (confirmed by deliberately breaking this guard during development: the
   * char-depth version above returned a 143-character body and reported
   * clean even with a real violation planted in the function). Prettier
   * formats every top-level declaration in this codebase so its OWN closing
   * brace is the ONLY line consisting of exactly "}" with no indentation;
   * every nested block inside the function (catch blocks, object literals)
   * is indented, so scanning for the first bare "}" line after the start
   * marker reliably finds the function's real end. Throws loudly if the
   * function or its closing line cannot be found, so a rename fails this
   * guard instead of silently checking nothing.
   */
  function extractFunctionBody(functionName: string): string {
    const startMarker = `export async function ${functionName}(`;
    const lines = source.split("\n");
    const startLineIdx = lines.findIndex((l) => l.includes(startMarker));
    if (startLineIdx === -1) {
      throw new Error(`Could not find "${startMarker}" in ${SOURCE_PATH} - this guard is stale`);
    }
    let endLineIdx = -1;
    for (let i = startLineIdx + 1; i < lines.length; i++) {
      if (lines[i] === "}") {
        endLineIdx = i;
        break;
      }
    }
    if (endLineIdx === -1) {
      throw new Error(`Could not find the closing "}" line for "${startMarker}" in ${SOURCE_PATH} - this guard is stale`);
    }
    return lines.slice(startLineIdx, endLineIdx + 1).join("\n");
  }

  it("linkVisualizerPagesIntoModuleAction's own body calls no visualizer-repo write", () => {
    const body = extractFunctionBody("linkVisualizerPagesIntoModuleAction");

    expect(body).not.toMatch(/createVisualizerConceptAction\s*\(/);
    expect(body).not.toMatch(/\bputFile\s*\(/);
    expect(body).not.toMatch(/\bgetFileText\s*\(/);
  });

  // Canary: proves extractFunctionBody neither stops too SHORT nor sweeps too
  // FAR, so the guard above is actually checking something real (the
  // "emoji-scan" lesson - a scanner that silently checks nothing still
  // reports clean). Too short: an earlier version of this extractor closed
  // on the FIRST `{`/`}` pair it found (the return type's own `{ error:
  // string }`), returning a 143-character stub that trivially passed every
  // assertion above with no real check happening - caught here by requiring
  // a realistic minimum length.
  it("canary: linkVisualizerPagesIntoModuleAction's extracted body is a real function body, not a truncated stub", () => {
    const body = extractFunctionBody("linkVisualizerPagesIntoModuleAction");

    expect(body.length).toBeGreaterThan(800);
    expect(body).toContain("requireOwner");
    expect(body).toContain("createModuleItemAction");
  });
});

// This file cannot compile until file set A (a sibling, concurrent build)
// lands src/lib/visualizer/selection-coverage.ts and
// src/app/actions/visualization-concepts-generator.ts (Contracts 1/2 of
// docs/visualizer-coverage-from-selection-acceptance-criteria.md). Per that
// doc's fixed contracts, this file imports the real
// classifySelectionCoverage/visualizerLinkTitle/unlinkedConcepts/
// VISUALIZER_LINK_MAX_ITEMS rather than declaring local stand-ins - the same
// "never let a shared contract silently drift" rule
// selection-chat-context.test.ts's own closing comment records for its
// sibling dependency.
