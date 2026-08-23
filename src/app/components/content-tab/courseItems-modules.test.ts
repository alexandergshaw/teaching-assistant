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

  // BUG FIX (live report 2026-08-22): a classic quiz's shadow assignment row
  // now appears in the Assignments tab (bulk.ts), keyed by its OWN (shadow
  // assignment) id - but Canvas never files a module item under that id; it
  // files the module item as type "Quiz", keyed by the underlying quiz's own
  // id. `shadowQuizId` (bulk.ts) is what makes this resolvable without a
  // second Canvas call.
  it("a classic-quiz-shadow row (Assignments tab) resolves via its shadowQuizId, not its own (shadow assignment) id", () => {
    const modules = [
      module({ id: 5, name: "Orientation", items: [moduleItem({ type: "Quiz", contentId: 55 })] }),
    ];
    const index = buildModuleIndex(modules);
    // Shadow assignment row: id is 903 (the assignment id), shadowQuizId is
    // 55 (the underlying quiz's own id) - shown in the Assignments tab.
    const result = modulesForItem({ id: "903", isClassicQuizShadow: true, shadowQuizId: 55 }, "Assignment", index);
    expect(result).toEqual({ known: true, names: ["Orientation"] });
  });

  it("a classic-quiz-shadow row looked up by its OWN (shadow assignment) id, ignoring shadowQuizId, never matches - proving the naive approach fails", () => {
    const modules = [
      module({ id: 5, name: "Orientation", items: [moduleItem({ type: "Quiz", contentId: 55 })] }),
    ];
    const index = buildModuleIndex(modules);
    // The naive lookup: "Assignment:903" (the shadow assignment's own id,
    // under the tab's own kind) - Canvas never files a module item there.
    expect(index.get("Assignment:903")).toBeUndefined();
  });

  it("a classic-quiz-shadow row with no shadowQuizId (should not happen in practice, but must not throw) falls back to the ordinary lookup and reports no module rather than crashing", () => {
    const modules = [module({ id: 5, name: "Orientation", items: [moduleItem({ type: "Quiz", contentId: 55 })] })];
    const index = buildModuleIndex(modules);
    const result = modulesForItem({ id: "903", isClassicQuizShadow: true }, "Assignment", index);
    expect(result).toEqual({ known: true, names: [] });
  });

  it("an id that collides between a classic-quiz-shadow's assignment id and an ordinary assignment's id stays disambiguated by the shadowQuizId carve-out", () => {
    const modules = [
      module({ id: 1, name: "Ordinary Module", items: [moduleItem({ type: "Assignment", contentId: 903 })] }),
      module({ id: 2, name: "Quiz Module", items: [moduleItem({ type: "Quiz", contentId: 55 })] }),
    ];
    const index = buildModuleIndex(modules);
    // An ordinary assignment that happens to share numeric id 903 with the
    // shadow assignment above resolves through the plain path.
    const ordinaryResult = modulesForItem({ id: "903" }, "Assignment", index);
    expect(ordinaryResult).toEqual({ known: true, names: ["Ordinary Module"] });
    // The shadow row itself, carrying the SAME id (903) plus shadowQuizId,
    // resolves to the QUIZ's module instead - the carve-out takes priority.
    const shadowResult = modulesForItem({ id: "903", isClassicQuizShadow: true, shadowQuizId: 55 }, "Assignment", index);
    expect(shadowResult).toEqual({ known: true, names: ["Quiz Module"] });
  });

  // FINDING 3 fix: a graded discussion's shadow assignment row now carries
  // shadowDiscussionTopicId (bulk.ts) the same way a classic quiz's shadow
  // carries shadowQuizId - so it must resolve via the DISCUSSION module item
  // (keyed by the topic's own id), never via the ordinary "Assignment:
  // <shadowId>" lookup, which Canvas never files a module item under.
  it("a graded-discussion-shadow row (Assignments tab) resolves via its shadowDiscussionTopicId, not its own (shadow assignment) id", () => {
    const modules = [
      module({ id: 6, name: "Week 3", items: [moduleItem({ type: "Discussion", contentId: 77 })] }),
    ];
    const index = buildModuleIndex(modules);
    const result = modulesForItem(
      { id: "904", isGradedDiscussionShadow: true, shadowDiscussionTopicId: 77 },
      "Assignment",
      index
    );
    expect(result).toEqual({ known: true, names: ["Week 3"] });
  });

  it("a graded-discussion-shadow row looked up by its OWN (shadow assignment) id, ignoring shadowDiscussionTopicId, never matches - proving the naive approach fails", () => {
    const modules = [
      module({ id: 6, name: "Week 3", items: [moduleItem({ type: "Discussion", contentId: 77 })] }),
    ];
    const index = buildModuleIndex(modules);
    expect(index.get("Assignment:904")).toBeUndefined();
  });

  // FINDING 3's own required behaviour: when Canvas's payload genuinely does
  // not carry the discussion topic id for this row (bulk.ts leaves
  // shadowDiscussionTopicId undefined - Canvas's own docs say the field is
  // present only "if applicable"), the row's module state must be reported as
  // UNKNOWN (known: false) - never silently asserted as "No module"
  // (known: true, names: []), which would be a fabricated fact nobody
  // observed.
  it("a graded-discussion-shadow row with no shadowDiscussionTopicId reports UNKNOWN (known: false), never a fabricated 'No module'", () => {
    const modules = [
      module({ id: 6, name: "Week 3", items: [moduleItem({ type: "Discussion", contentId: 77 })] }),
    ];
    const index = buildModuleIndex(modules);
    const result = modulesForItem({ id: "904", isGradedDiscussionShadow: true }, "Assignment", index);
    expect(result).toEqual({ known: false });
  });

  it("an id that collides between a graded-discussion-shadow's assignment id and an ordinary assignment's id stays disambiguated by the shadowDiscussionTopicId carve-out", () => {
    const modules = [
      module({ id: 1, name: "Ordinary Module", items: [moduleItem({ type: "Assignment", contentId: 904 })] }),
      module({ id: 2, name: "Discussion Module", items: [moduleItem({ type: "Discussion", contentId: 77 })] }),
    ];
    const index = buildModuleIndex(modules);
    const ordinaryResult = modulesForItem({ id: "904" }, "Assignment", index);
    expect(ordinaryResult).toEqual({ known: true, names: ["Ordinary Module"] });
    const shadowResult = modulesForItem(
      { id: "904", isGradedDiscussionShadow: true, shadowDiscussionTopicId: 77 },
      "Assignment",
      index
    );
    expect(shadowResult).toEqual({ known: true, names: ["Discussion Module"] });
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
