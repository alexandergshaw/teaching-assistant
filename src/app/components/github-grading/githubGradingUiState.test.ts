// Tests for githubGradingUiState.ts (AC C1,
// docs/github-grading-folder-and-assignment-acceptance-criteria.md).
// vitest.config.ts runs with environment: "node", so there is no
// `window`/`localStorage` global by default - this file stubs a minimal
// in-memory Storage and a `window` global before each test and restores the
// previous globals afterward, exactly matching repoGradesUiState.test.ts's
// own pattern in the sibling directory.
//
// Every field this module persists is a plain string (or, for `source`, a
// closed two-value enum encoded as a string) - unlike repoGradesUiState.ts's
// `sort`/assignment-map fields, nothing here is JSON-encoded (see
// githubGradingUiState.ts's own header comment for why). So the "corrupt
// value falls back to defaults rather than throwing" case this suite covers
// is the enum guard on `source` (isPullSource) rather than a JSON.parse
// failure - the same role malformed-sort-JSON plays in
// repoGradesUiState.test.ts, adapted to a module with no JSON field.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadGithubGradingUiState,
  persistGithubGradingUiState,
  type GithubGradingUiState,
} from "./githubGradingUiState";

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

const FULL_STATE: GithubGradingUiState = {
  gradingFolder: "week-3/starter",
  courseId: "course-42",
  source: "export",
  liveAssignmentId: "9001",
  exportAssignmentKey: "1:2",
  exportRubricTitle: "Final Project Rubric",
};

describe("loadGithubGradingUiState / persistGithubGradingUiState", () => {
  it("returns defaults (empty folder/course, live source, empty selections) when nothing is stored", () => {
    expect(loadGithubGradingUiState()).toEqual({
      gradingFolder: "",
      courseId: "",
      source: "live",
      liveAssignmentId: "",
      exportAssignmentKey: "",
      exportRubricTitle: "",
    });
  });

  it("returns defaults when window is undefined (SSR-safe read)", () => {
    // Delete BOTH globals - the guard must return before ever touching
    // `localStorage`, so deleting only `window` (leaving the stub in place)
    // would let a missing guard slip through undetected.
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadGithubGradingUiState()).toEqual({
      gradingFolder: "",
      courseId: "",
      source: "live",
      liveAssignmentId: "",
      exportAssignmentKey: "",
      exportRubricTitle: "",
    });
  });

  it("round-trips a full state through persist then load", () => {
    persistGithubGradingUiState(FULL_STATE);
    expect(loadGithubGradingUiState()).toEqual(FULL_STATE);
  });

  it("round-trips the other source value too (live)", () => {
    persistGithubGradingUiState({ ...FULL_STATE, source: "live" });
    expect(loadGithubGradingUiState().source).toBe("live");
  });

  it("does nothing when window is undefined (SSR-safe write)", () => {
    // See the read test's comment above for why both globals are removed.
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => persistGithubGradingUiState(FULL_STATE)).not.toThrow();
    expect(fakeStorage.getItem("ta-github-grading-course")).toBeNull();
  });

  it("swallows a localStorage write failure (quota/private mode) rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistGithubGradingUiState(FULL_STATE)).not.toThrow();
  });

  it("falls back to the default source ('live') for a corrupt/invalid stored value", () => {
    fakeStorage.setItem("ta-github-grading-source", "{not json");
    expect(loadGithubGradingUiState().source).toBe("live");
  });

  it("falls back to the default source for a value that is neither 'live' nor 'export'", () => {
    fakeStorage.setItem("ta-github-grading-source", "sideways");
    expect(loadGithubGradingUiState().source).toBe("live");
  });

  it("persists every field under its own distinct ta- key", () => {
    persistGithubGradingUiState(FULL_STATE);
    expect(fakeStorage.getItem("ta-github-grading-folder")).toBe("week-3/starter");
    expect(fakeStorage.getItem("ta-github-grading-course")).toBe("course-42");
    expect(fakeStorage.getItem("ta-github-grading-source")).toBe("export");
    expect(fakeStorage.getItem("ta-github-grading-live-assignment")).toBe("9001");
    expect(fakeStorage.getItem("ta-github-grading-export-assignment")).toBe("1:2");
    expect(fakeStorage.getItem("ta-github-grading-export-rubric")).toBe("Final Project Rubric");
  });

  it("leaves an untouched field's stored value alone when only one field is re-persisted via a fresh full state", () => {
    persistGithubGradingUiState(FULL_STATE);
    persistGithubGradingUiState({ ...FULL_STATE, gradingFolder: "week-4" });
    expect(loadGithubGradingUiState()).toEqual({ ...FULL_STATE, gradingFolder: "week-4" });
  });

  it("returns absent-key defaults for each field independently", () => {
    // Only the folder was ever saved; every other key is genuinely absent.
    fakeStorage.setItem("ta-github-grading-folder", "week-1");
    expect(loadGithubGradingUiState()).toEqual({
      gradingFolder: "week-1",
      courseId: "",
      source: "live",
      liveAssignmentId: "",
      exportAssignmentKey: "",
      exportRubricTitle: "",
    });
  });
});
