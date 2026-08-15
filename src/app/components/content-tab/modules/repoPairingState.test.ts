// Tests for repoPairingState.ts (AC1/AC4 of
// docs/repo-pairing-in-modules-acceptance-criteria.md). vitest.config.ts runs
// with environment: "node", so there is no `window`/`localStorage` global by
// default - this file stubs a minimal in-memory Storage and a `window`
// global before each test and restores the previous globals afterward,
// exactly matching repoGradesUiState.test.ts's own pattern (which itself
// cites tasksUiState.test.ts as the precedent that confirmed live that
// typeof window/localStorage are both "undefined" under plain Node here).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadPairedRepo,
  loadRepoModuleOverrides,
  persistPairedRepo,
  persistRepoModuleOverrides,
} from "./repoPairingState";
import { filterRepoModuleOverrides, type RepoModuleMappingModule } from "@/lib/repo-module-mapping";

class FakeStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  raw(): Map<string, string> {
    return this.store;
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

describe("loadPairedRepo / persistPairedRepo", () => {
  it("returns an empty selection when nothing is stored", () => {
    expect(loadPairedRepo("https://x.instructure.com/courses/1")).toEqual({ repoRef: "", branch: "" });
  });

  it("returns an empty selection when window is undefined (SSR-safe read)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadPairedRepo("https://x.instructure.com/courses/1")).toEqual({ repoRef: "", branch: "" });
  });

  it("is a no-op write when window is undefined (SSR-safe write)", () => {
    delete (globalThis as { window?: unknown }).window;
    persistPairedRepo("https://x.instructure.com/courses/1", { repoRef: "org/repo", branch: "main" });
    expect(fakeStorage.raw().size).toBe(0);
  });

  it("round-trips a repo ref and branch", () => {
    persistPairedRepo("https://x.instructure.com/courses/1", { repoRef: "org/repo", branch: "main" });
    expect(loadPairedRepo("https://x.instructure.com/courses/1")).toEqual({ repoRef: "org/repo", branch: "main" });
  });

  it("keeps two courses' persisted repos independent (PER-COURSE key, AC1)", () => {
    persistPairedRepo("https://x.instructure.com/courses/1", { repoRef: "org/repo-a", branch: "main" });
    persistPairedRepo("https://x.instructure.com/courses/2", { repoRef: "org/repo-b", branch: "dev" });
    expect(loadPairedRepo("https://x.instructure.com/courses/1")).toEqual({ repoRef: "org/repo-a", branch: "main" });
    expect(loadPairedRepo("https://x.instructure.com/courses/2")).toEqual({ repoRef: "org/repo-b", branch: "dev" });
  });

  it("treats a blank courseUrl as unkeyable rather than sharing a key across every courseless render", () => {
    persistPairedRepo("", { repoRef: "org/repo", branch: "main" });
    expect(fakeStorage.raw().size).toBe(0);
    expect(loadPairedRepo("")).toEqual({ repoRef: "", branch: "" });
  });
});

const COURSE = "https://x.instructure.com/courses/1";
const MODULES: RepoModuleMappingModule[] = [
  { id: 10, name: "Module 01: Setup" },
  { id: 11, name: "Module 02: Loops" },
];
const FOLDER_PATHS = ["assignments/module_01", "assignments/module_02"];

describe("loadRepoModuleOverrides / persistRepoModuleOverrides", () => {
  it("returns an empty map when nothing is stored", () => {
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({});
  });

  it("returns an empty map when window is undefined (SSR-safe read)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({});
  });

  it("round-trips a valid override untouched", () => {
    persistRepoModuleOverrides(COURSE, { "assignments/module_01": "10" });
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({ "assignments/module_01": "10" });
  });

  it("tolerates malformed JSON, degrading to an empty map rather than throwing", () => {
    localStorage.setItem("ta-repo-pairing-overrides-" + COURSE, "{not valid json");
    expect(() => loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).not.toThrow();
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({});
  });

  it("tolerates a stored JSON array (wrong shape), degrading to an empty map", () => {
    localStorage.setItem("ta-repo-pairing-overrides-" + COURSE, JSON.stringify(["not", "a", "record"]));
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({});
  });

  it("tolerates a stored record whose values are not strings, degrading to an empty map", () => {
    localStorage.setItem("ta-repo-pairing-overrides-" + COURSE, JSON.stringify({ "assignments/module_01": 10 }));
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({});
  });

  // AC4's own case: FILTER-ON-RESTORE. A stored override naming a folder or
  // module that no longer exists must be dropped, never resurrected as a
  // confirmed pairing for content that isn't actually there any more.
  it("drops a stored override naming a folder path that no longer exists in the repo", () => {
    persistRepoModuleOverrides(COURSE, {
      "assignments/module_01": "10",
      "assignments/module_99": "11", // stale: not in FOLDER_PATHS
    });
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({ "assignments/module_01": "10" });
  });

  it("drops a stored override naming a module id that no longer exists", () => {
    persistRepoModuleOverrides(COURSE, {
      "assignments/module_01": "10",
      "assignments/module_02": "999", // stale: not in MODULES
    });
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({ "assignments/module_01": "10" });
  });

  it("drops every entry when both the folder and the module have gone stale", () => {
    persistRepoModuleOverrides(COURSE, { "assignments/module_99": "999" });
    expect(loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES)).toEqual({});
  });

  it("keeps two courses' persisted overrides independent (PER-COURSE key, AC1)", () => {
    persistRepoModuleOverrides("https://x.instructure.com/courses/1", { "assignments/module_01": "10" });
    persistRepoModuleOverrides("https://x.instructure.com/courses/2", { "assignments/module_02": "11" });
    expect(loadRepoModuleOverrides("https://x.instructure.com/courses/1", FOLDER_PATHS, MODULES)).toEqual({
      "assignments/module_01": "10",
    });
    expect(loadRepoModuleOverrides("https://x.instructure.com/courses/2", FOLDER_PATHS, MODULES)).toEqual({
      "assignments/module_02": "11",
    });
  });

  it("is a no-op write when window is undefined (SSR-safe write)", () => {
    delete (globalThis as { window?: unknown }).window;
    persistRepoModuleOverrides(COURSE, { "assignments/module_01": "10" });
    expect(fakeStorage.raw().size).toBe(0);
  });

  // SABOTAGE-CHECK evidence (recorded here, not exercised by a live mutation
  // of the source): loadRepoModuleOverrides's whole reason to exist over a
  // plain JSON.parse is that it runs the raw stored value through
  // filterRepoModuleOverrides before returning it. Confirms directly that a
  // load call which skipped that step (returning `raw` instead of
  // `filterRepoModuleOverrides(raw, folderPaths, modules)`) would fail this
  // exact case - i.e. that the two are NOT equal for stale input, so the
  // "drops a stale entry" tests above are actually exercising the filter
  // call and not passing by coincidence.
  it("differs from the unfiltered raw value for stale input, proving the filter step is load-bearing", () => {
    const raw = { "assignments/module_01": "10", "assignments/module_99": "11" };
    persistRepoModuleOverrides(COURSE, raw);
    const loaded = loadRepoModuleOverrides(COURSE, FOLDER_PATHS, MODULES);
    expect(loaded).not.toEqual(raw);
    expect(loaded).toEqual(filterRepoModuleOverrides(raw, FOLDER_PATHS, MODULES));
  });
});
