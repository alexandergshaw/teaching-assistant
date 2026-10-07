// Wave 2 of the recording-grader UX overhaul: the per-course rubric default and
// the rule that a restore never overwrites text the instructor typed.
// vitest runs in node, so this stubs a minimal in-memory Storage and `window`
// the way src/lib/grade/rubric-memory.test.ts does.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  STORAGE_KEY_RUBRIC,
  STORAGE_KEY_RUBRIC_COURSE,
  chooseRubricRestore,
  courseDefaultRubricScope,
  isRubricFieldUntouched,
  persistRubric,
  recordingRubricScope,
  restoreRubric,
} from "./grading-rubric-memory";
import { loadRubricMemory, saveRubricMemory } from "@/lib/grade/rubric-memory";

class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { localStorage?: unknown }).localStorage = new FakeStorage();
});

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
  if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

describe("isRubricFieldUntouched - a restore never overwrites a typed rubric", () => {
  it("an empty field is untouched", () => {
    expect(isRubricFieldUntouched("", null)).toBe(true);
  });
  it("a field still holding exactly the last restored text is untouched", () => {
    expect(isRubricFieldUntouched("restored", "restored")).toBe(true);
  });
  it("a typed rubric (differs from the last restore, or no restore happened) is NOT untouched", () => {
    expect(isRubricFieldUntouched("typed by hand", null)).toBe(false);
    expect(isRubricFieldUntouched("restored then edited", "restored")).toBe(false);
  });
});

describe("scopes", () => {
  it("the per-assessment scope needs both course and assessment; the course scope needs only a course", () => {
    expect(recordingRubricScope("CS101", "")).toBe("");
    expect(recordingRubricScope("", "Week 1")).toBe("");
    expect(recordingRubricScope("CS101", "Week 1")).toBe("recording:CS101|Week 1");
    expect(courseDefaultRubricScope("  ")).toBe("");
    expect(courseDefaultRubricScope("CS101")).toBe("course-default:CS101");
  });
});

describe("restoreRubric - per-course default", () => {
  it("a NEW assessment label in a course that already has a rubric starts from that course's default", () => {
    persistRubric("CS101", "Week 1 discussion", "Participation rubric: 5 pts depth, 5 pts reply.");
    const restored = restoreRubric("CS101", "Week 2 discussion");
    expect(restored?.rubric).toBe("Participation rubric: 5 pts depth, 5 pts reply.");
    expect(restored?.origin).toContain("default rubric for CS101");
  });

  it("the course default applies with no assessment label yet", () => {
    persistRubric("CS101", "Week 1", "R1");
    expect(restoreRubric("CS101", "")?.rubric).toBe("R1");
  });

  it("an exact course+assessment entry beats the course default", () => {
    persistRubric("CS101", "Week 1", "R-week-1");
    persistRubric("CS101", "Week 2", "R-week-2");
    expect(restoreRubric("CS101", "Week 1")?.rubric).toBe("R-week-1");
  });

  it("another course's default is never used for this course", () => {
    persistRubric("CS101", "Week 1", "CS101 rubric");
    // No assessment label and no entry of its own for MATH200: nothing applies.
    expect(restoreRubric("MATH200", "")).toBeNull();
  });

  it("blank text is never saved, so clearing the field cannot erase a default", () => {
    persistRubric("CS101", "Week 1", "R1");
    persistRubric("CS101", "Week 1", "   ");
    expect(restoreRubric("CS101", "Week 2")?.rubric).toBe("R1");
  });

  it("persisting writes both stores", () => {
    persistRubric("CS101", "Week 1", "R1");
    expect(loadRubricMemory(STORAGE_KEY_RUBRIC, "recording:CS101|Week 1")?.entry.rubric).toBe("R1");
    expect(loadRubricMemory(STORAGE_KEY_RUBRIC_COURSE, "course-default:CS101")?.entry.rubric).toBe("R1");
  });
});

describe("chooseRubricRestore - the resolver itself", () => {
  const entry = (rubric: string) => ({ rubric, savedAt: 1 });

  it("rejects a course hit that is really the newest-anywhere fallback from another course", () => {
    const courseHit = { entry: entry("other course"), scope: "course-default:MATH200" };
    expect(
      chooseRubricRestore({ scope: "", courseScope: "course-default:CS101", assessmentHit: null, courseHit })
    ).toBeNull();
  });

  it("keeps the existing newest-anywhere fallback when a scope is known and no course default exists", () => {
    const assessmentHit = { entry: entry("elsewhere"), scope: "recording:CS101|Old" };
    const choice = chooseRubricRestore({
      scope: "recording:CS101|New",
      courseScope: "course-default:CS101",
      assessmentHit,
      courseHit: null,
    });
    expect(choice?.loaded.entry.rubric).toBe("elsewhere");
  });

  it("the course default is preferred over the newest-anywhere fallback", () => {
    const assessmentHit = { entry: entry("other assessment"), scope: "recording:MATH200|X" };
    const courseHit = { entry: entry("course default"), scope: "course-default:CS101" };
    const choice = chooseRubricRestore({
      scope: "recording:CS101|New",
      courseScope: "course-default:CS101",
      assessmentHit,
      courseHit,
    });
    expect(choice?.loaded.entry.rubric).toBe("course default");
  });
});

describe("saveRubricMemory is the only writer path used", () => {
  it("round-trips through the shared leaf", () => {
    saveRubricMemory(STORAGE_KEY_RUBRIC_COURSE, "course-default:X", { rubric: "Y" });
    expect(loadRubricMemory(STORAGE_KEY_RUBRIC_COURSE, "course-default:X")?.entry.rubric).toBe("Y");
  });
});
