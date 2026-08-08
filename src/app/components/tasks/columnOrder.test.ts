// TDD contract for the Tasks grid's column reorder logic -
// docs/tasks-column-reorder-acceptance-criteria.md.
//
// Written BEFORE the implementation; these currently FAIL because
// ./columnOrder does not exist yet. Make them pass without changing what they
// assert. If one is wrong, report it rather than editing it.
//
// The module under test must stay PURE (no React, no MUI, no CSS module, no
// DOM): this repo's vitest runs environment:"node" and collects only
// src/**/*.test.ts, so anything living in a .tsx cannot be tested at all.
// TasksGrid.tsx is also at 918 of its 1000-line budget. Same rationale as
// gridFocus.ts.
//
// IMPORTANT INPUT CONTRACT: `ReorderableColumn[]` is built by TasksTab from
// `resolvedCatalog` + `visibleColumnIds`, NOT from the grid's own `columns`
// array. TasksGrid receives `tasks={visibleTasks}` (TasksTab.tsx:680), so its
// column array never contains a hidden task - feeding it here would make every
// hidden column invisible to the renumbering, and a task left at
// `position: null` sorts to POSITIVE_INFINITY (course-tasks-view.ts:191), i.e.
// the end of its group. That is exactly what AC item 39 forbids.
import { describe, it, expect } from "vitest";
import type { TaskGroupId } from "@/lib/course-tasks";
import { BUILT_IN_TASKS } from "@/lib/course-tasks-catalog";
import {
  resolveTaskCatalog,
  type TaskCatalogOverride,
} from "@/lib/course-tasks-view";
import {
  isValidDropTarget,
  moveWithinGroup,
  stepWithinGroup,
  moveToGroupEdge,
  groupPositionAssignments,
  positionWithinGroup,
  type ReorderableColumn,
} from "./columnOrder";

/** Two groups, contiguous, mirroring the real Term Setup view. */
function cols(): ReorderableColumn[] {
  return [
    { id: "d1", group: "dependent", visible: true },
    { id: "d2", group: "dependent", visible: true },
    { id: "d3", group: "dependent", visible: true },
    { id: "i1", group: "independent", visible: true },
    { id: "i2", group: "independent", visible: true },
  ];
}

/** d2 hidden between two visible columns - the case that separates a correct
 * nearest-visible-neighbour move from a move-to-end. */
function withHidden(): ReorderableColumn[] {
  return [
    { id: "d1", group: "dependent", visible: true },
    { id: "d2", group: "dependent", visible: false },
    { id: "d3", group: "dependent", visible: true },
    { id: "d4", group: "dependent", visible: true },
  ];
}

const idsOf = (c: readonly ReorderableColumn[]) => c.map((x) => x.id);

/** Each group must occupy exactly ONE contiguous run - the invariant that
 * TasksGrid's header colSpan and gridFocus.ts's indexOf both depend on. */
function groupRunsAreContiguous(c: readonly ReorderableColumn[]): boolean {
  const seen = new Set<TaskGroupId>();
  let prev: TaskGroupId | null = null;
  for (const col of c) {
    if (col.group !== prev) {
      if (seen.has(col.group)) return false;
      seen.add(col.group);
      prev = col.group;
    }
  }
  return true;
}

describe("isValidDropTarget", () => {
  it("accepts a target in the dragged column's own group", () => {
    expect(isValidDropTarget(cols(), "d1", "d3")).toBe(true);
  });

  it("REJECTS a target in a different group", () => {
    // AC1 item 2 / REGRESSION entry 232 check 15.
    expect(isValidDropTarget(cols(), "d1", "i1")).toBe(false);
    expect(isValidDropTarget(cols(), "i2", "d2")).toBe(false);
  });

  it("rejects an unknown dragged id or target id", () => {
    expect(isValidDropTarget(cols(), "nope", "d1")).toBe(false);
    expect(isValidDropTarget(cols(), "d1", "nope")).toBe(false);
  });

  it("rejects dropping a column onto itself", () => {
    expect(isValidDropTarget(cols(), "d2", "d2")).toBe(false);
  });

  it("rejects a hidden column as either end of the drop", () => {
    // A hidden column has no header on screen, so it can be neither dragged
    // nor aimed at.
    expect(isValidDropTarget(withHidden(), "d2", "d3")).toBe(false);
    expect(isValidDropTarget(withHidden(), "d1", "d2")).toBe(false);
  });
});

describe("moveWithinGroup", () => {
  it("moves a column to the target's position inside its group", () => {
    expect(idsOf(moveWithinGroup(cols(), "d1", "d3")!)).toEqual([
      "d2",
      "d3",
      "d1",
      "i1",
      "i2",
    ]);
  });

  it("moves leftward as well as rightward", () => {
    expect(idsOf(moveWithinGroup(cols(), "d3", "d1")!)).toEqual([
      "d3",
      "d1",
      "d2",
      "i1",
      "i2",
    ]);
  });

  it("returns null for a cross-group move rather than clamping it", () => {
    expect(moveWithinGroup(cols(), "d1", "i2")).toBeNull();
  });

  it("carries hidden columns along without reordering them", () => {
    // AC item 4. Moving d1 onto d4 must not disturb where hidden d2 sits
    // relative to its visible neighbours, or re-showing d2 would surprise.
    const out = moveWithinGroup(withHidden(), "d1", "d4")!;
    expect(idsOf(out)).toEqual(["d2", "d3", "d4", "d1"]);
  });

  it("keeps every group contiguous", () => {
    for (const [from, to] of [
      ["d1", "d3"],
      ["d3", "d1"],
      ["d2", "d3"],
      ["i1", "i2"],
    ] as const) {
      const out = moveWithinGroup(cols(), from, to);
      expect(groupRunsAreContiguous(out!)).toBe(true);
    }
  });

  it("preserves the exact set of ids and their group membership", () => {
    const before = cols();
    const out = moveWithinGroup(before, "d1", "d3")!;
    expect([...idsOf(out)].sort()).toEqual([...idsOf(before)].sort());
    for (const col of out) {
      expect(col.group).toBe(before.find((b) => b.id === col.id)!.group);
    }
  });

  it("does not mutate its input", () => {
    const before = cols();
    const snapshot = idsOf(before);
    moveWithinGroup(before, "d1", "d3");
    expect(idsOf(before)).toEqual(snapshot);
  });
});

describe("stepWithinGroup", () => {
  it("moves one slot toward the requested side", () => {
    expect(idsOf(stepWithinGroup(cols(), "d1", "right")!)).toEqual([
      "d2",
      "d1",
      "d3",
      "i1",
      "i2",
    ]);
    expect(idsOf(stepWithinGroup(cols(), "d3", "left")!)).toEqual([
      "d1",
      "d3",
      "d2",
      "i1",
      "i2",
    ]);
  });

  it("is a no-op at the visible edge of its own group, NOT a move into the next group", () => {
    // AC4 item 15.
    expect(stepWithinGroup(cols(), "d3", "right")).toBeNull();
    expect(stepWithinGroup(cols(), "d1", "left")).toBeNull();
  });

  it("SPLICES past the nearest visible neighbour, skipping hidden columns", () => {
    // Asserted as an exact array. A weaker assertion (d1's index merely being
    // greater than d3's) cannot separate a correct splice from an exchange or
    // from a move-to-end of the group - all three satisfy it. The rule copied
    // here is moveColumnInOrder, courses-table-helpers.ts:266-290, which is
    // unambiguously splice-then-insert.
    expect(idsOf(stepWithinGroup(withHidden(), "d1", "right")!)).toEqual([
      "d2",
      "d3",
      "d1",
      "d4",
    ]);
  });

  it("steps back to where it came from", () => {
    // Round trip pins the splice further: right then left must restore the
    // original order exactly, which an exchange implementation also satisfies
    // but a move-to-end one does not.
    const once = stepWithinGroup(withHidden(), "d1", "right")!;
    expect(idsOf(stepWithinGroup(once, "d1", "left")!)).toEqual([
      "d1",
      "d2",
      "d3",
      "d4",
    ]);
  });

  it("returns null when the column itself is hidden", () => {
    expect(stepWithinGroup(withHidden(), "d2", "right")).toBeNull();
  });

  it("is a no-op when the group has only one visible column", () => {
    const lonely: ReorderableColumn[] = [
      { id: "d1", group: "dependent", visible: true },
      { id: "i1", group: "independent", visible: true },
    ];
    expect(stepWithinGroup(lonely, "d1", "right")).toBeNull();
    expect(stepWithinGroup(lonely, "d1", "left")).toBeNull();
  });
});

describe("moveToGroupEdge", () => {
  // AC3 item 11: the column menu offers Move to start / Move to end of group,
  // which is the WCAG 2.5.7 single-pointer route.
  it("moves a column to the start of its own group", () => {
    expect(idsOf(moveToGroupEdge(cols(), "d3", "start")!)).toEqual([
      "d3",
      "d1",
      "d2",
      "i1",
      "i2",
    ]);
  });

  it("moves a column to the end of its own group, never past it", () => {
    expect(idsOf(moveToGroupEdge(cols(), "d1", "end")!)).toEqual([
      "d2",
      "d3",
      "d1",
      "i1",
      "i2",
    ]);
  });

  it("is a no-op when the column is already at that visible edge", () => {
    expect(moveToGroupEdge(cols(), "d1", "start")).toBeNull();
    expect(moveToGroupEdge(cols(), "d3", "end")).toBeNull();
  });

  it("keeps groups contiguous", () => {
    expect(groupRunsAreContiguous(moveToGroupEdge(cols(), "i2", "start")!)).toBe(true);
  });
});

describe("groupPositionAssignments", () => {
  // NOTE: this returns SORT-KEY ASSIGNMENTS, not the wire payload. A
  // TaskCatalogOverride is eight fields (course-tasks-view.ts:89-101), and
  // upsertCourseTaskDef writes every column on conflict, so persisting a bare
  // {taskId, position} would blank a task's label, cadence and retired flag.
  // The caller must merge each assignment onto the task's existing override -
  // the baseOverrideFor step ManageTasksDialog.tsx:209 already performs -
  // before handing the array to the bulk write.
  it("returns sequential positions from zero for that group only", () => {
    expect(groupPositionAssignments(cols(), "dependent")).toEqual([
      { taskId: "d1", position: 0 },
      { taskId: "d2", position: 1 },
      { taskId: "d3", position: 2 },
    ]);
  });

  it("numbers hidden columns too, so hiding never reshuffles stored order", () => {
    expect(groupPositionAssignments(withHidden(), "dependent")).toEqual([
      { taskId: "d1", position: 0 },
      { taskId: "d2", position: 1 },
      { taskId: "d3", position: 2 },
      { taskId: "d4", position: 3 },
    ]);
  });

  it("assigns a position to EVERY task in the group, leaving none null", () => {
    // A task the renumbering skips keeps position null, which
    // resolveTaskCatalog reads as POSITIVE_INFINITY and sorts to the end of the
    // group (course-tasks-view.ts:191).
    const assigned = groupPositionAssignments(withHidden(), "dependent");
    expect(assigned.map((a) => a.taskId).sort()).toEqual(["d1", "d2", "d3", "d4"]);
    expect(assigned.every((a) => typeof a.position === "number")).toBe(true);
  });

  it("returns an empty array for a group with no columns", () => {
    expect(groupPositionAssignments(cols(), "daily")).toEqual([]);
  });
});

describe("positionWithinGroup", () => {
  it("reports a one-based index and the group's visible total", () => {
    expect(positionWithinGroup(cols(), "d2")).toEqual({ index: 2, total: 3 });
    expect(positionWithinGroup(cols(), "i2")).toEqual({ index: 2, total: 2 });
  });

  it("counts only VISIBLE columns, since that is what the user can perceive", () => {
    expect(positionWithinGroup(withHidden(), "d3")).toEqual({ index: 2, total: 3 });
  });

  it("returns null for a hidden column, which has no perceivable position", () => {
    expect(positionWithinGroup(withHidden(), "d2")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(positionWithinGroup(cols(), "nope")).toBeNull();
  });
});

describe("round trip through resolveTaskCatalog", () => {
  // AC1 item 5 and AC8 item 39. This is the test that proves a reorder actually
  // SURVIVES, rather than proving the pure helper rearranges an array. Nothing
  // else in this file would notice if the renumbering skipped hidden tasks.
  const view = "term" as const;

  const baseOverride = (taskId: string, position: number): TaskCatalogOverride => ({
    taskId,
    view,
    group: "dependent",
    label: null,
    cadence: null,
    position,
    retired: false,
    custom: false,
  });

  /** The resolved dependent-group order with no overrides applied. */
  function dependentOrder(overrides: TaskCatalogOverride[]): string[] {
    return resolveTaskCatalog(BUILT_IN_TASKS, overrides, view)
      .filter((t) => t.group === "dependent")
      .map((t) => t.id);
  }

  it("a reorder persisted as positions resolves back to the same order", () => {
    const original = dependentOrder([]);
    expect(original.length).toBeGreaterThan(3);

    const columns: ReorderableColumn[] = original.map((id) => ({
      id,
      group: "dependent",
      visible: true,
    }));

    const moved = moveWithinGroup(columns, original[0], original[2])!;
    const expected = idsOf(moved);

    const overrides = groupPositionAssignments(moved, "dependent").map((a) =>
      baseOverride(a.taskId, a.position)
    );

    expect(dependentOrder(overrides)).toEqual(expected);
    expect(expected).not.toEqual(original);
  });

  it("a HIDDEN column keeps its slot instead of sinking to the end of the group", () => {
    // The defect this guards: TasksGrid is handed only visible tasks, so a
    // reorder module fed from there never renumbers hidden ones. They keep
    // position null, sort at POSITIVE_INFINITY, and silently pile up at the end
    // of the group the next time the catalog resolves.
    const original = dependentOrder([]);
    const hiddenId = original[1];

    const columns: ReorderableColumn[] = original.map((id) => ({
      id,
      group: "dependent",
      visible: id !== hiddenId,
    }));

    const overrides = groupPositionAssignments(columns, "dependent").map((a) =>
      baseOverride(a.taskId, a.position)
    );

    // Re-showing the column must find it exactly where it was, at index 1.
    expect(dependentOrder(overrides).indexOf(hiddenId)).toBe(1);
  });

  it("reordering the term view leaves the recurring view untouched", () => {
    // AC8 item 40.
    const before = resolveTaskCatalog(BUILT_IN_TASKS, [], "recurring").map((t) => t.id);

    const original = dependentOrder([]);
    const columns: ReorderableColumn[] = original.map((id) => ({
      id,
      group: "dependent",
      visible: true,
    }));
    const overrides = groupPositionAssignments(
      moveWithinGroup(columns, original[0], original[2])!,
      "dependent"
    ).map((a) => baseOverride(a.taskId, a.position));

    expect(resolveTaskCatalog(BUILT_IN_TASKS, overrides, "recurring").map((t) => t.id)).toEqual(
      before
    );
  });
});
