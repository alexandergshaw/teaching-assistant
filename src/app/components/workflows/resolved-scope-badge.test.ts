import { describe, it, expect } from "vitest";
import { describeWorkflowScopeWithCounts } from "./resolved-scope-badge";

describe("describeWorkflowScopeWithCounts", () => {
  it("returns '' unchanged when the scope is empty", () => {
    expect(describeWorkflowScopeWithCounts(undefined, {})).toBe("");
    expect(describeWorkflowScopeWithCounts({}, {})).toBe("");
  });

  it("appends the resolved count onto 'all Canvas courses'", () => {
    expect(
      describeWorkflowScopeWithCounts({ lmsCourse: "*" }, { lmsCourseCount: 23 })
    ).toBe("all Canvas courses (23)");
  });

  it("appends the resolved count onto 'all course tiles'", () => {
    expect(
      describeWorkflowScopeWithCounts({ hubCourse: "*" }, { hubCourseCount: 5 })
    ).toBe("all course tiles (5)");
  });

  it("appends the resolved count onto 'all institutions'", () => {
    expect(
      describeWorkflowScopeWithCounts({ institution: "*" }, { institutionCount: 4 })
    ).toBe("all institutions (4)");
  });

  it("leaves the phrase unresolved when the count is not yet known", () => {
    expect(describeWorkflowScopeWithCounts({ lmsCourse: "*" }, {})).toBe("all Canvas courses");
    expect(
      describeWorkflowScopeWithCounts({ lmsCourse: "*" }, { lmsCourseCount: null })
    ).toBe("all Canvas courses");
  });

  it("never touches a concrete (non-'*') scope value", () => {
    expect(
      describeWorkflowScopeWithCounts({ lmsCourse: "https://a\nhttps://b" }, { lmsCourseCount: 99 })
    ).toBe("2 Canvas course(s)");
  });

  it("resolves multiple '*' families in the same scope independently", () => {
    expect(
      describeWorkflowScopeWithCounts(
        { institution: "*", lmsCourse: "*" },
        { institutionCount: 4, lmsCourseCount: 23 }
      )
    ).toBe("all institutions (4), all Canvas courses (23)");
  });
});
