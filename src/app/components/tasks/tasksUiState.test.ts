// Gap-analysis addition (note G6): tasksUiState.ts is pure apart from its
// localStorage/window access, and it is where REGRESSION #232 check 25's
// sub-view (term vs. recurring) storage-key separation now lives for the new
// column-filters functions, but it had no tests of its own. This suite lives
// in the component directory (not course-tasks-view.columns.test.ts) since
// tasksUiState.ts is component-directory code.
//
// vitest.config.ts runs this project's tests with `environment: "node"`, so
// there is no `window` or `localStorage` global by default (confirmed live:
// under plain Node, `typeof window` and `typeof localStorage` are both
// "undefined" here). This file stubs a minimal in-memory `localStorage` and a
// `window` global before each test and restores the previous globals
// afterward, rather than fighting the repo's shared vitest config.
//
// Deliberately does NOT re-test loadUiState/persistUiState/loadDensity beyond
// what is exercised incidentally here - they moved out of TasksTab.tsx
// unchanged, and their behavior is already pinned by the area baseline
// (REGRESSION #232).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadTaskColumnFilters,
  persistTaskColumnFilters,
} from "./tasksUiState";
import { serializeTaskColumnFilters, taskColumnFiltersKey } from "@/lib/course-tasks-view";

/** Minimal in-memory Storage stand-in - just enough surface for
 * tasksUiState.ts's getItem/setItem calls. `throwOnSet`, when true, makes
 * every `setItem` throw, simulating a full quota or private-browsing
 * localStorage. */
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

describe("loadTaskColumnFilters / persistTaskColumnFilters (G6)", () => {
  it("round-trips a filter through persist then load for the SAME sub-view", () => {
    persistTaskColumnFilters("term", { a: ["blocked"] });
    expect(loadTaskColumnFilters("term")).toEqual({ a: ["blocked"] });
  });

  it("does not let a write to one sub-view bleed into the other", () => {
    persistTaskColumnFilters("term", { a: ["blocked"] });
    // The other sub-view's storage key was never touched.
    expect(loadTaskColumnFilters("recurring")).toEqual({});

    persistTaskColumnFilters("recurring", { a: ["done"] });
    // Writing "recurring" does not disturb what "term" already had.
    expect(loadTaskColumnFilters("term")).toEqual({ a: ["blocked"] });
    expect(loadTaskColumnFilters("recurring")).toEqual({ a: ["done"] });
  });

  it("a value written directly under one sub-view's storage key is not readable under the other's", () => {
    fakeStorage.setItem(taskColumnFiltersKey("term"), serializeTaskColumnFilters({ a: ["na"] }));
    expect(loadTaskColumnFilters("recurring")).toEqual({});
    expect(loadTaskColumnFilters("term")).toEqual({ a: ["na"] });
  });

  it("normalizes on write - persisting a complete four-status selection stores no entry for it", () => {
    persistTaskColumnFilters("term", { a: ["open", "done", "blocked", "na"] });
    const stored = fakeStorage.getItem(taskColumnFiltersKey("term"));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string) as { filters: Record<string, unknown> };
    expect(parsed.filters).toEqual({});
    // ...and reading it back through the normal path agrees.
    expect(loadTaskColumnFilters("term")).toEqual({});
  });

  it("does not propagate a localStorage.setItem throw (quota / private browsing)", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistTaskColumnFilters("term", { a: ["blocked"] })).not.toThrow();
    // The lost write means there is still nothing to read back.
    fakeStorage.throwOnSet = false;
    expect(loadTaskColumnFilters("term")).toEqual({});
  });

  it("falls back to no filters when the stored string is garbage", () => {
    fakeStorage.setItem(taskColumnFiltersKey("term"), "{not json");
    expect(loadTaskColumnFilters("term")).toEqual({});
  });
});
