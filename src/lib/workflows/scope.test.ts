import { describe, it, expect } from "vitest";
import { isScopeableListType, expandScopedValue, ALL_SCOPE } from "./scope";
import { outputFeedsInput } from "./types";

describe("isScopeableListType", () => {
  it("recognizes the scopeable list types", () => {
    expect(isScopeableListType("hubCourseList")).toBe(true);
    expect(isScopeableListType("lmsCourseList")).toBe(true);
    expect(isScopeableListType("orgList")).toBe(true);
  });

  it("rejects single-item and unrelated types", () => {
    expect(isScopeableListType("hubCourse")).toBe(false);
    expect(isScopeableListType("lmsCourse")).toBe(false);
    expect(isScopeableListType("org")).toBe(false);
    expect(isScopeableListType("text")).toBe(false);
  });

  it("rejects lookahead (scalar, not a list type)", () => {
    expect(isScopeableListType("lookahead")).toBe(false);
  });
});

describe("expandScopedValue", () => {
  const ctx = { activeInstitution: null };

  it("returns a concrete list value unchanged (no network)", async () => {
    expect(await expandScopedValue("hubCourseList", "a\nb", ctx)).toBe("a\nb");
    expect(await expandScopedValue("hubCourseList", "", ctx)).toBe("");
  });

  it("returns a non-scopeable type's value unchanged, even '*'", async () => {
    expect(await expandScopedValue("text", ALL_SCOPE, ctx)).toBe(ALL_SCOPE);
    expect(await expandScopedValue("hubCourse", ALL_SCOPE, ctx)).toBe(ALL_SCOPE);
  });

  it("returns a lookahead value unchanged (scalar, not expanded)", async () => {
    expect(await expandScopedValue("lookahead", "14", ctx)).toBe("14");
    expect(await expandScopedValue("lookahead", "7", ctx)).toBe("7");
    expect(await expandScopedValue("lookahead", "", ctx)).toBe("");
  });

  it("expands lmsCourseList '*' to empty when no institution is active (no network)", async () => {
    expect(await expandScopedValue("lmsCourseList", ALL_SCOPE, { activeInstitution: "" })).toBe("");
    expect(await expandScopedValue("lmsCourseList", ALL_SCOPE, { activeInstitution: null })).toBe("");
  });
});

describe("outputFeedsInput", () => {
  it("allows exact type matches", () => {
    expect(outputFeedsInput("hubCourse", "hubCourse")).toBe(true);
    expect(outputFeedsInput("hubCourseList", "hubCourseList")).toBe(true);
    expect(outputFeedsInput("text", "text")).toBe(true);
    expect(outputFeedsInput("lookahead", "lookahead")).toBe(true);
  });

  it("allows a single-item output to feed its scopeable list input", () => {
    expect(outputFeedsInput("hubCourse", "hubCourseList")).toBe(true);
    expect(outputFeedsInput("lmsCourse", "lmsCourseList")).toBe(true);
    expect(outputFeedsInput("org", "orgList")).toBe(true);
  });

  it("does NOT let a list output feed a single input", () => {
    expect(outputFeedsInput("hubCourseList", "hubCourse")).toBe(false);
    expect(outputFeedsInput("orgList", "org")).toBe(false);
  });

  it("does not cross unrelated types", () => {
    expect(outputFeedsInput("hubCourse", "lmsCourseList")).toBe(false);
    expect(outputFeedsInput("text", "number")).toBe(false);
  });

  it("does NOT let number feed lookahead (exact-match only)", () => {
    expect(outputFeedsInput("number", "lookahead")).toBe(false);
  });
});
