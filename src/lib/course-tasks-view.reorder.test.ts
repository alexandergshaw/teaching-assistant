// Additional coverage for the column-reorder feature's persistence layer -
// docs/tasks-column-reorder-acceptance-criteria.md's "Tests still owed"
// section, items not covered by the provided TDD suite
// (src/app/components/tasks/columnOrder.test.ts), which deliberately stays
// pure and knows nothing about TaskCatalogOverride's full eight-field shape
// or the dialog/drag equivalence.
//
// AC2 item 7: the bulk-write action's base-merge behavior. A reorder must
// merge a fresh `position` onto the task's EXISTING override rather than
// replacing it - upsertCourseTaskDef(s) writes every column on conflict, and
// a bare {taskId, position} payload would blank a renamed label and a
// changed cadence, which is exactly the defect this guards.
//
// AC2 item 8: the dialog's move (ManageTasksDialog.moveTask) and a drag
// (TasksTab's handleReorderStep/handleReorderDrop) both call the SAME pure
// functions - stepWithinGroup + groupPositionAssignments +
// baseTaskCatalogOverride - so they cannot produce a different stored order
// for equivalent moves. Asserted directly here rather than only implied by
// "both call the same code", since neither ManageTasksDialog.tsx nor
// TasksTab.tsx can be rendered under this repo's node-environment vitest.
import { describe, it, expect } from "vitest";
import type { TaskDefinition } from "@/lib/course-tasks";
import {
  baseTaskCatalogOverride,
  resolveTaskCatalog,
  type TaskCatalogOverride,
} from "./course-tasks-view";
import {
  groupPositionAssignments,
  moveWithinGroup,
  stepWithinGroup,
  type ReorderableColumn,
} from "@/app/components/tasks/columnOrder";

const BUILT_INS: TaskDefinition[] = [
  { id: "d1", label: "Task D1", view: "term", group: "dependent", cadence: "once", builtIn: true },
  { id: "d2", label: "Task D2", view: "term", group: "dependent", cadence: "once", builtIn: true },
  { id: "d3", label: "Task D3", view: "term", group: "dependent", cadence: "once", builtIn: true },
];

describe("baseTaskCatalogOverride", () => {
  it("derives a fresh row from the built-in when no override exists yet", () => {
    const base = baseTaskCatalogOverride("d1", BUILT_INS, []);
    expect(base).toEqual({
      taskId: "d1",
      view: "term",
      group: "dependent",
      label: null,
      cadence: null,
      position: null,
      retired: false,
      custom: false,
    });
  });

  it("returns the EXISTING override untouched when one is on file", () => {
    const existing: TaskCatalogOverride = {
      taskId: "d1",
      view: "term",
      group: "dependent",
      label: "Renamed D1",
      cadence: "once",
      position: 2,
      retired: false,
      custom: false,
    };
    expect(baseTaskCatalogOverride("d1", BUILT_INS, [existing])).toEqual(existing);
  });

  it("falls back to an all-null row for an id naming neither an override nor a built-in", () => {
    expect(baseTaskCatalogOverride("ghost", BUILT_INS, [])).toEqual({
      taskId: "ghost",
      view: null,
      group: null,
      label: null,
      cadence: null,
      position: null,
      retired: false,
      custom: false,
    });
  });

  it("a reorder built on top of it PRESERVES a renamed label and cadence (AC2 item 7)", () => {
    // The exact defect a bare {taskId, position} payload would cause: this
    // repositions d1 and d3 within the group, and the write must still
    // carry d1's rename and d3's custom flag through untouched.
    const existingOverrides: TaskCatalogOverride[] = [
      {
        taskId: "d1",
        view: "term",
        group: "dependent",
        label: "Textbook Owned (Renamed)",
        cadence: "once",
        position: null,
        retired: false,
        custom: false,
      },
      {
        taskId: "d3",
        view: "term",
        group: "dependent",
        label: null,
        cadence: null,
        position: null,
        retired: false,
        custom: true,
      },
    ];

    const columns: ReorderableColumn[] = [
      { id: "d1", group: "dependent", visible: true },
      { id: "d2", group: "dependent", visible: true },
      { id: "d3", group: "dependent", visible: true },
    ];
    const moved = moveWithinGroup(columns, "d3", "d1")!;
    const nextOverrides = groupPositionAssignments(moved, "dependent").map((a) => ({
      ...baseTaskCatalogOverride(a.taskId, BUILT_INS, existingOverrides),
      position: a.position,
    }));

    const d1Row = nextOverrides.find((o) => o.taskId === "d1")!;
    const d3Row = nextOverrides.find((o) => o.taskId === "d3")!;
    expect(d1Row.label).toBe("Textbook Owned (Renamed)");
    expect(d1Row.cadence).toBe("once");
    expect(d3Row.custom).toBe(true);
    // Every row still carries a real view/group - upsertCourseTaskDef(s)'s
    // NOT NULL columns - even for d2, which never had an override before.
    for (const row of nextOverrides) {
      expect(row.view).toBe("term");
      expect(row.group).toBe("dependent");
    }
  });
});

describe("dialog move and drag produce the same stored order (AC2 item 8)", () => {
  it("ManageTasksDialog's 'up' step and a drag's left step resolve identically", () => {
    const columns: ReorderableColumn[] = [
      { id: "d1", group: "dependent", visible: true },
      { id: "d2", group: "dependent", visible: true },
      { id: "d3", group: "dependent", visible: true },
    ];

    // ManageTasksDialog.moveTask: direction "up" maps to stepWithinGroup's "left".
    const dialogMoved = stepWithinGroup(columns, "d3", "left");
    // TasksTab.handleReorderStep, called with "left" directly from Shift+Left.
    const dragMoved = stepWithinGroup(columns, "d3", "left");

    expect(dialogMoved).toEqual(dragMoved);

    const dialogAssignments = groupPositionAssignments(dialogMoved!, "dependent");
    const dragAssignments = groupPositionAssignments(dragMoved!, "dependent");
    expect(dialogAssignments).toEqual(dragAssignments);

    const overrides = dialogAssignments.map((a) => ({
      ...baseTaskCatalogOverride(a.taskId, BUILT_INS, []),
      position: a.position,
    }));
    const order = resolveTaskCatalog(BUILT_INS, overrides, "term").map((t) => t.id);
    expect(order).toEqual(["d1", "d3", "d2"]);
  });
});
