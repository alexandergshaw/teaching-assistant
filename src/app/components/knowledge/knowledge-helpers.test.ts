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
} from "./knowledge-helpers";
import { buildPageTree, type InstitutionPage } from "@/lib/knowledge-base";

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
