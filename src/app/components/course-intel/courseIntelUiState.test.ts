// Tests for courseIntelUiState.ts. vitest.config.ts runs with
// environment: "node", so there is no `window`/`localStorage` global by
// default - this file stubs a minimal in-memory Storage and a `window`
// global before each test and restores the previous globals afterward,
// exactly matching repoGradesUiState.test.ts's own pattern (see that file's
// header for why: it confirmed live that typeof window/localStorage are both
// "undefined" under plain Node here).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadCourseIntelCourseId,
  loadCourseIntelQuestion,
  persistCourseIntelCourseId,
  persistCourseIntelQuestion,
} from "./courseIntelUiState";

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

// Ordinal canary (this directory's own version of repoGradesUiState.test.ts's
// "persists ... under N distinct ta- keys" test) - every persisted control in
// this view is accounted for here under its exact ta- key, so a future
// control added to this module without a matching persist call, or a key
// renamed without updating every read site, turns this test red.
describe("courseIntelUiState - ordinal canary (two persisted controls, two ta- keys)", () => {
  it("persists the selected course id and the per-course draft question under exactly their two named ta- keys", () => {
    persistCourseIntelCourseId("course-9");
    persistCourseIntelQuestion("course-9", "How is Jamie doing?");
    expect(fakeStorage.getItem("ta-course-intel-course")).toBe("course-9");
    expect(fakeStorage.getItem("ta-course-intel-question")).toBe(JSON.stringify({ "course-9": "How is Jamie doing?" }));
  });
});

describe("loadCourseIntelCourseId / persistCourseIntelCourseId", () => {
  it("returns \"\" when nothing is stored", () => {
    expect(loadCourseIntelCourseId()).toBe("");
  });

  it("round-trips a course id through persist then load", () => {
    persistCourseIntelCourseId("course-1");
    expect(loadCourseIntelCourseId()).toBe("course-1");
  });

  // D13: this key holds the course_hub uuid ONLY. This module has no
  // knowledge of what a "valid" value looks like (that is the caller's job,
  // matching institution/canvasUrl validation), so it round-trips a
  // uuid-shaped string as plainly as any other - the guarantee this test
  // actually pins is narrower and more important: this module never derives
  // or stores a Canvas numeric id anywhere, which the ta-course-intel-course
  // ordinal canary above already proves by construction (there is no second
  // key here to hold one).
  it("round-trips a uuid-shaped course id unchanged", () => {
    persistCourseIntelCourseId("3fa85f64-5717-4562-b3fc-2c963f66afa6");
    expect(loadCourseIntelCourseId()).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");
  });

  it("returns \"\" when window is undefined (SSR-safe read)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadCourseIntelCourseId()).toBe("");
  });

  it("does nothing when persisting with window undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistCourseIntelCourseId("course-1")).not.toThrow();
    expect(fakeStorage.getItem("ta-course-intel-course")).toBeNull();
  });

  it("swallows a localStorage write failure (quota/private mode) rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistCourseIntelCourseId("course-1")).not.toThrow();
  });
});

describe("loadCourseIntelQuestion / persistCourseIntelQuestion", () => {
  it("returns \"\" when nothing is stored", () => {
    expect(loadCourseIntelQuestion("course-1")).toBe("");
  });

  it("returns \"\" for a blank course id", () => {
    expect(loadCourseIntelQuestion("")).toBe("");
  });

  it("round-trips one course's draft question through persist then load", () => {
    persistCourseIntelQuestion("course-1", "What areas has Jordan asked about?");
    expect(loadCourseIntelQuestion("course-1")).toBe("What areas has Jordan asked about?");
  });

  it("keeps a DIFFERENT course's draft completely separate", () => {
    persistCourseIntelQuestion("course-1", "Course 1's own draft");
    persistCourseIntelQuestion("course-2", "Course 2's own draft");
    expect(loadCourseIntelQuestion("course-1")).toBe("Course 1's own draft");
    expect(loadCourseIntelQuestion("course-2")).toBe("Course 2's own draft");
  });

  it("writing one course's draft does not disturb another already-stored course's draft", () => {
    persistCourseIntelQuestion("course-1", "first");
    persistCourseIntelQuestion("course-2", "second");
    persistCourseIntelQuestion("course-1", "first, edited");
    expect(loadCourseIntelQuestion("course-2")).toBe("second");
  });

  it("overwrites a course's prior draft entirely on the next persist for that course", () => {
    persistCourseIntelQuestion("course-1", "first draft");
    persistCourseIntelQuestion("course-1", "");
    expect(loadCourseIntelQuestion("course-1")).toBe("");
  });

  it("returns an empty string for malformed JSON", () => {
    fakeStorage.setItem("ta-course-intel-question", "{not json");
    expect(loadCourseIntelQuestion("course-1")).toBe("");
  });

  it("returns an empty string when the stored value is valid JSON but not an object", () => {
    fakeStorage.setItem("ta-course-intel-question", JSON.stringify(["not", "an", "object"]));
    expect(loadCourseIntelQuestion("course-1")).toBe("");
  });

  it("ignores a course entry whose stored value is not a string", () => {
    fakeStorage.setItem("ta-course-intel-question", JSON.stringify({ "course-1": 12345 }));
    expect(loadCourseIntelQuestion("course-1")).toBe("");
  });

  it("does nothing when persisting with window undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistCourseIntelQuestion("course-1", "text")).not.toThrow();
    expect(fakeStorage.getItem("ta-course-intel-question")).toBeNull();
  });

  it("returns \"\" when window is undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadCourseIntelQuestion("course-1")).toBe("");
  });

  it("is a no-op when persisting with a blank course id", () => {
    expect(() => persistCourseIntelQuestion("", "text")).not.toThrow();
    expect(fakeStorage.getItem("ta-course-intel-question")).toBeNull();
  });

  it("swallows a localStorage write failure rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistCourseIntelQuestion("course-1", "text")).not.toThrow();
  });
});
