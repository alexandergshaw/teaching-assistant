// Coverage for the Tasks grid's pure column-model builders (AC15 item 85,
// B1/WCAG 2.1.1/2.4.3, AC-A item 251) - pulled out of TasksGrid.tsx into
// gridColumnModel.ts purely for line budget (see that file's header
// comment), not because of a behavior change; this suite pins the existing
// contract the extraction must not disturb.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TaskDefinition, TaskGroupId } from "@/lib/course-tasks";
import {
  buildGridColumns,
  buildColumnGroupIds,
  buildColIndexByTaskId,
  buildColIndexByGroupId,
} from "./gridColumnModel";

function task(id: string, group: TaskGroupId): TaskDefinition {
  return { id, label: id, view: "term", group, cadence: "once", builtIn: true };
}

const GROUPS = [
  { id: "dependent" as TaskGroupId, label: "Dependent" },
  { id: "independent" as TaskGroupId, label: "Independent" },
];

const TASKS: TaskDefinition[] = [task("d1", "dependent"), task("d2", "dependent"), task("i1", "independent")];

describe("buildGridColumns", () => {
  it("emits one task column per visible task, in group order", () => {
    const columns = buildGridColumns(GROUPS, TASKS, new Set());
    expect(columns).toEqual([
      { kind: "task", task: TASKS[0] },
      { kind: "task", task: TASKS[1] },
      { kind: "task", task: TASKS[2] },
    ]);
  });

  it("collapses a group into a single rollup column carrying its tasks", () => {
    const columns = buildGridColumns(GROUPS, TASKS, new Set(["dependent"]));
    expect(columns).toEqual([
      { kind: "rollup", groupId: "dependent", label: "Dependent", tasks: [TASKS[0], TASKS[1]] },
      { kind: "task", task: TASKS[2] },
    ]);
  });

  it("contributes nothing for a group with zero visible tasks (AC7 item 37)", () => {
    const columns = buildGridColumns(GROUPS, [task("i1", "independent")], new Set());
    expect(columns).toEqual([{ kind: "task", task: TASKS[2] }]);
  });

  it("does not mutate its inputs", () => {
    const groups = [...GROUPS];
    const tasks = [...TASKS];
    buildGridColumns(groups, tasks, new Set(["dependent"]));
    expect(groups).toEqual(GROUPS);
    expect(tasks).toEqual(TASKS);
  });
});

describe("buildColumnGroupIds", () => {
  it("returns each column's group id, in column order", () => {
    const columns = buildGridColumns(GROUPS, TASKS, new Set());
    expect(buildColumnGroupIds(columns)).toEqual(["dependent", "dependent", "independent"]);
  });

  it("reports a rollup's OWN group id, not a task's", () => {
    const columns = buildGridColumns(GROUPS, TASKS, new Set(["dependent"]));
    expect(buildColumnGroupIds(columns)).toEqual(["dependent", "independent"]);
  });
});

describe("buildColIndexByTaskId / buildColIndexByGroupId", () => {
  it("indexes task columns starting at 2 (past the two frozen columns)", () => {
    const columns = buildGridColumns(GROUPS, TASKS, new Set());
    const byTaskId = buildColIndexByTaskId(columns);
    expect(byTaskId.get("d1")).toBe(2);
    expect(byTaskId.get("d2")).toBe(3);
    expect(byTaskId.get("i1")).toBe(4);
    expect(buildColIndexByGroupId(columns).size).toBe(0);
  });

  it("indexes a collapsed group's rollup column, and omits it from the task map", () => {
    const columns = buildGridColumns(GROUPS, TASKS, new Set(["dependent"]));
    const byTaskId = buildColIndexByTaskId(columns);
    const byGroupId = buildColIndexByGroupId(columns);
    expect(byTaskId.has("d1")).toBe(false);
    expect(byTaskId.has("d2")).toBe(false);
    expect(byTaskId.get("i1")).toBe(3);
    expect(byGroupId.get("dependent")).toBe(2);
  });
});

describe("gridColumnModel module", () => {
  // Unlike gridFocus.ts/gridNavigation.ts, this module DOES reference
  // TaskGridRow.tsx - but only for the `GridColumn` TYPE (erased at compile
  // time), never a value, so it still never drags MUI/React/a CSS module
  // into its own runtime graph. See the header comment for why.
  it("imports GridColumn as a type only, never a value, from TaskGridRow", () => {
    const source = readFileSync(new URL("./gridColumnModel.ts", import.meta.url), "utf8");
    expect(source).toMatch(/import type \{ GridColumn \} from ["']\.\/TaskGridRow["']/);
    // groupIdOf's logic is inlined (see buildColumnGroupIds), never called
    // or imported as a runtime value from TaskGridRow.tsx.
    expect(source).not.toMatch(/groupIdOf\(/);
    expect(source).not.toMatch(/import\s*\{[^}]*\bgroupIdOf\b[^}]*\}\s*from/);
  });

  it("never imports MUI or a CSS module", () => {
    const source = readFileSync(new URL("./gridColumnModel.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'](@mui|[^"']*\.module\.css)/);
  });
});
