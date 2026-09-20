// Tests for grading-capture-tombstones.ts (A9 wave 2, docs/REGRESSION.md
// entry 428). vitest.config.ts runs with environment: "node" and
// vitest.setup.ts creates no `window` global, so every `typeof window`
// guard in the file under test returns early and a test that never stubs
// `globalThis.window` would pass VACUOUSLY - it would prove the guard
// short-circuits, not that persistence works. This file stubs a minimal
// in-memory Storage AND a `window` global before each test and restores the
// previous globals afterward, mirroring courseIntelUiState.test.ts's own
// pattern exactly (that file's own header records why: it confirmed live
// that typeof window/localStorage are both "undefined" under plain Node
// here).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GradingRow } from "./grading-row";
import type { TrackedSubmission } from "./grading-capture-sync";
import {
  TOMBSTONE_STORAGE_KEY,
  type DismissedSubmission,
  projectDismissed,
  serializeDismissed,
  deserializeDismissed,
  dismissTrackedRow,
  seedTrackedFromRows,
  readDismissed,
  persistDismissedForCourse,
  commitDismissal,
  commitCaptureAdvance,
  commitTrackingReset,
  composeRemoveHandler,
  composeClearHandler,
} from "./grading-capture-tombstones";

class FakeStorage {
  private store = new Map<string, string>();
  /** Number of remaining setItem calls that should throw before succeeding.
   *  -1 means "throw forever". */
  throwFor = 0;

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.throwFor !== 0) {
      if (this.throwFor > 0) this.throwFor -= 1;
      throw new Error("quota exceeded (simulated)");
    }
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

function makeRow(id: string, name: string, text: string): GradingRow {
  return {
    id,
    studentName: name,
    nameMatch: "no-roster",
    rosterCandidates: [],
    submissionText: text,
    state: "pending",
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    rubricAreas: [],
    suggestedSubmissionKind: "unknown",
    submissionKindCue: "",
    submissionKind: "unknown",
  };
}

function makeTracked(name: string, text: string, rowId: string, dismissed = false): TrackedSubmission {
  return { name, text, suggestedSubmissionKind: "unknown", submissionKindCue: "", rowId, dismissed };
}

let idCounter = 0;
function mintId(): string {
  idCounter += 1;
  return `id-${idCounter}`;
}

describe("projectDismissed / serializeDismissed / deserializeDismissed - pure", () => {
  it("projects only dismissed entries, tagged with the given scope", () => {
    const tracked = [
      makeTracked("Alice", "alice text", "r-1", false),
      makeTracked("Bob", "bob text", "r-2", true),
    ];
    expect(projectDismissed(tracked, "course-a")).toEqual([{ name: "Bob", text: "bob text", course: "course-a" }]);
  });

  it("round-trips empty, one entry, course undefined, a course value, and text with a newline and a double quote", () => {
    const fixtures: DismissedSubmission[][] = [
      [],
      [{ name: "A", text: "line one\nline two \"quoted\"", course: undefined }],
      [{ name: "B", text: "b", course: "course-x" }],
    ];
    for (const entries of fixtures) {
      expect(deserializeDismissed(serializeDismissed(entries))).toEqual(entries);
    }
  });

  it("deserializeDismissed never throws on a malformed or absent raw string", () => {
    expect(deserializeDismissed(null)).toEqual([]);
    expect(deserializeDismissed("not json")).toEqual([]);
    expect(deserializeDismissed("{}")).toEqual([]);
    expect(deserializeDismissed("[1,2,3]")).toEqual([]);
    expect(deserializeDismissed('[{"name":"A"}]')).toEqual([]); // missing text
  });
});

describe("dismissTrackedRow - pure", () => {
  it("flips dismissed and moves the entry to the end", () => {
    const tracked = [
      makeTracked("Alice", "a", "r-1"),
      makeTracked("Bob", "b", "r-2"),
      makeTracked("Carol", "c", "r-3"),
    ];
    const next = dismissTrackedRow(tracked, "r-2");
    expect(next.map((e) => e.rowId)).toEqual(["r-1", "r-3", "r-2"]);
    expect(next.find((e) => e.rowId === "r-2")?.dismissed).toBe(true);
  });

  it("returns the SAME array reference on a miss - mirrors removeAssessmentRow's discipline", () => {
    const tracked = [makeTracked("Alice", "a", "r-1")];
    expect(dismissTrackedRow(tracked, "nope")).toBe(tracked);
  });
});

describe("seedTrackedFromRows - pure", () => {
  it("live entries in row order first, then this scope's tombstones, each live rowId equal to its row id", () => {
    const rows = [makeRow("r-1", "Alice", "alice text"), makeRow("r-2", "Bob", "bob text")];
    const dismissed: DismissedSubmission[] = [
      { name: "Carol", text: "carol text", course: "course-a" },
      { name: "Dave", text: "dave text", course: "course-b" },
    ];
    const seeded = seedTrackedFromRows(rows, dismissed, "course-a", mintId);
    expect(seeded).toHaveLength(3);
    expect(seeded[0]).toEqual({
      name: "Alice",
      text: "alice text",
      suggestedSubmissionKind: "unknown",
      submissionKindCue: "",
      rowId: "r-1",
      dismissed: false,
    });
    expect(seeded[1]).toEqual({
      name: "Bob",
      text: "bob text",
      suggestedSubmissionKind: "unknown",
      submissionKindCue: "",
      rowId: "r-2",
      dismissed: false,
    });
    expect(seeded[2].name).toBe("Carol");
    expect(seeded[2].dismissed).toBe(true);
    // Dave (course-b) is excluded from a course-a seed.
    expect(seeded.some((e) => e.name === "Dave")).toBe(false);
  });

  // docs/a8r-scope.md (A8-R) TR-2: GradingRow is the home of record for
  // suggestedSubmissionKind/submissionKindCue, so a live entry's reload seed
  // must read them BACK OFF the row - not default them the way a tombstone
  // (which has no row) does.
  it("a live entry's suggestedSubmissionKind/submissionKindCue travel with the row, not defaulted to unknown", () => {
    const row = { ...makeRow("r-1", "Alice", "alice text"), suggestedSubmissionKind: "reply" as const, submissionKindCue: "Replying to Bob" };
    const seeded = seedTrackedFromRows([row], [], "course-a", mintId);
    expect(seeded[0]).toEqual({
      name: "Alice",
      text: "alice text",
      suggestedSubmissionKind: "reply",
      submissionKindCue: "Replying to Bob",
      rowId: "r-1",
      dismissed: false,
    });
  });

  it("a tombstone entry (no row to read from) always seeds as unknown/empty, never resurrecting a guess", () => {
    const dismissed: DismissedSubmission[] = [{ name: "Carol", text: "carol text", course: "course-a" }];
    const seeded = seedTrackedFromRows([], dismissed, "course-a", mintId);
    expect(seeded[0].suggestedSubmissionKind).toBe("unknown");
    expect(seeded[0].submissionKindCue).toBe("");
  });

  it("course A -> B -> A: course A's seed is byte-identical both times", () => {
    const rowsA = [makeRow("r-1", "Alice", "alice text")];
    const dismissedA: DismissedSubmission[] = [{ name: "Zed", text: "zed text", course: "course-a" }];
    idCounter = 0;
    const first = seedTrackedFromRows(rowsA, dismissedA, "course-a", mintId);
    idCounter = 0;
    const second = seedTrackedFromRows(rowsA, dismissedA, "course-a", mintId);
    expect(second).toEqual(first);
  });
});

describe("readDismissed / persistDismissedForCourse - I/O, course-scoped read-modify-write", () => {
  it("readDismissed returns [] with no window (guard short-circuits honestly, not vacuously - see the describe below that removes the stub)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readDismissed()).toEqual([]);
  });

  it("persists this course's entries without disturbing another course's", () => {
    // Callers always pass entries already tagged via projectDismissed - the
    // `course` field mirrors the `courseScope` argument, exactly like every
    // production caller (commitDismissal/commitCaptureAdvance) does.
    persistDismissedForCourse([{ name: "Alice", text: "a", course: "course-a" }], "course-a");
    persistDismissedForCourse([{ name: "Bob", text: "b", course: "course-b" }], "course-b");
    const whole = readDismissed();
    expect(whole).toHaveLength(2);
    expect(whole.find((e) => e.name === "Alice")?.course).toBe("course-a");
    expect(whole.find((e) => e.name === "Bob")?.course).toBe("course-b");
  });

  it("re-persisting course A's own (possibly empty) set leaves every course-B entry byte-identical", () => {
    persistDismissedForCourse([{ name: "Bob", text: "b", course: "course-b" }], "course-b");
    const beforeB = readDismissed().filter((e) => e.course === "course-b");
    persistDismissedForCourse([{ name: "Alice", text: "a" }], "course-a");
    persistDismissedForCourse([], "course-a"); // clears course A - this is the "clear" shape
    const afterB = readDismissed().filter((e) => e.course === "course-b");
    expect(afterB).toEqual(beforeB);
    expect(readDismissed().some((e) => e.course === "course-a")).toBe(false);
  });

  it("never resets the whole key to an empty array - it is a read-modify-write, not a flat write", () => {
    persistDismissedForCourse([{ name: "Bob", text: "b", course: "course-b" }], "course-b");
    persistDismissedForCourse([], "course-a"); // course A had nothing; must not erase course B
    expect(readDismissed()).toEqual([{ name: "Bob", text: "b", course: "course-b" }]);
  });

  it("quota fallback drops the OLDEST entry of THIS COURSE, one at a time, never truncates text, never drops another course's entry", () => {
    persistDismissedForCourse([{ name: "Zed", text: "zed", course: "course-b" }], "course-b");
    fakeStorage.throwFor = 1; // first attempt (both entries) fails, retry with one dropped succeeds
    const entries: DismissedSubmission[] = [
      { name: "Alice", text: "alice full text", course: "course-a" },
      { name: "Bob", text: "bob full text", course: "course-a" },
    ];
    const dropped = persistDismissedForCourse(entries, "course-a");
    expect(dropped).toBe(1);
    const stored = readDismissed();
    expect(stored.find((e) => e.name === "Alice")).toBeUndefined(); // oldest dropped
    const bob = stored.find((e) => e.name === "Bob");
    expect(bob?.text).toBe("bob full text"); // never truncated
    expect(stored.find((e) => e.course === "course-b")?.text).toBe("zed"); // untouched
  });

  it("returns -1 if even the other-courses-only write fails", () => {
    fakeStorage.throwFor = -1;
    const dropped = persistDismissedForCourse([{ name: "Alice", text: "a" }], "course-a");
    expect(dropped).toBe(-1);
  });
});

describe("commitDismissal - dismiss and persist in one call", () => {
  it("the stored value carries the dismissal immediately", () => {
    const tracked = [makeTracked("Alice", "alice text", "r-1")];
    const { tracked: next } = commitDismissal(tracked, "r-1", "course-a");
    expect(next[0].dismissed).toBe(true);
    expect(readDismissed()).toEqual([{ name: "Alice", text: "alice text", course: "course-a" }]);
  });
});

describe("commitCaptureAdvance - rows committed before the tombstone projection is persisted", () => {
  it("persists on EVERY advance, and the stored text grows as an entry absorbs a continuation", () => {
    const callOrder: string[] = [];
    const originalSetItem = fakeStorage.setItem.bind(fakeStorage);
    fakeStorage.setItem = (key: string, value: string) => {
      callOrder.push("localStorage.setItem");
      originalSetItem(key, value);
    };
    const commitRows = () => {
      callOrder.push("commitRows");
    };

    let tracked: TrackedSubmission[] = [];
    let rows: GradingRow[] = [];

    // Batch 1: a fresh submission, then dismiss it.
    const first = commitCaptureAdvance(
      { tracked, rows, incoming: [{ name: "Alice", text: "top of the essay", suggestedSubmissionKind: "unknown", submissionKindCue: "" }], courseScope: "course-a", mintId },
      (r) => {
        rows = r;
        commitRows();
      }
    );
    tracked = first.tracked;
    const dismissResult = commitDismissal(tracked, tracked[0].rowId, "course-a");
    tracked = dismissResult.tracked;
    rows = []; // the panel would call gradingRows.removeRow, which drops the row

    // Batch 2: the same student's text continues - must still be absorbed
    // (it stays a tombstone; no row appears).
    callOrder.length = 0;
    const second = commitCaptureAdvance(
      {
        tracked,
        rows,
        incoming: [{ name: "Alice", text: "top of the essay, continuing into more of the same paragraph right here", suggestedSubmissionKind: "unknown", submissionKindCue: "" }],
        courseScope: "course-a",
        mintId,
      },
      (r) => {
        rows = r;
        commitRows();
      }
    );
    tracked = second.tracked;

    expect(rows).toEqual([]); // still no row - the dismissal held
    expect(callOrder).toEqual(["commitRows", "localStorage.setItem"]); // rows committed BEFORE the persist
    const stored = readDismissed();
    expect(stored).toHaveLength(1);
    expect(stored[0].text.length).toBeGreaterThan("top of the essay".length); // grew
  });
});

describe("commitTrackingReset - Clear table's reset, both halves (RULING 1/2, AC-A9-7)", () => {
  it("clears this course's stored tombstones and returns []", () => {
    persistDismissedForCourse([{ name: "Alice", text: "a", course: "course-a" }], "course-a");
    persistDismissedForCourse([{ name: "Bob", text: "b", course: "course-b" }], "course-b");
    const next = commitTrackingReset("course-a");
    expect(next).toEqual([]);
    const whole = readDismissed();
    expect(whole.some((e) => e.course === "course-a")).toBe(false);
    expect(whole.some((e) => e.course === "course-b")).toBe(true); // another course's set survives
  });

  it("a student re-read after the clear gets a row again, and nothing re-persists a tombstone", () => {
    persistDismissedForCourse([{ name: "Alice", text: "alice text", course: "course-a" }], "course-a");
    const trackedAfterReset = commitTrackingReset("course-a");
    let rows: GradingRow[] = [];
    const advance = commitCaptureAdvance(
      { tracked: trackedAfterReset, rows, incoming: [{ name: "Alice", text: "alice text", suggestedSubmissionKind: "unknown", submissionKindCue: "" }], courseScope: "course-a", mintId },
      (r) => {
        rows = r;
      }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].studentName).toBe("Alice");
    expect(readDismissed().some((e) => e.course === "course-a")).toBe(false);
    expect(advance.tracked.some((e) => e.dismissed)).toBe(false);
  });
});

describe("composeRemoveHandler / composeClearHandler - wiring composers, executable", () => {
  it("composeRemoveHandler calls recordDismissal BEFORE removeRow, both once, both with the same id", () => {
    const order: string[] = [];
    const removeRow = (id: string) => order.push(`removeRow:${id}`);
    const recordDismissal = (id: string) => order.push(`recordDismissal:${id}`);
    composeRemoveHandler(removeRow, recordDismissal)("row-7");
    expect(order).toEqual(["recordDismissal:row-7", "removeRow:row-7"]);
  });

  it("composeClearHandler calls both clearTable and resetTracking, exactly once each", () => {
    let clearCalls = 0;
    let resetCalls = 0;
    composeClearHandler(
      () => {
        clearCalls += 1;
      },
      () => {
        resetCalls += 1;
      }
    )();
    expect(clearCalls).toBe(1);
    expect(resetCalls).toBe(1);
  });
});

describe("TOMBSTONE_STORAGE_KEY", () => {
  it("is the exact literal expected by the grading-rows.test.ts key canary", () => {
    expect(TOMBSTONE_STORAGE_KEY).toBe("ta-rec-grade-dismissed");
  });
});
