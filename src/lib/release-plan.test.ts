// Tests for release-plan.ts
// (docs/scheduled-publishing-from-modules-acceptance-criteria.md - "Post-
// design corrections" section, F10 and F4).
//
// Sabotage check performed by hand against the real source file (not
// committed as broken code - restored, and the restore proven with a diff
// against a byte-for-byte backup taken BEFORE the sabotage edit; see the
// final report for the exact commands and their output):
//   Removed the dedupe step from `buildReleaseTargets` (made it return
//   `collectReleaseTargetCandidates(...)` directly, skipping
//   `dedupeReleaseTargets`). This reddened exactly one test - "dedupes an
//   item that is both selected directly and held by a selected module" -
//   which then saw the overlapping item twice in the result. Every other
//   test in this file, including the other ordering/expansion tests, stayed
//   green. Restored from the backup, diffed clean, suite green again.
//
// Every assertion below is on DECISION, COUNTS, and ORDERING/MEMBERSHIP -
// never on the exact wording of a `reason` string beyond a short distinctive
// substring, per this project's standing rule against source-text tests that
// pin prose.

import { describe, it, expect } from "vitest";
import {
  buildReleaseTargets,
  classifyReleaseHideState,
  describeReleaseHideState,
  buildReleasePlanRows,
  summarizeReleasePlan,
  buildReleasePlan,
  reconcileReleasePlanWithSelection,
  validateReleaseInstant,
  type ReleasePlanModuleNode,
  type ReleaseTargetRef,
  type ReleasePlanRowInput,
} from "./release-plan";

// ---------------------------------------------------------------------------
// Fixtures

function tree(): ReleasePlanModuleNode[] {
  return [
    {
      id: 1,
      name: "Week 1",
      selectionKey: "live:module:1",
      items: [
        { id: 101, moduleId: 1, title: "Week 1 Reading", selectionKey: "live:item:101" },
        { id: 102, moduleId: 1, title: "Week 1 Quiz", selectionKey: "live:item:102" },
      ],
    },
    {
      id: 2,
      name: "Week 2",
      selectionKey: "live:module:2",
      items: [{ id: 201, moduleId: 2, title: "Week 2 Assignment", selectionKey: "live:item:201" }],
    },
  ];
}

// ---------------------------------------------------------------------------
// F10 - target expansion and dedupe

describe("buildReleaseTargets", () => {
  it("expands a selected module into itself plus every one of its items", () => {
    const targets = buildReleaseTargets([1], [], tree());
    expect(targets.map((t) => `${t.kind}:${t.id}`)).toEqual(["module:1", "module_item:101", "module_item:102"]);
  });

  it("expands a selected item into itself alone, without pulling in its module", () => {
    const targets = buildReleaseTargets([], [201], tree());
    expect(targets.map((t) => `${t.kind}:${t.id}`)).toEqual(["module_item:201"]);
  });

  it("dedupes an item that is both selected directly and held by a selected module", () => {
    // Module 1 is selected (pulling in items 101 and 102), AND item 101 is
    // ALSO independently present in the item selection. This must produce
    // exactly one target for item 101, not two.
    const targets = buildReleaseTargets([1], [101], tree());
    const itemTargets = targets.filter((t) => t.kind === "module_item" && t.id === 101);
    expect(itemTargets).toHaveLength(1);
    expect(targets.map((t) => `${t.kind}:${t.id}`)).toEqual(["module:1", "module_item:101", "module_item:102"]);
  });

  it("carries the owning module id onto an item target, and null onto a module target", () => {
    const targets = buildReleaseTargets([1], [], tree());
    const moduleTarget = targets.find((t) => t.kind === "module")!;
    const itemTarget = targets.find((t) => t.kind === "module_item")!;
    expect(moduleTarget.moduleId).toBeNull();
    expect(itemTarget.moduleId).toBe(1);
  });

  it("orders modules before their own items, and preserves module tree order across multiple selected modules", () => {
    const targets = buildReleaseTargets([1, 2], [], tree());
    expect(targets.map((t) => `${t.kind}:${t.id}`)).toEqual([
      "module:1",
      "module_item:101",
      "module_item:102",
      "module:2",
      "module_item:201",
    ]);
  });

  it("produces no targets for an empty selection", () => {
    expect(buildReleaseTargets([], [], tree())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F4 - hide-state classification

function targetRef(overrides: Partial<ReleaseTargetRef> = {}): ReleaseTargetRef {
  return { kind: "module_item", id: 1, moduleId: 1, displayName: "Some Item", selectionKey: "live:item:1", ...overrides };
}

describe("classifyReleaseHideState", () => {
  it("is 'already-hidden' when the target is not currently published", () => {
    expect(classifyReleaseHideState({ published: false, canUnpublish: null })).toBe("already-hidden");
    expect(classifyReleaseHideState({ published: false, canUnpublish: true })).toBe("already-hidden");
  });

  it("is 'hideable' when published and Canvas allows unpublishing", () => {
    expect(classifyReleaseHideState({ published: true, canUnpublish: true })).toBe("hideable");
  });

  it("is 'refused' when published and Canvas refuses to unpublish", () => {
    expect(classifyReleaseHideState({ published: true, canUnpublish: false })).toBe("refused");
  });

  it("is 'unknown' when publish state could not be read, and this is distinct from 'hideable'", () => {
    const state = classifyReleaseHideState({ published: null, canUnpublish: null });
    expect(state).toBe("unknown");
    expect(state).not.toBe("hideable");
  });

  it("is 'unknown' when published but Canvas's unpublishable flag could not be read - never silently 'hideable'", () => {
    const state = classifyReleaseHideState({ published: true, canUnpublish: null });
    expect(state).toBe("unknown");
    expect(state).not.toBe("hideable");
  });

  it("all four states are mutually distinct outcomes", () => {
    const states = new Set([
      classifyReleaseHideState({ published: false, canUnpublish: null }),
      classifyReleaseHideState({ published: true, canUnpublish: true }),
      classifyReleaseHideState({ published: true, canUnpublish: false }),
      classifyReleaseHideState({ published: null, canUnpublish: null }),
    ]);
    expect(states.size).toBe(4);
  });
});

describe("describeReleaseHideState", () => {
  it("returns null for 'hideable' - nothing to explain", () => {
    expect(describeReleaseHideState("hideable", targetRef())).toBeNull();
  });

  it("names the target and mentions submissions-style refusal for 'refused'", () => {
    const reason = describeReleaseHideState("refused", targetRef({ displayName: "Midterm Quiz" }));
    expect(reason).toContain("Midterm Quiz");
    expect(reason?.toLowerCase()).toContain("submission");
  });

  it("distinguishes 'already-hidden' and 'unknown' reasons from each other and from 'refused'", () => {
    const alreadyHidden = describeReleaseHideState("already-hidden", targetRef());
    const unknown = describeReleaseHideState("unknown", targetRef());
    expect(alreadyHidden).not.toEqual(unknown);
    expect(alreadyHidden?.toLowerCase()).toContain("already");
    expect(unknown?.toLowerCase()).toContain("determine");
  });
});

// ---------------------------------------------------------------------------
// Ordering + summary through the full row pipeline

describe("buildReleasePlanRows / summarizeReleasePlan", () => {
  it("preserves input order and counts each hide-state exactly once", () => {
    const inputs: ReleasePlanRowInput[] = [
      { target: targetRef({ id: 1, displayName: "A" }), facts: { published: true, canUnpublish: true } },
      { target: targetRef({ id: 2, displayName: "B" }), facts: { published: false, canUnpublish: null } },
      { target: targetRef({ id: 3, displayName: "C" }), facts: { published: true, canUnpublish: false } },
      { target: targetRef({ id: 4, displayName: "D" }), facts: { published: null, canUnpublish: null } },
    ];
    const rows = buildReleasePlanRows(inputs);
    expect(rows.map((r) => r.target.displayName)).toEqual(["A", "B", "C", "D"]);
    expect(rows.map((r) => r.hideState)).toEqual(["hideable", "already-hidden", "refused", "unknown"]);

    const summary = summarizeReleasePlan(rows);
    expect(summary).toEqual({ total: 4, hideable: 1, alreadyHidden: 1, refused: 1, unknown: 1 });
  });

  it("summarizes an empty row set as all zeros", () => {
    expect(summarizeReleasePlan([])).toEqual({ total: 0, hideable: 0, alreadyHidden: 0, refused: 0, unknown: 0 });
  });
});

// ---------------------------------------------------------------------------
// Staleness / reconcile

describe("reconcileReleasePlanWithSelection", () => {
  it("reports selectionChanged=false and every row applicable when the selection has not moved", () => {
    const rows = [{ target: targetRef({ selectionKey: "live:item:1" }), hideState: "hideable" as const, reason: null }];
    const plan = buildReleasePlan(rows, ["live:item:1"]);
    const result = reconcileReleasePlanWithSelection(plan, ["live:item:1"]);
    expect(result.selectionChanged).toBe(false);
    expect(result.applicableRows).toEqual(rows);
    expect(result.droppedRows).toEqual([]);
  });

  it("drops a row whose target left the selection, and keeps a row whose target is still selected", () => {
    const rowA = { target: targetRef({ id: 1, selectionKey: "live:item:1" }), hideState: "hideable" as const, reason: null };
    const rowB = { target: targetRef({ id: 2, selectionKey: "live:item:2" }), hideState: "hideable" as const, reason: null };
    const plan = buildReleasePlan([rowA, rowB], ["live:item:1", "live:item:2"]);

    // Item 2 is deselected; item 1 remains.
    const result = reconcileReleasePlanWithSelection(plan, ["live:item:1"]);
    expect(result.selectionChanged).toBe(true);
    expect(result.applicableRows).toEqual([rowA]);
    expect(result.droppedRows).toEqual([rowB]);
  });

  it("is order-independent - the same selection re-expressed in a different order is not a change", () => {
    const rows = [{ target: targetRef({ selectionKey: "live:item:1" }), hideState: "hideable" as const, reason: null }];
    const plan = buildReleasePlan(rows, ["live:item:1", "live:item:2"]);
    const result = reconcileReleasePlanWithSelection(plan, ["live:item:2", "live:item:1"]);
    expect(result.selectionChanged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Release-time validation - exact boundary, no local wall-clock dates

describe("validateReleaseInstant", () => {
  it("refuses a release requested for exactly 'now'", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const result = validateReleaseInstant(now.toISOString(), now);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("future");
  });

  it("accepts a release requested one millisecond after 'now'", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const oneMsLater = new Date(now.getTime() + 1).toISOString();
    const result = validateReleaseInstant(oneMsLater, now);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("refuses a release requested one millisecond before 'now'", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const oneMsEarlier = new Date(now.getTime() - 1).toISOString();
    const result = validateReleaseInstant(oneMsEarlier, now);
    expect(result.valid).toBe(false);
  });

  it("refuses an unparseable release instant, with a distinct reason from the past-instant case", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const unparseable = validateReleaseInstant("not-a-date", now);
    const past = validateReleaseInstant(new Date(now.getTime() - 1000).toISOString(), now);
    expect(unparseable.valid).toBe(false);
    expect(unparseable.reason).not.toEqual(past.reason);
    expect(unparseable.reason?.toLowerCase()).toContain("parsed");
  });
});
