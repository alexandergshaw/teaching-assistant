import { describe, it, expect } from "vitest";
import {
  selectCommitTargets,
  classifyCommitFailure,
  describeUnpublishOutcome,
  summarizeCommitResults,
  buildCommitRowInput,
  type CommitTargetOutcome,
} from "./release-commit";
import type { ReleaseTargetRef } from "./release-plan";

function makeTarget(overrides: Partial<ReleaseTargetRef> = {}): ReleaseTargetRef {
  return {
    kind: "module_item",
    id: 1,
    moduleId: 100,
    displayName: "Week 1 reading",
    selectionKey: "module_item:1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// selectCommitTargets - the defensive re-dedupe at the one point that
// actually writes to Canvas and to the database.

describe("selectCommitTargets", () => {
  it("passes through a list with no duplicates unchanged, in order", () => {
    const targets = [makeTarget({ id: 1, selectionKey: "a" }), makeTarget({ id: 2, selectionKey: "b" })];
    expect(selectCommitTargets(targets)).toEqual(targets);
  });

  it("collapses a duplicate selectionKey down to its FIRST occurrence", () => {
    const first = makeTarget({ id: 1, selectionKey: "dup", displayName: "First" });
    const duplicate = makeTarget({ id: 1, selectionKey: "dup", displayName: "Second (should be dropped)" });
    const other = makeTarget({ id: 2, selectionKey: "other" });
    expect(selectCommitTargets([first, duplicate, other])).toEqual([first, other]);
  });

  it("an empty list stays empty", () => {
    expect(selectCommitTargets([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// classifyCommitFailure - mirrors release-runner.ts's classifyReleaseFailure
// in technique; pinned independently since the two are deliberately separate
// functions (see this file's own header for why).

describe("classifyCommitFailure", () => {
  it("uses the message of a real Error", () => {
    expect(classifyCommitFailure(new Error("Canvas refused the write."))).toBe("Canvas refused the write.");
  });

  it("stringifies a non-Error throw", () => {
    expect(classifyCommitFailure("plain string failure")).toBe("plain string failure");
  });

  it("never throws, even for a value String() cannot coerce", () => {
    const hostile = {
      toString: () => {
        throw new Error("broken toString");
      },
    };
    expect(() => classifyCommitFailure(hostile)).not.toThrow();
    expect(classifyCommitFailure(hostile)).toBe("Unknown error (could not be converted to a string).");
  });
});

// ---------------------------------------------------------------------------
// describeUnpublishOutcome - F10's refusal decision made explicit: this
// function only ever DESCRIBES the unpublish attempt, it never appears in
// any gating logic (the commit loop calls it purely for visibility/logging).

describe("describeUnpublishOutcome", () => {
  it("no error at all -> ok: true", () => {
    expect(describeUnpublishOutcome(undefined)).toEqual({ ok: true });
    expect(describeUnpublishOutcome(null)).toEqual({ ok: true });
  });

  it("a Canvas refusal -> ok: false, with the classified detail", () => {
    expect(describeUnpublishOutcome(new Error("Sis Id has student submissions"))).toEqual({
      ok: false,
      detail: "Sis Id has student submissions",
    });
  });
});

// ---------------------------------------------------------------------------
// summarizeCommitResults - the exact { committed, failed } shape
// commitScheduledReleaseAction returns.

describe("summarizeCommitResults", () => {
  it("tallies committed and failed independently, preserving failed reasons", () => {
    const outcomes: CommitTargetOutcome[] = [
      { selectionKey: "a", status: "committed" },
      { selectionKey: "b", status: "failed", reason: "Could not schedule: unique violation." },
      { selectionKey: "c", status: "committed" },
    ];
    expect(summarizeCommitResults(outcomes)).toEqual({
      committed: 2,
      failed: [{ selectionKey: "b", reason: "Could not schedule: unique violation." }],
    });
  });

  it("a failed outcome with no reason falls back to a generic message, never a blank one", () => {
    const outcomes: CommitTargetOutcome[] = [{ selectionKey: "a", status: "failed" }];
    expect(summarizeCommitResults(outcomes)).toEqual({
      committed: 0,
      failed: [{ selectionKey: "a", reason: "Could not schedule this release." }],
    });
  });

  it("an empty list summarizes to zero committed and no failures", () => {
    expect(summarizeCommitResults([])).toEqual({ committed: 0, failed: [] });
  });

  it("PER-TARGET ISOLATION IS VISIBLE IN THE TALLY: one failure among several successes never zeroes out the others", () => {
    const outcomes: CommitTargetOutcome[] = [
      { selectionKey: "a", status: "committed" },
      { selectionKey: "b", status: "failed", reason: "network error" },
      { selectionKey: "c", status: "committed" },
      { selectionKey: "d", status: "committed" },
    ];
    expect(summarizeCommitResults(outcomes)).toEqual({
      committed: 3,
      failed: [{ selectionKey: "b", reason: "network error" }],
    });
  });
});

// ---------------------------------------------------------------------------
// buildCommitRowInput - narrows release-plan.ts's rich ReleaseTargetRef down
// to the (kind, id) pair scheduled-releases.ts's ScheduleReleaseInput wants.

describe("buildCommitRowInput", () => {
  it("keeps the target's IDENTITY (kind, id, moduleId) and drops its display text", () => {
    const target = makeTarget({ kind: "module", id: 42, moduleId: null, displayName: "Week 1", selectionKey: "module:42" });
    expect(buildCommitRowInput(target, "2026-09-01T13:00:00.000Z", "https://canvas.example.edu/courses/1", "ABC")).toEqual({
      courseUrl: "https://canvas.example.edu/courses/1",
      courseAcronym: "ABC",
      target: { kind: "module", id: 42, moduleId: null },
      releaseAt: "2026-09-01T13:00:00.000Z",
    });
  });

  // The reason moduleId belongs in the row at all (F10): it spares the runner
  // a listModules call per item target, and listModules is one request PER
  // MODULE. An item target that lost it here would silently fall back to that
  // lookup and the only symptom would be a slower tick.
  it("carries an item target's owning moduleId through to the row", () => {
    const target = makeTarget({ kind: "module_item", id: 501, moduleId: 42, displayName: "Reading", selectionKey: "live:42:501" });
    const row = buildCommitRowInput(target, "2026-09-01T13:00:00.000Z", "https://canvas.example.edu/courses/1", "ABC");
    expect(row.target).toEqual({ kind: "module_item", id: 501, moduleId: 42 });
  });

  it("drops displayName and selectionKey - the row stores identity, not UI text", () => {
    const target = makeTarget({ kind: "module_item", id: 501, moduleId: 42, displayName: "Reading", selectionKey: "live:42:501" });
    const row = buildCommitRowInput(target, "2026-09-01T13:00:00.000Z", "https://canvas.example.edu/courses/1", "ABC");
    expect(Object.keys(row.target).sort()).toEqual(["id", "kind", "moduleId"]);
  });

  it("a null course acronym is passed through, not coerced to undefined", () => {
    const target = makeTarget();
    const result = buildCommitRowInput(target, "2026-09-01T13:00:00.000Z", "https://canvas.example.edu/courses/1", null);
    expect(result.courseAcronym).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildModuleIdPatch USED to live here, with its own guard pinning its single
// payload key against the module_id migration. Both are gone, and the
// coverage did not vanish with them - it MOVED to where the write now
// happens. module_id is written by scheduleRelease itself, in the same
// insert/update as the rest of the row, so scheduled-releases.test.ts's
// migration-column guard (which now reads the UNION of both migrations, since
// a table's columns are every migration that touched it) is what pins the key
// name. Leaving a guard here over a function nothing calls would have been a
// test that could never fail for a real reason.
