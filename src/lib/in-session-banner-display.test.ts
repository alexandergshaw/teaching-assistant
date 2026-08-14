import { describe, it, expect } from "vitest";
import { resolveFocusedCourse } from "./in-session-banner-display";

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
