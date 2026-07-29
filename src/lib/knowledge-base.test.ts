import { describe, it, expect } from "vitest";
import {
  buildPageTree,
  searchPages,
  pageBreadcrumb,
  nextPosition,
  normalizeInstitution,
  wouldCreateCycle,
  mapInstitutionPage,
  renderInstitutionPolicyText,
  type InstitutionPage,
} from "./knowledge-base";
import type { Database } from "./supabase/types";

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

describe("normalizeInstitution", () => {
  it("trims and uppercases", () => {
    expect(normalizeInstitution("  mcc ")).toBe("MCC");
  });

  it("is idempotent on an already-normalized value", () => {
    expect(normalizeInstitution("MPCC")).toBe("MPCC");
  });

  it("handles an empty string", () => {
    expect(normalizeInstitution("   ")).toBe("");
  });
});

describe("buildPageTree", () => {
  it("nests children under their parent", () => {
    const pages = [
      page({ id: "root", title: "Root", position: 0 }),
      page({ id: "child", title: "Child", parentId: "root", position: 0 }),
      page({ id: "grandchild", title: "Grandchild", parentId: "child", position: 0 }),
    ];

    const tree = buildPageTree(pages);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("child");
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe("grandchild");
  });

  it("orders siblings by position then title", () => {
    const pages = [
      page({ id: "b", title: "Banana", position: 1 }),
      page({ id: "a", title: "Apple", position: 1 }),
      page({ id: "c", title: "Carrot", position: 0 }),
    ];

    const tree = buildPageTree(pages);
    expect(tree.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });

  it("surfaces a page whose parent_id points at a missing page at the root, instead of dropping it", () => {
    const pages = [
      page({ id: "orphan", title: "Orphan", parentId: "does-not-exist" }),
      page({ id: "real-root", title: "Real Root" }),
    ];

    const tree = buildPageTree(pages);
    const ids = tree.map((n) => n.id).sort();
    expect(ids).toEqual(["orphan", "real-root"]);
  });

  it("does not hang on a two-node parent cycle, and keeps both pages in the tree", () => {
    const pages = [
      page({ id: "a", title: "A", parentId: "b" }),
      page({ id: "b", title: "B", parentId: "a" }),
    ];

    const run = () => buildPageTree(pages);
    expect(run).not.toThrow();

    const tree = run();
    // Flatten the whole tree and confirm nothing was lost or duplicated.
    const flatten = (nodes: ReturnType<typeof buildPageTree>): string[] =>
      nodes.flatMap((n) => [n.id, ...flatten(n.children)]);
    expect(flatten(tree).sort()).toEqual(["a", "b"]);

    // Exactly one of the two cycle members is promoted to root (the cycle's
    // entry point) - not both, and not neither.
    expect(tree).toHaveLength(1);
  });

  it("does not hang on a longer cycle (three nodes), and keeps every page", () => {
    const pages = [
      page({ id: "a", title: "A", parentId: "b" }),
      page({ id: "b", title: "B", parentId: "c" }),
      page({ id: "c", title: "C", parentId: "a" }),
    ];

    const run = () => buildPageTree(pages);
    expect(run).not.toThrow();

    const tree = run();
    const flatten = (nodes: ReturnType<typeof buildPageTree>): string[] =>
      nodes.flatMap((n) => [n.id, ...flatten(n.children)]);
    expect(flatten(tree).sort()).toEqual(["a", "b", "c"]);
    expect(tree).toHaveLength(1);
  });

  it("does not hang when a tail chain leads into a cycle, and keeps the tail node reachable", () => {
    // tail -> b -> c -> b (b/c cycle; tail is not itself part of the cycle)
    const pages = [
      page({ id: "tail", title: "Tail", parentId: "b" }),
      page({ id: "b", title: "B", parentId: "c" }),
      page({ id: "c", title: "C", parentId: "b" }),
    ];

    const run = () => buildPageTree(pages);
    expect(run).not.toThrow();

    const tree = run();
    const flatten = (nodes: ReturnType<typeof buildPageTree>): string[] =>
      nodes.flatMap((n) => [n.id, ...flatten(n.children)]);
    expect(flatten(tree).sort()).toEqual(["b", "c", "tail"]);
  });

  it("returns an empty array for no pages", () => {
    expect(buildPageTree([])).toEqual([]);
  });
});

describe("searchPages", () => {
  const pages = [
    page({ id: "1", title: "Attendance Policy", body: "Students must attend 80% of sessions.", tags: ["policy"] }),
    page({ id: "2", title: "Grading Rubric", body: "Late work loses 10% per day.", tags: ["grading", "deadlines"] }),
    page({ id: "3", title: "Contacts", body: "Nothing relevant here.", tags: [] }),
  ];

  it("matches on title, case-insensitively", () => {
    const hits = searchPages(pages, "attendance");
    expect(hits.map((h) => h.page.id)).toEqual(["1"]);
  });

  it("matches on body content", () => {
    const hits = searchPages(pages, "late work");
    expect(hits.map((h) => h.page.id)).toEqual(["2"]);
  });

  it("matches on tags", () => {
    const hits = searchPages(pages, "deadlines");
    expect(hits.map((h) => h.page.id)).toEqual(["2"]);
  });

  it("returns a snippet surrounding the body hit", () => {
    const hits = searchPages(pages, "80%");
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain("80%");
  });

  it("returns no hits for a blank query", () => {
    expect(searchPages(pages, "   ")).toEqual([]);
  });

  it("returns no hits when nothing matches", () => {
    expect(searchPages(pages, "xyzzy-not-present")).toEqual([]);
  });

  it("matches across all three fields at once without duplicating a page", () => {
    const p = page({ id: "4", title: "unique-term here", body: "and unique-term again", tags: ["unique-term"] });
    const hits = searchPages([p], "unique-term");
    expect(hits).toHaveLength(1);
  });
});

describe("pageBreadcrumb", () => {
  const pages = [
    page({ id: "root", title: "Root" }),
    page({ id: "mid", title: "Mid", parentId: "root" }),
    page({ id: "leaf", title: "Leaf", parentId: "mid" }),
  ];

  it("returns the ancestor chain root-first, including the page itself", () => {
    expect(pageBreadcrumb(pages, "leaf").map((p) => p.id)).toEqual(["root", "mid", "leaf"]);
  });

  it("returns a single-element chain for a root page", () => {
    expect(pageBreadcrumb(pages, "root").map((p) => p.id)).toEqual(["root"]);
  });

  it("returns an empty array for an unknown id", () => {
    expect(pageBreadcrumb(pages, "nope")).toEqual([]);
  });

  it("does not hang on a parent cycle", () => {
    const cyclic = [
      page({ id: "a", title: "A", parentId: "b" }),
      page({ id: "b", title: "B", parentId: "a" }),
    ];
    const run = () => pageBreadcrumb(cyclic, "a");
    expect(run).not.toThrow();
    // Stops once it would revisit a node - never longer than the number of pages.
    expect(run().length).toBeLessThanOrEqual(cyclic.length);
  });
});

describe("nextPosition", () => {
  it("returns 0 for no siblings", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("returns one past the current maximum", () => {
    const siblings = [page({ id: "a", position: 0 }), page({ id: "b", position: 3 }), page({ id: "c", position: 1 })];
    expect(nextPosition(siblings)).toBe(4);
  });
});

describe("wouldCreateCycle", () => {
  const pages = [
    page({ id: "root", title: "Root" }),
    page({ id: "child", title: "Child", parentId: "root" }),
    page({ id: "grandchild", title: "Grandchild", parentId: "child" }),
    page({ id: "unrelated", title: "Unrelated" }),
  ];

  it("rejects moving a page under itself", () => {
    expect(wouldCreateCycle(pages, "child", "child")).toBe(true);
  });

  it("rejects moving a page under its own descendant", () => {
    expect(wouldCreateCycle(pages, "root", "grandchild")).toBe(true);
    expect(wouldCreateCycle(pages, "child", "grandchild")).toBe(true);
  });

  it("allows moving a page under an unrelated page", () => {
    expect(wouldCreateCycle(pages, "child", "unrelated")).toBe(false);
  });

  it("allows moving a page to root (null parent)", () => {
    expect(wouldCreateCycle(pages, "grandchild", null)).toBe(false);
  });

  it("allows moving a page under its current grandparent (not a descendant)", () => {
    expect(wouldCreateCycle(pages, "grandchild", "root")).toBe(false);
  });

  it("does not hang when the data already contains an unrelated cycle", () => {
    const withCycle = [...pages, page({ id: "x", parentId: "y" }), page({ id: "y", parentId: "x" })];
    const run = () => wouldCreateCycle(withCycle, "child", "unrelated");
    expect(run).not.toThrow();
    expect(run()).toBe(false);
  });
});

describe("mapInstitutionPage", () => {
  type Row = Database["public"]["Tables"]["institution_pages"]["Row"];

  function row(overrides: Partial<Row> = {}): Row {
    return {
      id: "p1",
      user_id: "u1",
      institution: "MCC",
      parent_id: null,
      title: "Policy",
      body: "Body text",
      tags: ["policy"],
      position: 2,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      ...overrides,
    };
  }

  it("maps every column across the snake_case/camelCase boundary", () => {
    const mapped = mapInstitutionPage(row());
    expect(mapped).toEqual({
      id: "p1",
      institution: "MCC",
      parentId: null,
      title: "Policy",
      body: "Body text",
      tags: ["policy"],
      position: 2,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
    });
  });

  it("preserves a non-null parent_id as parentId", () => {
    const mapped = mapInstitutionPage(row({ parent_id: "parent-1" }));
    expect(mapped.parentId).toBe("parent-1");
  });
});

describe("renderInstitutionPolicyText", () => {
  it("returns an empty result for no pages", () => {
    expect(renderInstitutionPolicyText([], 1000)).toEqual({ text: "", includedCount: 0, omittedCount: 0 });
  });

  it("renders a single page as 'Title\\nBody'", () => {
    const result = renderInstitutionPolicyText(
      [page({ id: "1", title: "Attendance Policy", body: "Must attend 80%." })],
      1000
    );
    expect(result).toEqual({ text: "Attendance Policy\nMust attend 80%.", includedCount: 1, omittedCount: 0 });
  });

  it("falls back to a placeholder title for an untitled page", () => {
    const result = renderInstitutionPolicyText([page({ id: "1", title: "   ", body: "Body text." })], 1000);
    expect(result.text).toBe("Untitled page\nBody text.");
  });

  it("renders in buildPageTree order (root, then child, then grandchild), not insertion order", () => {
    const pages = [
      page({ id: "grandchild", title: "Grandchild", parentId: "child", body: "gc body" }),
      page({ id: "root", title: "Root", body: "root body" }),
      page({ id: "child", title: "Child", parentId: "root", body: "child body" }),
    ];
    const result = renderInstitutionPolicyText(pages, 10_000);
    const rootIdx = result.text.indexOf("Root");
    const childIdx = result.text.indexOf("Child");
    const grandchildIdx = result.text.indexOf("Grandchild");
    expect(rootIdx).toBeGreaterThanOrEqual(0);
    expect(rootIdx).toBeLessThan(childIdx);
    expect(childIdx).toBeLessThan(grandchildIdx);
    expect(result.includedCount).toBe(3);
    expect(result.omittedCount).toBe(0);
  });

  it("includes every page and adds no omitted-count note when everything fits within budget", () => {
    // "A\n12345" (7 chars) + separator (2) + "B\n67890" (7 chars) = 16.
    const pages = [
      page({ id: "a", title: "A", body: "12345" }),
      page({ id: "b", title: "B", body: "67890" }),
    ];
    const result = renderInstitutionPolicyText(pages, 16);
    expect(result).toEqual({ text: "A\n12345\n\nB\n67890", includedCount: 2, omittedCount: 0 });
  });

  it("truncates on a page boundary (never mid-sentence) at the budget boundary, and states the omitted count", () => {
    // Same pages as above, but one character short of fitting the second
    // page - the second page must be dropped WHOLE, not cut short.
    const pages = [
      page({ id: "a", title: "A", body: "12345" }),
      page({ id: "b", title: "B", body: "67890" }),
    ];
    const result = renderInstitutionPolicyText(pages, 15);
    expect(result.includedCount).toBe(1);
    expect(result.omittedCount).toBe(1);
    expect(result.text).toBe("A\n12345\n\n[1 more policy page omitted to stay within the context budget]");
    // The dropped page's own text never appears, not even partially.
    expect(result.text).not.toContain("B");
    expect(result.text).not.toContain("67890");
  });

  it("pluralizes the omitted-count note for more than one dropped page", () => {
    const pages = [
      page({ id: "a", title: "A", body: "12345" }),
      page({ id: "b", title: "B", body: "67890" }),
      page({ id: "c", title: "C", body: "13579" }),
    ];
    const result = renderInstitutionPolicyText(pages, 7);
    expect(result.includedCount).toBe(1);
    expect(result.omittedCount).toBe(2);
    expect(result.text).toContain("2 more policy pages omitted to stay within the context budget");
  });

  it("returns an omitted-only result when even the first page cannot fit", () => {
    const result = renderInstitutionPolicyText([page({ id: "a", title: "A", body: "12345" })], 3);
    expect(result.includedCount).toBe(0);
    expect(result.omittedCount).toBe(1);
    expect(result.text).toBe("[1 more policy page omitted to stay within the context budget]");
  });
});
