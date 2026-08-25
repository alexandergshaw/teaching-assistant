// Tests for rubric-run-log.ts - the downloadable "Generate & associate
// rubric" run log (docs/rubric-bulk-log-acceptance-criteria.md). Every
// function under test is pure and takes its timestamp as a parameter, so
// nothing here stubs a clock or asserts around "now" - matching
// repoGradesLog.test.ts's identical reasoning (entry 333) for the same shape
// of problem.
import { describe, expect, it } from "vitest";
import type { OrphanRubric, RubricTargetOutcome } from "@/app/actions/rubric-bulk";
import {
  appendRubricRunLogEntries,
  buildRubricRunLogEntries,
  formatRubricRunLogCsv,
  formatRubricRunLogJson,
  MAX_RUBRIC_RUN_LOG_ENTRIES,
  parseRubricRunLogEntries,
  recentRubricRunLogEntries,
  rubricRunLogFileName,
  summarizeRubricRunLog,
  type RubricRunLogEntry,
} from "./rubric-run-log";

function entry(overrides: Partial<RubricRunLogEntry> = {}): RubricRunLogEntry {
  return {
    at: "2026-08-24T15:04:05.123Z",
    kind: "target-updated",
    itemId: "1:9001",
    reason: "",
    rubricId: "42",
    rubricTitle: "Generated Rubric (100 pts)",
    pointsPossible: "100",
    attemptedItemIds: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildRubricRunLogEntries - B1.2: built from the SAME outcomes/orphans
// summarizeRubricGenerateOutcomes consumes, B1.3/B1.4's distinctions.

describe("buildRubricRunLogEntries", () => {
  const AT = "2026-08-24T15:04:05.123Z";

  it("B1.1: turns an 'updated' outcome into a target-updated entry carrying the rubric id, title and points", () => {
    const outcomes: RubricTargetOutcome[] = [
      { itemId: "1:9001", status: "updated", rubricId: 42, rubricTitle: "Generated Rubric (100 pts)", pointsPossible: 100 },
    ];
    const entries = buildRubricRunLogEntries(outcomes, [], {}, AT);
    expect(entries).toEqual([
      entry({ at: AT, kind: "target-updated", itemId: "1:9001", rubricId: "42", rubricTitle: "Generated Rubric (100 pts)", pointsPossible: "100" }),
    ]);
  });

  it("B1.1: turns a 'skipped' outcome into a target-skipped entry carrying the raw skip reason, unchanged", () => {
    const outcomes: RubricTargetOutcome[] = [
      { itemId: "1:9002", status: "skipped", reason: "already-has-rubric", existingRubricId: 7 },
      { itemId: "1:9003", status: "skipped", reason: "ineligible-kind" },
    ];
    const entries = buildRubricRunLogEntries(outcomes, [], {}, AT);
    expect(entries).toEqual([
      entry({ at: AT, kind: "target-skipped", itemId: "1:9002", reason: "already-has-rubric", rubricId: "7", rubricTitle: "", pointsPossible: "" }),
      entry({ at: AT, kind: "target-skipped", itemId: "1:9003", reason: "ineligible-kind", rubricId: "", rubricTitle: "", pointsPossible: "" }),
    ]);
  });

  it("B1.3: every orphan rubric appears by id, with its title, points, and every item its association attempt was made against", () => {
    const orphans: OrphanRubric[] = [
      { rubricId: 9, rubricTitle: "Generated Rubric (10 pts)", pointsPossible: 10, attemptedItemIds: ["1:9001", "1:9002"] },
    ];
    const entries = buildRubricRunLogEntries([], orphans, {}, AT);
    expect(entries).toEqual([
      entry({
        at: AT,
        kind: "orphan",
        itemId: "",
        reason: "",
        rubricId: "9",
        rubricTitle: "Generated Rubric (10 pts)",
        pointsPossible: "10",
        attemptedItemIds: "1:9001; 1:9002",
      }),
    ]);
  });

  // B1.4/B2 THE AUTOMATED SABOTAGE CHECK. Three kinds entry 332 fought to
  // keep distinct - a whole-action error (no attempt at all), a generation
  // failure (no Canvas write attempted, eligibility unknown), and a per-item
  // failure (a Canvas write WAS attempted for that one item) - each gets its
  // own `kind`, one entry apiece here, and none is a re-derivation of the
  // report's counts: every field below is read straight off the SAME inputs
  // `summarizeRubricGenerateOutcomes` itself would receive at this call site.
  describe("B1.4: the three failure kinds stay distinct, each proven with a paired positive", () => {
    it("a whole-action error produces exactly one run-error entry and no generation-failed or target-failed entry", () => {
      const entries = buildRubricRunLogEntries([], [], { actionError: "not signed in" }, AT);
      expect(entries).toEqual([entry({ at: AT, kind: "run-error", reason: "not signed in", itemId: "", rubricId: "", rubricTitle: "", pointsPossible: "" })]);
      expect(entries.some((e) => e.kind === "generation-failed")).toBe(false);
      expect(entries.some((e) => e.kind === "target-failed")).toBe(false);
    });

    it("PAIRED POSITIVE: no run-error entry is produced when actionError is absent", () => {
      const entries = buildRubricRunLogEntries([], [], {}, AT);
      expect(entries.some((e) => e.kind === "run-error")).toBe(false);
    });

    it("a generation failure produces exactly one generation-failed entry and no run-error or target-failed entry", () => {
      const entries = buildRubricRunLogEntries([], [], { generationFailedReason: "model timed out" }, AT);
      expect(entries).toEqual([
        entry({ at: AT, kind: "generation-failed", reason: "model timed out", itemId: "", rubricId: "", rubricTitle: "", pointsPossible: "" }),
      ]);
      expect(entries.some((e) => e.kind === "run-error")).toBe(false);
      expect(entries.some((e) => e.kind === "target-failed")).toBe(false);
    });

    it("PAIRED POSITIVE: no generation-failed entry is produced when generationFailedReason is absent", () => {
      const entries = buildRubricRunLogEntries([], [], {}, AT);
      expect(entries.some((e) => e.kind === "generation-failed")).toBe(false);
    });

    it("a per-item failure (a Canvas write was attempted for that one item) produces exactly one target-failed entry and no run-error or generation-failed entry", () => {
      const outcomes: RubricTargetOutcome[] = [{ itemId: "1:9004", status: "failed", reason: "Canvas timed out" }];
      const entries = buildRubricRunLogEntries(outcomes, [], {}, AT);
      expect(entries).toEqual([entry({ at: AT, kind: "target-failed", itemId: "1:9004", reason: "Canvas timed out", rubricId: "", rubricTitle: "", pointsPossible: "" })]);
      expect(entries.some((e) => e.kind === "run-error")).toBe(false);
      expect(entries.some((e) => e.kind === "generation-failed")).toBe(false);
    });

    it("PAIRED POSITIVE: no target-failed entry is produced when no outcome has status 'failed'", () => {
      const outcomes: RubricTargetOutcome[] = [{ itemId: "1:9005", status: "updated", rubricId: 1, rubricTitle: "R", pointsPossible: 10 }];
      const entries = buildRubricRunLogEntries(outcomes, [], {}, AT);
      expect(entries.some((e) => e.kind === "target-failed")).toBe(false);
    });

    // All three kinds can appear in the SAME run (a run-level generation
    // failure alongside detail-fetch failures that are reported as their own
    // "failed" outcomes before generation was even attempted) - proving the
    // three are simultaneously representable, not merely mutually exclusive.
    it("all three failure kinds coexist in one log without merging when a run produces all of them", () => {
      const outcomes: RubricTargetOutcome[] = [{ itemId: "1:9006", status: "failed", reason: "detail fetch failed" }];
      const entries = buildRubricRunLogEntries(outcomes, [], { generationFailedReason: "model timed out" }, AT);
      const kinds = entries.map((e) => e.kind).sort();
      expect(kinds).toEqual(["generation-failed", "target-failed"]);
    });
  });

  it("combines run-level, per-target and orphan entries from one mixed input, all under the same timestamp", () => {
    const outcomes: RubricTargetOutcome[] = [
      { itemId: "a", status: "updated", rubricId: 1, rubricTitle: "R100", pointsPossible: 100 },
      { itemId: "b", status: "skipped", reason: "new-quiz" },
      { itemId: "c", status: "failed", reason: "Canvas 500" },
    ];
    const orphans: OrphanRubric[] = [{ rubricId: 2, rubricTitle: "R50", pointsPossible: 50, attemptedItemIds: ["d"] }];
    const entries = buildRubricRunLogEntries(outcomes, orphans, {}, AT);
    expect(entries.map((e) => e.kind)).toEqual(["target-updated", "target-skipped", "target-failed", "orphan"]);
    expect(entries.every((e) => e.at === AT)).toBe(true);
  });

  it("returns [] for an empty run with no run-level failure", () => {
    expect(buildRubricRunLogEntries([], [], {}, AT)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// appendRubricRunLogEntries - append across runs, cap dropping the OLDEST.

describe("appendRubricRunLogEntries", () => {
  it("appends in oldest-first order without mutating the input", () => {
    const original = [entry({ itemId: "a" })];
    const frozen = Object.freeze(original.slice());
    const next = appendRubricRunLogEntries(frozen, [entry({ itemId: "b" })]);
    expect(next.map((e) => e.itemId)).toEqual(["a", "b"]);
    expect(original.map((e) => e.itemId)).toEqual(["a"]);
  });

  it("returns a copy (not the same reference) when there is nothing to append", () => {
    const original = [entry()];
    const next = appendRubricRunLogEntries(original, []);
    expect(next).toEqual(original);
    expect(next).not.toBe(original);
  });

  // B2 item 6: a second run must not erase the first - the first run's
  // orphans are still uncleaned - so appending, never replacing, is the only
  // correct mutator; this is that property, directly.
  it("a second run's entries are appended alongside the first run's, not in place of them", () => {
    const runOne = [entry({ itemId: "run1-a" }), entry({ kind: "orphan", itemId: "", rubricId: "9" })];
    const runTwo = [entry({ itemId: "run2-a" })];
    const next = appendRubricRunLogEntries(runOne, runTwo);
    expect(next.map((e) => e.itemId || `orphan:${e.rubricId}`)).toEqual(["run1-a", "orphan:9", "run2-a"]);
  });

  // The direction of the trim is the whole point - dropping the NEWEST would
  // make the log go quiet during the long session that filled it. Sabotaged
  // by hand (slice(0, MAX) in place of slice(length - MAX)) and confirmed red
  // before landing this assertion.
  it("drops the OLDEST entries, never the newest, once past the cap", () => {
    const full = Array.from({ length: MAX_RUBRIC_RUN_LOG_ENTRIES }, (_, i) => entry({ itemId: `item-${i}` }));
    const next = appendRubricRunLogEntries(full, [entry({ itemId: "newest" })]);
    expect(next).toHaveLength(MAX_RUBRIC_RUN_LOG_ENTRIES);
    expect(next[next.length - 1].itemId).toBe("newest");
    expect(next[0].itemId).toBe("item-1");
    expect(next.some((e) => e.itemId === "item-0")).toBe(false);
  });

  it("caps correctly when a single append is itself larger than the cap", () => {
    const many = Array.from({ length: MAX_RUBRIC_RUN_LOG_ENTRIES + 10 }, (_, i) => entry({ itemId: `r-${i}` }));
    const next = appendRubricRunLogEntries([entry({ itemId: "pre-existing" })], many);
    expect(next).toHaveLength(MAX_RUBRIC_RUN_LOG_ENTRIES);
    expect(next.some((e) => e.itemId === "pre-existing")).toBe(false);
    expect(next[next.length - 1].itemId).toBe(`r-${MAX_RUBRIC_RUN_LOG_ENTRIES + 9}`);
  });
});

// ---------------------------------------------------------------------------
// parseRubricRunLogEntries - validate on read; a malformed blob degrades to
// fewer entries, never a crash (B2).

describe("parseRubricRunLogEntries", () => {
  it("round-trips a valid stored array", () => {
    const stored = [entry({ itemId: "a" }), entry({ itemId: "b", kind: "target-failed", reason: "boom" })];
    expect(parseRubricRunLogEntries(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it("returns [] for anything that is not an array", () => {
    expect(parseRubricRunLogEntries(undefined)).toEqual([]);
    expect(parseRubricRunLogEntries(null)).toEqual([]);
    expect(parseRubricRunLogEntries("[]")).toEqual([]);
    expect(parseRubricRunLogEntries({ entries: [] })).toEqual([]);
  });

  it("drops entries with an unknown kind, a missing field, or a mistyped field, keeping the good ones", () => {
    const good = entry({ itemId: "keep" });
    const missingField = { ...entry({ itemId: "drop-1" }) } as Record<string, unknown>;
    delete missingField.reason;
    const mistyped = { ...entry({ itemId: "drop-2" }), pointsPossible: 100 };
    const unknownKind = { ...entry({ itemId: "drop-3" }), kind: "who-knows" };
    const parsed = parseRubricRunLogEntries([good, missingField, mistyped, unknownKind, null, "nope", 7]);
    expect(parsed).toEqual([good]);
  });

  it("applies the cap to a hand-edited oversized blob, keeping the newest", () => {
    const huge = Array.from({ length: MAX_RUBRIC_RUN_LOG_ENTRIES + 5 }, (_, i) => entry({ itemId: `r-${i}` }));
    const parsed = parseRubricRunLogEntries(huge);
    expect(parsed).toHaveLength(MAX_RUBRIC_RUN_LOG_ENTRIES);
    expect(parsed[parsed.length - 1].itemId).toBe(`r-${MAX_RUBRIC_RUN_LOG_ENTRIES + 4}`);
  });
});

// ---------------------------------------------------------------------------
// summarizeRubricRunLog

describe("summarizeRubricRunLog", () => {
  it("counts updated, skipped, orphans, and merges all three failure kinds into one 'failed' count for the panel's own display", () => {
    const kinds: RubricRunLogEntry["kind"][] = [
      "target-updated",
      "target-updated",
      "target-skipped",
      "run-error",
      "generation-failed",
      "target-failed",
      "orphan",
    ];
    expect(summarizeRubricRunLog(kinds.map((kind) => entry({ kind })))).toEqual({
      total: 7,
      updated: 2,
      skipped: 1,
      failed: 3,
      orphans: 1,
    });
  });

  it("reports all zeroes for an empty log", () => {
    expect(summarizeRubricRunLog([])).toEqual({ total: 0, updated: 0, skipped: 0, failed: 0, orphans: 0 });
  });
});

// ---------------------------------------------------------------------------
// recentRubricRunLogEntries

describe("recentRubricRunLogEntries", () => {
  const log = ["a", "b", "c", "d"].map((itemId) => entry({ itemId }));

  it("returns the last N NEWEST FIRST", () => {
    expect(recentRubricRunLogEntries(log, 2).map((e) => e.itemId)).toEqual(["d", "c"]);
  });

  it("returns the whole log (newest first) when it is shorter than N", () => {
    expect(recentRubricRunLogEntries(log, 10).map((e) => e.itemId)).toEqual(["d", "c", "b", "a"]);
  });

  it("returns [] for a non-positive count and never mutates the input", () => {
    expect(recentRubricRunLogEntries(log, 0)).toEqual([]);
    expect(log.map((e) => e.itemId)).toEqual(["a", "b", "c", "d"]);
  });
});

// ---------------------------------------------------------------------------
// formatRubricRunLogCsv - B3 item 7: escapeCsvValue, never a hand-rolled
// escaper. A rubric criterion description (and therefore a failure reason
// quoting one) routinely contains a comma, a quote AND a newline.

describe("formatRubricRunLogCsv", () => {
  it("emits the header row even for an empty log", () => {
    expect(formatRubricRunLogCsv([])).toBe("Time,Event,Item,Reason,Rubric ID,Rubric title,Points,Attempted items");
  });

  it("emits one row per entry, oldest first, with the human event label", () => {
    const csv = formatRubricRunLogCsv([
      entry({ at: "2026-08-24T15:04:05.123Z", kind: "target-updated", itemId: "1:1", rubricId: "1", rubricTitle: "R100", pointsPossible: "100" }),
      entry({ at: "2026-08-24T15:05:00.000Z", kind: "target-skipped", itemId: "1:2", reason: "already-has-rubric", rubricId: "9", rubricTitle: "", pointsPossible: "" }),
    ]);
    expect(csv.split("\r\n")).toEqual([
      "Time,Event,Item,Reason,Rubric ID,Rubric title,Points,Attempted items",
      "2026-08-24T15:04:05.123Z,Rubric associated,1:1,,1,R100,100,",
      "2026-08-24T15:05:00.000Z,Skipped,1:2,already-has-rubric,9,,,",
    ]);
  });

  // A criterion description containing all three hazards at once - the
  // scenario this test's own brief calls out by name.
  it("escapes a reason containing a comma, a quote AND a newline, all at once", () => {
    const csv = formatRubricRunLogCsv([
      entry({
        kind: "target-failed",
        itemId: "1:3",
        reason: 'Rubric said: "needs, commas", and\na newline',
        rubricId: "",
        rubricTitle: "",
        pointsPossible: "",
      }),
    ]);
    const dataRow = csv.split("\r\n")[1];
    expect(dataRow).toContain('"Rubric said: ""needs, commas"", and\na newline"');
    // The escaped field must not introduce a bare comma that splits the row.
    expect(dataRow.startsWith("2026-08-24T15:04:05.123Z,Item failed,1:3,\"")).toBe(true);
    expect(dataRow.endsWith(",,,")).toBe(true);
  });

  it("escapes an orphan's attempted item ids and title the same way as any other field", () => {
    const csv = formatRubricRunLogCsv([
      entry({ kind: "orphan", rubricId: "9", rubricTitle: 'Rubric, "generated"', pointsPossible: "50", attemptedItemIds: "1:1; 1:2" }),
    ]);
    const dataRow = csv.split("\r\n")[1];
    expect(dataRow).toContain('"Rubric, ""generated"""');
    expect(dataRow).toContain("1:1; 1:2");
  });
});

// ---------------------------------------------------------------------------
// formatRubricRunLogJson

describe("formatRubricRunLogJson", () => {
  it("wraps the entries in an object carrying the export metadata and the count", () => {
    const log = [entry({ itemId: "a" })];
    const parsed = JSON.parse(formatRubricRunLogJson(log, { exportedAt: "2026-08-24T16:00:00.000Z" }));
    expect(parsed).toEqual({ exportedAt: "2026-08-24T16:00:00.000Z", entryCount: 1, entries: log });
  });

  it("is an object, never a bare array, even when the log is empty", () => {
    const parsed = JSON.parse(formatRubricRunLogJson([], { exportedAt: "x" }));
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.entryCount).toBe(0);
    expect(parsed.entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// rubricRunLogFileName

describe("rubricRunLogFileName", () => {
  it("stamps the date and time and uses the extension it is given", () => {
    expect(rubricRunLogFileName("csv", "2026-08-24T15:04:05.123Z")).toBe("rubric-run-log-20260824-150405.csv");
    expect(rubricRunLogFileName("json", "2026-08-24T15:04:05.123Z")).toBe("rubric-run-log-20260824-150405.json");
  });

  it("never emits a character that is illegal in a Windows filename", () => {
    const name = rubricRunLogFileName("csv", "2026-08-24T15:04:05.123Z");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("falls back to a sanitised stamp for an unparseable timestamp", () => {
    const name = rubricRunLogFileName("csv", "not a date");
    expect(name).toBe("rubric-run-log-not-a-date.csv");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});
