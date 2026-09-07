import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D23c's "mark late" control, pinned at the source because nothing here renders.
 *
 * vitest in this repo is node-env and collects only `src/**\/*.test.ts`, so no
 * component is ever mounted. Reading the files that decide is the only check
 * available, and this directory already works that way.
 *
 * TWO DEFECTS THIS PINS, one of them shipped and corrected.
 *
 * The prop path. `markSubmissionLate` existed on the store, fully tested, and
 * nothing called it - the agent that built it correctly declined to add a button
 * whose prop path ran through a file outside its brief, because a button with no
 * path renders nothing. The path now runs Panel -> Table -> Row, and every link
 * is asserted here.
 *
 * The false toggle. The first version of the control flipped its label to "Late"
 * and set aria-pressed, so it read as a toggle - while `markSubmissionLate` only
 * ever SETS "marked-late" and has no inverse. Pressing it again did nothing at
 * all. A control that looks live and is inert is the failure this project keeps
 * re-shipping, and dressing a one-way action as a toggle is how it gets in. The
 * button is now shown only where pressing it changes something.
 */

const DIR = join(process.cwd(), "src", "app", "components", "grading-recording");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");

const ROW = read("GradingTableRow.tsx");
const TABLE = read("GradingTable.tsx");
const PANEL = read("GradingRecordingPanel.tsx");

describe("the mark-late control is reachable end to end", () => {
  it("the row declares the prop and calls it with its own id", () => {
    expect(ROW).toMatch(/onMarkLate:\s*\(id:\s*string\)\s*=>\s*void;/);
    expect(ROW).toMatch(/onMarkLate\(row\.id\)/);
  });

  it("the table declares the prop and forwards it to each row", () => {
    expect(TABLE).toMatch(/onMarkLate:\s*\(id:\s*string\)\s*=>\s*void;/);
    // Forwarded straight through, the way every other row action already is -
    // a table that accepted the prop and dropped it would type-check and render
    // a button wired to nothing.
    expect(TABLE).toMatch(/onMarkLate=\{onMarkLate\}/);
  });

  it("the panel supplies the store's own mutator", () => {
    // Not a local wrapper: the store method is what clears submittedAt and
    // refuses to read a clock. Anything else re-implements that guarantee.
    expect(PANEL).toMatch(/onMarkLate=\{gradingRows\.markSubmissionLate\}/);
  });
});

describe("the control is only offered where pressing it does something", () => {
  it("renders the button only for an unknown submission time", () => {
    expect(ROW).toMatch(/gradingRowSubmissionTimeStatus\(row\)\s*===\s*"unknown"\s*&&/);
  });

  it("shows marked-late as text rather than as a second press", () => {
    // The regression guard. If this comes back as a Button, the label flips,
    // aria-pressed returns, and the control is inert on its second press.
    const markedLateBranch = ROW.slice(ROW.indexOf('gradingRowSubmissionTimeStatus(row) === "marked-late"'));
    const branchEnd = markedLateBranch.indexOf(")}");
    const branch = markedLateBranch.slice(0, branchEnd > -1 ? branchEnd : 400);
    expect(
      branch,
      "the marked-late state renders a Button again - markSubmissionLate has no " +
        "inverse, so pressing it a second time does nothing and the control lies " +
        "about being interactive"
    ).not.toContain("<Button");
  });

  it("never sets aria-pressed on the mark-late control", () => {
    // aria-pressed is the specific thing that made the first version read as a
    // toggle to a screen reader. A one-way action must not claim a pressed
    // state it can never leave.
    const near = ROW.slice(Math.max(0, ROW.indexOf("onMarkLate(row.id)") - 600), ROW.indexOf("onMarkLate(row.id)") + 200);
    expect(near).not.toContain("aria-pressed");
  });

  it("reads the status through the helper, not off the raw field", () => {
    // gradingRowSubmissionTimeStatus normalises an absent property to
    // "unknown". Comparing row.submissionTimeStatus directly makes an older row
    // fall through every branch and offer no control at all.
    expect(ROW).toContain("gradingRowSubmissionTimeStatus");
    const near = ROW.slice(ROW.indexOf("D23c. Records THAT the work was late"));
    expect(near.slice(0, 1400)).not.toMatch(/row\.submissionTimeStatus\s*===/);
  });

  it("never reads a clock anywhere in the row", () => {
    // The whole reason the status is three-valued: the only clock this surface
    // has is when the INSTRUCTOR graded, and a grading session held after a
    // deadline would mark the entire class late.
    expect(ROW).not.toMatch(/new Date\(\)/);
    expect(ROW).not.toContain("Date.now(");
  });

  it("finds all three files, so a move cannot make this vacuously pass", () => {
    for (const [name, source] of [
      ["GradingTableRow.tsx", ROW],
      ["GradingTable.tsx", TABLE],
      ["GradingRecordingPanel.tsx", PANEL],
    ] as const) {
      expect(source.length, `${name} read as empty`).toBeGreaterThan(1000);
    }
  });
});
