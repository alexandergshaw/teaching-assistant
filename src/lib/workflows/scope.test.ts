import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listCoursesAction: vi.fn(),
  listMyOrgsAction: vi.fn(),
}));

import { isScopeableListType, expandScopedValue, ALL_SCOPE } from "./scope";
import { outputFeedsInput } from "./types";
import { listCourseHubAction } from "@/app/actions";

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

describe("expandScopedValue hubCourseList institution scoping", () => {
  // Tiles across two institutions plus one with no institution assigned.
  const tiles = [
    { id: "t-mcc", institution: "MCC" },
    { id: "t-mu", institution: "MU" },
    { id: "t-none", institution: null },
  ];

  beforeEach(() => {
    vi.mocked(listCourseHubAction).mockReset();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: tiles } as never);
  });

  it("expands '*' to only the run institution's tiles (a per-institution run must not process another institution's courses)", async () => {
    expect(await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: "MCC" })).toBe("t-mcc");
    expect(await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: "MU" })).toBe("t-mu");
  });

  it("matches the institution acronym case-insensitively", async () => {
    expect(await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: "mcc" })).toBe("t-mcc");
    expect(await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: " mu " })).toBe("t-mu");
  });

  it("expands '*' to every tile (including unassigned) when no institution is in effect", async () => {
    expect(await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: null })).toBe(
      "t-mcc\nt-mu\nt-none"
    );
    expect(await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: "" })).toBe(
      "t-mcc\nt-mu\nt-none"
    );
  });

  it("excludes tiles with no institution from an institution-pinned run", async () => {
    const expanded = await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: "MCC" });
    expect(expanded.split("\n")).not.toContain("t-none");
  });

  it("filters identically with the vestigial filterHubByInstitution flag set", async () => {
    expect(
      await expandScopedValue("hubCourseList", ALL_SCOPE, {
        activeInstitution: "mcc",
        filterHubByInstitution: true,
      })
    ).toBe("t-mcc");
  });

  it("returns empty on enumeration error rather than mis-treating '*' as an id", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "boom" } as never);
    expect(await expandScopedValue("hubCourseList", ALL_SCOPE, { activeInstitution: "MCC" })).toBe("");
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

  it("allows longtext output to feed a concepts input", () => {
    expect(outputFeedsInput("longtext", "concepts")).toBe(true);
  });

  it("does not allow the reverse (concepts output to longtext input)", () => {
    expect(outputFeedsInput("concepts", "longtext")).toBe(false);
  });
});
