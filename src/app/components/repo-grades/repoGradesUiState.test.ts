// Tests for repoGradesUiState.ts (AC4 items 23-24). vitest.config.ts runs
// with environment: "node", so there is no `window`/`localStorage` global by
// default - this file stubs a minimal in-memory Storage and a `window`
// global before each test and restores the previous globals afterward,
// exactly matching src/app/components/tasks/tasksUiState.test.ts's own
// pattern (see that file's header for why: it confirmed live that
// typeof window/localStorage are both "undefined" under plain Node here).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadRepoGradesUiState,
  loadSelectedRepoIds,
  persistRepoGradesUiState,
  persistSelectedRepoIds,
} from "./repoGradesUiState";
import { DEFAULT_REPO_GRADE_SORT } from "./repoGradesRows";

class FakeStorage {
  private store = new Map<string, string>();
  throwOnSet = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new Error("quota exceeded (simulated)");
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

let fakeStorage: FakeStorage;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  fakeStorage = new FakeStorage();
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
});

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;

  if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

describe("loadRepoGradesUiState / persistRepoGradesUiState", () => {
  it("returns defaults (empty course, empty prefix, repo/asc sort) when nothing is stored", () => {
    expect(loadRepoGradesUiState()).toEqual({ courseId: "", orgPrefix: "", sort: DEFAULT_REPO_GRADE_SORT });
  });

  it("returns defaults when window is undefined (SSR-safe read)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadRepoGradesUiState()).toEqual({ courseId: "", orgPrefix: "", sort: DEFAULT_REPO_GRADE_SORT });
  });

  it("round-trips a full state through persist then load", () => {
    persistRepoGradesUiState({ courseId: "course-1", orgPrefix: "module", sort: { field: "binding", direction: "desc" } });
    expect(loadRepoGradesUiState()).toEqual({
      courseId: "course-1",
      orgPrefix: "module",
      sort: { field: "binding", direction: "desc" },
    });
  });

  it("does nothing when window is undefined (SSR-safe write)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistRepoGradesUiState({ courseId: "x", orgPrefix: "y", sort: DEFAULT_REPO_GRADE_SORT })).not.toThrow();
    expect(fakeStorage.getItem("ta-repo-grades-course")).toBeNull();
  });

  it("swallows a localStorage write failure (quota/private mode) rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistRepoGradesUiState({ courseId: "x", orgPrefix: "y", sort: DEFAULT_REPO_GRADE_SORT })).not.toThrow();
  });

  it("falls back to the default sort for malformed JSON", () => {
    fakeStorage.setItem("ta-repo-grades-sort", "{not json");
    expect(loadRepoGradesUiState().sort).toEqual(DEFAULT_REPO_GRADE_SORT);
  });

  it("falls back to the default sort for a field/direction that no longer exists", () => {
    fakeStorage.setItem("ta-repo-grades-sort", JSON.stringify({ field: "score", direction: "sideways" }));
    expect(loadRepoGradesUiState().sort).toEqual(DEFAULT_REPO_GRADE_SORT);
  });

  it("persists course id, org prefix, and sort under three distinct ta- keys", () => {
    persistRepoGradesUiState({ courseId: "course-9", orgPrefix: "wk", sort: { field: "repo", direction: "desc" } });
    expect(fakeStorage.getItem("ta-repo-grades-course")).toBe("course-9");
    expect(fakeStorage.getItem("ta-repo-grades-org-prefix")).toBe("wk");
    expect(fakeStorage.getItem("ta-repo-grades-sort")).toBe(JSON.stringify({ field: "repo", direction: "desc" }));
  });
});

describe("loadSelectedRepoIds / persistSelectedRepoIds - AC4 item 23", () => {
  it("returns an empty set when nothing is stored", () => {
    expect(loadSelectedRepoIds(["org/a", "org/b"])).toEqual(new Set());
  });

  it("restores a persisted selection that is still valid", () => {
    persistSelectedRepoIds(new Set(["org/a", "org/b"]));
    expect(loadSelectedRepoIds(["org/a", "org/b", "org/c"])).toEqual(new Set(["org/a", "org/b"]));
  });

  it("filters out ids no longer present in validRepoIds (a stale selection never resurrects a removed row)", () => {
    persistSelectedRepoIds(new Set(["org/a", "org/stale-removed"]));
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set(["org/a"]));
  });

  it("drops every id when validRepoIds is empty (e.g. course switched, nothing scanned yet)", () => {
    persistSelectedRepoIds(new Set(["org/a", "org/b"]));
    expect(loadSelectedRepoIds([])).toEqual(new Set());
  });

  it("returns an empty set for malformed JSON", () => {
    fakeStorage.setItem("ta-repo-grades-selected", "{not an array");
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set());
  });

  it("returns an empty set when the stored value is valid JSON but not an array", () => {
    fakeStorage.setItem("ta-repo-grades-selected", JSON.stringify({ a: 1 }));
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set());
  });

  it("ignores non-string entries in the stored array", () => {
    fakeStorage.setItem("ta-repo-grades-selected", JSON.stringify(["org/a", 42, null]));
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set(["org/a"]));
  });

  it("returns an empty set when window is undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set());
  });

  it("does nothing when persisting with window undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistSelectedRepoIds(new Set(["org/a"]))).not.toThrow();
    expect(fakeStorage.getItem("ta-repo-grades-selected")).toBeNull();
  });
});
