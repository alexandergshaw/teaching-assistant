import { describe, it, expect } from "vitest";
import {
  scopeStorageKey,
  collectScopePages,
  scopeHasDescendants,
  describeScope,
  KNOWLEDGE_OVERVIEW_CONTEXT_MAX_CHARS,
  type KnowledgeScope,
} from "./knowledge-overview-scope";
import type { InstitutionPage } from "./knowledge-base";

// Duplicated deliberately rather than imported from knowledge-base.test.ts -
// importing a helper from another *.test.ts file re-runs that file's own
// describe blocks (see this repo's no-cross-test-file-imports rule).
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

describe("KNOWLEDGE_OVERVIEW_CONTEXT_MAX_CHARS", () => {
  it("is 120000 - the budget A2 raised this feature to, superseding the build spec's original 24000 (see CORRECTIONS.md X13)", () => {
    expect(KNOWLEDGE_OVERVIEW_CONTEXT_MAX_CHARS).toBe(120000);
  });
});

describe("KnowledgeScope", () => {
  it("accepts an institution scope with no pageId", () => {
    const scope: KnowledgeScope = { kind: "institution" };
    expect(scope.kind).toBe("institution");
  });

  it("accepts a subtree scope carrying a pageId", () => {
    const scope: KnowledgeScope = { kind: "subtree", pageId: "p1" };
    expect(scope).toEqual({ kind: "subtree", pageId: "p1" });
  });
});

describe("scopeStorageKey", () => {
  it("differs between the institution-root scope and a real page's scope", () => {
    const root = scopeStorageKey("MCC", null);
    const pageScope = scopeStorageKey("MCC", "11111111-1111-4111-8111-111111111111");
    expect(root).not.toBe(pageScope);
  });

  it("never collides with the root key for values that could plausibly show up by accident - an empty string, and the literal string \"null\"/\"undefined\" (the exact bug an unguarded template literal coercing a real `null` would produce)", () => {
    const root = scopeStorageKey("MCC", null);
    expect(scopeStorageKey("MCC", "")).not.toBe(root);
    expect(scopeStorageKey("MCC", "null")).not.toBe(root);
    expect(scopeStorageKey("MCC", "undefined")).not.toBe(root);
  });

  it("normalizes institution casing, so the same institution always resolves to the same key no matter how it was typed", () => {
    expect(scopeStorageKey("mcc", null)).toBe(scopeStorageKey("MCC", null));
    expect(scopeStorageKey(" Mcc ", "p1")).toBe(scopeStorageKey("MCC", "p1"));
  });

  it("keeps two different institutions' root scopes distinct", () => {
    expect(scopeStorageKey("MCC", null)).not.toBe(scopeStorageKey("MPCC", null));
  });
});

describe("collectScopePages", () => {
  it("flattens the whole forest in buildPageTree's DFS order when scopePageId is null", () => {
    const pages = [
      page({ id: "root-b", title: "Root B", position: 1 }),
      page({ id: "root-a", title: "Root A", position: 0 }),
      page({ id: "child", parentId: "root-a", title: "Child" }),
    ];
    expect(collectScopePages(pages, null).map((p) => p.id)).toEqual([
      "root-a",
      "child",
      "root-b",
    ]);
  });

  it(
    "orders a subtree's descendants by position then title - the real, always-reachable " +
      "divergence from collectSubtreePageIds that CORRECTIONS.md X10 identifies as the actual " +
      "reason buildPageTree was adjudicated the right walk (not a parent cycle, which the UI " +
      "cannot produce). collectSubtreePageIds' stack-based walk has no sibling sort at all, so a " +
      "page with two or more children can list them in whatever order they happen to sit in the " +
      "flat `pages` array instead of the order the tree view renders them in.",
    () => {
      const pages = [
        page({ id: "root", title: "Root" }),
        // Inserted deliberately out of position order, so a raw
        // insertion-order walk would visit (c, a, b) instead of the
        // position order (a, b, c) buildPageTree - and the sidebar - use.
        page({ id: "c", parentId: "root", title: "Carrot", position: 2 }),
        page({ id: "a", parentId: "root", title: "Apple", position: 0 }),
        page({ id: "b", parentId: "root", title: "Banana", position: 1 }),
      ];
      expect(collectScopePages(pages, "root").map((p) => p.id)).toEqual([
        "root",
        "a",
        "b",
        "c",
      ]);
    }
  );

  it("breaks a position tie by title, matching buildPageTree's own tie-break", () => {
    const pages = [
      page({ id: "root", title: "Root" }),
      page({ id: "z", parentId: "root", title: "Zebra", position: 0 }),
      page({ id: "m", parentId: "root", title: "Mango", position: 0 }),
    ];
    expect(collectScopePages(pages, "root").map((p) => p.id)).toEqual(["root", "m", "z"]);
  });

  it("puts the scope page itself first, then its descendants, for a subtree scope - and excludes an unrelated root", () => {
    const pages = [
      page({ id: "root", title: "Root" }),
      page({ id: "other-root", title: "Other Root" }),
      page({ id: "child", parentId: "root", title: "Child" }),
    ];
    expect(collectScopePages(pages, "root").map((p) => p.id)).toEqual(["root", "child"]);
  });

  it("returns just the page itself for a leaf page's subtree scope", () => {
    const pages = [page({ id: "leaf", title: "Leaf" })];
    expect(collectScopePages(pages, "leaf").map((p) => p.id)).toEqual(["leaf"]);
  });

  it("returns [] for a scopePageId that is not present in pages, rather than throwing", () => {
    const pages = [page({ id: "root", title: "Root" })];
    expect(collectScopePages(pages, "does-not-exist")).toEqual([]);
  });

  it("returns [] for the institution-root scope when there are no pages at all", () => {
    expect(collectScopePages([], null)).toEqual([]);
  });
});

describe("scopeHasDescendants", () => {
  it("is true for a page with at least one child", () => {
    const pages = [
      page({ id: "root", title: "Root" }),
      page({ id: "child", parentId: "root", title: "Child" }),
    ];
    expect(scopeHasDescendants(pages, "root")).toBe(true);
  });

  it("is false for a leaf page (AC1c: that view stays byte-for-byte what it is today)", () => {
    const pages = [page({ id: "leaf", title: "Leaf" })];
    expect(scopeHasDescendants(pages, "leaf")).toBe(false);
  });

  it("is false for a scopePageId that is not present in pages", () => {
    const pages = [page({ id: "root", title: "Root" })];
    expect(scopeHasDescendants(pages, "does-not-exist")).toBe(false);
  });
});

describe("describeScope", () => {
  it('reads "all N pages in {institution}" for an institution scope with more than one page', () => {
    const pages = Array.from({ length: 12 }, (_, i) => page({ id: `p${i}`, title: `Page ${i}` }));
    expect(describeScope(pages, null, "MCC")).toBe("all 12 pages in MCC");
  });

  it('reads "the 1 page in {institution}" - never "all 1 page" - for an institution scope with exactly one page', () => {
    const pages = [page({ id: "p1", title: "Only Page" })];
    expect(describeScope(pages, null, "MCC")).toBe("the 1 page in MCC");
  });

  it('reads "this page and its N sub-pages" for a subtree with more than one descendant', () => {
    const pages = [
      page({ id: "root", title: "Root" }),
      ...Array.from({ length: 7 }, (_, i) =>
        page({ id: `c${i}`, parentId: "root", title: `Child ${i}` })
      ),
    ];
    expect(describeScope(pages, "root", "MCC")).toBe("this page and its 7 sub-pages");
  });

  it('reads "this page and its 1 sub-page" - never "sub-pages" - for a subtree with exactly one descendant', () => {
    const pages = [
      page({ id: "root", title: "Root" }),
      page({ id: "child", parentId: "root", title: "Child" }),
    ];
    expect(describeScope(pages, "root", "MCC")).toBe("this page and its 1 sub-page");
  });
});
