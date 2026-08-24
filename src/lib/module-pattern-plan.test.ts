// Tests for module-pattern-plan.ts
// (docs/carry-module-pattern-forward-acceptance-criteria.md - section 5 is
// the FINAL CONTRACT; AC5, AC6, AC8, D3b, D4, D4b, D13).
//
// Sabotage checks performed by hand against the real source file (not
// committed as broken code - see the final report for the exact
// before/after output of each):
//   1. Source-exclusion: commented out the `input.targets.filter(...)` line
//      in buildModulePatternPlan so a target equal to the source id was NOT
//      dropped - reddened "drops a target whose id equals the source's id"
//      below, because the source module then appeared in `plan.targets`.
//   2. Blocked decision: changed the `if (patternResult.kind === "blocked")`
//      branch's decision to `"create"` - reddened the no-token-match test,
//      because a blocked item was then reported as a normal create with a
//      null resolvedTitle where the assertion expected "blocked-unnumbered".
//   3. Case-insensitive skip match: changed `normalizeTitleForMatch` to
//      return `title` unchanged (no trim/lowercase) - reddened the
//      case/whitespace-insensitive skip test, because "  lab 2  " no longer
//      matched "Lab 2" and the row fell through to "create" instead of
//      "skip".
// All three restored, and the suite returned to green - see the report.
//
// D18 additions, sabotage-checked the same way (see the final report for
// exact before/after output):
//   4. patternTemplate: changed `patternTemplate: pattern.template` to
//      `patternTemplate: null` in the resolved branch - reddened both the
//      "carries the inferred pattern text" test and the D3b
//      "Chapter {n} Discussion" test, which both expect a non-null template.
//   5. excludedItemIds: changed `usableSourceItems` back to
//      `input.source.items` (i.e. stopped filtering) - reddened "drops the
//      excluded item from every target's item list", because item id 1
//      reappeared in both targets' item lists and the totals count rose from
//      2 to 4.
//   6. sourceWeek: changed the returned field to a hardcoded `0` - reddened
//      both sourceWeek tests: the numbered-source test expected 2, got 0; the
//      unnumbered-source test expected null, got 0.
// All three restored, and the suite returned to green - see the report.

import { describe, it, expect } from "vitest";
import { buildModulePatternPlan, isCarryWriteSupportedKind, type ModulePatternPlanTargetInput } from "./module-pattern-plan";
import type { ModuleTemplate, TemplateItem } from "@/app/actions/module-template";
import { planBulkModuleCreation } from "./bulk-module-plan";

function makeItem(overrides: Partial<TemplateItem> & Pick<TemplateItem, "id" | "title">): TemplateItem {
  return {
    type: "Assignment",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: null,
    contentId: 100,
    dueAt: null,
    pointsPossible: 10,
    description: null,
    submissionTypes: [],
    notCarried: [],
    checkpointsUnknown: false,
    ...overrides,
  };
}

function makeSource(overrides: Partial<ModuleTemplate> & Pick<ModuleTemplate, "moduleId" | "moduleName" | "items">): ModuleTemplate {
  return {
    failures: [],
    ...overrides,
  };
}

function makeTarget(id: number, name: string, existingItems: Array<{ id: number; title: string }> = []): ModulePatternPlanTargetInput {
  return { id, name, existingItems };
}

const BASE_INPUT_DEFAULTS = {
  courseStartDate: null,
  assignmentDueRule: null,
  onExisting: "skip" as const,
};

describe("buildModulePatternPlan - the four decisions", () => {
  it("creates when no existing item matches the resolved title", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02: Loops",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.targets).toHaveLength(1);
    const [row] = plan.targets[0].items;
    expect(row.decision).toBe("create");
    expect(row.sourceTitle).toBe("Lab 2");
    expect(row.resolvedTitle).toBe("Lab 5");
    expect(row.matchedExistingId).toBeNull();
    expect(plan.totals).toEqual({ create: 1, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 });
  });

  it("skips when a matching title already exists and onExisting is 'skip'", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05", [{ id: 900, title: "Lab 5" }])],
      onExisting: "skip",
    });
    const [row] = plan.targets[0].items;
    expect(row.decision).toBe("skip");
    expect(row.matchedExistingId).toBe(900);
    expect(plan.totals.skip).toBe(1);
  });

  it("overwrites the same match when onExisting is 'overwrite'", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05", [{ id: 900, title: "Lab 5" }])],
      onExisting: "overwrite",
    });
    const [row] = plan.targets[0].items;
    expect(row.decision).toBe("overwrite");
    expect(row.matchedExistingId).toBe(900);
    expect(plan.totals.overwrite).toBe(1);
  });

  it("the by-title match is case- and trim-insensitive, matching planBulkModuleCreation's own rule", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05", [{ id: 900, title: "  lab 5  " }])],
      onExisting: "skip",
    });
    expect(plan.targets[0].items[0].decision).toBe("skip");
  });

  it("blocks with 'no-token-match' when the item's digits mean something unrelated", () => {
    const source = makeSource({
      moduleId: 3,
      moduleName: "Module 3",
      items: [makeItem({ id: 1, title: "Essay 1" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    const [row] = plan.targets[0].items;
    expect(row.decision).toBe("blocked-unnumbered");
    expect(row.blockedReasonCode).toBe("no-token-match");
    expect(row.resolvedTitle).toBeNull();
    expect(row.dueAtIso).toBeNull();
    expect(row.dueDateOutcome).toBeNull();
    expect(plan.totals.blocked).toBe(1);
  });

  it("blocks with 'source-module-unnumbered' when the source module itself carries no number", () => {
    const source = makeSource({
      moduleId: 9,
      moduleName: "Orientation",
      items: [makeItem({ id: 1, title: "Final Project" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.targets[0].items[0].blockedReasonCode).toBe("source-module-unnumbered");
  });

  it("an instructor-authored {n} pattern unblocks an item that inference alone would block", () => {
    const source = makeSource({
      moduleId: 9,
      moduleName: "Orientation",
      items: [makeItem({ id: 1, title: "Final Project" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
      authoredPatterns: { 1: "Week {n} Reflection" },
    });
    const [row] = plan.targets[0].items;
    expect(row.decision).toBe("create");
    expect(row.resolvedTitle).toBe("Week 5 Reflection");
  });

  it("blocks with 'target-module-unnumbered' when the TARGET module's own name carries no number", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(50, "Course Wrap-Up")],
    });
    const [row] = plan.targets[0].items;
    expect(row.decision).toBe("blocked-unnumbered");
    expect(row.blockedReasonCode).toBe("target-module-unnumbered");
    expect(plan.targets[0].targetWeek).toBeNull();
  });
});

describe("buildModulePatternPlan - source cannot be a target (structural, not a UI filter)", () => {
  it("drops a target whose id equals the source's id, and records it", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(2, "Module 02"), makeTarget(5, "Module 05")],
    });
    expect(plan.targets.map((t) => t.targetModuleId)).toEqual([5]);
    expect(plan.excludedSourceTargetId).toBe(2);
  });

  it("excludedSourceTargetId is null when the source id was never in the target list", () => {
    const source = makeSource({ moduleId: 2, moduleName: "Module 02", items: [] });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.excludedSourceTargetId).toBeNull();
  });
});

describe("buildModulePatternPlan - D3b: source and resolved title travel side by side", () => {
  it("the known false positive is visible on the row, not hidden by it (do not fix here)", () => {
    const source = makeSource({
      moduleId: 12,
      moduleName: "Module 12",
      items: [makeItem({ id: 1, title: "Chapter 12 Discussion", type: "Discussion" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(3, "Module 3")],
    });
    const [row] = plan.targets[0].items;
    expect(row.sourceTitle).toBe("Chapter 12 Discussion");
    expect(row.resolvedTitle).toBe("Chapter 03 Discussion");
  });
});

describe("buildModulePatternPlan - AC6: per-object read failures are surfaced, not dropped silently", () => {
  it("passes source.failures through as sourceReadFailures", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [],
      failures: [{ itemId: 77, title: "Some Quiz", type: "Quiz", reason: "Canvas timed out." }],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.sourceReadFailures).toEqual([{ itemId: 77, title: "Some Quiz", type: "Quiz", reason: "Canvas timed out." }]);
  });
});

describe("buildModulePatternPlan - D13: due date transposition passthrough", () => {
  const source = makeSource({
    moduleId: 2,
    moduleName: "Module 02",
    items: [makeItem({ id: 1, title: "Lab 2", dueAt: "2026-01-30T05:59:00.000Z" })],
  });

  it("outcome 'transposed-from-item' when the source item has a dueAt and the target week resolves", () => {
    const plan = buildModulePatternPlan({
      source,
      targets: [makeTarget(4, "Module 04")],
      courseStartDate: "2026-01-12",
      assignmentDueRule: "thu|23:59",
      onExisting: "skip",
    });
    const [row] = plan.targets[0].items;
    expect(row.dueDateOutcome).toBe("transposed-from-item");
    expect(row.dueAtIso).not.toBeNull();
  });

  it("outcome 'no-due-date' when there is no course start date at all", () => {
    const plan = buildModulePatternPlan({
      source,
      targets: [makeTarget(4, "Module 04")],
      courseStartDate: null,
      assignmentDueRule: "thu|23:59",
      onExisting: "skip",
    });
    const [row] = plan.targets[0].items;
    expect(row.dueDateOutcome).toBe("no-due-date");
    expect(row.dueAtIso).toBeNull();
    // Still creates - a missing due date never blocks the item (D13).
    expect(row.decision).toBe("create");
  });

  it("outcome 'course-due-rule' when the source item itself has no dueAt", () => {
    const noDueSource = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2", dueAt: null })],
    });
    const plan = buildModulePatternPlan({
      source: noDueSource,
      targets: [makeTarget(4, "Module 04")],
      courseStartDate: "2026-01-12",
      assignmentDueRule: "thu|23:59",
      onExisting: "skip",
    });
    expect(plan.targets[0].items[0].dueDateOutcome).toBe("course-due-rule");
  });
});

describe("buildModulePatternPlan - counts aggregate correctly across a mixed target", () => {
  it("one target with one of each decision reports matching per-target and plan-level totals", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [
        makeItem({ id: 1, title: "Lab 2" }), // create
        makeItem({ id: 2, title: "Essay 2" }), // create (2 matches module number)
        makeItem({ id: 3, title: "Reading" }), // blocked - no digits at all
      ],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05", [{ id: 900, title: "Essay 5" }])],
      onExisting: "overwrite",
    });
    const counts = plan.targets[0].counts;
    expect(counts).toEqual({ create: 1, skip: 0, overwrite: 1, blocked: 1, unsupported: 0 });
    expect(plan.totals).toEqual(counts);
  });
});

describe("buildModulePatternPlan - D18: patternTemplate on the row", () => {
  it("carries the inferred pattern text on a non-blocked row - the fastest false-positive signal", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02: Loops",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.targets[0].items[0].patternTemplate).toBe("Lab {n}");
  });

  it("carries an instructor-authored pattern's template too, not only an inferred one", () => {
    const source = makeSource({
      moduleId: 9,
      moduleName: "Orientation",
      items: [makeItem({ id: 1, title: "Final Project" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
      authoredPatterns: { 1: "Week {n} Reflection" },
    });
    expect(plan.targets[0].items[0].patternTemplate).toBe("Week {n} Reflection");
  });

  it("is null on a blocked-unnumbered row - there is no pattern to show", () => {
    const source = makeSource({
      moduleId: 3,
      moduleName: "Module 3",
      items: [makeItem({ id: 1, title: "Essay 1" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    const [row] = plan.targets[0].items;
    expect(row.decision).toBe("blocked-unnumbered");
    expect(row.patternTemplate).toBeNull();
  });

  it("makes the known D3b false positive visible on the pattern itself, not only the resolved title", () => {
    const source = makeSource({
      moduleId: 12,
      moduleName: "Module 12",
      items: [makeItem({ id: 1, title: "Chapter 12 Discussion", type: "Discussion" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(3, "Module 3")],
    });
    // "Chapter {n} Discussion" is the tell: a human sees at a glance that the
    // chapter number, not a module/week number, got tokenised.
    expect(plan.targets[0].items[0].patternTemplate).toBe("Chapter {n} Discussion");
  });
});

describe("buildModulePatternPlan - D18: excludedItemIds lets an instructor deselect a bad row", () => {
  it("drops the excluded item from every target's item list and from all counts", () => {
    const source = makeSource({
      moduleId: 12,
      moduleName: "Module 12",
      items: [
        makeItem({ id: 1, title: "Chapter 12 Discussion", type: "Discussion" }), // the false positive
        makeItem({ id: 2, title: "Lab 12" }),
      ],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(3, "Module 3"), makeTarget(4, "Module 4")],
      excludedItemIds: [1],
    });
    for (const target of plan.targets) {
      expect(target.items.map((i) => i.itemId)).toEqual([2]);
    }
    // The excluded item never occupies any of the five decision/count slots.
    expect(plan.totals).toEqual({ create: 2, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 });
  });

  it("with no excludedItemIds supplied, behaves exactly as before (the field is optional)", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.targets[0].items).toHaveLength(1);
  });

  it("excluding every item leaves a target with zero rows and zero-count totals, not an error", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
      excludedItemIds: [1],
    });
    expect(plan.targets[0].items).toEqual([]);
    expect(plan.totals).toEqual({ create: 0, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 });
  });

  // C1: the exclude checkbox used to be a one-way trapdoor -
  // `usableSourceItems` dropped an excluded item before any row was ever
  // built for it, so nothing survived to re-include it. Pin BOTH directions:
  // exclude removes the item from targets[].items and totals AND surfaces it
  // in `excludedItems`; re-include (an empty excludedItemIds on a fresh call
  // - this file is pure, so "re-include" is just "call again without it")
  // restores the row and its counts exactly as an unexcluded plan would have
  // them, and `excludedItems` goes back to empty.
  it("C1 round trip: excluding then re-including restores the row and its counts", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });

    const excludedPlan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
      excludedItemIds: [1],
    });
    expect(excludedPlan.targets[0].items).toEqual([]);
    expect(excludedPlan.totals).toEqual({ create: 0, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 });
    expect(excludedPlan.excludedItems).toEqual([{ itemId: 1, itemType: "Assignment", sourceTitle: "Lab 2" }]);
    expect(excludedPlan.sourceItemOrder).toEqual([1]);

    const reincludedPlan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
      excludedItemIds: [],
    });
    expect(reincludedPlan.excludedItems).toEqual([]);
    expect(reincludedPlan.targets[0].items).toHaveLength(1);
    expect(reincludedPlan.targets[0].items[0].decision).toBe("create");
    expect(reincludedPlan.targets[0].items[0].resolvedTitle).toBe("Lab 5");
    expect(reincludedPlan.totals).toEqual({ create: 1, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 });
  });
});

describe("buildModulePatternPlan - C2: unwritable kinds are disclosed, not counted as 'to create'", () => {
  it("isCarryWriteSupportedKind refuses ExternalUrl, ExternalTool and a File with no contentId, and accepts everything else", () => {
    expect(isCarryWriteSupportedKind("ExternalUrl", null)).toBe(false);
    expect(isCarryWriteSupportedKind("ExternalTool", 42)).toBe(false);
    expect(isCarryWriteSupportedKind("File", null)).toBe(false);
    expect(isCarryWriteSupportedKind("File", 42)).toBe(true);
    expect(isCarryWriteSupportedKind("Page", null)).toBe(true);
    expect(isCarryWriteSupportedKind("Assignment", null)).toBe(true);
    expect(isCarryWriteSupportedKind("Quiz", null)).toBe(true);
    expect(isCarryWriteSupportedKind("Discussion", null)).toBe(true);
    expect(isCarryWriteSupportedKind("SubHeader", null)).toBe(true);
  });

  it("a plan containing one of each unwritable kind reports them as not-to-be-created, not as 'create'", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [
        makeItem({ id: 1, title: "Syllabus Link 2", type: "ExternalUrl", contentId: null }),
        makeItem({ id: 2, title: "Publisher Tool 2", type: "ExternalTool", contentId: null }),
        makeItem({ id: 3, title: "Handout 2", type: "File", contentId: null }),
        makeItem({ id: 4, title: "Lab 2", type: "Assignment", contentId: 100 }),
      ],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    const byId = new Map(plan.targets[0].items.map((i) => [i.itemId, i]));
    expect(byId.get(1)?.decision).toBe("create");
    expect(byId.get(1)?.writeSupported).toBe(false);
    expect(byId.get(2)?.decision).toBe("create");
    expect(byId.get(2)?.writeSupported).toBe(false);
    expect(byId.get(3)?.decision).toBe("create");
    expect(byId.get(3)?.writeSupported).toBe(false);
    expect(byId.get(4)?.decision).toBe("create");
    expect(byId.get(4)?.writeSupported).toBe(true);
    // 3 unwritable kinds resolved to "create" but must NOT inflate
    // counts.create - only the one genuinely writable item does.
    expect(plan.totals).toEqual({ create: 1, skip: 0, overwrite: 0, blocked: 0, unsupported: 3 });
  });

  it("a File WITH a contentId is write-supported and counted as create", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02",
      items: [makeItem({ id: 1, title: "Handout 2", type: "File", contentId: 55 })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.targets[0].items[0].writeSupported).toBe(true);
    expect(plan.totals).toEqual({ create: 1, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 });
  });
});

describe("buildModulePatternPlan - D18/D4b: sourceWeek lets the caller render ONE message instead of one per item", () => {
  it("is the source module's own extracted number when it has one", () => {
    const source = makeSource({
      moduleId: 2,
      moduleName: "Module 02: Loops",
      items: [makeItem({ id: 1, title: "Lab 2" })],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.sourceWeek).toBe(2);
  });

  it("is null when the source module's name carries no recognizable number, matching every item's 'source-module-unnumbered' block", () => {
    const source = makeSource({
      moduleId: 9,
      moduleName: "Orientation",
      items: [
        makeItem({ id: 1, title: "Final Project" }),
        makeItem({ id: 2, title: "Syllabus Quiz" }),
      ],
    });
    const plan = buildModulePatternPlan({
      ...BASE_INPUT_DEFAULTS,
      source,
      targets: [makeTarget(5, "Module 05")],
    });
    expect(plan.sourceWeek).toBeNull();
    for (const row of plan.targets[0].items) {
      expect(row.blockedReasonCode).toBe("source-module-unnumbered");
    }
  });
});

describe("pinned agreement: normalizeTitleForMatch (module-pattern-plan.ts) vs planBulkModuleCreation's inline rule (bulk-module-plan.ts)", () => {
  // planBulkModuleCreation has no standalone exported comparison function to
  // import - its match rule (`m.name.trim().toLowerCase()`) is inlined into
  // `byNormalizedName` (bulk-module-plan.ts:178,187). This test drives BOTH
  // real exported functions, each on its own construction, and confirms they
  // reach the same case/whitespace-insensitivity verdict for each text pair -
  // so the two independent inline restatements of "trim + lowercase equality"
  // cannot silently drift apart from each other.
  //
  // Each case varies only the free-text BASE, never a digit run: appending a
  // numeric suffix is unavoidable in both functions (expandModuleNameTemplate
  // always appends a padded number to a token-less template;
  // buildModulePatternPlan always needs a `{n}`-bearing authored pattern) but
  // an IDENTICAL suffix on both sides of a single function's own comparison
  // cancels out of that comparison - it does not need to match ACROSS the two
  // functions, only within each one.
  // C13: a "  Module Intro  " (whitespace) row used to live here, but this
  // test's own setup (`candidateBase.trim()` below, before the candidate is
  // embedded into the authored pattern) trims it before
  // buildModulePatternPlan ever sees it - removing `.trim()` from
  // normalizeTitleForMatch would NOT redden that row, only pin something
  // this suite doesn't exercise. Trim-insensitivity on buildModulePatternPlan's
  // own side is genuinely covered by "the by-title match is case- and
  // trim-insensitive" above (the existing item's title carries the
  // whitespace there, not a value this test pre-cleans), so it is not
  // repeated degenerately here.
  const CASES: Array<{ existingBase: string; candidateBase: string; shouldMatch: boolean }> = [
    { existingBase: "Module Intro", candidateBase: "Module Intro", shouldMatch: true },
    { existingBase: "Module Intro", candidateBase: "module intro", shouldMatch: true },
    { existingBase: "Module Intro", candidateBase: "MODULE INTRO", shouldMatch: true },
    { existingBase: "Module Intro", candidateBase: "Module Introduction", shouldMatch: false },
    { existingBase: "Lab", candidateBase: "Lab Two", shouldMatch: false },
  ];

  it.each(CASES)("planBulkModuleCreation and buildModulePatternPlan agree for ($existingBase, $candidateBase)", ({ existingBase, candidateBase, shouldMatch }) => {
    // planBulkModuleCreation: a token-less template always gets " NN"
    // appended (expandModuleNameTemplate), so the existing list entry carries
    // that same literal suffix ("01" for count=1/startAt=1) up front - the
    // suffix is identical on both sides of ITS OWN comparison either way.
    const bulkPlan = planBulkModuleCreation([{ id: 1, name: `${existingBase} 01` }], 1, candidateBase, 1);
    const bulkAlreadyPresent = bulkPlan.entries[0]?.action === "already-present";
    expect(bulkAlreadyPresent).toBe(shouldMatch);

    // buildModulePatternPlan: an authored pattern must contain `{n}`, so the
    // rendered title always carries a target-number suffix too - the target
    // module's existing item carries the identical literal suffix ("1", for
    // target module number 1) up front, so this function's own comparison
    // sees an identical suffix on both sides regardless of the case/whitespace
    // variation under test.
    const plan = buildModulePatternPlan({
      source: makeSource({
        moduleId: 9,
        moduleName: "Module 09",
        items: [makeItem({ id: 1, title: "irrelevant - overridden by authoredPatterns below" })],
      }),
      targets: [makeTarget(1, "Module 01", [{ id: 500, title: `${existingBase} 1` }])],
      courseStartDate: null,
      assignmentDueRule: null,
      onExisting: "skip",
      // candidateBase is trimmed before being embedded, exactly as
      // expandModuleNameTemplate trims its own template's base before
      // appending the padded number (bulk-module-plan.ts:86) - otherwise a
      // candidateBase carrying its OWN leading/trailing whitespace would
      // collapse against the literal " {n}" into an internal double space
      // that is not part of either function's match rule, just an artifact
      // of string concatenation in this test's own setup.
      authoredPatterns: { 1: `${candidateBase.trim()} {n}` },
    });
    const decision = plan.targets[0].items[0].decision;
    expect(decision === "skip").toBe(shouldMatch);
  });
});
