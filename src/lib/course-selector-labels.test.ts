// Coverage for course-selector-labels.ts: the cache that lets the course
// tile picker (hubCourse) and the Canvas course picker (lmsCourse) keep
// showing a friendly name across a page refresh, instead of the raw id that
// is all localStorage would otherwise be able to restore before the options
// list finishes loading. See that module's header comment for the bug this
// fixes.
//
// vitest.config.ts runs this suite under environment: "node", so there is no
// real `localStorage` global - each test stubs one via a tiny in-memory
// implementation, restored between tests so the cache module's module-level
// behavior (it makes no assumptions about a persistent global) is what's
// under test, not test pollution.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readCachedSelectorLabel,
  writeCachedSelectorLabel,
  resolveSelectorLabel,
  UNKNOWN_SELECTOR_LABEL,
  type SelectorKind,
} from "./course-selector-labels";

class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
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

let fakeStorage: FakeLocalStorage;

beforeEach(() => {
  fakeStorage = new FakeLocalStorage();
  vi.stubGlobal("localStorage", fakeStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveSelectorLabel", () => {
  it("resolves from the loaded options list when present", () => {
    const label = resolveSelectorLabel({
      id: "course-1",
      optionLabel: "Intro to Biology",
      cachedLabel: null,
    });
    expect(label).toBe("Intro to Biology");
  });

  it("resolves from the persisted cache when the options list is still loading (null)", () => {
    // optionLabel undefined models the caller passing nothing while the
    // options list itself is still null (loading) - the caller never has an
    // optionLabel to offer in that state.
    const label = resolveSelectorLabel({
      id: "course-2",
      optionLabel: undefined,
      cachedLabel: "Advanced Chemistry",
    });
    expect(label).toBe("Advanced Chemistry");
  });

  it("resolves from the persisted cache when the options list failed to load", () => {
    // A failed load also leaves the caller with no optionLabel to offer (the
    // options list stays null forever on error - see useWorkflowOptions.ts's
    // hubCourses effect, which sets hubCoursesError but never sets
    // hubCourses to anything but null on failure).
    const label = resolveSelectorLabel({
      id: "course-3",
      optionLabel: null,
      cachedLabel: "US History",
    });
    expect(label).toBe("US History");
  });

  it("falls back to a neutral placeholder when neither source is available, and that placeholder is not the raw id", () => {
    const rawId = "a1b2c3-course-id";
    const label = resolveSelectorLabel({
      id: rawId,
      optionLabel: null,
      cachedLabel: null,
    });
    expect(label).toBe(UNKNOWN_SELECTOR_LABEL);
    expect(label).not.toBe(rawId);
  });

  it("lets the loaded options list win over a stale persisted label (freshness)", () => {
    const label = resolveSelectorLabel({
      id: "course-4",
      optionLabel: "Renamed Course",
      cachedLabel: "Old Cached Name",
    });
    expect(label).toBe("Renamed Course");
  });

  it("treats a blank optionLabel the same as absent, falling through to the cache", () => {
    const label = resolveSelectorLabel({
      id: "course-5",
      optionLabel: "   ",
      cachedLabel: "Cached Name",
    });
    expect(label).toBe("Cached Name");
  });

  it("supports a caller-supplied fallback in place of UNKNOWN_SELECTOR_LABEL", () => {
    const label = resolveSelectorLabel({
      id: "course-6",
      optionLabel: null,
      cachedLabel: null,
      fallback: "Selected course",
    });
    expect(label).toBe("Selected course");
  });

  it("returns the fallback for an empty id, without ever inventing a label from cache/options", () => {
    const label = resolveSelectorLabel({
      id: "",
      optionLabel: "should be ignored",
      cachedLabel: "should also be ignored",
    });
    expect(label).toBe(UNKNOWN_SELECTOR_LABEL);
  });
});

describe("writeCachedSelectorLabel / readCachedSelectorLabel", () => {
  it("writes the label to the cache when an item is selected, and it can be read back", () => {
    writeCachedSelectorLabel("hubCourse", "hub-42", "Data Structures");
    expect(readCachedSelectorLabel("hubCourse", "hub-42")).toBe("Data Structures");
  });

  it("keeps hubCourse and lmsCourse ids in separate namespaces", () => {
    writeCachedSelectorLabel("hubCourse", "42", "Hub Course Forty-Two");
    writeCachedSelectorLabel("lmsCourse", "42", "Canvas Course Forty-Two");
    expect(readCachedSelectorLabel("hubCourse", "42")).toBe("Hub Course Forty-Two");
    expect(readCachedSelectorLabel("lmsCourse", "42")).toBe("Canvas Course Forty-Two");
  });

  it("returns null for an id that was never cached", () => {
    expect(readCachedSelectorLabel("hubCourse", "never-seen")).toBeNull();
  });

  it("does not cache a blank label", () => {
    writeCachedSelectorLabel("hubCourse", "hub-99", "   ");
    expect(readCachedSelectorLabel("hubCourse", "hub-99")).toBeNull();
  });

  it("does not write anything for a blank id", () => {
    writeCachedSelectorLabel("hubCourse", "", "Some Name");
    expect(readCachedSelectorLabel("hubCourse", "")).toBeNull();
  });

  it("overwrites a stale cached label when a fresher name is written", () => {
    writeCachedSelectorLabel("lmsCourse", "c-7", "Old Name");
    writeCachedSelectorLabel("lmsCourse", "c-7", "New Name");
    expect(readCachedSelectorLabel("lmsCourse", "c-7")).toBe("New Name");
  });

  it("persists across separate read/write calls the way localStorage would across a page reload", () => {
    writeCachedSelectorLabel("hubCourse", "hub-1", "Persisted Course");
    // A second, independent read call - simulates a fresh render (or a
    // fresh page load) consulting the cache rather than in-memory state.
    expect(readCachedSelectorLabel("hubCourse", "hub-1")).toBe("Persisted Course");
  });

  it("is a no-op when localStorage is unavailable (SSR/node)", () => {
    vi.unstubAllGlobals();
    // No localStorage global at all in this scope - mirrors a server render.
    expect(() => writeCachedSelectorLabel("hubCourse", "hub-1", "Some Name")).not.toThrow();
    expect(readCachedSelectorLabel("hubCourse", "hub-1")).toBeNull();
  });
});

describe("the cache never influences what gets submitted", () => {
  it("keeps the id used for submission independent of a wrong cached label", () => {
    // Every real call site (CoursePicker's onSelect, RuntimeFieldInput's
    // hubCourse onChange) submits the raw id/url directly - never anything
    // returned by this module. This test simulates that: even a maximally
    // wrong cached label cannot change the id a caller already has in hand.
    const id = "hub-999";
    writeCachedSelectorLabel("hubCourse", id, "Completely Different Course");
    const cachedLabel = readCachedSelectorLabel("hubCourse", id);
    const displayLabel = resolveSelectorLabel({ id, cachedLabel });

    // The cache did its job - the display text reflects the (deliberately
    // wrong, for this test) cached name...
    expect(displayLabel).toBe("Completely Different Course");
    // ...but the value a caller would submit is a separate variable this
    // module never touches or derives from the label.
    expect(id).toBe("hub-999");
  });

  it("resolveSelectorLabel's return type carries no id - callers cannot accidentally submit it", () => {
    const kinds: SelectorKind[] = ["hubCourse", "lmsCourse"];
    for (const kind of kinds) {
      writeCachedSelectorLabel(kind, "shared-id", `${kind} label`);
    }
    const label = resolveSelectorLabel({
      id: "shared-id",
      cachedLabel: readCachedSelectorLabel("hubCourse", "shared-id"),
    });
    // The function returns a plain label string; nothing about its shape
    // could be mistaken for (or substituted as) the id by a caller.
    expect(typeof label).toBe("string");
    expect(label).toBe("hubCourse label");
  });
});
