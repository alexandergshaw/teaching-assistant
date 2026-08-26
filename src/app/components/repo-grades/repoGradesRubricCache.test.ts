// Tests for repoGradesRubricCache.ts (docs/repo-grades-rubric-picker-
// acceptance-criteria.md item 10, extracted per item 54 specifically so the
// cross-column-leak bug is unit-testable). No localStorage stub is needed -
// this module is pure and takes its store as a plain argument.
import { describe, expect, it } from "vitest";
import {
  createRepoGradeRubricCacheStore,
  dropRepoGradeRubricCacheForOtherCourses,
  failedRubricLookup,
  readRepoGradeRubricCacheEntry,
  repoGradeRubricCacheKey,
  resolvedRubric,
  writeRepoGradeRubricCacheEntry,
} from "./repoGradesRubricCache";

describe("repoGradeRubricCacheKey", () => {
  it("gives two different courses with the SAME assignment id different keys", () => {
    const keyA = repoGradeRubricCacheKey("course-1", "9001");
    const keyB = repoGradeRubricCacheKey("course-2", "9001");
    expect(keyA).not.toBe(keyB);
  });

  it("gives two different assignment ids under the SAME course different keys", () => {
    const keyA = repoGradeRubricCacheKey("course-1", "9001");
    const keyB = repoGradeRubricCacheKey("course-1", "9002");
    expect(keyA).not.toBe(keyB);
  });

  it("does not collide across a courseId/assignmentId boundary under naive concatenation (canary for the exact bug the tuple encoding prevents)", () => {
    // "1" + "23" and "12" + "3" would both naively concatenate to "123" - if
    // repoGradeRubricCacheKey ever regressed to bare concatenation this
    // assertion would start failing, proving it can fail.
    const keyA = repoGradeRubricCacheKey("1", "23");
    const keyB = repoGradeRubricCacheKey("12", "3");
    expect(keyA).not.toBe(keyB);
  });

  it("is pure: the same input always produces the same output", () => {
    expect(repoGradeRubricCacheKey("course-1", "9001")).toBe(repoGradeRubricCacheKey("course-1", "9001"));
  });

  it("is pure: calling it does not mutate anything observable across calls", () => {
    const before = repoGradeRubricCacheKey("course-1", "9001");
    repoGradeRubricCacheKey("course-2", "9002");
    repoGradeRubricCacheKey("course-3", "9003");
    const after = repoGradeRubricCacheKey("course-1", "9001");
    expect(after).toBe(before);
  });
});

describe("readRepoGradeRubricCacheEntry / writeRepoGradeRubricCacheEntry", () => {
  it("returns undefined (not-resolved) for a column never written", () => {
    const store = createRepoGradeRubricCacheStore();
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9001")).toBeUndefined();
  });

  it("distinguishes not-resolved from resolved-to-empty (an assignment with no attached rubric is a real, legitimate outcome)", () => {
    const store = createRepoGradeRubricCacheStore();
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9001")).toBeUndefined();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric(""));
    const entry = readRepoGradeRubricCacheEntry(store, "course-1", "9001");
    expect(entry).not.toBeUndefined();
    expect(entry).toEqual({ status: "resolved", rubricText: "" });
  });

  it("distinguishes resolved-to-empty from resolved-failed", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric(""));
    writeRepoGradeRubricCacheEntry(store, "course-1", "9002", failedRubricLookup("network timeout"));
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9001")).toEqual({ status: "resolved", rubricText: "" });
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9002")).toEqual({ status: "failed", reason: "network timeout" });
  });

  it("stores a non-empty resolved rubric verbatim", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric("5 pts: has a README"));
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9001")).toEqual({
      status: "resolved",
      rubricText: "5 pts: has a README",
    });
  });

  it("never leaks one column's resolution to a different assignment id under the same course", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric("column A's rubric"));
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9002")).toBeUndefined();
  });

  it("never leaks one course's resolution to a different course under the same assignment id", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric("course 1's rubric"));
    expect(readRepoGradeRubricCacheEntry(store, "course-2", "9001")).toBeUndefined();
  });

  it("a later write for the same course+assignment overwrites the earlier entry", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", failedRubricLookup("first attempt failed"));
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric("resolved on retry"));
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9001")).toEqual({
      status: "resolved",
      rubricText: "resolved on retry",
    });
  });
});

describe("dropRepoGradeRubricCacheForOtherCourses", () => {
  it("removes every entry for a course other than the current one", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric("stale"));
    writeRepoGradeRubricCacheEntry(store, "course-1", "9002", failedRubricLookup("stale failure"));
    dropRepoGradeRubricCacheForOtherCourses(store, "course-2");
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9001")).toBeUndefined();
    expect(readRepoGradeRubricCacheEntry(store, "course-1", "9002")).toBeUndefined();
  });

  it("leaves the current course's entries untouched (removes exactly the right entries, nothing more)", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric("old course"));
    writeRepoGradeRubricCacheEntry(store, "course-2", "9001", resolvedRubric("current course, same assignment id"));
    dropRepoGradeRubricCacheForOtherCourses(store, "course-2");
    expect(readRepoGradeRubricCacheEntry(store, "course-2", "9001")).toEqual({
      status: "resolved",
      rubricText: "current course, same assignment id",
    });
  });

  it("leaves nothing behind: the store's size reflects only the current course's entries after the drop", () => {
    const store = createRepoGradeRubricCacheStore();
    writeRepoGradeRubricCacheEntry(store, "course-1", "9001", resolvedRubric("a"));
    writeRepoGradeRubricCacheEntry(store, "course-1", "9002", resolvedRubric("b"));
    writeRepoGradeRubricCacheEntry(store, "course-3", "9003", resolvedRubric("c"));
    dropRepoGradeRubricCacheForOtherCourses(store, "course-2");
    expect(store.size).toBe(0);
  });

  it("is a no-op (not a crash) on an already-empty store", () => {
    const store = createRepoGradeRubricCacheStore();
    expect(() => dropRepoGradeRubricCacheForOtherCourses(store, "course-1")).not.toThrow();
    expect(store.size).toBe(0);
  });
});
