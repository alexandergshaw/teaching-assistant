// sweepOrphanUploads: the scheduled sweep for orphaned rubric/syllabus
// upload objects. See orphan-upload-sweep.ts's own header for the binding
// rulings this test file exists to enforce - most importantly Ruling 2
// (the phase-2 listing path has NO trailing slash) and the
// enumerate-before-delete ordering (a delete-while-paging implementation
// silently skips entries because Supabase's .list() offset is a live SQL
// OFFSET).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sweepOrphanUploads,
  ORPHAN_SWEEP_THRESHOLD_MS,
  type OrphanSweepLister,
  type OrphanSweepRemover,
  type StartIndexPicker,
} from "./orphan-upload-sweep";

const NOW = new Date("2026-09-13T12:00:00.000Z");
const OLD_ISO = new Date(NOW.getTime() - ORPHAN_SWEEP_THRESHOLD_MS - 60_000).toISOString();
const YOUNG_ISO = new Date(NOW.getTime() - 1_000).toISOString();

// sweepOrphanUploads reads the live clock (Date.now()) for its deadline
// checks, separately from the frozen `now` business-logic timestamp it is
// handed - pin BOTH to the same instant for every test in this file so a
// test's outcome never depends on how much real wall-clock time elapsed
// while it ran.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

interface FakeEntry {
  name: string;
  updatedAt: string | null;
}

/** A fake OrphanSweepLister and OrphanSweepRemover pair that SHARE MUTABLE
 * STATE, keyed by listing path ("" for the root, "${userId}/${segment}" for
 * a prefix-segment) - so a delete-while-paging implementation genuinely
 * skips entries the next .listPage call would have returned, and an
 * assertion on the full set of deleted entries can actually fail against
 * it. A fake returning a fixed array regardless of what was "removed" would
 * pass either way, which is exactly the gap this shared-state design closes. */
function makeSharedStateFakes(initial: Record<string, FakeEntry[]>) {
  const store = new Map<string, FakeEntry[]>();
  for (const [path, entries] of Object.entries(initial)) {
    store.set(path, entries.slice());
  }
  const listCalls: { path: string; limit: number; offset: number }[] = [];

  const lister: OrphanSweepLister = {
    async listPage(path, page) {
      listCalls.push({ path, limit: page.limit, offset: page.offset });
      const all = store.get(path) ?? [];
      const slice = all.slice(page.offset, page.offset + page.limit);
      return { entries: slice, error: null };
    },
  };

  const remover: OrphanSweepRemover = {
    async remove(paths) {
      const removedNames: string[] = [];
      for (const fullPath of paths) {
        const lastSlash = fullPath.lastIndexOf("/");
        const path = fullPath.slice(0, lastSlash);
        const name = fullPath.slice(lastSlash + 1);
        const arr = store.get(path);
        if (!arr) continue;
        const idx = arr.findIndex((e) => e.name === name);
        if (idx !== -1) {
          arr.splice(idx, 1);
          removedNames.push(name);
        }
      }
      return { removedNames, error: null };
    },
  };

  return { store, lister, remover, listCalls };
}

function fixedPicker(index: number): StartIndexPicker & { pick: ReturnType<typeof vi.fn> } {
  return { pick: vi.fn(() => index) };
}

function baseOptions(overrides: Partial<Parameters<typeof sweepOrphanUploads>[4]> = {}) {
  return {
    thresholdMs: ORPHAN_SWEEP_THRESHOLD_MS,
    softDeadlineAt: new Date(NOW.getTime() + 50_000),
    phase1BudgetMs: 20_000,
    maxUserPrefixesThisTick: 100,
    pageSize: 100,
    ...overrides,
  };
}

describe("sweepOrphanUploads: Ruling 2 - the phase-2 listing path has NO trailing slash", () => {
  it("calls listPage with the exact literal, e.g. 'u1/rubric-uploads' - no trailing slash", async () => {
    const { lister, remover, listCalls } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [],
      "u1/syllabus-uploads": [],
    });
    await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    const paths = listCalls.map((c) => c.path);
    expect(paths).toContain("u1/rubric-uploads");
    expect(paths).toContain("u1/syllabus-uploads");
    expect(paths).not.toContain("u1/rubric-uploads/");
    expect(paths).not.toContain("u1/syllabus-uploads/");
  });
});

describe("sweepOrphanUploads: pagination completeness (a dedicated axis, per Ruling 1(c))", () => {
  it("pages past a full first page - the trailing sentinel is not dropped", async () => {
    const pageSize = 2;
    // pageSize + 1 recent (not-yet-old) entries: if the sweep stops after the
    // first page, the final entry is never counted.
    const entries: FakeEntry[] = [
      { name: "a.docx", updatedAt: YOUNG_ISO },
      { name: "b.docx", updatedAt: YOUNG_ISO },
      { name: "c.docx", updatedAt: YOUNG_ISO },
    ];
    const { lister, remover } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": entries,
      "u1/syllabus-uploads": [],
    });
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions({ pageSize }));
    expect(result.skippedNotOldEnough).toBe(pageSize + 1);
  });
});

describe("sweepOrphanUploads: enumerate-before-delete (Ruling 1(b) - the offset-shift hazard)", () => {
  it("deletes every stale entry across multiple pages, never fewer because of a mid-listing delete", async () => {
    const pageSize = 2;
    // pageSize + 1 OLD (deletable) entries under one prefix-segment.
    const entries: FakeEntry[] = [
      { name: "a.docx", updatedAt: OLD_ISO },
      { name: "b.docx", updatedAt: OLD_ISO },
      { name: "c.docx", updatedAt: OLD_ISO },
    ];
    const { lister, remover } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": entries,
      "u1/syllabus-uploads": [],
    });
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions({ pageSize }));
    expect(result.deleted.map((d) => d.uploadId).sort()).toEqual(["a.docx", "b.docx", "c.docx"]);
    expect(result.failed).toEqual([]);
  });
});

describe("sweepOrphanUploads: reconciliation - removedNames, not a bare ok:boolean", () => {
  it("a path absent from removedNames is 'failed', even when error is null", async () => {
    const { lister } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [
        { name: "a.docx", updatedAt: OLD_ISO },
        { name: "b.docx", updatedAt: OLD_ISO },
        { name: "c.docx", updatedAt: OLD_ISO },
      ],
      "u1/syllabus-uploads": [],
    });
    // Remover claims success (error: null) but omits "b.docx" from removedNames -
    // exactly the shape a filtered DELETE matching nothing for that one path
    // would produce.
    const remover: OrphanSweepRemover = {
      remove: vi.fn(async () => ({ removedNames: ["a.docx", "c.docx"], error: null })),
    };
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    expect(result.deleted.map((d) => d.uploadId).sort()).toEqual(["a.docx", "c.docx"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].uploadId).toBe("b.docx");
    expect(result.failed[0].error).toContain("possibly already deleted");
  });

  it("treats an actual SDK error the same way - every requested path becomes failed", async () => {
    const { lister } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [{ name: "a.docx", updatedAt: OLD_ISO }],
      "u1/syllabus-uploads": [],
    });
    const remover: OrphanSweepRemover = {
      remove: vi.fn(async () => ({ removedNames: [], error: "network error" })),
    };
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    expect(result.deleted).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe("Not confirmed removed (error)");
  });
});

describe("sweepOrphanUploads: the zero-prefix guard", () => {
  it("returns the all-zero result and never calls the picker when phase 1 finds no user prefixes", async () => {
    const { lister, remover } = makeSharedStateFakes({ "": [] });
    const picker = fixedPicker(0);
    const result = await sweepOrphanUploads(lister, remover, picker, NOW, baseOptions());
    expect(result).toEqual({
      totalUserPrefixes: 0,
      scannedUserPrefixes: 0,
      deleted: [],
      failed: [],
      skippedNotOldEnough: 0,
      skippedUnknownAge: 0,
      truncatedByBudget: false,
      listingErrors: 0,
      matchedByLeafName: 0,
      matchedByFullPath: 0,
    });
    expect(picker.pick).not.toHaveBeenCalled();
  });
});

describe("sweepOrphanUploads: phase-1's own sub-budget, independent of the overall soft deadline", () => {
  it("aborts with totalUserPrefixes: null when the root pass alone exceeds phase1BudgetMs - phase 2 never runs", async () => {
    {
      const listCalls: string[] = [];
      const lister: OrphanSweepLister = {
        async listPage(path, page) {
          listCalls.push(path);
          if (path === "") {
            // Simulate a slow root .list() call: each call consumes more
            // wall-clock time than phase1BudgetMs allows in total, and
            // always returns a full page so the loop keeps paging.
            vi.advanceTimersByTime(25_000);
            return {
              entries: Array.from({ length: page.limit }, (_, i) => ({
                name: `u${page.offset + i}`,
                updatedAt: null,
              })),
              error: null,
            };
          }
          return { entries: [], error: null };
        },
      };
      const remover: OrphanSweepRemover = { remove: vi.fn(async () => ({ removedNames: [], error: null })) };
      const picker = fixedPicker(0);
      const result = await sweepOrphanUploads(lister, remover, picker, NOW, baseOptions({ phase1BudgetMs: 20_000 }));
      expect(result.totalUserPrefixes).toBeNull();
      expect(result.truncatedByBudget).toBe(true);
      expect(result.deleted).toEqual([]);
      expect(result.scannedUserPrefixes).toBe(0);
      expect(picker.pick).not.toHaveBeenCalled();
      expect(listCalls.every((p) => p === "")).toBe(true);
    }
  });

  it("a slow PHASE 2 (not phase 1) instead produces a non-null total with truncatedByBudget: true - the two budgets are independently triggerable", async () => {
    {
      const lister: OrphanSweepLister = {
        async listPage(path) {
          if (path === "") {
            return { entries: [{ name: "u1", updatedAt: null }], error: null };
          }
          // Any per-prefix listing call blows the overall soft deadline
          // (50s) without touching phase1BudgetMs (20s) at all.
          vi.advanceTimersByTime(60_000);
          return { entries: [], error: null };
        },
      };
      const remover: OrphanSweepRemover = { remove: vi.fn(async () => ({ removedNames: [], error: null })) };
      const picker = fixedPicker(0);
      const result = await sweepOrphanUploads(lister, remover, picker, NOW, baseOptions());
      expect(result.totalUserPrefixes).toBe(1);
      expect(result.truncatedByBudget).toBe(true);
      expect(picker.pick).toHaveBeenCalledWith(1);
    }
  });
});

describe("sweepOrphanUploads: the StartIndexPicker seam", () => {
  it("calls pick with the REAL totalUserPrefixes from phase 1, and starts phase 2 at the returned index", async () => {
    const { lister, remover, listCalls } = makeSharedStateFakes({
      "": [{ name: "u0", updatedAt: null }, { name: "u1", updatedAt: null }, { name: "u2", updatedAt: null }],
      "u0/rubric-uploads": [],
      "u0/syllabus-uploads": [],
      "u1/rubric-uploads": [],
      "u1/syllabus-uploads": [],
      "u2/rubric-uploads": [],
      "u2/syllabus-uploads": [],
    });
    const picker = fixedPicker(2);
    await sweepOrphanUploads(lister, remover, picker, NOW, baseOptions({ maxUserPrefixesThisTick: 1 }));
    expect(picker.pick).toHaveBeenCalledWith(3);
    const segmentPaths = listCalls.map((c) => c.path).filter((p) => p !== "");
    expect(segmentPaths.every((p) => p.startsWith("u2/"))).toBe(true);
  });

  it("wraps to 0 when the picked index plus maxUserPrefixesThisTick runs past the end", async () => {
    const { lister, remover, listCalls } = makeSharedStateFakes({
      "": [{ name: "u0", updatedAt: null }, { name: "u1", updatedAt: null }, { name: "u2", updatedAt: null }],
      "u0/rubric-uploads": [],
      "u0/syllabus-uploads": [],
      "u1/rubric-uploads": [],
      "u1/syllabus-uploads": [],
      "u2/rubric-uploads": [],
      "u2/syllabus-uploads": [],
    });
    const picker = fixedPicker(2);
    await sweepOrphanUploads(lister, remover, picker, NOW, baseOptions({ maxUserPrefixesThisTick: 2 }));
    const scannedUsers = new Set(listCalls.map((c) => c.path).filter((p) => p !== "").map((p) => p.split("/")[0]));
    expect(scannedUsers).toEqual(new Set(["u2", "u0"]));
  });
});

describe("sweepOrphanUploads: skippedUnknownAge is its own counter, never folded into skippedNotOldEnough", () => {
  it("counts a null-updatedAt entry separately from a verified-young one, and never deletes either", async () => {
    const { lister, remover } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [
        { name: "old.docx", updatedAt: OLD_ISO },
        { name: "young.docx", updatedAt: YOUNG_ISO },
        { name: "unknown.docx", updatedAt: null },
      ],
      "u1/syllabus-uploads": [],
    });
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    expect(result.deleted.map((d) => d.uploadId)).toEqual(["old.docx"]);
    expect(result.skippedNotOldEnough).toBe(1);
    expect(result.skippedUnknownAge).toBe(1);
  });
});

describe("sweepOrphanUploads: segment containment", () => {
  it("only ever lists syllabus-uploads and rubric-uploads under a user prefix - never any other segment", async () => {
    const { lister, remover, listCalls } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [],
      "u1/syllabus-uploads": [],
    });
    await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    const segmentPaths = listCalls.map((c) => c.path).filter((p) => p !== "");
    expect(new Set(segmentPaths)).toEqual(new Set(["u1/rubric-uploads", "u1/syllabus-uploads"]));
  });
});

describe("sweepOrphanUploads: MJ-1 - the mid-listing deadline check inside listPrefixSegmentToCompletion has a test that can fail", () => {
  it("stops paging ONE prefix-segment mid-listing when softDeadlineAt is exceeded, even though the page just returned was FULL (would otherwise immediately request a second page)", async () => {
    const pageSize = 2;
    let rubricListCalls = 0;
    const lister: OrphanSweepLister = {
      async listPage(path, page) {
        if (path === "") {
          return { entries: [{ name: "u1", updatedAt: null }], error: null };
        }
        if (path === "u1/syllabus-uploads") {
          return { entries: [], error: null };
        }
        // path === "u1/rubric-uploads": return a FULL page (length ===
        // pageSize, so the completeness check alone would page again), but
        // advance the clock past softDeadlineAt first - only the mid-loop
        // check (Date.now() > softDeadlineAtMs at the TOP of the paging
        // loop, before requesting the next page) can stop a second call.
        rubricListCalls += 1;
        vi.advanceTimersByTime(60_000);
        return {
          entries: Array.from({ length: pageSize }, (_, i) => ({ name: `f${page.offset + i}.docx`, updatedAt: null })),
          error: null,
        };
      },
    };
    const remover: OrphanSweepRemover = { remove: vi.fn(async () => ({ removedNames: [], error: null })) };
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions({ pageSize }));
    expect(result.truncatedByBudget).toBe(true);
    expect(rubricListCalls).toBe(1);
  });
});

describe("sweepOrphanUploads: MJ-2 - a listing error is counted separately from budget truncation", () => {
  it("counts a phase-2 listing error in listingErrors, distinct from a budget-only truncation", async () => {
    const { lister: budgetLister, remover } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [],
      "u1/syllabus-uploads": [],
    });
    const budgetOnly = await sweepOrphanUploads(
      budgetLister,
      remover,
      fixedPicker(0),
      NOW,
      baseOptions({ softDeadlineAt: new Date(NOW.getTime() - 1) })
    );
    expect(budgetOnly.truncatedByBudget).toBe(true);
    expect(budgetOnly.listingErrors).toBe(0);

    const erroringLister: OrphanSweepLister = {
      async listPage(path) {
        if (path === "") {
          return { entries: [{ name: "u1", updatedAt: null }], error: null };
        }
        if (path === "u1/rubric-uploads") {
          return { entries: [], error: "wrong bucket" };
        }
        return { entries: [], error: null };
      },
    };
    const errored = await sweepOrphanUploads(erroringLister, remover, fixedPicker(0), NOW, baseOptions());
    expect(errored.truncatedByBudget).toBe(true);
    expect(errored.listingErrors).toBe(1);
  });

  it("counts a phase-1 (root pass) listing error too", async () => {
    const erroringRootLister: OrphanSweepLister = {
      async listPage(path) {
        if (path === "") {
          return { entries: [], error: "wrong bucket" };
        }
        return { entries: [], error: null };
      },
    };
    const remover: OrphanSweepRemover = { remove: vi.fn(async () => ({ removedNames: [], error: null })) };
    const result = await sweepOrphanUploads(erroringRootLister, remover, fixedPicker(0), NOW, baseOptions());
    expect(result.totalUserPrefixes).toBeNull();
    expect(result.listingErrors).toBe(1);
  });
});

describe("sweepOrphanUploads: RULING A - matchedByLeafName and matchedByFullPath are counted at the two halves of the reconciliation disjunction", () => {
  it("counts a leaf-name match separately from a full-path match, both still landing in deleted", async () => {
    const { lister } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [
        { name: "a.docx", updatedAt: OLD_ISO },
        { name: "b.docx", updatedAt: OLD_ISO },
      ],
      "u1/syllabus-uploads": [],
    });
    // "a.docx" reported back as a bare leaf name; "b.docx" as the full
    // requested path - the two shapes Ruling 1's open question is about.
    const remover: OrphanSweepRemover = {
      remove: vi.fn(async () => ({
        removedNames: ["a.docx", "u1/rubric-uploads/b.docx"],
        error: null,
      })),
    };
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    expect(result.deleted.map((d) => d.uploadId).sort()).toEqual(["a.docx", "b.docx"]);
    expect(result.matchedByLeafName).toBe(1);
    expect(result.matchedByFullPath).toBe(1);
  });

  it("neither counter increments for a failed (unconfirmed) removal", async () => {
    const { lister } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }],
      "u1/rubric-uploads": [{ name: "a.docx", updatedAt: OLD_ISO }],
      "u1/syllabus-uploads": [],
    });
    const remover: OrphanSweepRemover = {
      remove: vi.fn(async () => ({ removedNames: [], error: null })),
    };
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    expect(result.failed).toHaveLength(1);
    expect(result.matchedByLeafName).toBe(0);
    expect(result.matchedByFullPath).toBe(0);
  });
});

describe("sweepOrphanUploads: partial failure does not stop the rest", () => {
  it("one prefix's remove failing does not prevent other prefixes' candidates from being reported deleted", async () => {
    const { lister } = makeSharedStateFakes({
      "": [{ name: "u1", updatedAt: null }, { name: "u2", updatedAt: null }],
      "u1/rubric-uploads": [{ name: "a.docx", updatedAt: OLD_ISO }],
      "u1/syllabus-uploads": [],
      "u2/rubric-uploads": [{ name: "b.docx", updatedAt: OLD_ISO }],
      "u2/syllabus-uploads": [],
    });
    const remover: OrphanSweepRemover = {
      remove: vi.fn(async (paths: string[]) => {
        if (paths[0].startsWith("u1/")) return { removedNames: [], error: "network error" };
        return { removedNames: ["b.docx"], error: null };
      }),
    };
    const result = await sweepOrphanUploads(lister, remover, fixedPicker(0), NOW, baseOptions());
    expect(result.failed.map((f) => f.uploadId)).toEqual(["a.docx"]);
    expect(result.deleted.map((d) => d.uploadId)).toEqual(["b.docx"]);
  });
});
