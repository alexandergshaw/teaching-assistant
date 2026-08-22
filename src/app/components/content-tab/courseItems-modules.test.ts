// Real unit tests for the pure module-mapping leaf extracted out of
// CourseItemsView.tsx: unlike courseItemsView.wiring.test.ts, which can only
// regex-match source text because vitest here never renders a component,
// this file calls buildModuleIndex/modulesForItem directly.
import { describe, it, expect } from "vitest";
import { buildModuleIndex, modulesForItem } from "./courseItems-modules";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";

/** Minimal CanvasModuleItem fixture - only `type` and `contentId` matter to
 *  this mapping, but every field is filled in so the fixture type-checks
 *  against the real interface. */
function moduleItem(overrides: Partial<CanvasModuleItem> & Pick<CanvasModuleItem, "type" | "contentId">): CanvasModuleItem {
  return {
    id: 1,
    moduleId: 1,
    title: "item",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: null,
    dueAt: null,
    pointsPossible: null,
    htmlUrl: null,
    externalUrl: null,
    ...overrides,
  };
}

function module(overrides: Partial<CanvasModule> & Pick<CanvasModule, "id" | "name" | "items">): CanvasModule {
  return {
    position: 1,
    published: true,
    itemsCount: overrides.items.length,
    ...overrides,
  };
}

describe("buildModuleIndex + modulesForItem", () => {
  it("matches an ordinary assignment via module-item type \"Assignment\" and its own id", () => {
    const modules = [
      module({ id: 1, name: "Week 1", items: [moduleItem({ type: "Assignment", contentId: 501 })] }),
    ];
    const index = buildModuleIndex(modules);
    const result = modulesForItem({ id: "501" }, "Assignment", index);
    expect(result).toEqual({ known: true, names: ["Week 1"] });
  });

  it("matches a Classic quiz via module-item type \"Quiz\" and the QUIZ id (not an assignment id)", () => {
    const modules = [
      module({ id: 2, name: "Week 2", items: [moduleItem({ type: "Quiz", contentId: 700 })] }),
    ];
    const index = buildModuleIndex(modules);
    // Classic quiz row: no isNewQuiz flag, id is the quiz's own id (700).
    const result = modulesForItem({ id: "700" }, "Quiz", index);
    expect(result).toEqual({ known: true, names: ["Week 2"] });
  });

  it("matches a New Quiz via module-item type \"Assignment\" and its ASSIGNMENT id, even though it is displayed in the Quizzes tab", () => {
    const modules = [
      module({ id: 3, name: "Week 3", items: [moduleItem({ type: "Assignment", contentId: 900 })] }),
    ];
    const index = buildModuleIndex(modules);
    // New Quiz row: isNewQuiz true, id is the underlying ASSIGNMENT id (900),
    // shown in the Quiz tab (kind = "Quiz") - the case a naive implementation
    // that keys off the tab's own `kind` (looking for type "Quiz") gets wrong.
    const result = modulesForItem({ id: "900", isNewQuiz: true }, "Quiz", index);
    expect(result).toEqual({ known: true, names: ["Week 3"] });
  });

  it("a New Quiz mapped via the WRONG type (\"Quiz\") or WRONG id never matches - proving the naive approach fails", () => {
    const modules = [
      module({ id: 3, name: "Week 3", items: [moduleItem({ type: "Assignment", contentId: 900 })] }),
    ];
    const index = buildModuleIndex(modules);
    // Wrong type: looking up "Quiz:900" (the naive "use the tab's kind
    // directly" bug) finds nothing, because the module item is filed under
    // "Assignment", not "Quiz".
    expect(index.get("Quiz:900")).toBeUndefined();
    // Wrong id: a New Quiz has no quiz id at all - looking it up by some
    // other numeric id also finds nothing.
    expect(index.get("Assignment:901")).toBeUndefined();
  });

  it("an item in no module reports known: true with an empty names list", () => {
    const modules = [
      module({ id: 1, name: "Week 1", items: [moduleItem({ type: "Assignment", contentId: 501 })] }),
    ];
    const index = buildModuleIndex(modules);
    const result = modulesForItem({ id: "999" }, "Assignment", index);
    expect(result).toEqual({ known: true, names: [] });
  });

  it("an item in several modules names all of them, in module order - never just the first", () => {
    const modules = [
      module({ id: 1, name: "Week 1", items: [moduleItem({ type: "Assignment", contentId: 501 })] }),
      module({ id: 2, name: "Review", items: [moduleItem({ type: "Assignment", contentId: 501 })] }),
      module({ id: 3, name: "Extra Credit", items: [moduleItem({ type: "Assignment", contentId: 501 })] }),
    ];
    const index = buildModuleIndex(modules);
    const result = modulesForItem({ id: "501" }, "Assignment", index);
    expect(result).toEqual({ known: true, names: ["Week 1", "Review", "Extra Credit"] });
  });

  it("an id that collides across types does not cross-match: an assignment and a quiz sharing the same numeric id stay in their own modules", () => {
    const modules = [
      module({ id: 1, name: "Assignment Module", items: [moduleItem({ type: "Assignment", contentId: 42 })] }),
      module({ id: 2, name: "Quiz Module", items: [moduleItem({ type: "Quiz", contentId: 42 })] }),
    ];
    const index = buildModuleIndex(modules);
    const assignmentResult = modulesForItem({ id: "42" }, "Assignment", index);
    const quizResult = modulesForItem({ id: "42" }, "Quiz", index);
    expect(assignmentResult).toEqual({ known: true, names: ["Assignment Module"] });
    expect(quizResult).toEqual({ known: true, names: ["Quiz Module"] });
  });

  it("an absent/failed module tree (index === null) reports known: false, never a fabricated empty list", () => {
    const result = modulesForItem({ id: "501" }, "Assignment", null);
    expect(result).toEqual({ known: false });
  });

  it("NIT12: a duplicate module item listed twice inside the SAME module names that module only once, not 'Week 1, Week 1'", () => {
    const modules = [
      module({
        id: 1,
        name: "Week 1",
        items: [
          moduleItem({ type: "Assignment", contentId: 501 }),
          moduleItem({ type: "Assignment", contentId: 501 }),
        ],
      }),
    ];
    const index = buildModuleIndex(modules);
    const result = modulesForItem({ id: "501" }, "Assignment", index);
    expect(result).toEqual({ known: true, names: ["Week 1"] });
  });

  it("NIT12: a duplicate within one module does not swallow a later, genuinely different module", () => {
    const modules = [
      module({
        id: 1,
        name: "Week 1",
        items: [
          moduleItem({ type: "Assignment", contentId: 501 }),
          moduleItem({ type: "Assignment", contentId: 501 }),
        ],
      }),
      module({ id: 2, name: "Review", items: [moduleItem({ type: "Assignment", contentId: 501 })] }),
    ];
    const index = buildModuleIndex(modules);
    const result = modulesForItem({ id: "501" }, "Assignment", index);
    expect(result).toEqual({ known: true, names: ["Week 1", "Review"] });
  });

  it("buildModuleIndex skips module items with a null contentId (Pages, SubHeaders, ExternalUrls), rather than throwing or fabricating a key", () => {
    const modules = [
      module({
        id: 1,
        name: "Week 1",
        items: [
          moduleItem({ type: "SubHeader", contentId: null }),
          moduleItem({ type: "Page", contentId: null, pageUrl: "intro" }),
          moduleItem({ type: "Assignment", contentId: 501 }),
        ],
      }),
    ];
    const index = buildModuleIndex(modules);
    expect(index.size).toBe(1);
    expect(index.get("Assignment:501")).toEqual(["Week 1"]);
  });
});
