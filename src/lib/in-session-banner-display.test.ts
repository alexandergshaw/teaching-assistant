import { describe, it, expect } from "vitest";
import { limitDisplayedCourses, resolveFocusedCourse, MAX_VISIBLE_IN_SESSION_COURSES } from "./in-session-banner-display";

interface Item {
  id: string;
}

function items(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({ id: `c${i}` }));
}

describe("limitDisplayedCourses", () => {
  it("returns every course with zero overflow when the list is under the cap", () => {
    const list = items(3);
    expect(limitDisplayedCourses(list, 6)).toEqual({ visible: list, overflowCount: 0 });
  });

  it("returns every course with zero overflow when the list exactly meets the cap", () => {
    const list = items(6);
    expect(limitDisplayedCourses(list, 6)).toEqual({ visible: list, overflowCount: 0 });
  });

  it("truncates to the cap and reports the remainder once the list exceeds it", () => {
    const list = items(8);
    const result = limitDisplayedCourses(list, 6);
    expect(result.visible).toEqual(list.slice(0, 6));
    expect(result.overflowCount).toBe(2);
  });

  it("preserves the given order rather than resorting", () => {
    const list = [{ id: "z" }, { id: "a" }, { id: "m" }];
    expect(limitDisplayedCourses(list, 2).visible).toEqual([{ id: "z" }, { id: "a" }]);
  });

  it("never mutates the input array", () => {
    const list = items(8);
    const copy = [...list];
    limitDisplayedCourses(list, 6);
    expect(list).toEqual(copy);
  });

  it("defaults to MAX_VISIBLE_IN_SESSION_COURSES when no max is given", () => {
    const list = items(MAX_VISIBLE_IN_SESSION_COURSES + 3);
    const result = limitDisplayedCourses(list);
    expect(result.visible.length).toBe(MAX_VISIBLE_IN_SESSION_COURSES);
    expect(result.overflowCount).toBe(3);
  });

  it("returns an empty visible list with zero overflow for an empty input", () => {
    expect(limitDisplayedCourses([], 6)).toEqual({ visible: [], overflowCount: 0 });
  });

  it("treats a cap of zero as show-none, overflow-all", () => {
    const list = items(4);
    expect(limitDisplayedCourses(list, 0)).toEqual({ visible: [], overflowCount: 4 });
  });

  it("throws on a negative cap", () => {
    expect(() => limitDisplayedCourses(items(2), -1)).toThrow(RangeError);
  });
});

describe("resolveFocusedCourse", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the matching course when the id is present", () => {
    expect(resolveFocusedCourse(list, "b")).toEqual({ id: "b" });
  });

  it("returns null when the id names no course in the list", () => {
    expect(resolveFocusedCourse(list, "does-not-exist")).toBeNull();
  });

  it("returns null when the id is null", () => {
    expect(resolveFocusedCourse(list, null)).toBeNull();
  });

  it("returns null for an empty course list regardless of id", () => {
    expect(resolveFocusedCourse([], "a")).toBeNull();
  });
});
