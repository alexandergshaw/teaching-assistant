import { describe, it, expect } from "vitest";
import {
  validateTaskTitle,
  groupTasksByCollege,
  filterTasks,
  type OneOffTask,
} from "./one-off-task-model";

function makeTask(overrides: Partial<OneOffTask> & { id: string }): OneOffTask {
  return {
    title: "t",
    college: null,
    done: false,
    notes: "",
    dueDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateTaskTitle", () => {
  it("rejects empty and whitespace-only titles as blank", () => {
    expect(validateTaskTitle("")).toEqual({ ok: false, reason: "blank" });
    expect(validateTaskTitle("   ")).toEqual({ ok: false, reason: "blank" });
  });

  it("trims and keeps case", () => {
    expect(validateTaskTitle("  Grade lab  ")).toEqual({ ok: true, title: "Grade lab" });
  });

  it("rejects a title one over the cap", () => {
    const r = validateTaskTitle("x".repeat(201));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too-long");
  });

  it("accepts a title exactly at the cap", () => {
    expect(validateTaskTitle("x".repeat(200)).ok).toBe(true);
  });
});

describe("groupTasksByCollege", () => {
  const tasks = [
    makeTask({ id: "1", college: "MPCC" }),
    makeTask({ id: "2", college: null }),
    makeTask({ id: "3", college: "MCC" }),
    makeTask({ id: "4", college: "OLD" }),
  ];

  it("orders registry first, then Unassigned, then orphans", () => {
    const groups = groupTasksByCollege(tasks, ["MCC", "MPCC"]);
    expect(groups.map((g) => g.college)).toEqual(["MCC", "MPCC", null, "OLD"]);
  });

  it("puts each task in its own bucket", () => {
    const groups = groupTasksByCollege(tasks, ["MCC", "MPCC"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["3"]);
    expect(groups[2].tasks.map((t) => t.id)).toEqual(["2"]);
    expect(groups[3].tasks.map((t) => t.id)).toEqual(["4"]);
  });

  it("keeps a de-registered college's task visible", () => {
    const groups = groupTasksByCollege(tasks, ["MCC", "MPCC"]);
    const old = groups.find((g) => g.college === "OLD");
    expect(old).toBeDefined();
    expect(old?.tasks.map((t) => t.id)).toEqual(["4"]);
  });

  it("keeps a registered institution with no tasks as an empty group", () => {
    const groups = groupTasksByCollege([makeTask({ id: "1", college: "MCC" })], ["MCC", "MPCC"]);
    const empty = groups.find((g) => g.college === "MPCC");
    expect(empty).toBeDefined();
    expect(empty?.tasks).toEqual([]);
  });

  it("omits Unassigned when no task lacks a college", () => {
    const groups = groupTasksByCollege([makeTask({ id: "1", college: "MCC" })], ["MCC"]);
    expect(groups.map((g) => g.college)).toEqual(["MCC"]);
  });
});

describe("filterTasks", () => {
  const ts = [
    makeTask({ id: "a", college: "MCC", done: false }),
    makeTask({ id: "b", college: "MCC", done: true }),
    makeTask({ id: "c", college: null, done: false }),
  ];

  it("filters by a named college", () => {
    expect(filterTasks(ts, { college: "MCC" }).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("treats college null as Unassigned, not as all", () => {
    expect(filterTasks(ts, { college: null }).map((t) => t.id)).toEqual(["c"]);
  });

  it("filters by status", () => {
    expect(filterTasks(ts, { status: "open" }).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filterTasks(ts, { status: "done" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("ANDs the college and status filters", () => {
    expect(filterTasks(ts, { college: "MCC", status: "done" }).map((t) => t.id)).toEqual(["b"]);
  });
});
