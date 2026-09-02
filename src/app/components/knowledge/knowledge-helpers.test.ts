import { describe, it, expect } from "vitest";
import {
  findNode,
  countDescendants,
  invalidParentIds,
  computeReorder,
  pickValidPageId,
  parseSelectedPageId,
  parseExpandedIds,
  resolveActiveKbInstitution,
  isDraftDirty,
  parseTagsInput,
  visiblePageIds,
  allVisibleSelected,
  describeSelectedPages,
  SHOW_ALL_SELECTED_PAGES,
  parseBulkSelectedIds,
  selectAllVisibleVisualState,
  describeKnowledgeContextLabel,
  kbBulkActionConsequenceTag,
  computeBulkDeleteTargets,
  bulkDeleteInclusiveCount,
  describeBulkDeleteOutcome,
  kbBulkBarStatusText,
  includedContextPages,
} from "./knowledge-helpers";
import { buildPageTree, type InstitutionPage } from "@/lib/knowledge-base";
import { buildKnowledgeContextBlock } from "@/lib/chat/knowledge-context";

function page(overrides: Partial<InstitutionPage> = {}): InstitutionPage {
  return {
    id: "p1",
    institution: "MCC",
    parentId: null,
    title: "Untitled",
    body: "",
    tags: [],
    position: 0,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("findNode / countDescendants", () => {
  const pages = [
    page({ id: "root", title: "Root", position: 0 }),
    page({ id: "child-a", title: "Child A", parentId: "root", position: 0 }),
    page({ id: "child-b", title: "Child B", parentId: "root", position: 1 }),
    page({ id: "grandchild", title: "Grandchild", parentId: "child-a", position: 0 }),
    page({ id: "other-root", title: "Other Root", position: 1 }),
  ];
  const tree = buildPageTree(pages);

  it("finds a root node", () => {
    expect(findNode(tree, "root")?.title).toBe("Root");
  });

  it("finds a nested node", () => {
    expect(findNode(tree, "grandchild")?.title).toBe("Grandchild");
  });

  it("returns null for an id not in the tree", () => {
    expect(findNode(tree, "nope")).toBeNull();
  });

  it("counts every descendant, not just direct children", () => {
    // root -> child-a, child-b, grandchild (under child-a) = 3
    expect(countDescendants(tree, "root")).toBe(3);
  });

  it("counts zero for a leaf page", () => {
    expect(countDescendants(tree, "grandchild")).toBe(0);
  });

  it("counts zero for an id that does not exist", () => {
    expect(countDescendants(tree, "nope")).toBe(0);
  });

  it("does not count a sibling subtree", () => {
    expect(countDescendants(tree, "other-root")).toBe(0);
  });
});

describe("invalidParentIds", () => {
  const pages = [
    page({ id: "root", title: "Root", position: 0 }),
    page({ id: "child", title: "Child", parentId: "root", position: 0 }),
    page({ id: "grandchild", title: "Grandchild", parentId: "child", position: 0 }),
    page({ id: "unrelated", title: "Unrelated", position: 1 }),
  ];

  it("excludes the page itself", () => {
    expect(invalidParentIds(pages, "root").has("root")).toBe(true);
  });

  it("excludes every descendant", () => {
    const invalid = invalidParentIds(pages, "root");
    expect(invalid.has("child")).toBe(true);
    expect(invalid.has("grandchild")).toBe(true);
  });

  it("allows an unrelated page as a parent", () => {
    expect(invalidParentIds(pages, "root").has("unrelated")).toBe(false);
  });

  it("allows a leaf's own ancestor chain to stay valid for a different mover", () => {
    // Moving "unrelated" - nothing in the root/child/grandchild chain should
    // be excluded since none of them is unrelated's ancestor or descendant.
    const invalid = invalidParentIds(pages, "unrelated");
    expect(invalid.has("root")).toBe(false);
    expect(invalid.has("child")).toBe(false);
    expect(invalid.has("grandchild")).toBe(false);
  });
});

describe("computeReorder", () => {
  const siblings = [
    { id: "a", position: 0 },
    { id: "b", position: 10 },
    { id: "c", position: 20 },
  ];

  it("swaps a middle item up with its predecessor", () => {
    const result = computeReorder(siblings, "b", "up");
    expect(result).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 10 },
    ]);
  });

  it("swaps a middle item down with its successor", () => {
    const result = computeReorder(siblings, "b", "down");
    expect(result).toEqual([
      { id: "b", position: 20 },
      { id: "c", position: 10 },
    ]);
  });

  it("refuses to move the first item up", () => {
    expect(computeReorder(siblings, "a", "up")).toBeNull();
  });

  it("refuses to move the last item down", () => {
    expect(computeReorder(siblings, "c", "down")).toBeNull();
  });

  it("returns null for an id not present in the list", () => {
    expect(computeReorder(siblings, "nope", "up")).toBeNull();
  });

  it("moving the sole item in a single-item list is a no-op null in both directions", () => {
    const solo = [{ id: "only", position: 0 }];
    expect(computeReorder(solo, "only", "up")).toBeNull();
    expect(computeReorder(solo, "only", "down")).toBeNull();
  });
});

describe("pickValidPageId", () => {
  const validIds = new Set(["p1", "p2"]);

  it("returns the id when it is a member of validIds", () => {
    expect(pickValidPageId("p1", validIds)).toBe("p1");
  });

  it("returns null for an id that does not exist", () => {
    expect(pickValidPageId("deleted-page", validIds)).toBeNull();
  });

  it("returns null for an id that belongs to a different institution's page list", () => {
    // validIds is scoped to whatever institution the caller passed - an id
    // valid under a different institution simply won't be a member of it.
    const otherInstitutionIds = new Set(["other-1", "other-2"]);
    expect(pickValidPageId("p1", otherInstitutionIds)).toBeNull();
  });

  it("returns null when there is no candidate id", () => {
    expect(pickValidPageId(null, validIds)).toBeNull();
  });

  it("returns null against an empty validIds set", () => {
    expect(pickValidPageId("p1", new Set())).toBeNull();
  });
});

describe("parseSelectedPageId", () => {
  const validIds = new Set(["p1", "p2"]);

  it("returns the stored id when it is valid for this institution", () => {
    const raw = JSON.stringify({ MCC: "p1", MPCC: "p2" });
    expect(parseSelectedPageId(raw, "MCC", validIds)).toBe("p1");
  });

  it("falls back to null when the stored id no longer exists", () => {
    const raw = JSON.stringify({ MCC: "deleted-page" });
    expect(parseSelectedPageId(raw, "MCC", validIds)).toBeNull();
  });

  it("falls back to null on corrupt JSON", () => {
    expect(parseSelectedPageId("{not json", "MCC", validIds)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(parseSelectedPageId(null, "MCC", validIds)).toBeNull();
  });

  it("returns null when the stored value is not an object", () => {
    expect(parseSelectedPageId('"p1"', "MCC", validIds)).toBeNull();
    expect(parseSelectedPageId("[1,2,3]", "MCC", validIds)).toBeNull();
  });

  it("does not leak another institution's selection", () => {
    const raw = JSON.stringify({ MPCC: "p1" });
    expect(parseSelectedPageId(raw, "MCC", validIds)).toBeNull();
  });
});

describe("parseExpandedIds", () => {
  it("returns the stored set for this institution", () => {
    const raw = JSON.stringify({ MCC: ["a", "b"] });
    expect(parseExpandedIds(raw, "MCC")).toEqual(new Set(["a", "b"]));
  });

  it("falls back to an empty set on corrupt JSON", () => {
    expect(parseExpandedIds("not json at all", "MCC")).toEqual(new Set());
  });

  it("falls back to an empty set when nothing is stored", () => {
    expect(parseExpandedIds(null, "MCC")).toEqual(new Set());
  });

  it("falls back to an empty set when the institution's value is not an array", () => {
    const raw = JSON.stringify({ MCC: "not-an-array" });
    expect(parseExpandedIds(raw, "MCC")).toEqual(new Set());
  });

  it("ignores non-string entries in the stored array", () => {
    const raw = JSON.stringify({ MCC: ["a", 5, null, "b"] });
    expect(parseExpandedIds(raw, "MCC")).toEqual(new Set(["a", "b"]));
  });
});

describe("resolveActiveKbInstitution", () => {
  const registered = ["MCC", "MPCC"];

  it("keeps the stored value when it is still registered", () => {
    expect(resolveActiveKbInstitution("MPCC", registered, "MCC")).toBe("MPCC");
  });

  it("falls back to the first registered institution when the stored value is no longer registered", () => {
    // The header value ("MPCC") must be ignored here - AC3 says a stale stored
    // value falls back to the first registered institution, not to the header.
    expect(resolveActiveKbInstitution("GONE", registered, "MPCC")).toBe("MCC");
  });

  it("seeds from the header's active institution when nothing is stored and the header value is registered", () => {
    expect(resolveActiveKbInstitution(null, registered, "MPCC")).toBe("MPCC");
  });

  it("falls back to the first registered institution when nothing is stored and the header value is not registered", () => {
    expect(resolveActiveKbInstitution(null, registered, "ZZZ")).toBe("MCC");
  });

  it("falls back to the first registered institution when nothing is stored and there is no header value", () => {
    expect(resolveActiveKbInstitution(null, registered, "")).toBe("MCC");
  });

  it("returns an empty string when no institutions are registered at all", () => {
    expect(resolveActiveKbInstitution(null, [], "MCC")).toBe("");
    expect(resolveActiveKbInstitution("MCC", [], "MCC")).toBe("");
  });
});

describe("isDraftDirty", () => {
  const snapshot = { title: "Original", body: "Body text", tags: "a, b" };

  it("is false while no edit session is open", () => {
    expect(isDraftDirty(false, null, "Original", "Body text", "a, b")).toBe(false);
  });

  it("is false while editing but nothing has changed from the snapshot", () => {
    expect(isDraftDirty(true, snapshot, "Original", "Body text", "a, b")).toBe(false);
  });

  it("is true when the title differs from the snapshot", () => {
    expect(isDraftDirty(true, snapshot, "Changed", "Body text", "a, b")).toBe(true);
  });

  it("is true when the body differs from the snapshot", () => {
    expect(isDraftDirty(true, snapshot, "Original", "Changed body", "a, b")).toBe(true);
  });

  it("is true when the tags differ from the snapshot", () => {
    expect(isDraftDirty(true, snapshot, "Original", "Body text", "a, b, c")).toBe(true);
  });

  it("is false when isEditing is true but there is no snapshot yet", () => {
    // beginEdit sets isEditing and editSnapshot together, so in practice
    // this combination should not occur - covered anyway since it is the
    // exact case the !!editSnapshot guard exists for.
    expect(isDraftDirty(true, null, "Original", "Body text", "a, b")).toBe(false);
  });
});

describe("visiblePageIds", () => {
  const pages = [
    page({ id: "root", title: "Root", position: 0 }),
    page({ id: "child-a", title: "Child A", parentId: "root", position: 0 }),
    page({ id: "child-b", title: "Child B", parentId: "root", position: 1 }),
    page({ id: "grandchild", title: "Grandchild", parentId: "child-a", position: 0 }),
    page({ id: "other-root", title: "Other Root", position: 1 }),
  ];
  const tree = buildPageTree(pages);

  it("includes every root node even with nothing expanded", () => {
    expect(visiblePageIds(tree, new Set())).toEqual(["root", "other-root"]);
  });

  it("does not descend into a collapsed node's children", () => {
    const ids = visiblePageIds(tree, new Set());
    expect(ids).not.toContain("child-a");
    expect(ids).not.toContain("grandchild");
  });

  it("includes a node's direct children once it is expanded", () => {
    const ids = visiblePageIds(tree, new Set(["root"]));
    expect(ids).toEqual(["root", "child-a", "child-b", "other-root"]);
  });

  it("does not reach a grandchild until its own parent is also expanded, even if the root is", () => {
    const ids = visiblePageIds(tree, new Set(["root"]));
    expect(ids).not.toContain("grandchild");
  });

  it("reaches a grandchild once every ancestor in its chain is expanded", () => {
    const ids = visiblePageIds(tree, new Set(["root", "child-a"]));
    expect(ids).toContain("grandchild");
  });
});

describe("allVisibleSelected", () => {
  it("is false for an empty visibleIds list, even with nothing selected", () => {
    expect(allVisibleSelected(new Set(), [])).toBe(false);
  });

  it("is false when only some visible ids are selected", () => {
    expect(allVisibleSelected(new Set(["a"]), ["a", "b"])).toBe(false);
  });

  it("is true when every visible id is selected", () => {
    expect(allVisibleSelected(new Set(["a", "b", "c"]), ["a", "b"])).toBe(true);
  });

  it("ignores a selected id that falls outside visibleIds (e.g. a collapsed branch)", () => {
    expect(allVisibleSelected(new Set(["a", "b", "z"]), ["a", "b"])).toBe(true);
  });
});

describe("describeSelectedPages", () => {
  const pages = [
    page({ id: "root", title: "Root", position: 0 }),
    page({ id: "child-a", title: "Child A", parentId: "root", position: 0 }),
    page({ id: "child-b", title: "Child B", parentId: "root", position: 1 }),
    page({ id: "grandchild", title: "Grandchild", parentId: "child-a", position: 0 }),
    page({ id: "other-root", title: "Other Root", position: 1 }),
  ];

  it("returns an empty description for an empty selection", () => {
    expect(describeSelectedPages(pages, new Set())).toEqual({ shownTitles: [], overflowCount: 0, text: "" });
  });

  it("lists every selected title when the count is at or under maxShown", () => {
    const result = describeSelectedPages(pages, new Set(["root", "other-root"]));
    expect(result).toEqual({ shownTitles: ["Root", "Other Root"], overflowCount: 0, text: "Root, Other Root" });
  });

  it("names a page selected INSIDE A COLLAPSED BRANCH - this is the whole point of B5: describeSelectedPages filters the flat `pages` list, never visiblePageIds, so a page with no on-screen checkbox is still named here", () => {
    // "grandchild" is nested three levels deep; nothing here says anything
    // about tree expansion state - describeSelectedPages does not take
    // `expanded` as a parameter at all, unlike visiblePageIds.
    const result = describeSelectedPages(pages, new Set(["grandchild"]));
    expect(result.shownTitles).toEqual(["Grandchild"]);
    expect(result.text).toBe("Grandchild");
  });

  it("folds anything past maxShown into a stated +N more, never a silent truncation", () => {
    const result = describeSelectedPages(pages, new Set(["root", "child-a", "child-b", "grandchild"]), 2);
    expect(result.shownTitles).toEqual(["Root", "Child A"]);
    expect(result.overflowCount).toBe(2);
    expect(result.text).toBe("Root, Child A +2 more");
  });

  it("falls back to 'Untitled page' for a blank title, matching PageTreeView's own fallback", () => {
    const blank = [page({ id: "blank", title: "   ", position: 0 })];
    expect(describeSelectedPages(blank, new Set(["blank"])).text).toBe("Untitled page");
  });

  it("ignores a selected id that no longer exists in `pages` (deleted page still lingering in the selection)", () => {
    const result = describeSelectedPages(pages, new Set(["root", "deleted-id"]));
    expect(result.shownTitles).toEqual(["Root"]);
    expect(result.overflowCount).toBe(0);
  });
});

describe("parseBulkSelectedIds", () => {
  it("returns the stored set for this institution", () => {
    const raw = JSON.stringify({ MCC: ["p1", "p2"] });
    expect(parseBulkSelectedIds(raw, "MCC")).toEqual(new Set(["p1", "p2"]));
  });

  it("falls back to an empty set on corrupt JSON", () => {
    expect(parseBulkSelectedIds("{not json", "MCC")).toEqual(new Set());
  });

  it("falls back to an empty set when nothing is stored", () => {
    expect(parseBulkSelectedIds(null, "MCC")).toEqual(new Set());
  });

  it("falls back to an empty set when the institution's value is not an array", () => {
    const raw = JSON.stringify({ MCC: "not-an-array" });
    expect(parseBulkSelectedIds(raw, "MCC")).toEqual(new Set());
  });

  it("ignores non-string entries in the stored array", () => {
    const raw = JSON.stringify({ MCC: ["a", 5, null, "b"] });
    expect(parseBulkSelectedIds(raw, "MCC")).toEqual(new Set(["a", "b"]));
  });

  it("does not leak another institution's selection", () => {
    const raw = JSON.stringify({ MPCC: ["p1"] });
    expect(parseBulkSelectedIds(raw, "MCC")).toEqual(new Set());
  });
});

describe("parseTagsInput", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseTagsInput(" grading , deadlines ")).toEqual(["grading", "deadlines"]);
  });

  it("drops blank entries", () => {
    expect(parseTagsInput("grading,,deadlines,")).toEqual(["grading", "deadlines"]);
  });

  it("deduplicates repeated tags", () => {
    expect(parseTagsInput("grading, grading, deadlines")).toEqual(["grading", "deadlines"]);
  });

  it("returns an empty array for a blank string", () => {
    expect(parseTagsInput("")).toEqual([]);
    expect(parseTagsInput("   ")).toEqual([]);
  });
});

describe("describeSelectedPages with SHOW_ALL_SELECTED_PAGES (K6 expander)", () => {
  const pages = [
    page({ id: "a", title: "A", position: 0 }),
    page({ id: "b", title: "B", position: 1 }),
    page({ id: "c", title: "C", position: 2 }),
    page({ id: "d", title: "D", position: 3 }),
  ];

  it("folds past the default cap when not expanded", () => {
    const result = describeSelectedPages(pages, new Set(["a", "b", "c", "d"]), 3);
    expect(result.overflowCount).toBe(1);
  });

  it("shows every selected title with no overflow when passed SHOW_ALL_SELECTED_PAGES", () => {
    const result = describeSelectedPages(pages, new Set(["a", "b", "c", "d"]), SHOW_ALL_SELECTED_PAGES);
    expect(result.overflowCount).toBe(0);
    expect(result.shownTitles).toEqual(["A", "B", "C", "D"]);
  });
});

describe("selectAllVisibleVisualState (K6 - the checkbox must not lie about a hidden selection)", () => {
  it("is unchecked and non-indeterminate for an empty visibleIds list", () => {
    expect(selectAllVisibleVisualState(new Set(), [])).toEqual({ checked: false, indeterminate: false });
  });

  it("is unchecked and non-indeterminate when nothing at all is selected", () => {
    expect(selectAllVisibleVisualState(new Set(), ["a", "b"])).toEqual({ checked: false, indeterminate: false });
  });

  it("is checked (not indeterminate) when the selection is EXACTLY the visible set", () => {
    expect(selectAllVisibleVisualState(new Set(["a", "b"]), ["a", "b"])).toEqual({ checked: true, indeterminate: false });
  });

  it("is indeterminate, NOT checked, when only some visible ids are selected", () => {
    expect(selectAllVisibleVisualState(new Set(["a"]), ["a", "b"])).toEqual({ checked: false, indeterminate: true });
  });

  it(
    "THE K6 BUG: every visible id selected, but many MORE pages selected outside view (e.g. a collapsed " +
      "branch) - must read indeterminate, never a false full checkmark that would then deselect only the " +
      "visible ones on click and leave the rest stranded with no visible indication",
    () => {
      // 40-page selection collapsed down to 6 visible roots, all 6 of which
      // happen to be selected - the exact scenario the audit named.
      const visibleIds = ["r1", "r2", "r3", "r4", "r5", "r6"];
      const selected = new Set([...visibleIds, ...Array.from({ length: 34 }, (_, i) => `hidden-${i}`)]);
      expect(selectAllVisibleVisualState(selected, visibleIds)).toEqual({ checked: false, indeterminate: true });
    }
  );
});

describe("describeKnowledgeContextLabel (K1 - the omission must reach the label the landing panel renders)", () => {
  it("states a plain count when nothing was omitted", () => {
    expect(describeKnowledgeContextLabel(5, 5, 0)).toBe("5 Knowledge Base pages");
  });

  it("uses the singular noun for exactly one page", () => {
    expect(describeKnowledgeContextLabel(1, 1, 0)).toBe("1 Knowledge Base page");
  });

  it("states the included-of-total count and names the omitted count when the budget dropped pages", () => {
    expect(describeKnowledgeContextLabel(40, 28, 12)).toBe(
      "28 of 40 Knowledge Base pages (12 omitted - too large for the context budget)"
    );
  });
});

describe("kbBulkActionConsequenceTag (K7)", () => {
  it("gives each tier a distinct, non-empty tag", () => {
    const tags = new Set([
      kbBulkActionConsequenceTag("read-only"),
      kbBulkActionConsequenceTag("fan-out"),
      kbBulkActionConsequenceTag("destructive"),
    ]);
    expect(tags.size).toBe(3);
    for (const tag of tags) expect(tag.length).toBeGreaterThan(0);
  });

  it("names the destructive tier as irreversible", () => {
    expect(kbBulkActionConsequenceTag("destructive")).toMatch(/cannot be undone/i);
  });
});

describe("computeBulkDeleteTargets (K10 - never double-delete a covered descendant)", () => {
  const pages = [
    page({ id: "root", title: "Root", position: 0 }),
    page({ id: "child-a", title: "Child A", parentId: "root", position: 0 }),
    page({ id: "grandchild", title: "Grandchild", parentId: "child-a", position: 0 }),
    page({ id: "other-root", title: "Other Root", position: 1 }),
  ];

  it("treats a page with no selected ancestor as top-level", () => {
    const { topLevelIds, skippedIds } = computeBulkDeleteTargets(pages, new Set(["root"]));
    expect(topLevelIds).toEqual(["root"]);
    expect(skippedIds).toEqual([]);
  });

  it("skips a descendant whose ancestor is ALSO selected, rather than sending it to delete twice", () => {
    const { topLevelIds, skippedIds } = computeBulkDeleteTargets(pages, new Set(["root", "child-a", "grandchild"]));
    expect(topLevelIds).toEqual(["root"]);
    expect(skippedIds.sort()).toEqual(["child-a", "grandchild"]);
  });

  it("treats two unrelated selected pages as both top-level", () => {
    const { topLevelIds, skippedIds } = computeBulkDeleteTargets(pages, new Set(["root", "other-root"]));
    expect(topLevelIds.sort()).toEqual(["other-root", "root"]);
    expect(skippedIds).toEqual([]);
  });

  it("ignores a selected id that no longer exists in pages", () => {
    const { topLevelIds, skippedIds } = computeBulkDeleteTargets(pages, new Set(["root", "gone"]));
    expect(topLevelIds).toEqual(["root"]);
    expect(skippedIds).toEqual([]);
  });
});

describe("bulkDeleteInclusiveCount (K10 - the confirm must state the REAL blast radius, not the checkbox count)", () => {
  const pages = [
    page({ id: "root", title: "Root", position: 0 }),
    page({ id: "child-a", title: "Child A", parentId: "root", position: 0 }),
    page({ id: "child-b", title: "Child B", parentId: "root", position: 1 }),
    page({ id: "grandchild", title: "Grandchild", parentId: "child-a", position: 0 }),
  ];
  const tree = buildPageTree(pages);

  it("counts a leaf top-level target as just itself", () => {
    expect(bulkDeleteInclusiveCount(tree, ["grandchild"])).toBe(1);
  });

  it(
    "counts every descendant of a top-level target EVEN THOUGH THEY WERE NEVER TICKED - only 'root' is " +
      "selected, but the cascade removes 3 more pages, and the confirm must say 4, not 1",
    () => {
      expect(bulkDeleteInclusiveCount(tree, ["root"])).toBe(4);
    }
  );

  it("sums across multiple independent top-level targets without double-counting", () => {
    expect(bulkDeleteInclusiveCount(tree, ["child-a", "child-b"])).toBe(3); // child-a + grandchild + child-b
  });
});

describe("describeBulkDeleteOutcome (K10 - the {done, failed, skipped} note)", () => {
  it("states a clean success with no failed/skipped clauses", () => {
    expect(describeBulkDeleteOutcome(3, { doneCount: 3, failed: [], skipped: [] })).toBe("3 of 3 pages deleted.");
  });

  it("names every failed title and every skipped title, distinctly", () => {
    const text = describeBulkDeleteOutcome(7, {
      doneCount: 3,
      failed: [{ title: "Late policy", message: "network error" }, { title: "Grading rubric", message: "network error" }],
      skipped: [{ title: "Sub-page" }, { title: "Another sub-page" }],
    });
    expect(text).toContain("3 of 7 pages deleted.");
    expect(text).toContain("2 failed: Late policy, Grading rubric.");
    expect(text).toContain("2 not deleted directly");
    expect(text).toContain("Sub-page, Another sub-page");
  });

  it("uses the singular noun for a total of exactly one page", () => {
    expect(describeBulkDeleteOutcome(1, { doneCount: 1, failed: [], skipped: [] })).toBe("1 of 1 page deleted.");
  });
});

describe("kbBulkBarStatusText (aesthetics/UX pass - the bulk bar's ONE bar-level live region, now that busy/outcome/armed each used to gate a separate `role=\"status\"` element)", () => {
  it("returns null when there is nothing to announce", () => {
    expect(kbBulkBarStatusText(false, null, false, 0)).toBeNull();
  });

  it("SABOTAGE TARGET: busy wins over everything else, even a stale outcome note or an armed delete", () => {
    expect(kbBulkBarStatusText(true, "3 of 3 pages deleted.", true, 12)).toBe("Working…");
  });

  it("SABOTAGE TARGET: the outcome note wins over an armed delete once busy has cleared", () => {
    expect(kbBulkBarStatusText(false, "3 of 3 pages deleted.", true, 12)).toBe("3 of 3 pages deleted.");
  });

  it("falls through to the armed confirmation sentence only once busy and outcomeNote are both clear", () => {
    const text = kbBulkBarStatusText(false, null, true, 12);
    expect(text).toContain("12 pages");
    expect(text).toMatch(/cannot be undone/i);
    expect(text).toMatch(/Confirm delete/);
  });

  it("uses the singular noun for an inclusive count of exactly one page", () => {
    const text = kbBulkBarStatusText(false, null, true, 1);
    expect(text).toContain("1 page");
    expect(text).not.toContain("1 pages");
  });
});

describe("includedContextPages (AC1 of docs/knowledge-recording-handoff-acceptance-criteria.md - never name a page the model did not read)", () => {
  it("keeps every page (with body) when nothing was omitted (small selection, well under budget)", () => {
    const selectedPages = [
      { id: "p1", title: "Grading rubric", body: "Short body." },
      { id: "p2", title: "Late policy", body: "Also short." },
    ];
    const block = buildKnowledgeContextBlock({
      pages: [
        { title: "Grading rubric", body: "Short body." },
        { title: "Late policy", body: "Also short." },
      ],
      attachments: [],
    });
    expect(includedContextPages(selectedPages, block.pageResults)).toEqual(selectedPages);
  });

  it(
    "SABOTAGE TARGET (AC1's core claim): a MIDDLE page omitted by the budget is never listed as included, " +
      "even though a later, SHORTER page right after it survives - inclusion is not a prefix",
    () => {
      // The budget loop uses `continue`, not `break` (knowledge-context.ts) -
      // a huge middle page is skipped while a later, tiny page still fits.
      // A prefix-assuming implementation (or one that switches `continue` to
      // `break`) would keep "Intro" and "Huge policy" and drop "Tiny note",
      // exactly backwards from what actually got sent to the model.
      const selectedPages = [
        { id: "p1", title: "Intro", body: "Short intro." },
        { id: "p2", title: "Huge policy", body: "x".repeat(20000) },
        { id: "p3", title: "Tiny note", body: "n" },
      ];
      const block = buildKnowledgeContextBlock({
        pages: [
          { title: "Intro", body: "Short intro." },
          { title: "Huge policy", body: "x".repeat(20000) },
          { title: "Tiny note", body: "n" },
        ],
        attachments: [],
        maxChars: 1000,
      });
      // Sanity-check the fixture actually exercises the omission path this
      // test exists to pin - if this ever stops being true the test below
      // would pass vacuously.
      expect(block.omittedPages).toBeGreaterThan(0);
      const result = includedContextPages(selectedPages, block.pageResults);
      const resultIds = result.map((p) => p.id);
      expect(resultIds).not.toContain("p2");
      expect(resultIds).toContain("p1");
      expect(resultIds).toContain("p3");
    }
  );

  it("returns an EMPTY list, never a guess, when selectedPages/pageResults lengths diverge", () => {
    const selectedPages = [
      { id: "p1", title: "A", body: "a" },
      { id: "p2", title: "B", body: "b" },
    ];
    const pageResults = [{ title: "A", included: true }]; // one short - a caller bug
    expect(includedContextPages(selectedPages, pageResults)).toEqual([]);
  });

  it("returns an empty list for an empty selection", () => {
    expect(includedContextPages([], [])).toEqual([]);
  });

  it("preserves input order in the result, carrying body through untouched", () => {
    const selectedPages = [
      { id: "a", title: "A", body: "body a" },
      { id: "b", title: "B", body: "body b" },
      { id: "c", title: "C", body: "body c" },
    ];
    const pageResults = [
      { title: "A", included: true },
      { title: "B", included: false },
      { title: "C", included: true },
    ];
    expect(includedContextPages(selectedPages, pageResults)).toEqual([
      { id: "a", title: "A", body: "body a" },
      { id: "c", title: "C", body: "body c" },
    ]);
  });
});
