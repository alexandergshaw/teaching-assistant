// Oracle for src/app/components/grading-results/ungradedDisclosure.ts
// (docs/a12-a13-scope.md, A12/A13). This is the chunk's whole `verify` and
// its whole oracle: pure-function tests over the leaf, plus the source-text
// wiring assertions over GradingResults.tsx that no rendered component in
// this repo could otherwise prove (vitest is node-env; nothing here is ever
// rendered).
//
// Fixtures are transcribed field-by-field from buildUngradedRow
// (src/lib/grade/engine.ts:146-171), not invented, so a fixture never proves
// something no real producer emits.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GRADING_FAILURE_PREFIX,
  type GradingFailedOutcome,
  type NotAttemptedOutcome,
} from "@/lib/grade/types";
import {
  applyFeedbackFieldEdit,
  type AreaEdit,
  type GradeRow,
  type GradingRun,
  type RowEdit,
} from "./gradingResultsHelpers";
import {
  UNGRADED_DISCLOSURE_COPY,
  classifyRow,
  correctUngradedFeedbackSeed,
  correctUngradedSeeds,
  describeSkippedStatus,
} from "./ungradedDisclosure";

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeEdit(overrides: Partial<RowEdit> = {}): RowEdit {
  const areas: Record<string, AreaEdit> = {};
  return {
    total: "",
    overall: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    areas,
    ...overrides,
  };
}

function makeGradedRow(overrides: Partial<GradeRow> = {}): GradeRow {
  return {
    student: "Ada Lovelace",
    overallComment: "Great job overall.",
    strengths: "Clear structure.",
    improvements: "Add more tests.",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "8/10",
    feedback: "Great job overall.",
    mergedFileCount: 1,
    submittedFiles: [],
    userId: 42,
    ...overrides,
  } as GradeRow;
}

// Transcribed from buildUngradedRow, src/lib/grade/engine.ts:146-171.
function makeUngradedRow(outcome: NotAttemptedOutcome | GradingFailedOutcome): GradeRow {
  const strengths = outcome.message;
  return {
    student: outcome.student,
    overallComment: strengths,
    strengths,
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: strengths,
    mergedFileCount: 0,
    submittedFiles: [],
    codeExecution: undefined,
    gradedRepo: undefined,
    gradedRef: undefined,
    submissionTruncated: undefined,
    ungraded: outcome,
  } as GradeRow;
}

const countBoundOutcome: NotAttemptedOutcome = {
  kind: "not-attempted",
  stoppedBy: "submission-count-bound",
  sourceIndex: 5,
  student: "Grace Hopper",
  canvasUserId: 101,
  message: "Not graded: this run is limited to 40 submissions. Re-run to grade the rest.",
};

const deadlineOutcome: NotAttemptedOutcome = {
  kind: "not-attempted",
  stoppedBy: "run-deadline",
  sourceIndex: 6,
  student: "Alan Turing",
  canvasUserId: 102,
  message:
    "Not graded: the grading run's time budget ran out before this submission could be started. Re-run to grade it.",
};

const gradingFailedOutcome: GradingFailedOutcome = {
  kind: "grading-failed",
  sourceIndex: 2,
  student: "Barbara Liskov",
  canvasUserId: 103,
  message: `${GRADING_FAILURE_PREFIX}Network error while grading.`,
};

const REFUSED_REASON =
  "This row has no score from the grader and its comment has not been edited - it looks like a " +
  "failed or unparsed grading result, not a reviewed grade. Type a score or edit the comment before " +
  "posting it to the student.";

// ── AC-1: five outcomes, five distinct runtime states (G1) ─────────────────

describe("classifyRow - AC-1", () => {
  it("graded, postable", () => {
    const row = makeGradedRow();
    const edit = makeEdit({ total: "8/10", overall: row.overallComment });
    expect(classifyRow(row, edit).state).toBe("postable");
  });

  it("graded, refused by checkRowPostability", () => {
    const row = makeGradedRow({ totalScore: "", rubricAreas: [] });
    const edit = makeEdit({ total: "", overall: row.overallComment });
    expect(classifyRow(row, edit).state).toBe("refused");
  });

  it("ungraded, grading-failed", () => {
    const row = makeUngradedRow(gradingFailedOutcome);
    const edit = makeEdit({ strengths: gradingFailedOutcome.message });
    expect(classifyRow(row, edit).state).toBe("grading-failed");
  });

  it("ungraded, not-attempted, submission-count-bound", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ strengths: countBoundOutcome.message });
    expect(classifyRow(row, edit).state).toBe("not-attempted-count-bound");
  });

  // Section 3.2 (docs/a12-a13-scope.md): "run-deadline" is reachable only
  // through a server-side workflow step, never through the three GradingResults
  // importers on this surface - built for the union's TYPE closure (G1b/AC-7),
  // not because it is observable here.
  it("ungraded, not-attempted, run-deadline (built for type closure - section 3.2, not observable on this surface)", () => {
    const row = makeUngradedRow(deadlineOutcome);
    const edit = makeEdit({ strengths: deadlineOutcome.message });
    expect(classifyRow(row, edit).state).toBe("not-attempted-run-deadline");
  });

  it("S1's control: the two stoppedBy states are distinguished, not collapsed", () => {
    const countBoundRow = makeUngradedRow(countBoundOutcome);
    const deadlineRow = makeUngradedRow(deadlineOutcome);
    const countBoundState = classifyRow(countBoundRow, makeEdit({ strengths: countBoundOutcome.message })).state;
    const deadlineState = classifyRow(deadlineRow, makeEdit({ strengths: deadlineOutcome.message })).state;
    expect(countBoundState).not.toBe(deadlineState);
  });

  it("S2's control: an ungraded row is never classified as an ordinary graded row", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ strengths: countBoundOutcome.message });
    const state = classifyRow(row, edit).state;
    expect(state).not.toBe("postable");
    expect(state).not.toBe("refused");
  });
});

// ── AC-2: rescued row ────────────────────────────────────────────────────

describe("classifyRow - AC-2: a rescued ungraded row", () => {
  it("classifies as its own state and states it cannot be posted from this table, when edit.total carries a real score", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ total: "7/10", strengths: countBoundOutcome.message });
    const disclosure = classifyRow(row, edit);
    expect(disclosure.state).toBe("rescued");
    expect(disclosure.message).toMatch(/cannot be posted from this table/);
  });

  it("S3's control: a scored ungraded row does not fall through to postable", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ total: "7/10", strengths: countBoundOutcome.message });
    expect(classifyRow(row, edit).state).not.toBe("postable");
  });

  it("a blank or whitespace-only total does not trigger rescue", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ total: "   ", strengths: countBoundOutcome.message });
    expect(classifyRow(row, edit).state).toBe("not-attempted-count-bound");
  });
});

// ── AC-3a: no "Re-run" substring in the frozen copy ─────────────────────────

describe("UNGRADED_DISCLOSURE_COPY - AC-3a", () => {
  it("no member contains the substring Re-run", () => {
    for (const value of Object.values(UNGRADED_DISCLOSURE_COPY)) {
      expect(value.includes("Re-run")).toBe(false);
    }
  });

  it("S4's control: a copy containing the banned substring would fail this assertion", () => {
    const sabotaged = `${UNGRADED_DISCLOSURE_COPY["submission-count-bound"]} Re-run to grade the rest.`;
    expect(sabotaged.includes("Re-run")).toBe(true);
  });
});

// ── AC-3b: the frozen set of every string classifyRow can return ───────────

describe("classifyRow - AC-3b: the frozen set of every returned RowDisclosure string", () => {
  // Written out by hand, NOT read from UNGRADED_DISCLOSURE_COPY - importing
  // the leaf's own constant here would make this assertion a tautology (a
  // sabotaged copy would still equal "itself"), exactly the failure mode
  // AC-3a's S4 sabotage exposed against an earlier draft of this test.
  const FROZEN_LITERALS = [
    "",
    REFUSED_REASON,
    "The tool did not grade this submission, but a score has been entered for it by hand. This row cannot be posted from this table with the others - review and post it separately.",
    gradingFailedOutcome.message,
    "Not graded: this run stopped before reaching this submission because of the run's submission limit. Grading again without changing the queue will grade the same students again, not this one - remove the students who already have a grade from the queue first.",
    "Not graded: this run's time budget ran out before this submission could be started. Grading again without changing the queue will start from the same point again, not this one - remove the students who already have a grade from the queue first.",
  ];

  it("collects exactly this set across the enumerated product of inputs, both directions", () => {
    const postableRow = makeGradedRow();
    const postableEdit = makeEdit({ total: "8/10", overall: postableRow.overallComment });

    const refusedRow = makeGradedRow({ totalScore: "", rubricAreas: [] });
    const refusedEdit = makeEdit({ total: "", overall: refusedRow.overallComment });

    const rescuedRow = makeUngradedRow(countBoundOutcome);
    const rescuedEdit = makeEdit({ total: "7/10", strengths: countBoundOutcome.message });

    const gradingFailedRow = makeUngradedRow(gradingFailedOutcome);
    const gradingFailedEdit = makeEdit({ strengths: gradingFailedOutcome.message });

    const countBoundRow = makeUngradedRow(countBoundOutcome);
    const countBoundEdit = makeEdit({ strengths: countBoundOutcome.message });

    const deadlineRow = makeUngradedRow(deadlineOutcome);
    const deadlineEdit = makeEdit({ strengths: deadlineOutcome.message });

    const collected = [
      classifyRow(postableRow, postableEdit),
      classifyRow(refusedRow, refusedEdit),
      classifyRow(rescuedRow, rescuedEdit),
      classifyRow(gradingFailedRow, gradingFailedEdit),
      classifyRow(countBoundRow, countBoundEdit),
      classifyRow(deadlineRow, deadlineEdit),
    ].map((disclosure) => disclosure.message);

    expect(new Set(collected)).toEqual(new Set(FROZEN_LITERALS));
  });
});

// ── AC-3c: correctUngradedFeedbackSeed reads the SAME frozen members ────────

describe("correctUngradedFeedbackSeed - AC-3c", () => {
  it.each([
    ["submission-count-bound", countBoundOutcome] as const,
    ["run-deadline", deadlineOutcome] as const,
  ])("replacement for %s is byte-identical to UNGRADED_DISCLOSURE_COPY", (stoppedBy, outcome) => {
    const row = makeUngradedRow(outcome);
    const edit = makeEdit({ strengths: outcome.message });
    const corrected = correctUngradedFeedbackSeed(row, edit);
    expect(corrected.strengths).toBe(UNGRADED_DISCLOSURE_COPY[stoppedBy]);
  });

  it("S16's control: a hand-authored second copy would not be byte-identical to the frozen member", () => {
    const driftedCopy = `${UNGRADED_DISCLOSURE_COPY["submission-count-bound"]} `; // trailing space drift
    expect(driftedCopy).not.toBe(UNGRADED_DISCLOSURE_COPY["submission-count-bound"]);
  });
});

// ── AC-4: describeSkippedStatus ──────────────────────────────────────────

describe("describeSkippedStatus - AC-4", () => {
  it.each([
    [undefined, "Not posted - no grade or comment to send"],
    ["", "Not posted - no grade or comment to send"],
    ["   ", "Not posted - no grade or comment to send"],
  ])("falls back to a non-empty fallback for %j", (input, expected) => {
    expect(describeSkippedStatus(input)).toBe(expected);
  });

  it("returns a real reason exactly as given, not a substitute", () => {
    expect(describeSkippedStatus("Missing required rubric score")).toBe("Missing required rubric score");
  });

  it("S5b's control: returning the argument directly would leak an empty string on a blank message", () => {
    const s5bImplementation = (m?: string) => m ?? "";
    expect(s5bImplementation("")).toBe("");
    expect(describeSkippedStatus("")).not.toBe("");
  });

  it("S5c's control: unconditionally returning the fallback would swallow a real reason", () => {
    const s5cImplementation = () => "Not posted - no grade or comment to send";
    expect(s5cImplementation()).toBe("Not posted - no grade or comment to send");
    expect(describeSkippedStatus("Missing required rubric score")).not.toBe(
      "Not posted - no grade or comment to send"
    );
  });
});

// ── AC-6: correctUngradedFeedbackSeed ────────────────────────────────────

describe("correctUngradedFeedbackSeed - AC-6", () => {
  it("replaces strengths (and recomputes overall) for a not-attempted row whose strengths is the engine's own message", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ strengths: countBoundOutcome.message, overall: countBoundOutcome.message });
    const corrected = correctUngradedFeedbackSeed(row, edit);
    const expectedCorrected = applyFeedbackFieldEdit(
      edit,
      "strengths",
      UNGRADED_DISCLOSURE_COPY["submission-count-bound"]
    );
    expect(corrected).toEqual(expectedCorrected);
  });

  it("also replaces strengths when it already equals one of the leaf's own frozen literals (idempotent path)", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ strengths: UNGRADED_DISCLOSURE_COPY["submission-count-bound"] });
    const once = correctUngradedFeedbackSeed(row, edit);
    const twice = correctUngradedFeedbackSeed(row, once);
    expect(twice).toEqual(once);
  });

  it("S11's control: leaves a typed edit (neither the engine message nor a frozen literal) completely unchanged", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ strengths: "I reviewed this by hand and it looks fine.", overall: "custom overall" });
    const corrected = correctUngradedFeedbackSeed(row, edit);
    expect(corrected).toBe(edit);
  });

  it("S10's control: a pass-through implementation would leave the engine's stale sentence in place", () => {
    const row = makeUngradedRow(countBoundOutcome);
    const edit = makeEdit({ strengths: countBoundOutcome.message });
    const passThrough = (_r: GradeRow, e: RowEdit) => e;
    expect(correctUngradedFeedbackSeed(row, edit)).not.toBe(passThrough(row, edit));
    expect(correctUngradedFeedbackSeed(row, edit).strengths).not.toBe(countBoundOutcome.message);
  });

  it("S15's control: a grading-failed row's real per-submission diagnostic is left completely unchanged, unconditionally - even though its strengths equals result.ungraded.message by the same pass-through buildUngradedRow gives both kinds", () => {
    const row = makeUngradedRow(gradingFailedOutcome);
    const edit = makeEdit({ strengths: gradingFailedOutcome.message, overall: gradingFailedOutcome.message });
    const corrected = correctUngradedFeedbackSeed(row, edit);
    expect(corrected).toBe(edit);
    expect(corrected.strengths).toBe(gradingFailedOutcome.message);
  });

  it("a graded (non-ungraded) row is returned unchanged", () => {
    const row = makeGradedRow();
    const edit = makeEdit({ total: "8/10", overall: row.overallComment, strengths: row.strengths });
    expect(correctUngradedFeedbackSeed(row, edit)).toBe(edit);
  });
});

// ── AC-9: correctUngradedSeeds ───────────────────────────────────────────

describe("correctUngradedSeeds - AC-9", () => {
  it("corrects every row in the run that needs correction, and returns every other row byte-identical (same reference)", () => {
    const countBoundRow = makeUngradedRow(countBoundOutcome);
    const gradedRow = makeGradedRow({ student: "Postable Pat" });
    const run: GradingRun = {
      results: [countBoundRow, gradedRow],
      rubricAreaNames: [],
      fullCreditChecklist: [],
    };
    const staleEdit = makeEdit({ strengths: countBoundOutcome.message, overall: countBoundOutcome.message });
    const gradedEdit = makeEdit({ total: "8/10", overall: gradedRow.overallComment, strengths: gradedRow.strengths });
    const edits: Record<string, RowEdit> = {
      [countBoundRow.student]: staleEdit,
      [gradedRow.student]: gradedEdit,
    };

    const next = correctUngradedSeeds(run, edits);

    expect(next[countBoundRow.student].strengths).toBe(UNGRADED_DISCLOSURE_COPY["submission-count-bound"]);
    expect(next[gradedRow.student]).toBe(gradedEdit);
  });

  it("leaves a student absent from edits absent from the output (nothing to correct)", () => {
    const countBoundRow = makeUngradedRow(countBoundOutcome);
    const run: GradingRun = { results: [countBoundRow], rubricAreaNames: [], fullCreditChecklist: [] };
    const next = correctUngradedSeeds(run, {});
    expect(next[countBoundRow.student]).toBeUndefined();
  });

  it("S19's control: a pass-through implementation ((run, edits) => edits) never corrects a real per-run edits map", () => {
    const countBoundRow = makeUngradedRow(countBoundOutcome);
    const run: GradingRun = { results: [countBoundRow], rubricAreaNames: [], fullCreditChecklist: [] };
    const staleEdit = makeEdit({ strengths: countBoundOutcome.message });
    const edits: Record<string, RowEdit> = { [countBoundRow.student]: staleEdit };

    const passThrough = (_r: GradingRun, e: Record<string, RowEdit>) => e;

    expect(correctUngradedSeeds(run, edits)).not.toEqual(passThrough(run, edits));
    expect(correctUngradedSeeds(run, edits)[countBoundRow.student].strengths).not.toBe(countBoundOutcome.message);
  });
});

// ── AC-5 / AC-6 wiring / AC-8: source-text checks over GradingResults.tsx ──

describe("GradingResults.tsx source-text wiring", () => {
  function readComponentSource(): string {
    return readFileSync(fileURLToPath(new URL("../GradingResults.tsx", import.meta.url)), "utf8");
  }

  // The CR-tolerant, UNANCHORED form backlog L13 requires: split on
  // /\r?\n/, strip an unanchored line-comment pattern per line, rejoin. The
  // anchored multiline form is CR-safe but trailing-comment-blind (L13
  // recorded an executed defeat against it) - see S9 below.
  function stripComments(source: string): string {
    return source
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  }

  function tbodyMapRegion(source: string): string {
    const stripped = stripComments(source);
    const mapStart = stripped.indexOf("sortedResults.map(");
    if (mapStart === -1) throw new Error("sortedResults.map( not found in GradingResults.tsx");
    const trClose = stripped.indexOf("</tr>", mapStart);
    if (trClose === -1) throw new Error("</tr> not found after sortedResults.map( in GradingResults.tsx");
    return stripped.slice(mapStart, trClose + "</tr>".length);
  }

  describe("AC-5: a per-row marker inside the tbody map region", () => {
    const ATTRIBUTE_NAME = "data-ungraded-state";

    it("canary: the detection discriminates a known-good fixture from known-bad ones", () => {
      const good =
        "sortedResults.map((result) => { return (<tr data-ungraded-state={classifyRow(result, edit).state}><td /></tr>); })";
      const badNoAttribute = "sortedResults.map((result) => { return (<tr><td /></tr>); })";
      expect(tbodyMapRegion(good)).toMatch(new RegExp(`${ATTRIBUTE_NAME}=`));
      expect(tbodyMapRegion(good)).toMatch(/classifyRow\(/);
      expect(tbodyMapRegion(badNoAttribute)).not.toMatch(new RegExp(`${ATTRIBUTE_NAME}=`));
    });

    it("the real file renders the attribute and calls classifyRow inside the tbody map region", () => {
      const region = tbodyMapRegion(readComponentSource());
      expect(region).toMatch(new RegExp(`${ATTRIBUTE_NAME}=`));
      expect(region).toMatch(/classifyRow\(/);
    });

    // S9: proves stripComments is not trailing-comment-blind (the anchored
    // multiline form would still see this attribute even though it is
    // commented out on its own line).
    it("S9's control: a trailing-comment copy of the attribute is not mistaken for a live one", () => {
      const trailingCommentSabotage =
        "sortedResults.map((result) => { return (<tr // data-ungraded-state={classifyRow(result, edit).state}\n><td /></tr>); })";
      expect(tbodyMapRegion(trailingCommentSabotage)).not.toMatch(new RegExp(`${ATTRIBUTE_NAME}=`));
    });

    // CR canary (traps-search.md): built with String.fromCharCode(13) so no
    // tool can materialise a \r escape into a real byte.
    it("CR canary: a CRLF-style line still strips its trailing comment", () => {
      const crLine = `const x = 1;${String.fromCharCode(13)}\n// data-ungraded-state should not appear here`;
      expect(stripComments(crLine)).not.toMatch(/data-ungraded-state/);
    });
  });

  it("AC-4/S5: the skipped arm calls describeSkippedStatus, not the hardcoded fallback literal directly", () => {
    const source = stripComments(readComponentSource());
    expect(source).toMatch(/describeSkippedStatus\(status\.message\)/);
    const revertedTernaryArm =
      /status\.status === "skipped"\s*\n?\s*\?\s*"Not posted - no grade or comment to send"/;
    expect(source).not.toMatch(revertedTernaryArm);
  });

  it("AC-6/S12: BOTH loadGradingResultsEdits call sites are wrapped in correctUngradedSeeds", () => {
    const source = stripComments(readComponentSource());
    const matches = source.match(/correctUngradedSeeds\(run, loadGradingResultsEdits\(canvasUrl, run\)\)/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("S6b's control: an import with no call would leave the leaf dead", () => {
    const source = stripComments(readComponentSource());
    const importsClassifyRow = /import\s*{[^}]*classifyRow[^}]*}\s*from\s*["']\.\/grading-results\/ungradedDisclosure["']/.test(
      source
    );
    const callsClassifyRow = /classifyRow\(/.test(source);
    expect(importsClassifyRow && callsClassifyRow).toBe(true);
  });
});

// ── AC-8: the leaf's own client-bundle safety ────────────────────────────

describe("ungradedDisclosure.ts stays client-bundle-safe - AC-8", () => {
  function readLeafSource(): string {
    return readFileSync(fileURLToPath(new URL("./ungradedDisclosure.ts", import.meta.url)), "utf8");
  }

  it("does not import the @/lib/grade barrel (or any submodule other than /types)", () => {
    const source = readLeafSource();
    expect(source).not.toMatch(/from ["']@\/lib\/grade["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/grade\/(?!types["'])/);
  });

  it("does value-import from @/lib/grade/types", () => {
    const source = readLeafSource();
    expect(source).toMatch(/from ["']@\/lib\/grade\/types["']/);
  });

  it("S13's control: importing from the barrel would trip the negative assertion above", () => {
    const sabotagedLine = 'import { isUngraded } from "@/lib/grade";';
    expect(sabotagedLine).toMatch(/from ["']@\/lib\/grade["']/);
  });
});

// ── AC-7/S14: compile-time exhaustiveness lives in the leaf's own switch ───
// No vitest instrument exists for this - it is `npx tsc --noEmit`, at the
// wave gate only (docs/a12-a13-scope.md section 6). Recorded here as a
// comment, not a test, so a reader of this file does not conclude AC-7 has
// no coverage at all.
