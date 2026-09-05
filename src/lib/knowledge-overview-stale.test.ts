import { describe, it, expect } from "vitest";
import {
  fingerprintScopePages,
  summaryStaleness,
  type StoredSourcePage,
} from "./knowledge-overview-stale";
import type { InstitutionPage } from "./knowledge-base";

// Duplicated deliberately rather than imported from knowledge-base.test.ts
// or knowledge-overview-scope.test.ts - importing a helper from another
// *.test.ts file re-runs that file's own describe blocks (see this repo's
// no-cross-test-file-imports rule).
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

function stored(overrides: Partial<StoredSourcePage> = {}): StoredSourcePage {
  return {
    id: "p1",
    title: "Untitled",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("fingerprintScopePages", () => {
  it("maps each page to its (id, updatedAt) pair, dropping title/body/tags", () => {
    const pages = [
      page({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
      page({ id: "b", title: "Beta", updatedAt: "2026-08-02T00:00:00Z" }),
    ];
    expect(fingerprintScopePages(pages)).toEqual([
      { id: "a", updatedAt: "2026-08-01T00:00:00Z" },
      { id: "b", updatedAt: "2026-08-02T00:00:00Z" },
    ]);
  });

  it("sorts by id regardless of input order", () => {
    const pages = [page({ id: "z" }), page({ id: "a" }), page({ id: "m" })];
    expect(fingerprintScopePages(pages).map((f) => f.id)).toEqual(["a", "m", "z"]);
  });

  it("returns [] for an empty page list", () => {
    expect(fingerprintScopePages([])).toEqual([]);
  });
});

describe("summaryStaleness", () => {
  it("is not stale when every stored page matches the current scope exactly", () => {
    const storedPages = [
      stored({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
      stored({ id: "b", title: "Beta", updatedAt: "2026-08-02T00:00:00Z" }),
    ];
    const current = [
      page({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
      page({ id: "b", title: "Beta", updatedAt: "2026-08-02T00:00:00Z" }),
    ];
    expect(summaryStaleness(storedPages, current)).toEqual({
      stale: false,
      reasons: [],
      changedTitles: [],
      addedTitles: [],
      removedTitles: [],
    });
  });

  it("flags a page whose updatedAt STRING differs as page-edited (string inequality, not a clock comparison)", () => {
    const storedPages = [stored({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" })];
    // Deliberately an EARLIER timestamp than the stored one, not a later one
    // - proves the check is string inequality, never `>` (a `>` comparison
    // would miss this, or treat a clock-skewed "earlier" edit as not stale).
    const current = [page({ id: "a", title: "Alpha", updatedAt: "2026-07-01T00:00:00Z" })];
    expect(summaryStaleness(storedPages, current)).toEqual({
      stale: true,
      reasons: ["page-edited"],
      changedTitles: ["Alpha"],
      addedTitles: [],
      removedTitles: [],
    });
  });

  it(
    "flags a deleted page as page-removed EVEN WHEN every remaining page is completely " +
      "unchanged - the case a reviewer assumes is already covered and is not, because a " +
      "delete bumps nobody's updated_at (see BUILD.md/CORRECTIONS.md C2)",
    () => {
      const storedPages = [
        stored({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
        stored({ id: "b", title: "Beta", updatedAt: "2026-08-02T00:00:00Z" }),
      ];
      // "b" is gone entirely; "a" is byte-for-byte identical to its stored
      // fingerprint - nothing here has a "newer" timestamp to compare.
      const current = [page({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" })];
      expect(summaryStaleness(storedPages, current)).toEqual({
        stale: true,
        reasons: ["page-removed"],
        changedTitles: [],
        addedTitles: [],
        removedTitles: ["Beta"],
      });
    }
  );

  it("flags a newly in-scope page as page-added", () => {
    const storedPages = [stored({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" })];
    const current = [
      page({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
      page({ id: "b", title: "Beta", updatedAt: "2026-08-02T00:00:00Z" }),
    ];
    expect(summaryStaleness(storedPages, current)).toEqual({
      stale: true,
      reasons: ["page-added"],
      changedTitles: [],
      addedTitles: ["Beta"],
      removedTitles: [],
    });
  });

  it(
    "reports BOTH an add and a remove when the total page count nets to the same number - " +
      "proves the id SET is diffed, not a count",
    () => {
      const storedPages = [
        stored({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
        stored({ id: "b", title: "Beta", updatedAt: "2026-08-02T00:00:00Z" }),
      ];
      // Two pages on both sides (a count check would see 2 === 2 and call
      // this fresh), but "b" left the scope and "c" entered it.
      const current = [
        page({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
        page({ id: "c", title: "Carrot", updatedAt: "2026-08-03T00:00:00Z" }),
      ];
      expect(summaryStaleness(storedPages, current)).toEqual({
        stale: true,
        reasons: ["page-added", "page-removed"],
        changedTitles: [],
        addedTitles: ["Carrot"],
        removedTitles: ["Beta"],
      });
    }
  );

  it(
    "works the same over an institution-root scope spanning a multi-root tree (the pages " +
      "share no common parent at all) - the diff is a flat id set, not a tree walk",
    () => {
      const storedPages = [
        stored({ id: "root-a", title: "Root A", updatedAt: "2026-08-01T00:00:00Z" }),
        stored({ id: "root-b", title: "Root B", updatedAt: "2026-08-02T00:00:00Z" }),
      ];
      const current = [
        page({ id: "root-a", title: "Root A", updatedAt: "2026-08-01T00:00:00Z", parentId: null }),
        // root-b is a second, unrelated root - exactly what an
        // institution-root scope collects across a multi-root forest.
        page({ id: "root-b", title: "Root B", updatedAt: "2026-08-09T00:00:00Z", parentId: null }),
      ];
      expect(summaryStaleness(storedPages, current)).toEqual({
        stale: true,
        reasons: ["page-edited"],
        changedTitles: ["Root B"],
        addedTitles: [],
        removedTitles: [],
      });
    }
  );

  it("treats an empty stored source_pages list as everything being newly added, not as everything being removed", () => {
    const current = [
      page({ id: "a", title: "Alpha", updatedAt: "2026-08-01T00:00:00Z" }),
      page({ id: "b", title: "Beta", updatedAt: "2026-08-02T00:00:00Z" }),
    ];
    expect(summaryStaleness([], current)).toEqual({
      stale: true,
      reasons: ["page-added"],
      changedTitles: [],
      addedTitles: ["Alpha", "Beta"],
      removedTitles: [],
    });
  });

  it("is not stale when both the stored snapshot and the current scope are empty", () => {
    expect(summaryStaleness([], [])).toEqual({
      stale: false,
      reasons: [],
      changedTitles: [],
      addedTitles: [],
      removedTitles: [],
    });
  });

  it(
    "orders reasons edited, then added, then removed - the fixed SummaryStaleReason " +
      "declaration order, never id sort order or Map/Set iteration order",
    () => {
      // The "added" page ("z-new") sorts AFTER the "edited" page
      // ("a-edited") and the "removed" page ("m-gone") sorts in between -
      // if reasons were pushed in id-sort order, this would come out
      // ["page-edited", "page-removed", "page-added"] instead.
      const storedPages = [
        stored({ id: "a-edited", title: "Edited", updatedAt: "2026-08-01T00:00:00Z" }),
        stored({ id: "m-gone", title: "Gone", updatedAt: "2026-08-01T00:00:00Z" }),
      ];
      const current = [
        page({ id: "a-edited", title: "Edited", updatedAt: "2026-08-09T00:00:00Z" }),
        page({ id: "z-new", title: "New", updatedAt: "2026-08-01T00:00:00Z" }),
      ];
      expect(summaryStaleness(storedPages, current).reasons).toEqual([
        "page-edited",
        "page-added",
        "page-removed",
      ]);
    }
  );
});
