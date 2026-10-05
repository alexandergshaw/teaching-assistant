import { describe, it, expect } from "vitest";
import { mapOneOffTask } from "./one-off-tasks";
import type { Database } from "./types";

type Row = Database["public"]["Tables"]["one_off_tasks"]["Row"];

function makeRow(): Row {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Grade lab 3",
    college: "MCC",
    done: true,
    notes: "bring rubric",
    due_date: "2026-11-01",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-02T00:00:00.000Z",
  };
}

describe("mapOneOffTask", () => {
  it("renames every column to the camelCase task shape", () => {
    expect(mapOneOffTask(makeRow())).toEqual({
      id: "task-1",
      title: "Grade lab 3",
      college: "MCC",
      done: true,
      notes: "bring rubric",
      dueDate: "2026-11-01",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("does not leak snake_case keys or user_id", () => {
    const mapped = mapOneOffTask(makeRow());
    expect("due_date" in mapped).toBe(false);
    expect("created_at" in mapped).toBe(false);
    expect("user_id" in mapped).toBe(false);
  });

  it("keeps null college and due date as null", () => {
    const mapped = mapOneOffTask({ ...makeRow(), college: null, due_date: null });
    expect(mapped.college).toBeNull();
    expect(mapped.dueDate).toBeNull();
  });

  it("turns null notes into an empty string", () => {
    const row = { ...makeRow(), notes: null } as unknown as Row;
    expect(mapOneOffTask(row).notes).toBe("");
  });
});
