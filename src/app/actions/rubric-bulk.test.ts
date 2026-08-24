// Coverage for rubric-bulk.ts (docs/rubric-bulk-action-acceptance-criteria.md,
// chunk H, AC3/AC4/AC6). Canvas and the LLM layer are fully mocked; nothing
// here makes a live call. parseGeneratedRubric is left UNMOCKED (it is a
// pure function) so the generation-phase tests exercise the real parse path,
// including the "the model returned unparseable text" failure.
// buildPercentSpecFromRows/buildRubricBulkPlan (src/lib/rubric-bulk-plan.ts)
// are ALSO left unmocked -- they are the pure core this file imports instead
// of a local twin, and the seam-closing point is that this file's own tests
// exercise the real scaling/eligibility/grouping logic end to end, not a
// stand-in for it.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/grade/rubric", () => ({
  generateRubric: vi.fn(),
}));

vi.mock("@/lib/canvas-modules", () => ({
  createRubric: vi.fn(),
  bulkAssociateRubric: vi.fn(),
  listBulkItems: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { generateRubric } from "@/lib/grade/rubric";
import { createRubric, bulkAssociateRubric, listBulkItems } from "@/lib/canvas-modules";
import {
  generateRubricSpecsAction,
  materializeAndAssociateRubricAction,
  generateAndAssociateRubricAction,
  type RubricTargetItem,
} from "./rubric-bulk";

const mockedGenerateRubric = vi.mocked(generateRubric);
const mockedCreateRubric = vi.mocked(createRubric);
const mockedBulkAssociateRubric = vi.mocked(bulkAssociateRubric);
const mockedListBulkItems = vi.mocked(listBulkItems);

const COURSE_URL = "https://canvas.example.com/courses/1";

// A rubric that parses into two areas, 60% and 40%, matching generateRubric's
// own documented format (src/lib/grade/rubric.ts:196-200).
const TWO_AREA_RUBRIC_TEXT = [
  "Area A (60%): Covers the first half.",
  "  Excellent (100% -- no deductions): Full marks criteria.",
  "  Meets Expectations (75% -- 25% deducted): Partial criteria.",
  "  Needs Improvement (50% -- 50% deducted): Weak criteria.",
  "Area B (40%): Covers the second half.",
  "  Excellent (100% -- no deductions): Full marks criteria.",
  "  Meets Expectations (75% -- 25% deducted): Partial criteria.",
  "  Needs Improvement (50% -- 50% deducted): Weak criteria.",
].join("\n");

function assignmentTarget(overrides: Partial<RubricTargetItem> = {}): RubricTargetItem {
  return {
    itemId: "item-1",
    kind: "Assignment",
    contentId: 101,
    pointsPossible: 100,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" } as never);
  // Default: the course-level assignments fetch (resolveNewQuizFlags) finds
  // no rows at all, so every target falls back to its own caller-supplied
  // `isNewQuiz` (undefined -> "not a New Quiz"). Tests that care about the
  // Canvas-derived flag override this explicitly.
  mockedListBulkItems.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Phase 1: generateRubricSpecsAction
// ---------------------------------------------------------------------------

describe("generateRubricSpecsAction", () => {
  it("returns outcomes keyed by request key, not array position", async () => {
    mockedGenerateRubric.mockImplementation(async (instructions) => {
      if (instructions === "fails") throw new Error("model exploded");
      return TWO_AREA_RUBRIC_TEXT;
    });

    const result = await generateRubricSpecsAction([
      { key: "b", instructions: "fails" },
      { key: "a", instructions: "ok" },
    ]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    const byKey = new Map(result.outcomes.map((o) => [o.key, o]));
    expect(byKey.get("a")).toMatchObject({ status: "ok" });
    expect(byKey.get("b")).toMatchObject({ status: "failed", reason: "model exploded" });
  });

  it("reports a rejected generateRubric call as failed with its message, never throwing the whole action", async () => {
    mockedGenerateRubric.mockRejectedValue(new Error("HTTP 500"));

    const result = await generateRubricSpecsAction([{ key: "x", instructions: "instructions" }]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([{ key: "x", status: "failed", reason: "HTTP 500" }]);
  });

  it("reports unparseable model text as a failed outcome with a named reason", async () => {
    mockedGenerateRubric.mockResolvedValue("this is not a rubric at all, no area lines here");

    const result = await generateRubricSpecsAction([{ key: "x", instructions: "instructions" }]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([
      { key: "x", status: "failed", reason: "Could not parse the generated rubric." },
    ]);
  });

  it("returns an empty outcomes array and never calls generateRubric when given no requests", async () => {
    const result = await generateRubricSpecsAction([]);
    expect(result).toEqual({ outcomes: [] });
    expect(mockedGenerateRubric).not.toHaveBeenCalled();
  });

  it("calls requireOwner exactly once regardless of how many specs are requested", async () => {
    mockedGenerateRubric.mockResolvedValue(TWO_AREA_RUBRIC_TEXT);
    await generateRubricSpecsAction([
      { key: "a", instructions: "i1" },
      { key: "b", instructions: "i2" },
      { key: "c", instructions: "i3" },
    ]);
    expect(requireOwner).toHaveBeenCalledTimes(1);
  });

  it("returns { error } when requireOwner rejects, never throwing", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("not signed in"));
    const result = await generateRubricSpecsAction([{ key: "x", instructions: "i" }]);
    expect(result).toEqual({ error: "not signed in" });
  });
});

// ---------------------------------------------------------------------------
// Phase 2: materializeAndAssociateRubricAction
// ---------------------------------------------------------------------------

describe("materializeAndAssociateRubricAction - eligibility (AC4)", () => {
  it("skips a non-Assignment kind with reason ineligible-kind and never calls Canvas for it", async () => {
    const targets = [assignmentTarget({ itemId: "page-1", kind: "Page", contentId: null })];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, [{ area: "A", weight: "100%", description: "", subcategories: [] }], targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([{ itemId: "page-1", status: "skipped", reason: "ineligible-kind" }]);
    expect(mockedCreateRubric).not.toHaveBeenCalled();
    expect(mockedBulkAssociateRubric).not.toHaveBeenCalled();
  });

  it("skips an Assignment-kind item with no contentId, reason no-content-id", async () => {
    const targets = [assignmentTarget({ itemId: "a-1", contentId: null })];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, [{ area: "A", weight: "100%", description: "", subcategories: [] }], targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([{ itemId: "a-1", status: "skipped", reason: "no-content-id" }]);
  });

  it("refuses a caller-flagged New Quiz with a named reason, never attempting the Canvas write", async () => {
    const targets = [assignmentTarget({ itemId: "nq-1", isNewQuiz: true })];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, [{ area: "A", weight: "100%", description: "", subcategories: [] }], targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([{ itemId: "nq-1", status: "skipped", reason: "new-quiz" }]);
    expect(mockedCreateRubric).not.toHaveBeenCalled();
  });

  it("skips an item that already carries a rubric, with the existing id attached, and never replaces it (AC3)", async () => {
    const targets = [assignmentTarget({ itemId: "has-1", existingRubricId: 55 })];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, [{ area: "A", weight: "100%", description: "", subcategories: [] }], targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([
      { itemId: "has-1", status: "skipped", reason: "already-has-rubric", existingRubricId: 55 },
    ]);
    expect(mockedCreateRubric).not.toHaveBeenCalled();
  });

  it("reports ineligible/skipped items alongside eligible ones in the same call, never dropping any of them", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 900, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const targets = [
      assignmentTarget({ itemId: "eligible-1", contentId: 101, pointsPossible: 100 }),
      assignmentTarget({ itemId: "page-1", kind: "Page", contentId: null }),
      assignmentTarget({ itemId: "has-1", contentId: 102, existingRubricId: 7 }),
    ];

    const result = await materializeAndAssociateRubricAction(
      COURSE_URL,
      [{ area: "A", weight: "100%", description: "", subcategories: [] }],
      targets
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toHaveLength(3);
    const byId = new Map(result.outcomes.map((o) => [o.itemId, o]));
    expect(byId.get("eligible-1")).toMatchObject({ status: "updated" });
    expect(byId.get("page-1")).toMatchObject({ status: "skipped", reason: "ineligible-kind" });
    expect(byId.get("has-1")).toMatchObject({ status: "skipped", reason: "already-has-rubric" });
  });
});

describe("materializeAndAssociateRubricAction - one rubric per distinct point total (AC1)", () => {
  it("creates one rubric per distinct pointsPossible, scaled correctly, and associates each to its own group", async () => {
    mockedCreateRubric.mockImplementation(async (_url, input) => ({
      id: input.title.includes("50") ? 501 : 1001,
      title: input.title,
    }));
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const rows = [
      { area: "Area A", weight: "60%", description: "d", subcategories: [] },
      { area: "Area B", weight: "40%", description: "d", subcategories: [] },
    ];
    const targets = [
      assignmentTarget({ itemId: "hundred-1", contentId: 101, pointsPossible: 100 }),
      assignmentTarget({ itemId: "fifty-1", contentId: 201, pointsPossible: 50 }),
    ];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(mockedCreateRubric).toHaveBeenCalledTimes(2);
    expect(mockedBulkAssociateRubric).toHaveBeenCalledTimes(2);

    // The 100-point group's criteria: 60 and 40 points.
    const hundredCall = mockedCreateRubric.mock.calls.find((c) => c[1].title.includes("100"))!;
    expect(hundredCall[1].criteria.map((c) => c.points)).toEqual([60, 40]);
    expect(hundredCall[1].criteria[0].ratings.map((r) => r.points)).toEqual([60, 45, 30]);

    // The 50-point group's criteria: 30 and 20 points.
    const fiftyCall = mockedCreateRubric.mock.calls.find((c) => c[1].title.includes("50"))!;
    expect(fiftyCall[1].criteria.map((c) => c.points)).toEqual([30, 20]);

    expect(result.outcomes.find((o) => o.itemId === "hundred-1")).toMatchObject({ status: "updated", pointsPossible: 100 });
    expect(result.outcomes.find((o) => o.itemId === "fifty-1")).toMatchObject({ status: "updated", pointsPossible: 50 });
  });

  it("writes distinct-total groups strictly sequentially, never in parallel", async () => {
    const order: string[] = [];
    mockedCreateRubric.mockImplementation(async (_url, input) => {
      order.push(`create:${input.title}`);
      return { id: input.title.includes("50") ? 501 : 1001, title: input.title };
    });
    mockedBulkAssociateRubric.mockImplementation(async (_url, rubricId) => {
      order.push(`associate:${rubricId}`);
      return { updated: 1, failures: [] };
    });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "a", contentId: 1, pointsPossible: 100 }),
      assignmentTarget({ itemId: "b", contentId: 2, pointsPossible: 50 }),
    ];

    await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    // Each group's create must complete (and its associate must run) before
    // the next group's create begins -- proves no group is started while a
    // sibling group's write is still in flight.
    expect(order).toEqual(["create:Generated Rubric (100 pts)", "associate:1001", "create:Generated Rubric (50 pts)", "associate:501"]);
  });
});

describe("materializeAndAssociateRubricAction - two-phase separation (AC6): a create failure never contaminates another group", () => {
  it("marks only the failed group's items failed, with the create error's own reason; the other group still succeeds", async () => {
    mockedCreateRubric.mockImplementation(async (_url, input) => {
      if (input.title.includes("50")) throw new Error("Canvas rejected the rubric");
      return { id: 1001, title: input.title };
    });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "ok-1", contentId: 1, pointsPossible: 100 }),
      assignmentTarget({ itemId: "fail-1", contentId: 2, pointsPossible: 50 }),
    ];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes.find((o) => o.itemId === "ok-1")).toMatchObject({ status: "updated" });
    expect(result.outcomes.find((o) => o.itemId === "fail-1")).toMatchObject({
      status: "failed",
      reason: "Canvas rejected the rubric",
    });
    // A create failure creates nothing, so it is never reported as an orphan.
    expect(result.orphans).toEqual([]);
  });
});

describe("materializeAndAssociateRubricAction - per-item association failure and the orphan report (AC3)", () => {
  it("reports a per-item association failure with its own reason while other items in the same group succeed", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({
      updated: 1,
      failures: [{ id: "2", error: "assignment locked" }],
    });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "ok-1", contentId: 1, pointsPossible: 100 }),
      assignmentTarget({ itemId: "locked-1", contentId: 2, pointsPossible: 100 }),
    ];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes.find((o) => o.itemId === "ok-1")).toMatchObject({ status: "updated" });
    expect(result.outcomes.find((o) => o.itemId === "locked-1")).toMatchObject({
      status: "failed",
      reason: "assignment locked",
    });
    // Not every association failed, so the rubric is in use -- not an orphan.
    expect(result.orphans).toEqual([]);
  });

  it("reports the created rubric as an orphan by id/title/points when every association for it fails", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({
      updated: 0,
      failures: [
        { id: "1", error: "assignment locked" },
        { id: "2", error: "assignment locked" },
      ],
    });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "a", contentId: 1, pointsPossible: 100 }),
      assignmentTarget({ itemId: "b", contentId: 2, pointsPossible: 100 }),
    ];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.orphans).toEqual([
      { rubricId: 1001, rubricTitle: "Generated Rubric (100 pts)", pointsPossible: 100, attemptedItemIds: ["a", "b"] },
    ]);
    expect(result.outcomes.every((o) => o.status === "failed")).toBe(true);
  });
});

describe("materializeAndAssociateRubricAction - misc", () => {
  it("returns { error } when given zero rubric rows, without calling Canvas", async () => {
    const result = await materializeAndAssociateRubricAction(COURSE_URL, [], [assignmentTarget()]);
    expect("error" in result).toBe(true);
    expect(mockedCreateRubric).not.toHaveBeenCalled();
  });

  it("calls requireOwner exactly once regardless of how many distinct-total groups fan out", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "t" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "a", contentId: 1, pointsPossible: 100 }),
      assignmentTarget({ itemId: "b", contentId: 2, pointsPossible: 50 }),
      assignmentTarget({ itemId: "c", contentId: 3, pointsPossible: 25 }),
    ];

    await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);
    expect(requireOwner).toHaveBeenCalledTimes(1);
  });

  it("skips a null pointsPossible item with reason missing-points instead of guessing 100 (seam close: classifyRubricEligibility, not the old local fallback)", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "a", contentId: 1, pointsPossible: null }),
      assignmentTarget({ itemId: "b", contentId: 2, pointsPossible: 100 }),
    ];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes.find((o) => o.itemId === "a")).toEqual({
      itemId: "a",
      status: "skipped",
      reason: "missing-points",
    });
    expect(result.outcomes.find((o) => o.itemId === "b")).toMatchObject({ status: "updated", pointsPossible: 100 });
    // Only item "b" is in the 100-point group -- "a" was never guessed into it.
    expect(mockedCreateRubric).toHaveBeenCalledTimes(1);
    expect(mockedBulkAssociateRubric).toHaveBeenCalledWith(COURSE_URL, 1001, ["2"], undefined);
  });

  it("returns { error } when the generated rows do not sum to ~100 percent, without calling Canvas (AC1b, via the imported buildPercentSpecFromRows)", async () => {
    const rows = [{ area: "A", weight: "60%", description: "", subcategories: [] }];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, [assignmentTarget()]);

    expect("error" in result).toBe(true);
    expect(mockedCreateRubric).not.toHaveBeenCalled();
    expect(mockedBulkAssociateRubric).not.toHaveBeenCalled();
  });

  it("apportions rounding with largest-remainder so criteria sum back to an odd total, not plain per-criterion Math.round (AC1b's sharpest constraint, imported from rubric-bulk-plan.ts)", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (7 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    // 33/33/34 percent of 7 points: plain per-criterion Math.round gives
    // 2/2/2 = 6, one point short of the assignment's real total. The
    // imported largest-remainder apportionment must sum to exactly 7.
    const rows = [
      { area: "A", weight: "33%", description: "", subcategories: [] },
      { area: "B", weight: "33%", description: "", subcategories: [] },
      { area: "C", weight: "34%", description: "", subcategories: [] },
    ];
    const targets = [assignmentTarget({ itemId: "x", contentId: 1, pointsPossible: 7 })];

    await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    const call = mockedCreateRubric.mock.calls[0];
    const points = call[1].criteria.map((c) => c.points);
    expect(points.reduce((a, b) => a + b, 0)).toBe(7);
    expect(points).toEqual([2, 2, 3]);
  });
});

describe("materializeAndAssociateRubricAction - New Quiz flag is Canvas-derived, not caller-hoped-for (AC's risk 3)", () => {
  it("refuses an item the caller did NOT flag as a New Quiz, once the course-level assignments fetch reports it as one", async () => {
    mockedListBulkItems.mockResolvedValue([
      { id: "101", title: "Quiz LTI", published: true, dueAt: null, pointsPossible: 100, isNewQuiz: true },
    ]);

    // Deliberately no `isNewQuiz` on the target -- the old behaviour (an
    // optional caller-supplied flag defaulting to "not a New Quiz") would
    // let this attempt a Canvas write; this file must refuse it anyway
    // because it now runs the real classifier itself.
    const targets = [assignmentTarget({ itemId: "nq-real", contentId: 101 })];

    const result = await materializeAndAssociateRubricAction(
      COURSE_URL,
      [{ area: "A", weight: "100%", description: "", subcategories: [] }],
      targets
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([{ itemId: "nq-real", status: "skipped", reason: "new-quiz" }]);
    expect(mockedCreateRubric).not.toHaveBeenCalled();
    expect(mockedListBulkItems).toHaveBeenCalledWith(COURSE_URL, "Assignment", undefined);
  });

  it("treats an item the fetch reports as NOT a New Quiz as an ordinary assignment, even if never explicitly flagged", async () => {
    mockedListBulkItems.mockResolvedValue([
      { id: "101", title: "Real Assignment", published: true, dueAt: null, pointsPossible: 100, isNewQuiz: undefined },
    ]);
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const targets = [assignmentTarget({ itemId: "ordinary-1", contentId: 101 })];

    const result = await materializeAndAssociateRubricAction(
      COURSE_URL,
      [{ area: "A", weight: "100%", description: "", subcategories: [] }],
      targets
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([
      { itemId: "ordinary-1", status: "updated", rubricId: 1001, rubricTitle: "Generated Rubric (100 pts)", pointsPossible: 100 },
    ]);
  });

  it("fetches the course's assignments exactly once per call, never once per target or per distinct-total group", async () => {
    mockedListBulkItems.mockResolvedValue([]);
    mockedCreateRubric.mockImplementation(async (_url, input) => ({
      id: input.title.includes("50") ? 501 : 1001,
      title: input.title,
    }));
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const targets = [
      assignmentTarget({ itemId: "a", contentId: 1, pointsPossible: 100 }),
      assignmentTarget({ itemId: "b", contentId: 2, pointsPossible: 50 }),
      assignmentTarget({ itemId: "c", contentId: 3, pointsPossible: 25 }),
    ];

    await materializeAndAssociateRubricAction(
      COURSE_URL,
      [{ area: "A", weight: "100%", description: "", subcategories: [] }],
      targets
    );

    expect(mockedListBulkItems).toHaveBeenCalledTimes(1);
  });

  it("never fetches the course's assignments when nothing in the selection could possibly need the flag (e.g. an all-Page selection)", async () => {
    const targets = [assignmentTarget({ itemId: "page-1", kind: "Page", contentId: null })];

    await materializeAndAssociateRubricAction(
      COURSE_URL,
      [{ area: "A", weight: "100%", description: "", subcategories: [] }],
      targets
    );

    expect(mockedListBulkItems).not.toHaveBeenCalled();
  });

  it("falls back to the caller's own isNewQuiz flag when the course-level fetch itself fails, rather than failing the whole operation", async () => {
    mockedListBulkItems.mockRejectedValue(new Error("Canvas 500"));

    const targets = [assignmentTarget({ itemId: "nq-1", contentId: 101, isNewQuiz: true })];

    const result = await materializeAndAssociateRubricAction(
      COURSE_URL,
      [{ area: "A", weight: "100%", description: "", subcategories: [] }],
      targets
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([{ itemId: "nq-1", status: "skipped", reason: "new-quiz" }]);
  });

  // C4: the previous version of this file swallowed a fetch failure into an
  // empty map, and toPlanItem's `?? false` fallback then treated the item as
  // an ordinary assignment -- this is the REAL production path, since the
  // hook's own caller supplies `isNewQuiz` only from THIS file's fetch, never
  // hardcodes `true` the way the old, now-misleading test above did. A guard
  // that cannot verify must refuse, not assume.
  it("refuses an Assignment target with no caller-supplied isNewQuiz when the course-level fetch itself fails (C4: the real production path, not the caller-flagged one)", async () => {
    mockedListBulkItems.mockRejectedValue(new Error("Canvas 500"));

    const targets = [assignmentTarget({ itemId: "unverified-1", contentId: 101 })];

    const result = await materializeAndAssociateRubricAction(
      COURSE_URL,
      [{ area: "A", weight: "100%", description: "", subcategories: [] }],
      targets
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes).toEqual([
      { itemId: "unverified-1", status: "skipped", reason: "new-quiz-unverifiable" },
    ]);
    expect(mockedCreateRubric).not.toHaveBeenCalled();
    expect(mockedBulkAssociateRubric).not.toHaveBeenCalled();
  });
});

describe("materializeAndAssociateRubricAction - one assignment placed in two modules (C9)", () => {
  it("de-duplicates the ids sent to bulkAssociateRubric and reports the same outcome to every module item sharing the contentId", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "module-1-item", contentId: 101, pointsPossible: 100 }),
      assignmentTarget({ itemId: "module-2-item", contentId: 101, pointsPossible: 100 }),
    ];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // Sent ONCE, not twice, for the same underlying Canvas assignment.
    expect(mockedBulkAssociateRubric).toHaveBeenCalledWith(COURSE_URL, 1001, ["101"], undefined);
    expect(result.outcomes.find((o) => o.itemId === "module-1-item")).toMatchObject({ status: "updated" });
    expect(result.outcomes.find((o) => o.itemId === "module-2-item")).toMatchObject({ status: "updated" });
  });

  it("reports a shared association failure to both module items, never one failure lost or double-counted", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({
      updated: 0,
      failures: [{ id: "101", error: "assignment locked" }],
    });

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [
      assignmentTarget({ itemId: "module-1-item", contentId: 101, pointsPossible: 100 }),
      assignmentTarget({ itemId: "module-2-item", contentId: 101, pointsPossible: 100 }),
    ];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.outcomes.find((o) => o.itemId === "module-1-item")).toMatchObject({
      status: "failed",
      reason: "assignment locked",
    });
    expect(result.outcomes.find((o) => o.itemId === "module-2-item")).toMatchObject({
      status: "failed",
      reason: "assignment locked",
    });
  });
});

describe("materializeAndAssociateRubricAction - a throw from bulkAssociateRubric still reports the orphan (C10)", () => {
  it("reports the just-created rubric as an orphan when bulkAssociateRubric itself throws, instead of losing the report to an unwind past the try", async () => {
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockRejectedValue(new Error("could not resolve course"));

    const rows = [{ area: "A", weight: "100%", description: "", subcategories: [] }];
    const targets = [assignmentTarget({ itemId: "a", contentId: 1, pointsPossible: 100 })];

    const result = await materializeAndAssociateRubricAction(COURSE_URL, rows, targets);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.orphans).toEqual([
      { rubricId: 1001, rubricTitle: "Generated Rubric (100 pts)", pointsPossible: 100, attemptedItemIds: ["a"] },
    ]);
    expect(result.outcomes).toEqual([{ itemId: "a", status: "failed", reason: "could not resolve course" }]);
  });
});

// ---------------------------------------------------------------------------
// The single-spec convenience action
// ---------------------------------------------------------------------------

describe("generateAndAssociateRubricAction - two phases, never interleaved (AC6)", () => {
  it("returns phase 'generation-failed' and never calls createRubric/bulkAssociateRubric when generation fails", async () => {
    mockedGenerateRubric.mockRejectedValue(new Error("model exploded"));

    const result = await generateAndAssociateRubricAction(COURSE_URL, "instructions", [assignmentTarget()]);

    expect(result).toEqual({ phase: "generation-failed", reason: "model exploded" });
    expect(mockedCreateRubric).not.toHaveBeenCalled();
    expect(mockedBulkAssociateRubric).not.toHaveBeenCalled();
  });

  it("returns phase 'generation-failed' when the model text is unparseable, distinct from a Canvas failure shape", async () => {
    mockedGenerateRubric.mockResolvedValue("no area lines at all");

    const result = await generateAndAssociateRubricAction(COURSE_URL, "instructions", [assignmentTarget()]);

    expect(result).toEqual({
      phase: "generation-failed",
      reason: "Could not parse the generated rubric.",
    });
  });

  it("proceeds to materialize and associate when generation succeeds", async () => {
    mockedGenerateRubric.mockResolvedValue(TWO_AREA_RUBRIC_TEXT);
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const result = await generateAndAssociateRubricAction(COURSE_URL, "instructions", [assignmentTarget()]);

    expect(result).toMatchObject({
      phase: "done",
      result: { outcomes: [{ itemId: "item-1", status: "updated" }] },
    });
  });

  it("calls requireOwner exactly once for the whole combined operation, not once per phase", async () => {
    mockedGenerateRubric.mockResolvedValue(TWO_AREA_RUBRIC_TEXT);
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    await generateAndAssociateRubricAction(COURSE_URL, "instructions", [assignmentTarget()]);
    expect(requireOwner).toHaveBeenCalledTimes(1);
  });
});

describe("generateAndAssociateRubricAction - AC3's idempotency check runs before the model spend, not just before the Canvas write (C5)", () => {
  it("never calls generateRubric on a re-run where every target already has a rubric", async () => {
    const targets = [
      assignmentTarget({ itemId: "a", contentId: 1, existingRubricId: 10 }),
      assignmentTarget({ itemId: "b", contentId: 2, existingRubricId: 20 }),
    ];

    const result = await generateAndAssociateRubricAction(COURSE_URL, "instructions", targets);

    expect(mockedGenerateRubric).not.toHaveBeenCalled();
    expect(result).toEqual({
      phase: "done",
      result: {
        outcomes: [
          { itemId: "a", status: "skipped", reason: "already-has-rubric", existingRubricId: 10 },
          { itemId: "b", status: "skipped", reason: "already-has-rubric", existingRubricId: 20 },
        ],
        orphans: [],
      },
    });
  });

  it("never calls generateRubric on an all-ineligible selection either -- the zero-spend short-circuit is not limited to already-has-rubric", async () => {
    const targets = [assignmentTarget({ itemId: "page-1", kind: "Page", contentId: null })];

    const result = await generateAndAssociateRubricAction(COURSE_URL, "instructions", targets);

    expect(mockedGenerateRubric).not.toHaveBeenCalled();
    expect(result).toEqual({
      phase: "done",
      result: { outcomes: [{ itemId: "page-1", status: "skipped", reason: "ineligible-kind" }], orphans: [] },
    });
  });

  it("still calls generateRubric exactly once when at least one target in a mixed selection is genuinely eligible", async () => {
    mockedGenerateRubric.mockResolvedValue(TWO_AREA_RUBRIC_TEXT);
    mockedCreateRubric.mockResolvedValue({ id: 1001, title: "Generated Rubric (100 pts)" });
    mockedBulkAssociateRubric.mockResolvedValue({ updated: 1, failures: [] });

    const targets = [
      assignmentTarget({ itemId: "has-1", contentId: 1, existingRubricId: 10 }),
      assignmentTarget({ itemId: "eligible-1", contentId: 2, pointsPossible: 100 }),
    ];

    const result = await generateAndAssociateRubricAction(COURSE_URL, "instructions", targets);

    expect(mockedGenerateRubric).toHaveBeenCalledTimes(1);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result).toMatchObject({
      phase: "done",
      result: {
        outcomes: expect.arrayContaining([
          { itemId: "has-1", status: "skipped", reason: "already-has-rubric", existingRubricId: 10 },
          expect.objectContaining({ itemId: "eligible-1", status: "updated" }),
        ]),
      },
    });
  });
});
