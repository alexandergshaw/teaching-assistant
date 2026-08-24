// Coverage for readModuleTemplateAction (module-template.ts): the read
// composition chunk D's brief calls G1 - "here is module X's shape" - plus
// D6/D7/D8/D9's corrections to it. Canvas is fully mocked; nothing here makes
// a live call (docs/DEV_LOOP.md's testing-reality rule - vitest here is
// node-env and renders no component, so this only proves the pure read
// composition, never that any screen renders it).
//
// D8's sabotage (see the test below named for it) is the one this suite
// exists to make impossible to regress: if the merge ever collapsed to
// getGradable's four fields alone, every carried item would ship worth zero
// points with no due date and no published state - silently.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/canvas-modules", () => ({
  listModules: vi.fn(),
  getGradable: vi.fn(),
  getPage: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { listModules, getGradable, getPage } from "@/lib/canvas-modules";
import { readModuleTemplateAction } from "./module-template";
// This constant lives outside module-template.ts on purpose: that file
// carries "use server", and such a module may export nothing but async
// functions and type-only exports (src/lib/use-server-exports.test.ts
// enforces this) - see module-template.ts's own comment near
// `checkpointsUnknown` for the full explanation.
import { DISCUSSION_CHECKPOINTS_UNREADABLE_REASON } from "@/lib/module-template-shape";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";

const mockedListModules = vi.mocked(listModules);
const mockedGetGradable = vi.mocked(getGradable);
const mockedGetPage = vi.mocked(getPage);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" } as never);
});

function item(overrides: Partial<CanvasModuleItem>): CanvasModuleItem {
  return {
    id: 1,
    moduleId: 5,
    title: "Item",
    type: "Assignment",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: null,
    contentId: 100,
    dueAt: null,
    pointsPossible: null,
    htmlUrl: null,
    externalUrl: null,
    ...overrides,
  };
}

function moduleWith(items: CanvasModuleItem[]): CanvasModule {
  return { id: 5, name: "Week 3", position: 3, published: true, itemsCount: items.length, items };
}

describe("readModuleTemplateAction - module lookup", () => {
  it("returns an error when the module id is not in the course's module list", async () => {
    mockedListModules.mockResolvedValue([moduleWith([])]);
    const result = await readModuleTemplateAction("course", 999);
    expect("error" in result).toBe(true);
    expect(mockedGetGradable).not.toHaveBeenCalled();
  });

  it("calls requireOwner before reading anything", async () => {
    mockedListModules.mockResolvedValue([moduleWith([])]);
    await readModuleTemplateAction("course", 5);
    expect(requireOwner).toHaveBeenCalledTimes(1);
  });
});

describe("readModuleTemplateAction - D8: points/due-date/published come from mapModuleItem, not getGradable alone", () => {
  it("carries pointsPossible, dueAt, and published from the module-tree item even though getGradable never returns them", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([
        item({
          id: 11,
          title: "HW 1",
          type: "Assignment",
          contentId: 200,
          pointsPossible: 25,
          dueAt: "2026-02-05T23:59:00Z",
          published: true,
        }),
      ]),
    ]);
    // getGradable's real return shape carries exactly title/description/
    // rubricId/submissionTypes - no points, no due date, no published field
    // exists on GradableDetail at all, so this fixture matches the real shape.
    mockedGetGradable.mockResolvedValue({
      title: "HW 1",
      description: "<p>Do the homework.</p>",
      rubricId: 7,
      submissionTypes: ["online_text_entry"],
    });

    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    expect(result.template.items).toHaveLength(1);
    const read = result.template.items[0];
    expect(read.pointsPossible).toBe(25);
    expect(read.dueAt).toBe("2026-02-05T23:59:00Z");
    expect(read.published).toBe(true);
    expect(read.description).toBe("<p>Do the homework.</p>");
    expect(read.rubricId).toBe(7);
    expect(read.submissionTypes).toEqual(["online_text_entry"]);
  });

  // SABOTAGE CHECK (per brief): with the merge disabled - i.e. the reader
  // built only from getGradable's four fields - this same fixture would
  // report pointsPossible/dueAt as absent and published as untracked. This
  // test pins the fact (both halves are present) and would fail red under
  // that regression. Reported sabotage output is in the agent's final report.
  it("fails if pointsPossible/dueAt are ever dropped (the D8 regression this suite exists to catch)", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([item({ id: 11, contentId: 200, pointsPossible: 25, dueAt: "2026-02-05T23:59:00Z" })]),
    ]);
    mockedGetGradable.mockResolvedValue({
      title: "HW 1",
      description: "",
      submissionTypes: [],
    });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const read = result.template.items[0];
    expect(read.pointsPossible).not.toBeNull();
    expect(read.dueAt).not.toBeNull();
  });
});

describe("readModuleTemplateAction - D7: per-kind disclosure, not one flat list", () => {
  it("Assignment items disclose the shared unreadable-anywhere fields only", async () => {
    mockedListModules.mockResolvedValue([moduleWith([item({ id: 1, type: "Assignment", contentId: 10 })])]);
    mockedGetGradable.mockResolvedValue({ title: "A", description: "", submissionTypes: ["online_upload"] });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const fields = result.template.items[0].notCarried.map((f) => f.field);
    expect(fields).toContain("unlock_at");
    expect(fields).toContain("grading_type");
    expect(fields).not.toContain("submission_types");
    expect(fields).not.toContain("points_possible");
  });

  it("Quiz items additionally disclose points_possible and submission_types, which Assignment items do not", async () => {
    mockedListModules.mockResolvedValue([moduleWith([item({ id: 2, type: "Quiz", contentId: 20 })])]);
    mockedGetGradable.mockResolvedValue({ title: "Q", description: "", submissionTypes: [] });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const fields = result.template.items[0].notCarried.map((f) => f.field);
    expect(fields).toContain("points_possible");
    expect(fields).toContain("submission_types");
    expect(fields).toContain("unlock_at");
  });

  it("Discussion items disclose submission_types but not points_possible", async () => {
    mockedListModules.mockResolvedValue([moduleWith([item({ id: 3, type: "Discussion", contentId: 30 })])]);
    mockedGetGradable.mockResolvedValue({ title: "D", description: "", submissionTypes: [] });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const fields = result.template.items[0].notCarried.map((f) => f.field);
    expect(fields).toContain("submission_types");
    expect(fields).not.toContain("points_possible");
  });

  // Step-10 review, C6: this test used to assert `notCarried` is empty for
  // SubHeader, which was WRONG - `published` is read for every kind but the
  // write path this app uses for SubHeader (addContentToModuleDetailed) has
  // no `published` member on AddContentOpts, exactly like Quiz/Discussion.
  // Corrected to the true behaviour rather than weakened to keep passing.
  it("non-gradable kinds (SubHeader) disclose only 'published' (C6), nothing else", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([item({ id: 4, type: "SubHeader", contentId: null })]),
    ]);
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const fields = result.template.items[0].notCarried.map((f) => f.field);
    expect(fields).toEqual(["published"]);
    expect(mockedGetGradable).not.toHaveBeenCalled();
  });

  it("File items disclose only 'published' (C6)", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([item({ id: 5, type: "File", contentId: 500 })]),
    ]);
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const fields = result.template.items[0].notCarried.map((f) => f.field);
    expect(fields).toEqual(["published"]);
    expect(mockedGetGradable).not.toHaveBeenCalled();
  });
});

describe("readModuleTemplateAction - step-10 review, C6: 'published' is carried for Assignments only, and every other kind must say so", () => {
  it("Assignment items do NOT disclose 'published' as not-carried - the richer write path honours it", async () => {
    mockedListModules.mockResolvedValue([moduleWith([item({ id: 1, type: "Assignment", contentId: 10 })])]);
    mockedGetGradable.mockResolvedValue({ title: "A", description: "", submissionTypes: ["online_upload"] });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const fields = result.template.items[0].notCarried.map((f) => f.field);
    expect(fields).not.toContain("published");
  });

  it("Quiz and Discussion items DO disclose 'published' as not-carried, with a reason naming the write-path gap (not a generic 'never read' reason)", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([
        item({ id: 2, type: "Quiz", contentId: 20 }),
        item({ id: 3, type: "Discussion", contentId: 30 }),
      ]),
    ]);
    mockedGetGradable.mockResolvedValue({ title: "x", description: "", submissionTypes: [] });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    for (const item of result.template.items) {
      const published = item.notCarried.find((f) => f.field === "published");
      expect(published, `${item.type} should disclose published`).toBeDefined();
      // Pin the FACT (read succeeds, write path is the gap), not the exact
      // sentence - this is what distinguishes it from the six pure
      // write-only fields, whose reason says the opposite.
      expect(published!.reason).toMatch(/read/i);
      expect(published!.reason).not.toMatch(/not read by any/i);
    }
  });

  it("Page items also disclose 'published' as not-carried", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([item({ id: 9, type: "Page", contentId: null, pageUrl: "week-3-overview" })]),
    ]);
    mockedGetPage.mockResolvedValue({
      pageId: 1,
      url: "week-3-overview",
      title: "Overview",
      body: "<p>x</p>",
      published: true,
      updatedAt: null,
    });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const fields = result.template.items[0].notCarried.map((f) => f.field);
    expect(fields).toContain("published");
  });
});

describe("readModuleTemplateAction - step-10 review, C10: the two auto-zero-readable fields must read as distinguishable from the six pure write-only fields", () => {
  it("grading_type / omit_from_final_grade's reason states they ARE read (elsewhere); unlock_at's reason states the opposite", async () => {
    mockedListModules.mockResolvedValue([moduleWith([item({ id: 1, type: "Assignment", contentId: 10 })])]);
    mockedGetGradable.mockResolvedValue({ title: "A", description: "", submissionTypes: [] });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const byField = new Map(result.template.items[0].notCarried.map((f) => [f.field, f.reason]));
    // Fact pinned: these two fields' reason must NOT claim they are unread
    // anywhere (that claim is what C10 found false) - it must instead
    // affirmatively state they are readable, just not from this file.
    expect(byField.get("grading_type")).toMatch(/read/i);
    expect(byField.get("grading_type")).not.toMatch(/not read by any/i);
    expect(byField.get("omit_from_final_grade")).toBeDefined();
    // The six genuinely write-only fields keep the opposite claim.
    expect(byField.get("unlock_at")).toMatch(/not read by any/i);
  });
});

describe("readModuleTemplateAction - D9: checkpoints disclosure", () => {
  it("flags checkpointsUnknown for Discussion items and only Discussion items", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([
        item({ id: 3, type: "Discussion", contentId: 30 }),
        item({ id: 1, type: "Assignment", contentId: 10 }),
      ]),
    ]);
    mockedGetGradable.mockResolvedValue({ title: "x", description: "", submissionTypes: [] });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    const discussion = result.template.items.find((i) => i.type === "Discussion");
    const assignment = result.template.items.find((i) => i.type === "Assignment");
    expect(discussion?.checkpointsUnknown).toBe(true);
    expect(assignment?.checkpointsUnknown).toBe(false);
  });
});

describe("DISCUSSION_CHECKPOINTS_UNREADABLE_REASON - step-10 review, C7: the refusal reason must name OUR limitation, never the discussion's", () => {
  it("states inability plainly, and is not phrased as a hedge about the discussion itself", () => {
    // Pin the FACT, never the exact sentence (this repo has twice had
    // source-text assertions force contorted implementations): the reason
    // must assert this app CANNOT read the structure, not that a discussion
    // MIGHT have one.
    expect(DISCUSSION_CHECKPOINTS_UNREADABLE_REASON).toMatch(/cannot read/i);
    expect(DISCUSSION_CHECKPOINTS_UNREADABLE_REASON).not.toMatch(/may carry/i);
    expect(DISCUSSION_CHECKPOINTS_UNREADABLE_REASON).not.toMatch(/might have/i);
  });
});

describe("readModuleTemplateAction - Page body", () => {
  it("reads a Page item's body via getPage and reports it as description", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([item({ id: 9, type: "Page", contentId: null, pageUrl: "week-3-overview" })]),
    ]);
    mockedGetPage.mockResolvedValue({
      pageId: 1,
      url: "week-3-overview",
      title: "Overview",
      body: "<p>Welcome to week 3.</p>",
      published: true,
      updatedAt: null,
    });
    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    expect(result.template.items[0].description).toBe("<p>Welcome to week 3.</p>");
    expect(mockedGetGradable).not.toHaveBeenCalled();
  });
});

describe("readModuleTemplateAction - AC6: per-item failure is per-item", () => {
  it("one item's Canvas failure lands in `failures` and does not drop the rest of the module", async () => {
    mockedListModules.mockResolvedValue([
      moduleWith([
        item({ id: 1, type: "Assignment", contentId: 10, title: "Good item" }),
        item({ id: 2, type: "Assignment", contentId: 20, title: "Bad item" }),
      ]),
    ]);
    mockedGetGradable.mockImplementation(async (_courseUrl, _kind, contentId) => {
      if (contentId === 20) throw new Error("Canvas rejected the request.");
      return { title: "Good item", description: "", submissionTypes: [] };
    });

    const result = await readModuleTemplateAction("course", 5);
    if (!("template" in result)) throw new Error("expected a template");
    expect(result.template.items).toHaveLength(1);
    expect(result.template.items[0].title).toBe("Good item");
    expect(result.template.failures).toHaveLength(1);
    expect(result.template.failures[0]).toMatchObject({ itemId: 2, title: "Bad item", reason: "Canvas rejected the request." });
  });

  it("a whole-module failure (e.g. requireOwner rejects) returns a top-level error, not a thrown exception", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("not an owner"));
    const result = await readModuleTemplateAction("course", 5);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("not an owner");
  });
});
