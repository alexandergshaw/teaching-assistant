import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking pattern as lms-generation.test.ts (read in full before this
// file was written): requireOwner/course resolution/listCourseContentAction/
// gatherSelectionMaterials/expandModuleSelection are all mocked at their
// exact import specifiers, so an inert mock fails loudly rather than
// silently falling through to a real implementation. getPageAction/
// previewFileAction/fetchCanvasMetaAction are mocked too even though no test
// below exercises LIVE_FETCHERS directly (gatherSelectionMaterials itself is
// mocked, so it never calls them) - matching lms-generation.test.ts's own
// precedent of mocking every module this file imports, not only the ones a
// given test path happens to reach.
//
// SELECTION_CHAT_MAX_ITEMS/tooManyItemsForChatNote (src/lib/chat/
// selection-context.ts) are NOT mocked: that module is a pure, I/O-free leaf
// (Contract 1 of docs/modules-selection-ask-ai-acceptance-criteria.md, owned
// by a sibling file set A), the same "pure leaves are imported for real,
// only I/O is mocked" precedent course-not-linked.ts already follows in
// lms-generation.fixtures.ts. Until file set A lands that module, this file
// fails to compile on that one import - see this file's own closing comment.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/app/actions/lms-syllabus-buttons", () => ({
  resolveLmsCourseRowAction: vi.fn(),
  resolveLmsCourseRowByIdAction: vi.fn(),
}));
vi.mock("@/app/actions/canvas-modules", () => ({ listCourseContentAction: vi.fn() }));
vi.mock("@/app/actions/canvas-files-bulk", () => ({ getPageAction: vi.fn(), previewFileAction: vi.fn() }));
vi.mock("@/app/actions/grading", () => ({ fetchCanvasMetaAction: vi.fn() }));
vi.mock("@/lib/lms-generation/materials", () => ({
  gatherSelectionMaterials: vi.fn(),
  expandModuleSelection: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "@/app/actions/lms-syllabus-buttons";
import { listCourseContentAction } from "@/app/actions/canvas-modules";
import { gatherSelectionMaterials, expandModuleSelection } from "@/lib/lms-generation/materials";
import { buildSelectionChatContextAction } from "./selection-chat-context";
import { SELECTION_CHAT_MAX_ITEMS, tooManyItemsForChatNote } from "@/lib/chat/selection-context";
import {
  COURSE_URL,
  FAKE_COURSE,
  FAKE_MODULES,
  NOT_LINKED_ERROR,
  mockCourseContent,
  mockOwner,
  mockResolvedCourse,
  mockResolvedCourseById,
} from "./lms-generation.fixtures";

// Same shape SOME_ITEM in lms-generation.test.ts uses - a single resolved
// live selection entry. Kept local rather than imported from that file:
// nothing in lms-generation.fixtures.ts exports it (only course/module
// doubles do), and this file's own tests need to build several variants of
// it (for the over-cap test in particular), so a local builder is clearer
// than reaching into a sibling test file for one literal.
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

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

describe("buildSelectionChatContextAction", () => {
  it("B1: is owner-scoped - requireOwner gates every path, including the earliest refusal", async () => {
    // B1's ownership check is the one guard that must run BEFORE anything
    // else, including the empty-selection refusal below: an action that
    // refused an unauthenticated caller's empty selection with a friendly
    // "select at least one item" would be answering a question it should
    // never have accepted. Asserted on the earliest-returning path
    // specifically, because that is the path most likely to be reordered
    // ahead of the gate by a later refactor.
    await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [] });
    expect(requireOwner).toHaveBeenCalled();

    vi.clearAllMocks();
    mockOwner();
    mockResolvedCourse();
    mockMaterials("grounded materials", []);
    await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });
    expect(requireOwner).toHaveBeenCalled();
  });

  it("B4: rejects an empty selection (no items, no moduleIds) without resolving the course or gathering materials", async () => {
    const result = await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [] });

    expect("error" in result).toBe(true);
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(resolveLmsCourseRowByIdAction).not.toHaveBeenCalled();
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("B1/B4: the course-not-linked path returns the named error, flags courseNotLinked, and calls no gather", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const result = await buildSelectionChatContextAction({
      courseUrl: COURSE_URL,
      items: [makeLiveItem(1)],
    });

    expect(result).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("a generic course-resolution error is NOT flagged as courseNotLinked", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({ error: "Could not resolve the course." } as never);

    const result = await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect(result).toEqual({ error: "Could not resolve the course." });
    expect("courseNotLinked" in (result as object)).toBe(false);
  });

  it("B1: resolves an export-sourced selection by courseId, never by courseUrl", async () => {
    mockResolvedCourseById();
    mockMaterials("some material", []);

    const result = await buildSelectionChatContextAction({
      courseUrl: "",
      courseId: "export-course-1",
      items: [makeLiveItem(1)],
    });

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);
  });

  it("threads a host-less courseUrl's acronym through to resolveLmsCourseRowAction, mirroring the deck route's own branch", async () => {
    mockResolvedCourse();
    mockMaterials("some material", []);

    await buildSelectionChatContextAction({
      courseUrl: "/courses/10287",
      acronym: "WNCC",
      items: [makeLiveItem(1)],
    });

    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith("/courses/10287", "WNCC");
    expect(resolveLmsCourseRowByIdAction).not.toHaveBeenCalled();
  });

  it("B4: reports an error and calls no gather-dependent step twice when materials gathering finds nothing usable", async () => {
    mockResolvedCourse();
    mockMaterials("   ", []);

    const result = await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect("error" in result).toBe(true);
    expect(gatherSelectionMaterials).toHaveBeenCalledTimes(1);
  });

  it("B2: an items-only selection (no moduleIds) never fetches the live course content", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");

    await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [makeLiveItem(1)] });

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(expandModuleSelection).not.toHaveBeenCalled();
  });

  it("B2: a whole-module selection fetches a FRESH module tree and expands it before gathering", async () => {
    mockResolvedCourse();
    mockCourseContent();
    vi.mocked(expandModuleSelection).mockReturnValue([makeLiveItem(1), makeLiveItem(2)] as never);
    mockMaterials("grounded materials from the whole module");

    const result = await buildSelectionChatContextAction({
      courseUrl: COURSE_URL,
      items: [],
      moduleIds: [10],
    });

    expect(listCourseContentAction).toHaveBeenCalledWith(COURSE_URL, "MIT");
    expect(expandModuleSelection).toHaveBeenCalledWith([], ["live:10"], FAKE_MODULES);
    // gatherSelectionMaterials must receive expandModuleSelection's OUTPUT,
    // not the empty `items` input - otherwise a module-only selection would
    // silently gather nothing (same defect class lms-generation.test.ts
    // already guards for its own generate action).
    expect(gatherSelectionMaterials).toHaveBeenCalledWith([makeLiveItem(1), makeLiveItem(2)], expect.anything());
    expect(result).toEqual({
      materialsText: "grounded materials from the whole module",
      notes: [],
      itemCount: 2,
    });
  });

  it("propagates a listCourseContentAction failure without calling gatherSelectionMaterials", async () => {
    mockResolvedCourse();
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);

    const result = await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [], moduleIds: [10] });

    expect(result).toEqual({ error: "Canvas is down" });
    expect(expandModuleSelection).not.toHaveBeenCalled();
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("B4: refuses a selection whose POST-expansion item count exceeds SELECTION_CHAT_MAX_ITEMS, and never calls gatherSelectionMaterials", async () => {
    mockResolvedCourse();
    const tooMany = Array.from({ length: SELECTION_CHAT_MAX_ITEMS + 1 }, (_, i) => makeLiveItem(i));

    const result = await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: tooMany });

    expect(result).toEqual({
      error: tooManyItemsForChatNote(SELECTION_CHAT_MAX_ITEMS + 1, SELECTION_CHAT_MAX_ITEMS),
    });
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("B4: a selection AT exactly SELECTION_CHAT_MAX_ITEMS is not refused by the cap", async () => {
    mockResolvedCourse();
    const exactlyAtCap = Array.from({ length: SELECTION_CHAT_MAX_ITEMS }, (_, i) => makeLiveItem(i));
    mockMaterials("grounded materials");

    const result = await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: exactlyAtCap });

    expect("error" in result).toBe(false);
    expect(gatherSelectionMaterials).toHaveBeenCalledTimes(1);
  });

  it("B4: the cap is enforced on the POST-expansion count, not the pre-expansion moduleIds/items count", async () => {
    // Only ONE moduleId is sent (well under the cap), but the fresh module
    // tree expands it into more items than SELECTION_CHAT_MAX_ITEMS allows -
    // proving the check reads resolvedItems.length (after expansion), not
    // input.items.length or input.moduleIds.length (before it).
    mockResolvedCourse();
    mockCourseContent();
    const expanded = Array.from({ length: SELECTION_CHAT_MAX_ITEMS + 5 }, (_, i) => makeLiveItem(i));
    vi.mocked(expandModuleSelection).mockReturnValue(expanded as never);

    const result = await buildSelectionChatContextAction({ courseUrl: COURSE_URL, items: [], moduleIds: [10] });

    expect(result).toEqual({
      error: tooManyItemsForChatNote(SELECTION_CHAT_MAX_ITEMS + 5, SELECTION_CHAT_MAX_ITEMS),
    });
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("B3/B5: happy path gathers via gatherSelectionMaterials with the LIVE_FETCHERS wiring, returns text/notes/itemCount, and calls no write action", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a note"]);

    const result = await buildSelectionChatContextAction({
      courseUrl: COURSE_URL,
      items: [makeLiveItem(1), makeLiveItem(2)],
    });

    expect(gatherSelectionMaterials).toHaveBeenCalledWith(
      [makeLiveItem(1), makeLiveItem(2)],
      expect.objectContaining({ canvasUrl: FAKE_COURSE.canvasUrl, institution: FAKE_COURSE.institution })
    );
    expect(result).toEqual({
      materialsText: "grounded materials",
      notes: ["a note"],
      itemCount: 2,
    });
  });
});

// This file cannot compile until file set A (a sibling, concurrent build)
// lands src/lib/chat/selection-context.ts, which owns SELECTION_CHAT_MAX_ITEMS
// and tooManyItemsForChatNote (Contract 1, docs/modules-selection-ask-ai-
// acceptance-criteria.md). Per that doc's fixed contracts, this file imports
// the real constant/function rather than declaring a local stand-in number -
// declaring one here would let this file's cap tests silently drift from the
// actual shared value the client-side pre-flight check (file set C) and the
// chat context renderer (file set A) both enforce.
