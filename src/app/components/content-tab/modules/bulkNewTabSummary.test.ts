// docs/bulk-open-in-new-tab-acceptance-criteria.md - tests for the pure
// reporting core of the "set open-in-a-new-tab" bulk control. See
// ./bulkNewTabSummary.ts's own header for why this lives in its own leaf
// module (vitest here is node-env and renders no component - see this
// repo's own "vitest is node-env... no component is ever rendered" note,
// e.g. useCarryModulePattern.test.ts's identical header) and why the
// ineligible/failed/unchanged distinction is the whole point of this file.
//
// AC5/AC6's core claim is that "skipped" (cannot take this setting) and
// "failed" (Canvas write attempted and rejected) must never collapse into
// one bucket - a report that merges them makes a successful run (mostly
// ineligible items, nothing actually wrong) look broken. Tests below assert
// on COUNTS and on the FACT that the two stay in separate clauses of the
// run note, not on the note's exact wording, so a future rewording does not
// force a contorted implementation (this repo's own "source-text tests
// over-specify" lesson).
import { describe, it, expect } from "vitest";
import {
  isEligibleForNewTab,
  classifyNewTabTarget,
  previewNewTabAction,
  describeNewTabOfferedAction,
  summarizeNewTabOutcomes,
  describeNewTabRunNote,
  EMPTY_NEW_TAB_REPORT,
  type NewTabSelectionItem,
  type NewTabTargetOutcome,
} from "./bulkNewTabSummary";

// ---------------------------------------------------------------------------
// isEligibleForNewTab

describe("isEligibleForNewTab", () => {
  it("is eligible for ExternalUrl and ExternalTool - the only two Canvas honours new_tab for", () => {
    expect(isEligibleForNewTab("ExternalUrl")).toBe(true);
    expect(isEligibleForNewTab("ExternalTool")).toBe(true);
  });

  it("is ineligible for every other module item kind", () => {
    for (const kind of ["Assignment", "Quiz", "Page", "Discussion", "File", "SubHeader"]) {
      expect(isEligibleForNewTab(kind)).toBe(false);
    }
  });

  // The survey's own "stale-documentation trap": the DB's content_type for an
  // LTI tool item is "ContextExternalTool", but the API's module-item `type`
  // this app actually reads is "ExternalTool". The predicate must test the
  // API spelling, not the DB spelling, or every real ExternalTool item would
  // be reported ineligible.
  it("tests the API's module-item type spelling, not the DB's content_type spelling", () => {
    expect(isEligibleForNewTab("ExternalTool")).toBe(true);
    expect(isEligibleForNewTab("ContextExternalTool")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyNewTabTarget

describe("classifyNewTabTarget", () => {
  it("skips an ineligible kind, naming the actual type", () => {
    const decision = classifyNewTabTarget({ itemId: "i1", kind: "Assignment", currentNewTab: null }, true);
    expect(decision).toEqual({
      shouldWrite: false,
      outcome: { itemId: "i1", status: "skipped", reason: "ineligible-kind", kind: "Assignment" },
    });
  });

  it("reports unchanged when an eligible item already holds the requested value (true)", () => {
    const decision = classifyNewTabTarget({ itemId: "i2", kind: "ExternalUrl", currentNewTab: true }, true);
    expect(decision).toEqual({ shouldWrite: false, outcome: { itemId: "i2", status: "unchanged", newTab: true } });
  });

  it("reports unchanged when an eligible item already holds the requested value (false)", () => {
    const decision = classifyNewTabTarget({ itemId: "i3", kind: "ExternalTool", currentNewTab: false }, false);
    expect(decision).toEqual({ shouldWrite: false, outcome: { itemId: "i3", status: "unchanged", newTab: false } });
  });

  it("says a write is needed when an eligible item's current value differs from the requested one", () => {
    const decision = classifyNewTabTarget({ itemId: "i4", kind: "ExternalUrl", currentNewTab: false }, true);
    expect(decision).toEqual({ shouldWrite: true });
  });

  it("says a write is needed when the current value is unknown (null) on an eligible item", () => {
    // An eligible item's currentNewTab should never actually be null in
    // practice (AC3 reads it for every ExternalUrl/ExternalTool item), but
    // this function must not silently treat "unknown" as "already correct".
    const decision = classifyNewTabTarget({ itemId: "i5", kind: "ExternalTool", currentNewTab: null }, true);
    expect(decision).toEqual({ shouldWrite: true });
  });
});

// ---------------------------------------------------------------------------
// previewNewTabAction / describeNewTabOfferedAction - AC1's pre-click count.

describe("previewNewTabAction", () => {
  it("counts a mixed selection: eligible, ineligible, and already-set", () => {
    const items: NewTabSelectionItem[] = [
      { itemId: "1", kind: "ExternalUrl", currentNewTab: false }, // would change
      { itemId: "2", kind: "ExternalTool", currentNewTab: true }, // already set
      { itemId: "3", kind: "Assignment", currentNewTab: null }, // ineligible
      { itemId: "4", kind: "Page", currentNewTab: null }, // ineligible
    ];
    const preview = previewNewTabAction(items, true);
    expect(preview).toEqual({ selectedCount: 4, eligibleCount: 2, alreadySetCount: 1, wouldChangeCount: 1 });
  });

  it("counts zero eligible when the selection has no ExternalUrl/ExternalTool items", () => {
    const items: NewTabSelectionItem[] = [
      { itemId: "1", kind: "Assignment", currentNewTab: null },
      { itemId: "2", kind: "Quiz", currentNewTab: null },
    ];
    expect(previewNewTabAction(items, true)).toEqual({
      selectedCount: 2,
      eligibleCount: 0,
      alreadySetCount: 0,
      wouldChangeCount: 0,
    });
  });

  it("counts an empty selection as all zero", () => {
    expect(previewNewTabAction([], true)).toEqual({
      selectedCount: 0,
      eligibleCount: 0,
      alreadySetCount: 0,
      wouldChangeCount: 0,
    });
  });
});

describe("describeNewTabOfferedAction", () => {
  it("is disabled, with its reason visible, when nothing in the selection is eligible", () => {
    const items: NewTabSelectionItem[] = [{ itemId: "1", kind: "Assignment", currentNewTab: null }];
    const result = describeNewTabOfferedAction(items, true);
    expect(result.enabled).toBe(false);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("states the number of items that would actually change, not merely the eligible count", () => {
    const items: NewTabSelectionItem[] = [
      { itemId: "1", kind: "ExternalUrl", currentNewTab: false }, // would change
      { itemId: "2", kind: "ExternalTool", currentNewTab: true }, // already set - would NOT change
      { itemId: "3", kind: "Assignment", currentNewTab: null }, // ineligible
    ];
    const result = describeNewTabOfferedAction(items, true);
    expect(result.enabled).toBe(true);
    expect(result.text).toContain("1");
    expect(result.text).toContain("3");
  });

  it("is enabled but says nothing would change when every eligible item already matches", () => {
    const items: NewTabSelectionItem[] = [
      { itemId: "1", kind: "ExternalUrl", currentNewTab: true },
      { itemId: "2", kind: "ExternalTool", currentNewTab: true },
    ];
    const result = describeNewTabOfferedAction(items, true);
    expect(result.enabled).toBe(true);
    expect(result.text).toContain("2");
  });
});

// ---------------------------------------------------------------------------
// summarizeNewTabOutcomes - the counters AC5/AC6 exist for.

describe("summarizeNewTabOutcomes", () => {
  it("returns the empty report for an empty outcome list", () => {
    expect(summarizeNewTabOutcomes([])).toEqual(EMPTY_NEW_TAB_REPORT);
  });

  it("counts an all-eligible, all-updated run", () => {
    const outcomes: NewTabTargetOutcome[] = [
      { itemId: "1", status: "updated", newTab: true },
      { itemId: "2", status: "updated", newTab: true },
    ];
    const report = summarizeNewTabOutcomes(outcomes);
    expect(report.updated).toBe(2);
    expect(report.unchanged).toBe(0);
    expect(report.ineligible).toBe(0);
    expect(report.failed).toBe(0);
  });

  it("counts an all-ineligible run (none eligible)", () => {
    const outcomes: NewTabTargetOutcome[] = [
      { itemId: "1", status: "skipped", reason: "ineligible-kind", kind: "Assignment" },
      { itemId: "2", status: "skipped", reason: "ineligible-kind", kind: "Page" },
    ];
    const report = summarizeNewTabOutcomes(outcomes);
    expect(report.updated).toBe(0);
    expect(report.ineligible).toBe(2);
    expect(report.failed).toBe(0);
  });

  it("counts a mixed selection: updated, unchanged, ineligible, and failed together", () => {
    const outcomes: NewTabTargetOutcome[] = [
      { itemId: "1", status: "updated", newTab: true },
      { itemId: "2", status: "unchanged", newTab: true },
      { itemId: "3", status: "skipped", reason: "ineligible-kind", kind: "Assignment" },
      { itemId: "4", status: "skipped", reason: "ineligible-kind", kind: "Page" },
      { itemId: "5", status: "failed", reason: "Canvas returned 403" },
    ];
    const report = summarizeNewTabOutcomes(outcomes);
    expect(report.updated).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(report.ineligible).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.failures).toEqual([{ itemId: "5", reason: "Canvas returned 403" }]);
  });

  it("counts a run where every item already had the requested value (a harmless re-run)", () => {
    const outcomes: NewTabTargetOutcome[] = [
      { itemId: "1", status: "unchanged", newTab: true },
      { itemId: "2", status: "unchanged", newTab: true },
      { itemId: "3", status: "unchanged", newTab: true },
    ];
    const report = summarizeNewTabOutcomes(outcomes);
    expect(report.updated).toBe(0);
    expect(report.unchanged).toBe(3);
    expect(report.ineligible).toBe(0);
    expect(report.failed).toBe(0);
  });

  it("carries a partial failure's real reason through, never discarding it", () => {
    const outcomes: NewTabTargetOutcome[] = [
      { itemId: "1", status: "updated", newTab: true },
      { itemId: "2", status: "failed", reason: "Canvas timed out after 30s" },
    ];
    const report = summarizeNewTabOutcomes(outcomes);
    expect(report.failed).toBe(1);
    expect(report.failures).toEqual([{ itemId: "2", reason: "Canvas timed out after 30s" }]);
  });
});

// ---------------------------------------------------------------------------
// describeNewTabRunNote - the copy. Facts pinned, not exact wording.

describe("describeNewTabRunNote", () => {
  it("is a success with no ineligible/failed clauses when everything eligible was updated", () => {
    const report = summarizeNewTabOutcomes([
      { itemId: "1", status: "updated", newTab: true },
      { itemId: "2", status: "updated", newTab: true },
    ]);
    const note = describeNewTabRunNote(report, true);
    expect(note.kind).toBe("success");
    expect(note.text).toContain("2");
    expect(note.text).not.toContain("cannot take this setting");
    expect(note.text).not.toContain("failed");
  });

  // This is the exact scenario this chunk's brief argues about: "Set 3 of 11
  // selected items to open in a new tab; 8 cannot take this setting" is a
  // different, TRUE message from "3 done, 8 failed". Assert the facts that
  // make it true, not the literal sentence.
  it("keeps 'skipped' (ineligible) and 'failed' in separate clauses on a mixed run", () => {
    const report = summarizeNewTabOutcomes([
      { itemId: "1", status: "updated", newTab: true },
      { itemId: "2", status: "updated", newTab: true },
      { itemId: "3", status: "updated", newTab: true },
      { itemId: "4", status: "skipped", reason: "ineligible-kind", kind: "Assignment" },
      { itemId: "5", status: "skipped", reason: "ineligible-kind", kind: "Page" },
      { itemId: "6", status: "skipped", reason: "ineligible-kind", kind: "Quiz" },
      { itemId: "7", status: "skipped", reason: "ineligible-kind", kind: "Discussion" },
      { itemId: "8", status: "skipped", reason: "ineligible-kind", kind: "File" },
      { itemId: "9", status: "skipped", reason: "ineligible-kind", kind: "SubHeader" },
      { itemId: "10", status: "skipped", reason: "ineligible-kind", kind: "Assignment" },
      { itemId: "11", status: "skipped", reason: "ineligible-kind", kind: "Assignment" },
    ]);
    expect(report.updated).toBe(3);
    expect(report.ineligible).toBe(8);
    expect(report.failed).toBe(0);

    const note = describeNewTabRunNote(report, true);
    expect(note.kind).toBe("success"); // ineligible items alone do not make a run look broken
    expect(note.text).toContain("3");
    expect(note.text).toContain("11");
    expect(note.text).toContain("8");
    expect(note.text).toContain("cannot take this setting");
    expect(note.text).not.toContain("failed");

    const clauses = note.text.split(";").map((c) => c.trim());
    const ineligibleClause = clauses.find((c) => c.includes("cannot take this setting"));
    expect(ineligibleClause).toBeDefined();
    // The clause naming "cannot take this setting" must not also be the one
    // reporting failures - conflating the two into one clause is exactly the
    // regression this test (and the sabotage check on summarizeNewTabOutcomes)
    // exists to catch.
    expect(ineligibleClause).not.toContain("failed");
  });

  it("reports a run where every eligible item already had the value as neither done nor failed", () => {
    const report = summarizeNewTabOutcomes([
      { itemId: "1", status: "unchanged", newTab: true },
      { itemId: "2", status: "unchanged", newTab: true },
    ]);
    const note = describeNewTabRunNote(report, true);
    expect(note.kind).toBe("success");
    expect(note.text).toContain("already");
    expect(note.text).not.toContain("failed");
    expect(note.text).not.toContain("cannot take this setting");
  });

  it("keeps 'failed' and 'cannot take this setting' in separate clauses, and reports failed as an error, when a partial failure carries a real reason", () => {
    const report = summarizeNewTabOutcomes([
      { itemId: "1", status: "updated", newTab: true },
      { itemId: "2", status: "skipped", reason: "ineligible-kind", kind: "Assignment" },
      { itemId: "3", status: "failed", reason: "Canvas returned 500" },
    ]);
    expect(report.failures).toEqual([{ itemId: "3", reason: "Canvas returned 500" }]);

    const note = describeNewTabRunNote(report, true);
    expect(note.kind).toBe("error");
    expect(note.text).toContain("cannot take this setting");
    expect(note.text).toContain("failed");

    const clauses = note.text.split(";").map((c) => c.trim());
    const ineligibleClause = clauses.find((c) => c.includes("cannot take this setting"));
    const failedClause = clauses.find((c) => c.includes("failed"));
    expect(ineligibleClause).toBeDefined();
    expect(failedClause).toBeDefined();
    expect(ineligibleClause).not.toBe(failedClause);
    expect(ineligibleClause).not.toContain("failed");
  });

  it("handles an empty run without throwing, and reports success", () => {
    const report = summarizeNewTabOutcomes([]);
    const note = describeNewTabRunNote(report, true);
    expect(note.kind).toBe("success");
    expect(note.text).toContain("0");
  });

  it("describes the 'open in the same tab' direction distinctly from 'open in a new tab'", () => {
    const report = summarizeNewTabOutcomes([{ itemId: "1", status: "updated", newTab: false }]);
    const sameTabNote = describeNewTabRunNote(report, false);
    const newTabNote = describeNewTabRunNote(report, true);
    expect(sameTabNote.text).not.toBe(newTabNote.text);
  });
});
