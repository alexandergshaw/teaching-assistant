// Tests for courseIntelUiState.ts. vitest.config.ts runs with
// environment: "node", so there is no `window`/`localStorage` global by
// default - this file stubs a minimal in-memory Storage and a `window`
// global before each test and restores the previous globals afterward,
// exactly matching repoGradesUiState.test.ts's own pattern (see that file's
// header for why: it confirmed live that typeof window/localStorage are both
// "undefined" under plain Node here).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "app", "components", "course-intel");
import { loadCourseIntelQuestion, persistCourseIntelQuestion } from "./courseIntelUiState";

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
// this view is accounted for here under its exact ta- key, so a control added
// to this module without a matching persist call, or a key renamed without
// updating every read site, turns this test red.
//
// IT WAS TWO KEYS, THEN ONE, AND IS NOW TWO AGAIN - and only one of them lives
// in this module. D24 removed the course picker, retiring
// `ta-course-intel-course`; the history surface then added
// `ta-course-intel-history-open`, which useCourseIntel.ts owns and reads
// through its own helper rather than importing one from here.
//
// THAT SPLIT IS WHY THIS COMMENT EXISTS. A canary that silently kept saying
// "one persisted control" while the view had two would read as coverage of the
// whole view while checking half of it - the same stale-canary failure this
// file's own history already shows. The count below is this MODULE's, not the
// view's, and the key owned elsewhere is named so the next reader can find it,
// following courseIntelOfflineTables.test.ts's idiom for keys owned by another
// module.
//
// The retired-key assertion is the one that matters most: deleting a persisted
// control is easy to do by half, and a leftover writer stores a value nothing
// reads while looking exactly like a working control.

/** Every ta- key this VIEW persists, and which module owns each. Only the
 *  first is this module's to write. */
const VIEW_KEYS = [
  { key: "ta-course-intel-question", owner: "courseIntelUiState.ts (this module)" },
  { key: "ta-course-intel-history-open", owner: "useCourseIntel.ts" },
] as const;

describe("courseIntelUiState - ordinal canary (this module owns one of the view's two ta- keys)", () => {
  it("persists the draft question under its named ta- key, and writes no other", () => {
    persistCourseIntelQuestion("all-courses", "How is Jamie doing?");
    expect(fakeStorage.getItem("ta-course-intel-question")).toBe(
      JSON.stringify({ "all-courses": "How is Jamie doing?" })
    );

    // The retired picker key must never come back.
    expect(fakeStorage.getItem("ta-course-intel-course")).toBeNull();

    // And this module must not have written the key another module owns -
    // two writers for one key is how a control starts disagreeing with itself.
    expect(fakeStorage.getItem("ta-course-intel-history-open")).toBeNull();
  });

  it("names every key the view persists, so a new one cannot be added unnoticed", () => {
    // Not a behavioural assertion - a registry. If a control is added to this
    // view under a new key, this list is where it has to be declared, and the
    // source scan below is what makes forgetting fail rather than pass.
    const source = readFileSync(join(DIR, "useCourseIntel.ts"), "utf8");
    const declaredElsewhere = VIEW_KEYS.filter((entry) => entry.owner !== "courseIntelUiState.ts (this module)");
    for (const entry of declaredElsewhere) {
      expect(
        source,
        `${entry.key} is listed here as owned by ${entry.owner}, but that file does not mention it`
      ).toContain(entry.key);
    }

    // Every whole-string ta- literal in that file is either a key it owns for
    // this view, or one it reads from another view - both are declared. A new,
    // undeclared key turns this red.
    const found = source.match(/"ta-[a-z0-9-]+"/g) ?? [];
    const known = new Set([
      ...VIEW_KEYS.map((entry) => `"${entry.key}"`),
      // Read, not owned - the recorded offline tables, per that file's header.
      '"ta-rec-grade-table"',
      '"ta-rec-disc-table"',
      '"ta-rec-grade-declarations"',
    ]);
    expect(found.filter((key) => !known.has(key))).toEqual([]);
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
