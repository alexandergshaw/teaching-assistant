// Frozen-literal tests for bulkConfirmDecision.ts - specifically BLOCKER 1
// from the Tasks-tab UX audit: Ctrl+D fill-down used to skip the confirm
// dialog entirely whenever every target cell was still "open" (exactly the
// start-of-term case), because the old rule only counted a target as
// requiring confirmation when it already held a meaningful, non-open value.
import { describe, expect, it } from "vitest";
import type { TaskCell as TaskCellValue } from "@/lib/course-tasks";
import {
  buildColumnBulkMessage,
  buildColumnBulkOutcome,
  buildFillDownMessage,
  buildFillDownOutcome,
  buildRowBulkMessage,
  buildRowBulkOutcome,
  decideFillDownConfirm,
  decideStatusBulkConfirm,
  overwritesMeaningfully,
} from "./bulkConfirmDecision";

const open: TaskCellValue = { status: "open", note: "", doneAt: null };
const done = (at: number): TaskCellValue => ({ status: "done", note: "", doneAt: at });
const blocked: TaskCellValue = { status: "blocked", note: "", doneAt: null };
const na: TaskCellValue = { status: "na", note: "", doneAt: null };
const openWithNote = (note: string): TaskCellValue => ({ status: "open", note, doneAt: null });

describe("overwritesMeaningfully", () => {
  it("false for an open cell - nothing meaningful to lose", () => {
    expect(overwritesMeaningfully(open, "done")).toBe(false);
  });

  it("false when the cell already holds the value being written", () => {
    expect(overwritesMeaningfully(blocked, "blocked")).toBe(false);
  });

  it("true when the cell holds a different, non-open value", () => {
    expect(overwritesMeaningfully(done(100), "blocked")).toBe(true);
  });
});

describe("decideStatusBulkConfirm (column/row bulk-set - unchanged AC6 threshold)", () => {
  it("does not require confirm when every target is open", () => {
    const decision = decideStatusBulkConfirm([open, open, open], "done");
    expect(decision).toEqual({ requiresConfirm: false, count: 0 });
  });

  it("requires confirm and counts only the meaningfully-overwritten targets", () => {
    const decision = decideStatusBulkConfirm([open, blocked, done(1), na], "done");
    // blocked and na are non-open and differ from the incoming "done", so
    // both count; `open` has nothing to lose, and done(1) already equals the
    // incoming status (not an "overwrite" at all) - neither counts.
    expect(decision).toEqual({ requiresConfirm: true, count: 2 });
  });
});

describe("decideFillDownConfirm - single target row (unchanged low-risk threshold)", () => {
  it("does not confirm filling an open cell onto one open target", () => {
    const decision = decideFillDownConfirm([open], open);
    expect(decision).toEqual({ requiresConfirm: false, count: 0, manyRows: false });
  });

  it("confirms when the single target already holds a different, non-open value", () => {
    const decision = decideFillDownConfirm([blocked], done(5));
    expect(decision).toEqual({ requiresConfirm: true, count: 1, manyRows: false });
  });

  it("does not confirm a single-row no-op fill (target already matches the source)", () => {
    const decision = decideFillDownConfirm([done(5)], done(9));
    // Same status ("done"), same note (""), only doneAt differs - doneAt is
    // deliberately excluded from cellsDiffer, but this branch never even
    // reaches cellsDiffer (single-row keeps the overwritesMeaningfully
    // threshold), and done !== done is false here regardless.
    expect(decision.requiresConfirm).toBe(false);
  });
});

describe("decideFillDownConfirm - BLOCKER 1: more than one target row", () => {
  it("THE DEFECT: confirms unconditionally when 25 open courses are about to become done - the old rule let this through silently", () => {
    const targets = Array.from({ length: 25 }, () => open);
    const decision = decideFillDownConfirm(targets, done(1000));
    expect(decision.manyRows).toBe(true);
    expect(decision.requiresConfirm).toBe(true);
    expect(decision.count).toBe(25);
  });

  it("counts only the rows that would actually change, not the whole target list", () => {
    // 5 targets: 2 already "done" (same status/note as the source - no
    // change), 3 still open (will change).
    const targets = [done(1), open, done(2), open, open];
    const decision = decideFillDownConfirm(targets, done(999));
    expect(decision).toEqual({ requiresConfirm: true, count: 3, manyRows: true });
  });

  it("never confirms a many-row fill that is a total no-op (every target already matches the source)", () => {
    const targets = [openWithNote("x"), openWithNote("x"), openWithNote("x")];
    const decision = decideFillDownConfirm(targets, openWithNote("x"));
    expect(decision).toEqual({ requiresConfirm: false, count: 0, manyRows: true });
  });

  it("a differing NOTE counts as a change even when the status matches", () => {
    const targets = [openWithNote("old"), openWithNote("old")];
    const decision = decideFillDownConfirm(targets, openWithNote("new"));
    expect(decision).toEqual({ requiresConfirm: true, count: 2, manyRows: true });
  });

  it("sabotage canary: a version that only counted overwritesMeaningfully (the OLD rule) would report 0 for the 25-open-courses case above", () => {
    const targets = Array.from({ length: 25 }, () => open);
    const oldRuleCount = targets.filter((c) => overwritesMeaningfully(c, "done")).length;
    expect(oldRuleCount).toBe(0);
    // Proves decideFillDownConfirm is NOT simply delegating to the old rule
    // for the many-row branch - if it were, this test's sibling above
    // ("THE DEFECT") would also read 0 and requiresConfirm: false.
    const decision = decideFillDownConfirm(targets, done(1000));
    expect(decision.count).not.toBe(oldRuleCount);
  });
});

describe("message builders", () => {
  it("buildColumnBulkMessage names the task, the target value, and the count, singular", () => {
    expect(buildColumnBulkMessage("Textbook ordered?", "done", 1)).toBe(
      'This will overwrite 1 existing value in "Textbook ordered?" with Done. Continue?'
    );
  });

  it("buildColumnBulkMessage pluralizes for more than one", () => {
    expect(buildColumnBulkMessage("Textbook ordered?", "blocked", 3)).toBe(
      'This will overwrite 3 existing values in "Textbook ordered?" with Blocked. Continue?'
    );
  });

  it("buildRowBulkMessage names the course", () => {
    expect(buildRowBulkMessage("Intro to Java", "na", 2)).toBe(
      "This will overwrite 2 existing values for Intro to Java with Not applicable. Continue?"
    );
  });

  it("buildFillDownMessage (many-row branch) names the count, the value, and the anchor course", () => {
    const decision = decideFillDownConfirm(Array.from({ length: 25 }, () => open), done(1));
    expect(buildFillDownMessage("Textbook ordered?", "done", decision, "Intro to Java")).toBe(
      'Fill "Textbook ordered?" = Done into the 25 courses below Intro to Java?'
    );
  });

  it("buildFillDownMessage (single-row branch) keeps the original overwrite copy, no anchor mentioned", () => {
    const decision = decideFillDownConfirm([blocked], done(1));
    expect(buildFillDownMessage("Textbook ordered?", "done", decision, "Intro to Java")).toBe(
      'This will overwrite 1 existing value in "Textbook ordered?" below. Continue?'
    );
    expect(buildFillDownMessage("Textbook ordered?", "done", decision, "Intro to Java")).not.toContain("Intro to Java");
  });

  it("buildFillDownMessage singularizes the many-row branch's course count too", () => {
    const decision = decideFillDownConfirm([open, done(1)], done(2));
    expect(decision.count).toBe(1);
    expect(buildFillDownMessage("X", "done", decision, "Anchor")).toBe('Fill "X" = Done into the 1 course below Anchor?');
  });
});

describe("bulk-outcome builders (BLOCKER 2 - a partial failure must never read like a success)", () => {
  it("buildColumnBulkOutcome: a full success reads N of N", () => {
    expect(buildColumnBulkOutcome("Textbook ordered?", "done", 26, 26)).toBe(
      "Set Textbook ordered? to Done for 26 of 26 courses."
    );
  });

  it("buildColumnBulkOutcome: THE DEFECT this fixes - a partial failure is a DIFFERENT sentence from a full success, not silently identical", () => {
    const full = buildColumnBulkOutcome("Textbook ordered?", "done", 26, 26);
    const partial = buildColumnBulkOutcome("Textbook ordered?", "done", 3, 26);
    expect(partial).toBe("Set Textbook ordered? to Done for 3 of 26 courses.");
    expect(partial).not.toBe(full);
  });

  it("buildColumnBulkOutcome singularizes a one-course scope", () => {
    expect(buildColumnBulkOutcome("X", "na", 1, 1)).toBe("Set X to Not applicable for 1 of 1 course.");
  });

  it("buildRowBulkOutcome: success names the task count and the course", () => {
    expect(buildRowBulkOutcome("Intro to Java", "blocked", 5, true)).toBe(
      "Set 5 tasks to Blocked for Intro to Java."
    );
  });

  it("buildRowBulkOutcome: failure names the course and surfaces the server error, never silently matching the success sentence's shape", () => {
    const outcome = buildRowBulkOutcome("Intro to Java", "blocked", 5, false, "Network error");
    expect(outcome).toBe("Could not update Intro to Java: Network error");
    expect(outcome).not.toContain("Set 5 tasks");
  });

  it("buildFillDownOutcome: a partial failure's count is distinguishable from a full success", () => {
    expect(buildFillDownOutcome("Textbook ordered?", 25, 25)).toBe("Filled Textbook ordered? down to 25 of 25 courses.");
    expect(buildFillDownOutcome("Textbook ordered?", 22, 25)).toBe("Filled Textbook ordered? down to 22 of 25 courses.");
  });
});
