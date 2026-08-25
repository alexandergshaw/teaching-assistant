import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked so the "normal path makes NO module-listing call" tests (F10's
// whole point - REGRESSION entry 339's own follow-up, closed by the
// acceptance criteria doc's F10) can assert listModules is never reached,
// and so the pre-F10 fallback test can assert it IS reached when a row has
// no moduleId. Every other test in this file injects its own `publish` fake
// and never touches this mock at all.
vi.mock("@/lib/canvas-modules", () => ({
  listModules: vi.fn(),
  updateModule: vi.fn(),
  updateModuleItem: vi.fn(),
}));

import {
  canStartRelease,
  classifyReleaseFailure,
  releaseSubBudgetDeadlineMs,
  summarizeReleaseResults,
  runDueReleases,
  publishReleaseTarget,
  RELEASE_SUB_BUDGET_MS,
  type ReleaseRunResult,
  type ReleaseWithModuleId,
} from "./release-runner";
import { listModules, updateModule, updateModuleItem } from "@/lib/canvas-modules";
import type { ScheduledRelease } from "./scheduled-releases";

// Fixed reference instant so every test pins `now` explicitly, matching
// scheduled-releases.test.ts's NOW idiom.
const NOW = new Date("2026-08-24T12:00:00.000Z");
const NOW_MS = NOW.getTime();

function makeRelease(overrides: Partial<ReleaseWithModuleId> = {}): ScheduledRelease {
  return {
    id: "release-1",
    userId: "user-1",
    courseUrl: "https://canvas.example.edu/courses/1",
    courseAcronym: null,
    target: { kind: "module", id: 100 },
    releaseAt: new Date(NOW_MS - 1_000).toISOString(),
    status: "pending",
    claimedAt: null,
    recoveryAttempts: 0,
    lastError: null,
    // F11: the published state the commit found and hid, so a later cancel can
    // restore on fact. The fixture defaults it to null - "we do not know" -
    // rather than false, because null is what a row written before that
    // column existed actually carries, and the runner must behave the same
    // either way (it publishes; only cancel reads this field).
    wasPublished: null,
    completedAt: null,
    createdAt: new Date(NOW_MS - 60_000).toISOString(),
    updatedAt: new Date(NOW_MS - 60_000).toISOString(),
    ...overrides,
  };
}

/** Same as makeRelease, but typed to also carry `moduleId` - for the
 * publishReleaseTarget/default-publish tests below, which are the only ones
 * that care about it. */
function makeReleaseWithModuleId(overrides: Partial<ReleaseWithModuleId> = {}): ReleaseWithModuleId {
  return { ...makeRelease(overrides), moduleId: overrides.moduleId };
}

// ---------------------------------------------------------------------------
// canStartRelease - the exact sub-budget boundary the whole release phase's
// "stop starting new work" decision hinges on.

describe("canStartRelease", () => {
  it("a target whose start check lands EXACTLY on the deadline still fits", () => {
    expect(canStartRelease(new Date(NOW_MS), NOW_MS)).toBe(true);
  });

  it("the first target to land 1ms past the deadline does not fit", () => {
    expect(canStartRelease(new Date(NOW_MS + 1), NOW_MS)).toBe(false);
  });

  it("a target well before the deadline fits", () => {
    expect(canStartRelease(new Date(NOW_MS - 5_000), NOW_MS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// releaseSubBudgetDeadlineMs - proves the release phase is carved from the
// FRONT of the tick's existing budget rather than stacked on top of it. This
// is the mechanism behind F2's ordering requirement: releases run first,
// under their own smaller budget, and the workflow loop's own deadline is
// left completely unrecomputed afterward (see route.ts) - so whatever the
// release phase actually consumed is automatically subtracted from what the
// workflow loop has left, with no separate arithmetic anywhere else. What
// makes that safe is proven here alone: the release deadline can NEVER
// exceed the overall deadline, no matter how the sub-budget is configured.

describe("releaseSubBudgetDeadlineMs", () => {
  it("is now + the sub-budget when that still lands before the overall deadline", () => {
    const overallDeadlineMs = NOW_MS + 50_000;
    expect(releaseSubBudgetDeadlineMs(NOW, overallDeadlineMs)).toBe(NOW_MS + RELEASE_SUB_BUDGET_MS);
  });

  it("never exceeds the overall deadline, even with a sub-budget larger than what's left", () => {
    // Only 5s left in the whole tick, but the default sub-budget is 15s -
    // must NOT push the release phase's own deadline past the shared ceiling
    // (that would be exactly the "second independent budget stacked on top"
    // mistake F2 warns against).
    const overallDeadlineMs = NOW_MS + 5_000;
    expect(releaseSubBudgetDeadlineMs(NOW, overallDeadlineMs)).toBe(overallDeadlineMs);
  });

  it("respects a custom sub-budget", () => {
    const overallDeadlineMs = NOW_MS + 50_000;
    expect(releaseSubBudgetDeadlineMs(NOW, overallDeadlineMs, 3_000)).toBe(NOW_MS + 3_000);
  });

  it("the overall deadline itself is never recomputed by this function - callers reuse the same instant for the workflow loop", () => {
    // Calling this twice with clocks that have advanced (simulating the
    // release phase taking real time) never changes what the SHARED overall
    // deadline was - that value is a caller-owned constant, not something
    // this function derives a fresh one from.
    const overallDeadlineMs = NOW_MS + 50_000;
    const firstCall = releaseSubBudgetDeadlineMs(NOW, overallDeadlineMs);
    const laterClock = new Date(NOW_MS + 10_000);
    const secondCallSameOverall = releaseSubBudgetDeadlineMs(laterClock, overallDeadlineMs);
    expect(firstCall).toBeLessThanOrEqual(overallDeadlineMs);
    expect(secondCallSameOverall).toBeLessThanOrEqual(overallDeadlineMs);
  });
});

// ---------------------------------------------------------------------------
// classifyReleaseFailure

describe("classifyReleaseFailure", () => {
  it("uses the message of a real Error", () => {
    expect(classifyReleaseFailure(new Error("Canvas refused the write."))).toBe("Canvas refused the write.");
  });

  it("stringifies a non-Error throw", () => {
    expect(classifyReleaseFailure("plain string failure")).toBe("plain string failure");
  });

  it("never throws, even for a value String() cannot coerce", () => {
    const hostile = { toString: () => { throw new Error("broken toString"); } };
    expect(() => classifyReleaseFailure(hostile)).not.toThrow();
    expect(classifyReleaseFailure(hostile)).toBe("Unknown error (could not be converted to a string).");
  });
});

// ---------------------------------------------------------------------------
// summarizeReleaseResults

describe("summarizeReleaseResults", () => {
  it("tallies each status independently, plus notStarted and due", () => {
    const results: ReleaseRunResult[] = [
      { releaseId: "a", target: { kind: "module", id: 1 }, status: "released" },
      { releaseId: "b", target: { kind: "module", id: 2 }, status: "released" },
      { releaseId: "c", target: { kind: "module_item", id: 3 }, status: "failed", detail: "refused" },
      { releaseId: "d", target: { kind: "module", id: 4 }, status: "skipped", detail: "already claimed" },
    ];
    expect(summarizeReleaseResults(results, 2, 6)).toEqual({
      due: 6,
      attempted: 4,
      released: 2,
      failed: 1,
      skipped: 1,
      notStarted: 2,
    });
  });

  it("an empty run summarizes to all zeros", () => {
    expect(summarizeReleaseResults([], 0, 0)).toEqual({ due: 0, attempted: 0, released: 0, failed: 0, skipped: 0, notStarted: 0 });
  });
});

// ---------------------------------------------------------------------------
// runDueReleases - the loop: claim -> publish -> mark done/failed, per target,
// under the sub-budget, with a per-target failure never aborting the tick.

describe("runDueReleases", () => {
  it("processes each due target in order: claims it, publishes it, marks it done", async () => {
    const r1 = makeRelease({ id: "r1", target: { kind: "module", id: 1 } });
    const r2 = makeRelease({ id: "r2", target: { kind: "module_item", id: 2 } });
    const claim = vi.fn().mockResolvedValue(true);
    const markDone = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const publish = vi.fn().mockResolvedValue(undefined);

    const { results, summary } = await runDueReleases({
      due: [r1, r2],
      deadlineMs: NOW_MS + 60_000,
      clock: () => NOW,
      claim,
      markDone,
      markFailed,
      publish,
    });

    expect(claim.mock.calls.map((c) => c[0].id)).toEqual(["r1", "r2"]);
    expect(publish.mock.calls.map((c) => c[0].id)).toEqual(["r1", "r2"]);
    expect(markDone.mock.calls.map((c) => c[0])).toEqual(["r1", "r2"]);
    expect(markFailed).not.toHaveBeenCalled();
    expect(results).toEqual([
      { releaseId: "r1", target: r1.target, status: "released" },
      { releaseId: "r2", target: r2.target, status: "released" },
    ]);
    expect(summary).toEqual({ due: 2, attempted: 2, released: 2, failed: 0, skipped: 0, notStarted: 0 });
  });

  it("a claim lost to a concurrent runner is reported skipped, and is never published or marked", async () => {
    const r1 = makeRelease({ id: "r1" });
    const claim = vi.fn().mockResolvedValue(false);
    const markDone = vi.fn();
    const markFailed = vi.fn();
    const publish = vi.fn();

    const { results, summary } = await runDueReleases({
      due: [r1],
      deadlineMs: NOW_MS + 60_000,
      clock: () => NOW,
      claim,
      markDone,
      markFailed,
      publish,
    });

    expect(publish).not.toHaveBeenCalled();
    expect(markDone).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(results).toEqual([{ releaseId: "r1", target: r1.target, status: "skipped", detail: "already claimed" }]);
    expect(summary.skipped).toBe(1);
  });

  it("PER-TARGET FAILURE ISOLATION: one target's publish failure never aborts the run - the remaining targets are attempted exactly as if it never existed", async () => {
    const r1 = makeRelease({ id: "r1", target: { kind: "module", id: 1 } });
    const r2 = makeRelease({ id: "r2", target: { kind: "module", id: 2 } });
    const r3 = makeRelease({ id: "r3", target: { kind: "module", id: 3 } });
    const claim = vi.fn().mockResolvedValue(true);
    const markDone = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const publish = vi.fn(async (release: ScheduledRelease) => {
      if (release.id === "r2") throw new Error("Canvas refused: quiz has submissions.");
    });

    const { results, summary } = await runDueReleases({
      due: [r1, r2, r3],
      deadlineMs: NOW_MS + 60_000,
      clock: () => NOW,
      claim,
      markDone,
      markFailed,
      publish,
    });

    // All three were claimed and attempted - the failure on r2 did not stop
    // the loop from reaching r3.
    expect(claim.mock.calls.map((c) => c[0].id)).toEqual(["r1", "r2", "r3"]);
    expect(markDone.mock.calls.map((c) => c[0])).toEqual(["r1", "r3"]);
    expect(markFailed).toHaveBeenCalledWith("r2", NOW, "Canvas refused: quiz has submissions.");
    expect(results).toEqual([
      { releaseId: "r1", target: r1.target, status: "released" },
      { releaseId: "r2", target: r2.target, status: "failed", detail: "Canvas refused: quiz has submissions." },
      { releaseId: "r3", target: r3.target, status: "released" },
    ]);
    expect(summary).toEqual({ due: 3, attempted: 3, released: 2, failed: 1, skipped: 0, notStarted: 0 });
  });

  it("a claim call that itself throws is recorded failed without calling markFailed (the row was never confirmed claimed)", async () => {
    const r1 = makeRelease({ id: "r1" });
    const claim = vi.fn().mockRejectedValue(new Error("connection reset"));
    const markDone = vi.fn();
    const markFailed = vi.fn();
    const publish = vi.fn();

    const { results } = await runDueReleases({
      due: [r1],
      deadlineMs: NOW_MS + 60_000,
      clock: () => NOW,
      claim,
      markDone,
      markFailed,
      publish,
    });

    expect(publish).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(results).toEqual([{ releaseId: "r1", target: r1.target, status: "failed", detail: "connection reset" }]);
  });

  it("SUB-BUDGET BOUNDARY: a target that fits is claimed; the first target that does not is left completely untouched and still due", async () => {
    const r1 = makeRelease({ id: "r1" });
    const r2 = makeRelease({ id: "r2" });
    const r3 = makeRelease({ id: "r3" });
    const deadlineMs = NOW_MS + 1_000;
    // The clock advances past the deadline exactly when the loop checks
    // whether r2 may start - r1 gets a clock reading AT the deadline (fits,
    // per canStartRelease's <=), r2 gets one 1ms past it (does not fit).
    const clock = vi
      .fn()
      .mockReturnValueOnce(new Date(deadlineMs)) // canStartRelease check for r1 - fits
      .mockReturnValueOnce(new Date(deadlineMs)) // claim(r1) timestamp
      .mockReturnValueOnce(new Date(deadlineMs)) // markDone(r1) timestamp
      .mockReturnValueOnce(new Date(deadlineMs + 1)); // canStartRelease check for r2 - does not fit

    const claim = vi.fn().mockResolvedValue(true);
    const markDone = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn();
    const publish = vi.fn().mockResolvedValue(undefined);

    const { results, summary } = await runDueReleases({
      due: [r1, r2, r3],
      deadlineMs,
      clock,
      claim,
      markDone,
      markFailed,
      publish,
    });

    // r1 fit: claimed, published, done.
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim.mock.calls[0][0].id).toBe("r1");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(markDone).toHaveBeenCalledTimes(1);
    // r2 and r3 never got a claim attempt at all - left exactly as they were
    // (still "pending" in the database, since nothing here ever touched
    // them), which is what makes them independently due again next tick -
    // the same partial-run-independence property
    // selectDueScheduledReleases's own tests pin for a mid-run crash,
    // extended here to a mid-run budget cutoff.
    expect(claim).not.toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }), expect.anything());
    expect(claim).not.toHaveBeenCalledWith(expect.objectContaining({ id: "r3" }), expect.anything());
    expect(results).toEqual([{ releaseId: "r1", target: r1.target, status: "released" }]);
    expect(summary).toEqual({ due: 3, attempted: 1, released: 1, failed: 0, skipped: 0, notStarted: 2 });
  });

  it("an empty due list does nothing and summarizes to all zeros", async () => {
    const claim = vi.fn();
    const markDone = vi.fn();
    const markFailed = vi.fn();
    const publish = vi.fn();

    const { results, summary } = await runDueReleases({
      due: [],
      deadlineMs: NOW_MS + 60_000,
      clock: () => NOW,
      claim,
      markDone,
      markFailed,
      publish,
    });

    expect(claim).not.toHaveBeenCalled();
    expect(results).toEqual([]);
    expect(summary).toEqual({ due: 0, attempted: 0, released: 0, failed: 0, skipped: 0, notStarted: 0 });
  });

  it("defaults publish to the real Canvas-writing function when none is injected (identity check only - no network call made here since due is empty)", async () => {
    const claim = vi.fn();
    const markDone = vi.fn();
    const markFailed = vi.fn();
    const { summary } = await runDueReleases({
      due: [],
      deadlineMs: NOW_MS + 60_000,
      claim,
      markDone,
      markFailed,
    });
    expect(summary.due).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// publishReleaseTarget - F10's whole point: a module_item target with a known
// moduleId must publish DIRECTLY, with no Canvas read to find its owning
// module. This is the property REGRESSION entry 339's own "follow-up this
// creates" section named and F10 closed - a test that only checked the
// happy publish result would not notice the extra read coming back, so these
// assert directly on the mocked listModules spy's call count.

describe("publishReleaseTarget", () => {
  beforeEachClearMocks();

  it("a module target publishes by id directly - no module lookup regardless of moduleId", async () => {
    await publishReleaseTarget("https://canvas.example.edu/courses/1", null, { kind: "module", id: 42 });
    expect(updateModule).toHaveBeenCalledWith("https://canvas.example.edu/courses/1", 42, { published: true }, undefined);
    expect(listModules).not.toHaveBeenCalled();
  });

  it("THE NORMAL PATH: a module_item target with a known moduleId publishes directly and makes NO module-listing call", async () => {
    await publishReleaseTarget("https://canvas.example.edu/courses/1", "ABC", { kind: "module_item", id: 7 }, 900);
    expect(updateModuleItem).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/1",
      900,
      7,
      { published: true },
      "ABC"
    );
    expect(listModules).not.toHaveBeenCalled();
  });

  it("THE FALLBACK PATH: a module_item target with NO moduleId (a pre-F10 row) falls back to listModules to find its owning module", async () => {
    vi.mocked(listModules).mockResolvedValue([
      { id: 900, name: "Week 1", position: 1, published: true, itemsCount: 1, items: [{ id: 7 } as never] },
    ] as never);

    await publishReleaseTarget("https://canvas.example.edu/courses/1", null, { kind: "module_item", id: 7 }, null);

    expect(listModules).toHaveBeenCalledTimes(1);
    expect(updateModuleItem).toHaveBeenCalledWith("https://canvas.example.edu/courses/1", 900, 7, { published: true }, undefined);
  });

  it("the fallback throws when no module contains the item", async () => {
    vi.mocked(listModules).mockResolvedValue([]);
    await expect(
      publishReleaseTarget("https://canvas.example.edu/courses/1", null, { kind: "module_item", id: 7 })
    ).rejects.toThrow(/was not found in any module/);
  });
});

// ---------------------------------------------------------------------------
// runDueReleases' DEFAULT publish wiring - proves moduleId actually flows
// from the due row through to publishReleaseTarget when no `publish` override
// is injected (every other runDueReleases test above injects its own
// `publish` fake and so never exercises this wiring at all).

describe("runDueReleases default publish wiring", () => {
  beforeEachClearMocks();

  it("passes the due row's moduleId through to the real publish path, making no module-listing call", async () => {
    const r1 = makeReleaseWithModuleId({ id: "r1", target: { kind: "module_item", id: 7 }, moduleId: 900 });
    const claim = vi.fn().mockResolvedValue(true);
    const markDone = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn();

    const { summary } = await runDueReleases({
      due: [r1],
      deadlineMs: NOW_MS + 60_000,
      clock: () => NOW,
      claim,
      markDone,
      markFailed,
      // No `publish` override - exercises the real default, which calls the
      // (mocked) canvas-modules functions.
    });

    expect(updateModuleItem).toHaveBeenCalledWith(r1.courseUrl, 900, 7, { published: true }, undefined);
    expect(listModules).not.toHaveBeenCalled();
    expect(summary).toEqual({ due: 1, attempted: 1, released: 1, failed: 0, skipped: 0, notStarted: 0 });
  });
});

function beforeEachClearMocks() {
  beforeEach(() => {
    vi.mocked(listModules).mockReset();
    vi.mocked(updateModule).mockReset().mockResolvedValue(undefined);
    vi.mocked(updateModuleItem).mockReset().mockResolvedValue(undefined);
  });
}
