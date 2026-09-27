// vitest.config.ts runs with environment: "node", so there is no
// `window`/`localStorage` global by default - this file stubs a minimal
// in-memory Storage and a `window` global before each test and restores the
// previous globals afterward, matching githubGradingUiState.test.ts's own
// pattern.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRubricMemory, saveRubricMemory, describeRubricOrigin } from "./rubric-memory";

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

const KEY = "ta-grading-rubric-memory-test";

// W2-1: docs/a39-waves.md 8.2. The direction of failure this guards against
// is a FIRST implementation that restores the last-used entry unconditionally
// - the exact "wrong grades that look right" trap docs/a39-architecture.md
// 6.2.1 names. The condition ranges over the PAIR (text + origin string),
// never the text alone, so a fix that returns the right text but still
// fabricates a label would still fail this.
describe("W2-1: nothing is restored before a scope is known", () => {
  it("returns null for an empty scope even when another scope has a saved entry", () => {
    saveRubricMemory(KEY, "upload:last-weeks-file.zip", { rubric: "Old rubric text" });

    const loaded = loadRubricMemory(KEY, "");
    expect(loaded).toBeNull();
  });

  it("restores nothing, and therefore no origin label, when the map is empty", () => {
    const loaded = loadRubricMemory(KEY, "upload:this-weeks-file.zip");
    expect(loaded).toBeNull();
  });
});

// W2-2: scope keying never silently crosses assignments. docs/a39-waves.md
// 8.2 / docs/a39-architecture.md 6.2.2's sibling ruling: restoring under a
// DIFFERENT scope than the one requested is allowed (the last-used
// fallback), but only when describeRubricOrigin actually says so - never
// with an empty or absent label, and never claiming the requested scope.
describe("W2-2: cross-scope restore is always labelled, never silent", () => {
  it("falls back to the most recently saved entry when the requested scope has none", () => {
    saveRubricMemory(KEY, "upload:report-a.docx", { rubric: "Rubric A" });

    const loaded = loadRubricMemory(KEY, "upload:report-b.docx");
    expect(loaded).not.toBeNull();
    expect(loaded!.entry.rubric).toBe("Rubric A");
    expect(loaded!.scope).toBe("upload:report-a.docx");

    const label = describeRubricOrigin(loaded!, "upload:report-b.docx");
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("");
    // The label must name the scope the entry ACTUALLY came from, not the
    // one that was requested - an implementation whose label function
    // returns "" (the watched failure) fails both assertions below.
    expect(label).toContain("report-a.docx");
    expect(label).not.toContain("report-b.docx");
  });

  it("picks the newest entry across scopes when several exist", () => {
    saveRubricMemory(KEY, "upload:older.docx", { rubric: "Older" });
    saveRubricMemory(KEY, "upload:newer.docx", { rubric: "Newer" });

    const loaded = loadRubricMemory(KEY, "upload:third.docx");
    expect(loaded!.entry.rubric).toBe("Newer");
    expect(loaded!.scope).toBe("upload:newer.docx");
  });
});

describe("exact-scope restore", () => {
  it("returns the entry saved under the exact requested scope, labelled as same-scope", () => {
    saveRubricMemory(KEY, "cartridge:CSCI 101|Project 1", {
      rubric: "Criterion A (50%)",
      instructions: "Build a binary search tree.",
    });

    const loaded = loadRubricMemory(KEY, "cartridge:CSCI 101|Project 1");
    expect(loaded).not.toBeNull();
    expect(loaded!.entry.rubric).toBe("Criterion A (50%)");
    expect(loaded!.entry.instructions).toBe("Build a binary search tree.");
    expect(loaded!.scope).toBe("cartridge:CSCI 101|Project 1");

    const label = describeRubricOrigin(loaded!, "cartridge:CSCI 101|Project 1");
    expect(label).not.toBe("");
    expect(label).toContain("CSCI 101");
    expect(label).toContain("Project 1");
  });
});

describe("saveRubricMemory refuses an empty scope", () => {
  it("does not create a shared blank-scope slot other callers could collide on", () => {
    saveRubricMemory(KEY, "", { rubric: "Should not be stored" });
    const loaded = loadRubricMemory(KEY, "upload:anything.zip");
    expect(loaded).toBeNull();
  });
});

describe("scopes with distinct storage keys never see each other's entries", () => {
  it("is isolated per storageKey", () => {
    saveRubricMemory("ta-one", "upload:a.txt", { rubric: "From key one" });
    const loaded = loadRubricMemory("ta-two", "upload:b.txt");
    expect(loaded).toBeNull();
  });
});
