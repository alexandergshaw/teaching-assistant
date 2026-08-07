import { describe, it, expect } from "vitest";
import { mergeStatusMap, mapCourseTaskRow, mapCourseTaskDefRow } from "./course-tasks";
import type { Database } from "./types";

describe("mergeStatusMap", () => {
  it("adds a new key onto an existing map", () => {
    const result = mergeStatusMap({ a: "open" }, { b: "done" });
    expect(result).toEqual({ a: "open", b: "done" });
  });

  it("replaces an existing key's value", () => {
    const result = mergeStatusMap({ a: "open" }, { a: "done" });
    expect(result).toEqual({ a: "done" });
  });

  it("deletes a key when the patch value is null", () => {
    const result = mergeStatusMap({ a: "open", b: "done" }, { a: null });
    expect(result).toEqual({ b: "done" });
  });

  it("mixes set and delete across several keys in one patch", () => {
    const current = { a: "open", b: "done", c: "blocked" };
    const result = mergeStatusMap(current, { a: "done", b: null, d: "na" });
    expect(result).toEqual({ a: "done", c: "blocked", d: "na" });
  });

  it("leaves keys not named in the patch untouched", () => {
    const current = { a: "open", b: "done", c: "blocked" };
    const result = mergeStatusMap(current, { a: "done" });
    expect(result.b).toBe("done");
    expect(result.c).toBe("blocked");
  });

  it("treats a null current as an empty map", () => {
    expect(mergeStatusMap(null, { a: "open" })).toEqual({ a: "open" });
  });

  it("treats an undefined current as an empty map", () => {
    expect(mergeStatusMap(undefined, { a: "open" })).toEqual({ a: "open" });
  });

  it("treats an array current as an empty map", () => {
    expect(mergeStatusMap(["not", "a", "map"], { a: "open" })).toEqual({ a: "open" });
  });

  it("treats a string current as an empty map", () => {
    expect(mergeStatusMap("not-a-map", { a: "open" })).toEqual({ a: "open" });
  });

  it("treats a number current as an empty map", () => {
    expect(mergeStatusMap(42, { a: "open" })).toEqual({ a: "open" });
  });

  it("returns an equal copy of the coerced current map for an empty patch", () => {
    const current = { a: "open", b: "done" };
    const result = mergeStatusMap(current, {});
    expect(result).toEqual(current);
    expect(result).not.toBe(current);
  });

  it("no-ops (without throwing) when deleting a key that is not present", () => {
    const current = { a: "open" };
    const result = mergeStatusMap(current, { missing: null });
    expect(result).toEqual({ a: "open" });
  });

  it("does not mutate the current argument", () => {
    const current = { a: "open" };
    const currentCopy = { ...current };
    mergeStatusMap(current, { a: "done", b: "na" });
    expect(current).toEqual(currentCopy);
  });

  it("does not mutate the patch argument", () => {
    const patch = { a: "done", b: null as string | null };
    const patchCopy = { ...patch };
    mergeStatusMap({ a: "open" }, patch);
    expect(patch).toEqual(patchCopy);
  });

  it("ignores a patch value of undefined, leaving the existing value in place", () => {
    // Documented decision: `undefined` is IGNORED, not treated as a delete.
    // Only an explicit `null` deletes a key. This mirrors JSON.stringify's
    // own handling of undefined properties (they vanish rather than
    // serializing as `null`), so a patch that arrives over the wire could
    // never actually carry an explicit `undefined` in the first place.
    const result = mergeStatusMap({ a: "open" }, { a: undefined });
    expect(result).toEqual({ a: "open" });
  });

  it("ignores a patch value of undefined for a key not yet present (does not create it)", () => {
    const result = mergeStatusMap({ a: "open" }, { b: undefined });
    expect(result).toEqual({ a: "open" });
    expect("b" in result).toBe(false);
  });
});

describe("mapCourseTaskRow", () => {
  type Row = Database["public"]["Tables"]["course_tasks"]["Row"];

  function row(overrides: Partial<Row> = {}): Row {
    return {
      id: "t1",
      user_id: "u1",
      course_id: "c1",
      statuses: { "task-a": { status: "open" }, "task-b": { status: "done" } },
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      ...overrides,
    };
  }

  it("maps a fully-populated row across the snake_case/camelCase boundary", () => {
    const mapped = mapCourseTaskRow(row());
    expect(mapped).toEqual({
      courseId: "c1",
      statuses: { "task-a": { status: "open" }, "task-b": { status: "done" } },
      updatedAt: "2026-08-02T00:00:00Z",
    });
  });

  it("coerces a non-object statuses value into an empty map instead of throwing", () => {
    const mapped = mapCourseTaskRow(row({ statuses: null as unknown as Row["statuses"] }));
    expect(mapped.statuses).toEqual({});
  });
});

describe("mapCourseTaskDefRow", () => {
  type Row = Database["public"]["Tables"]["course_task_defs"]["Row"];

  function row(overrides: Partial<Row> = {}): Row {
    return {
      id: "d1",
      user_id: "u1",
      task_id: "setup-canvas",
      view_id: "term",
      group_id: "dependent",
      label: "Set up Canvas shell",
      cadence: "once",
      sort_position: 3,
      retired: false,
      custom: false,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      ...overrides,
    };
  }

  it("maps a fully-populated row, including sort_position -> position", () => {
    const mapped = mapCourseTaskDefRow(row());
    expect(mapped).toEqual({
      taskId: "setup-canvas",
      view: "term",
      group: "dependent",
      label: "Set up Canvas shell",
      cadence: "once",
      position: 3,
      retired: false,
      custom: false,
    });
  });

  it("maps a row with every nullable column null", () => {
    const mapped = mapCourseTaskDefRow(
      row({ label: null, cadence: null, sort_position: null })
    );
    expect(mapped.label).toBeNull();
    expect(mapped.cadence).toBeNull();
    expect(mapped.position).toBeNull();
  });

  it("returns retired/custom as real booleans, not truthy/falsy stand-ins", () => {
    const mapped = mapCourseTaskDefRow(row({ retired: true, custom: true }));
    expect(mapped.retired).toBe(true);
    expect(mapped.custom).toBe(true);
    expect(typeof mapped.retired).toBe("boolean");
    expect(typeof mapped.custom).toBe("boolean");
  });
});
