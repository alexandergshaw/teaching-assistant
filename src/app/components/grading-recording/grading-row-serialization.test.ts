// Unit tests for grading-row-serialization.ts - the persisted row shape and
// serializeGradingRows / serializeGradingRowsWithoutSubmissionText /
// deserializeGradingRows. Mirrors discussion-serialization.test.ts's own
// structure and discipline (frozen literal oracle, round-trip, every
// coercion case, garbage never throws) - see that file and
// grading-row-serialization.ts's own header for why.
//
// SABOTAGE CHECK LOG (verified by actually breaking the source, re-running,
// and reverting - grading-rows.test.ts's own log is the precedent for
// recording this inline rather than only asserting it happened):
//   1. Removed deserializeGradingRows's outer try/catch entirely -> every
//      case in the "never throws on garbage input" it.each block below
//      failed by actually throwing (not by returning the wrong value - the
//      test runner reported an uncaught SyntaxError from JSON.parse), as
//      expected. Reverted.
//   2. Changed `state === "grading" ? "pending" : row.state` (buildWireRow,
//      write side) to just `row.state` (dropping the write-side
//      normalization). The FIRST version of this test round-tripped through
//      deserializeGradingRows and STAYED GREEN - deserializeGradingRows's
//      own defensive `if (state === "grading") state = "pending"` (read
//      side) silently masked the write-side regression, exactly the BL4
//      trap discussion-serialization.test.ts's own header warns about. The
//      test below was rewritten to assert on serializeGradingRows's raw
//      JSON.parse'd output directly, which then failed as expected
//      (`raw.rows[0].state` was "grading", not "pending") against the same
//      sabotage. A second test keeps the round-trip case for its own sake.
//      Reverted; the corrected test is what ships below.
//   3. Changed the read-side nameMatch fallback from "no-roster" to
//      "unmatched" -> "an invalid nameMatch coerces to no-roster, never a
//      false assertion of unmatched" failed as expected (got "unmatched").
//      Reverted - this is the exact case worth sabotage-testing, since
//      "unmatched" is also a plausible-looking wrong default that would not
//      be caught by a test that only checks "coerces to SOME valid member".
//   4. Changed `error: state === "failed" ? row.error : ""` (buildWireRow)
//      to unconditionally `row.error` -> "clears a stale error on write for
//      a non-failed row" failed as expected (a stale error string survived
//      onto a "ready" row). Reverted.
//   5. Changed serializeGradingRowsWithoutSubmissionText's `dropSubmissionText`
//      argument from `true` to `false` (making it identical to
//      serializeGradingRows) -> "the quota-fallback write drops
//      submissionText but keeps every feedback field and userEdited" failed
//      (submissionText was NOT empty in the fallback output), as expected.
//      Reverted.
//   6. Changed the userEdited read default from `false` to `typeof
//      r.userEdited === "boolean" ? r.userEdited : true` -> "userEdited
//      defaults to false, never true, when unreadable" failed as expected.
//      Reverted - a wrong default here silently re-arms overwrite
//      protection on a row that was never actually edited, or - the more
//      dangerous direction were the default flipped the other way - would
//      have silently disarmed protection on the DEFAULT case tested here,
//      which is why the test pins false specifically rather than merely
//      checking "some boolean came back".

import { describe, it, expect } from "vitest";
import {
  GRADING_TABLE_VERSION,
  serializeGradingRows,
  serializeGradingRowsWithoutSubmissionText,
  deserializeGradingRows,
} from "./grading-row-serialization";
import type { GradingRow } from "./grading-row";

function makeRow(overrides: Partial<GradingRow> = {}): GradingRow {
  return {
    id: "grade-1",
    studentName: "Maria Alvarez",
    nameMatch: "no-roster",
    rosterCandidates: [],
    submissionText: "A submission about the reading.",
    state: "pending",
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    // D23c: the round-trip-stable default (deserializeGradingRows normalizes
    // an absent status to exactly this) - a test that needs the genuinely
    // ABSENT case explicitly overrides this to `undefined` rather than
    // relying on omission, which would just re-apply this same default.
    submissionTimeStatus: "unknown",
    submittedAt: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Round trip / normalization / userEdited survival (item 3 of the brief).
// ---------------------------------------------------------------------------

describe("serializeGradingRows / deserializeGradingRows round trip", () => {
  it("round-trips a well-formed table", () => {
    const rows = [
      makeRow({ id: "a", nameMatch: "matched", rosterCandidates: ["Maria Alvarez"] }),
      makeRow({ id: "b", state: "ready", totalScore: "8/10" }),
    ];
    const raw = serializeGradingRows(rows);
    const restored = deserializeGradingRows(raw);
    expect(restored).toEqual(rows);
  });

  it("normalizes a grading row to pending on WRITE, since nothing is in flight after a reload - checks serializeGradingRows's own raw output, not the round trip, because deserializeGradingRows enforces this same invariant independently on read and would mask a write-side regression (mirrors discussion-serialization.test.ts's own BL4 discipline)", () => {
    const rows = [makeRow({ id: "a", state: "grading" })];
    const raw = JSON.parse(serializeGradingRows(rows)) as { rows: Array<{ state: string }> };
    expect(raw.rows[0].state).toBe("pending");
  });

  it("also round-trips a grading row to pending through deserializeGradingRows", () => {
    const rows = [makeRow({ id: "a", state: "grading" })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].state).toBe("pending");
  });

  it("preserves the error message for a failed row", () => {
    const rows = [makeRow({ id: "a", state: "failed", error: "Model call failed." })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].state).toBe("failed");
    expect(restored[0].error).toBe("Model call failed.");
  });

  it("clears a stale error on write for a non-failed row, enforcing the invariant that error is set only when state is failed", () => {
    const rows = [makeRow({ id: "a", state: "ready", error: "stale error from a previous failure" })];
    const raw = JSON.parse(serializeGradingRows(rows)) as { rows: Array<{ error: string }> };
    expect(raw.rows[0].error).toBe("");
  });

  it("D23c: clears a stale submittedAt on WRITE for a row whose submissionTimeStatus is not 'known', checked on the raw output directly - mirrors the error/state === failed discipline just above (and grading-row-serialization.test.ts's own log entry 2 on why checking raw output matters, not just the round trip)", () => {
    const rows = [makeRow({ id: "a", submissionTimeStatus: "unknown", submittedAt: "stale timestamp from a previous known state" })];
    const raw = JSON.parse(serializeGradingRows(rows)) as { rows: Array<{ submittedAt: string }> };
    expect(raw.rows[0].submittedAt).toBe("");
  });

  it("D23c: normalizes an absent submissionTimeStatus to the explicit string 'unknown' on write", () => {
    const rows = [makeRow({ id: "a" })];
    const raw = JSON.parse(serializeGradingRows(rows)) as { rows: Array<{ submissionTimeStatus: string }> };
    expect(raw.rows[0].submissionTimeStatus).toBe("unknown");
  });

  it("item 3: userEdited survives the round trip when true", () => {
    const rows = [makeRow({ id: "a", userEdited: true })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].userEdited).toBe(true);
  });

  it("item 3: userEdited survives the round trip when false", () => {
    const rows = [makeRow({ id: "a", userEdited: false })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].userEdited).toBe(false);
  });

  it("preserves rosterCandidates and an ambiguous nameMatch together", () => {
    const rows = [makeRow({ id: "a", nameMatch: "ambiguous", rosterCandidates: ["Sam Lee", "Samuel Lee"] })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].nameMatch).toBe("ambiguous");
    expect(restored[0].rosterCandidates).toEqual(["Sam Lee", "Samuel Lee"]);
  });

  // D22b/D23e/D23c: the silent-drop trap - a new field compiles fine and
  // vanishes on reload unless it is also added to buildWireRow AND
  // deserializeGradingRows's own explicit field lists (grading-row-
  // serialization.ts's own header). Each of the three new D23 fields gets
  // its own round trip here, independent of the dedicated "assessment
  // (D22b/D23e)" / "submission timing (D23c)" describe blocks below, so a
  // regression in the ROUND TRIP specifically (as opposed to a coercion
  // rule) is caught by the most obvious possible test.
  it("SABOTAGE TARGET: every new D23 field survives the round trip together on one row", () => {
    const rows = [
      makeRow({
        id: "a",
        course: "course-A",
        assessment: "essay-2",
        submissionTimeStatus: "known",
        submittedAt: "2026-09-01T23:59:00Z",
      }),
    ];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].course).toBe("course-A");
    expect(restored[0].assessment).toBe("essay-2");
    expect(restored[0].submissionTimeStatus).toBe("known");
    expect(restored[0].submittedAt).toBe("2026-09-01T23:59:00Z");
  });
});

// ---------------------------------------------------------------------------
// Coercion cases (item 2 of the brief) - nothing may throw, and nothing may
// reach the table as a value the type says is impossible.
// ---------------------------------------------------------------------------

describe("deserializeGradingRows: coercion", () => {
  it.each([null, "", "not json at all {{{", "[]", '{"v":1}', '{"v":1,"rows":"not-an-array"}', '{"v":99,"rows":[]}'])(
    "never throws on garbage input %j, and returns an empty array",
    (garbage) => {
      expect(() => deserializeGradingRows(garbage)).not.toThrow();
      expect(deserializeGradingRows(garbage)).toEqual([]);
    }
  );

  it("a stored blob from a hypothetical older/future version degrades to an empty table rather than throwing or guessing at an unknown shape", () => {
    const olderVersionBlob = JSON.stringify({
      v: 0,
      rows: [{ id: "a", studentName: "Maria", state: "pending" }],
    });
    expect(() => deserializeGradingRows(olderVersionBlob)).not.toThrow();
    expect(deserializeGradingRows(olderVersionBlob)).toEqual([]);
  });

  it("drops an individual malformed row (no usable id) but keeps the rest", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [
        { id: "keep-me", studentName: "Maria" },
        { studentName: "No Id Here" },
        null,
        "not an object",
        { id: "   " },
      ],
    });
    expect(deserializeGradingRows(raw).map((r) => r.id)).toEqual(["keep-me"]);
  });

  it("a stored `state` outside the known set coerces to pending, never throws, and never reaches the row as the garbage value", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a", state: "not-a-real-state" }] });
    const restored = deserializeGradingRows(raw);
    expect(restored[0].state).toBe("pending");
  });

  it("a stored `nameMatch` outside its four values coerces to no-roster, never a false assertion of matched or unmatched", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a", nameMatch: "definitely-a-match-trust-me" }] });
    expect(deserializeGradingRows(raw)[0].nameMatch).toBe("no-roster");
  });

  it("a missing `nameMatch` also coerces to no-roster (it is not an optional field on GradingRow - every row must carry a real member)", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a" }] });
    expect(deserializeGradingRows(raw)[0].nameMatch).toBe("no-roster");
  });

  it("a non-array `rosterCandidates` coerces to an empty array", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a", rosterCandidates: "not-an-array" }] });
    expect(deserializeGradingRows(raw)[0].rosterCandidates).toEqual([]);
  });

  it("a `rosterCandidates` array with non-string entries drops only the non-string entries", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a", rosterCandidates: ["Maria Alvarez", 42, null, "Diego Chen", { not: "a string" }] }],
    });
    expect(deserializeGradingRows(raw)[0].rosterCandidates).toEqual(["Maria Alvarez", "Diego Chen"]);
  });

  it("a truncated/missing `submissionText` defaults to an empty string, not undefined", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a" }] });
    expect(deserializeGradingRows(raw)[0].submissionText).toBe("");
  });

  it("missing feedback fields (totalScore/strengths/improvements/overallComment) default to empty strings", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a" }] });
    const restored = deserializeGradingRows(raw)[0];
    expect(restored.totalScore).toBe("");
    expect(restored.strengths).toBe("");
    expect(restored.improvements).toBe("");
    expect(restored.overallComment).toBe("");
  });

  it("an `error` on a row that is not failed is dropped to empty string even if present in storage", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a", state: "ready", error: "a stale message" }] });
    expect(deserializeGradingRows(raw)[0].error).toBe("");
  });

  it("a `grading` state read from storage (e.g. a tab closed mid-grade) coerces to pending on read as well as on write", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a", state: "grading" }] });
    expect(deserializeGradingRows(raw)[0].state).toBe("pending");
  });

  it("item 3 / item 6: `userEdited` defaults to false, never true, when missing or not a boolean", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a" }, { id: "b", userEdited: "yes" }, { id: "c", userEdited: 1 }],
    });
    const restored = deserializeGradingRows(raw);
    expect(restored.map((r) => r.userEdited)).toEqual([false, false, false]);
  });

  it("never mistakes a non-object row entry for a row, and never mistakes a non-object top-level payload for the table", () => {
    expect(deserializeGradingRows("42")).toEqual([]);
    expect(deserializeGradingRows('"a string"')).toEqual([]);
    expect(deserializeGradingRows("true")).toEqual([]);
  });

  it("a missing `submissionTimeStatus` coerces to 'unknown', never 'known' or 'marked-late'", () => {
    const raw = JSON.stringify({ v: GRADING_TABLE_VERSION, rows: [{ id: "a" }] });
    expect(deserializeGradingRows(raw)[0].submissionTimeStatus).toBe("unknown");
  });

  it("a `submissionTimeStatus` outside its three values coerces to 'unknown', never a false assertion of known or marked-late", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a", submissionTimeStatus: "definitely-on-time-trust-me" }],
    });
    expect(deserializeGradingRows(raw)[0].submissionTimeStatus).toBe("unknown");
  });

  it("a `submittedAt` value stored under a non-'known' status is dropped to empty string, never resurrected", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a", submissionTimeStatus: "unknown", submittedAt: "2026-09-01T23:59:00Z" }],
    });
    expect(deserializeGradingRows(raw)[0].submittedAt).toBe("");
  });

  it("a `submittedAt` value stored under 'marked-late' is also dropped - that state carries no timestamp", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a", submissionTimeStatus: "marked-late", submittedAt: "2026-09-01T23:59:00Z" }],
    });
    expect(deserializeGradingRows(raw)[0].submittedAt).toBe("");
  });

  it("a `submittedAt` value stored under 'known' survives", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a", submissionTimeStatus: "known", submittedAt: "2026-09-01T23:59:00Z" }],
    });
    expect(deserializeGradingRows(raw)[0].submittedAt).toBe("2026-09-01T23:59:00Z");
  });

  it("a non-string `assessment` coerces to absent rather than a default", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a", studentName: "Maria", submissionText: "x", assessment: 12345 }],
    });
    expect(deserializeGradingRows(raw)[0].assessment).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Item 4: the quota-fallback write. Never fails silently (the hook layer
// reports it - see useGradingRows.ts), never drops feedback while keeping
// submission text.
// ---------------------------------------------------------------------------

describe("serializeGradingRowsWithoutSubmissionText (item 4: quota fallback)", () => {
  const rows: GradingRow[] = [
    makeRow({
      id: "a",
      submissionText: "A very long submission that is the primary thing filling up storage.",
      totalScore: "9/10",
      strengths: "Real feedback that must never be lost.",
      improvements: "More real feedback.",
      overallComment: "Even more real feedback.",
      userEdited: true,
    }),
  ];

  it("drops submissionText to an empty string but keeps every feedback field and userEdited", () => {
    const restored = deserializeGradingRows(serializeGradingRowsWithoutSubmissionText(rows));
    expect(restored[0].submissionText).toBe("");
    expect(restored[0].totalScore).toBe("9/10");
    expect(restored[0].strengths).toBe("Real feedback that must never be lost.");
    expect(restored[0].improvements).toBe("More real feedback.");
    expect(restored[0].overallComment).toBe("Even more real feedback.");
    expect(restored[0].userEdited).toBe(true);
  });

  it("the reduced write is meaningfully smaller than the full write for a row carrying real submission text", () => {
    const full = serializeGradingRows(rows);
    const reduced = serializeGradingRowsWithoutSubmissionText(rows);
    expect(reduced.length).toBeLessThan(full.length);
  });

  it("also round-trips id, studentName, nameMatch, rosterCandidates and state through the reduced write", () => {
    const withRoster = [makeRow({ id: "z", studentName: "Zed Osei", nameMatch: "ambiguous", rosterCandidates: ["Zed Osei", "Zed O."], state: "ready" })];
    const restored = deserializeGradingRows(serializeGradingRowsWithoutSubmissionText(withRoster));
    expect(restored[0]).toMatchObject({ id: "z", studentName: "Zed Osei", nameMatch: "ambiguous", rosterCandidates: ["Zed Osei", "Zed O."], state: "ready" });
  });
});

// ---------------------------------------------------------------------------
// Frozen serialization oracle. Four rows, matching the brief's own list: a
// graded (unedited) row, a failed row, an edited row, and a row with
// `ambiguous` roster match and candidates. Captured by actually running
// serializeGradingRows/serializeGradingRowsWithoutSubmissionText against
// these exact rows and pasting the output verbatim - so a future format
// change is loud (a byte-for-byte mismatch), not a silent shape drift.
// ---------------------------------------------------------------------------

describe("frozen serialization oracle", () => {
  const oracleRows: GradingRow[] = [
    {
      id: "grade-1-0",
      studentName: "Maria Alvarez",
      nameMatch: "matched",
      rosterCandidates: ["Maria Alvarez"],
      submissionText:
        "Utilitarian calculus applied to the trolley problem shows that pulling the lever minimizes total harm, though quantifying happiness across people remains genuinely hard.",
      state: "ready",
      totalScore: "9/10",
      strengths: "Clear thesis and strong use of the reading.",
      improvements: "Consider addressing the counterargument from deontological ethics.",
      overallComment:
        "Strong work, Maria - clear thesis and strong use of the reading. Consider addressing the counterargument from deontological ethics.",
      error: "",
      userEdited: false,
      assessment: "essay-2",
      submissionTimeStatus: "known",
      submittedAt: "2026-09-01T23:59:00Z",
    },
    {
      id: "grade-1-1",
      studentName: "Diego Chen",
      nameMatch: "unmatched",
      rosterCandidates: [],
      submissionText: "I could not read this submission clearly off the screen.",
      state: "failed",
      totalScore: "",
      strengths: "",
      improvements: "",
      overallComment: "",
      error: "Gemini rejected the request (400).",
      userEdited: false,
      // D23c: explicit here (rather than left absent, like course/assessment
      // above) because deserializeGradingRows always normalizes an absent
      // status to the literal string "unknown" on read (see that function's
      // own comment on why this field does not get the same "absent stays
      // absent" treatment) - so the "still round-trips" test below, which
      // compares oracleRows to itself after a round trip, needs the fixture
      // to already carry the value the round trip will produce.
      submissionTimeStatus: "unknown",
      submittedAt: "",
    },
    {
      id: "grade-1-2",
      studentName: "Priya Nair",
      nameMatch: "no-roster",
      rosterCandidates: [],
      submissionText: "Consequentialism is the view that only outcomes matter morally.",
      state: "ready",
      totalScore: "10/10 (my own call)",
      strengths: "My own hand-typed strengths.",
      improvements: "My own hand-typed improvements.",
      overallComment: "My own hand-typed comment.",
      error: "",
      userEdited: true,
      // D23c: "marked-late" carries no timestamp - submittedAt stays "" (the
      // round-trip-stable form), same reasoning as grade-1-1/grade-1-3's own
      // comment above.
      submissionTimeStatus: "marked-late",
      submittedAt: "",
    },
    {
      id: "grade-1-3",
      studentName: "Sam Lee",
      nameMatch: "ambiguous",
      rosterCandidates: ["Sam Lee", "Samuel Lee"],
      submissionText: "No strong opinion either way on the reading.",
      state: "pending",
      totalScore: "",
      strengths: "",
      improvements: "",
      overallComment: "",
      error: "",
      userEdited: false,
      // D23c: see grade-1-1's own identical comment above.
      submissionTimeStatus: "unknown",
      submittedAt: "",
    },
  ];

  // Captured verbatim from a real run of serializeGradingRows against
  // oracleRows above (regenerated for D22b/D23e/D23c: assessment/
  // submissionTimeStatus/submittedAt are now part of the wire format -
  // grade-1-0 carries a real assessment + a "known" submission time,
  // grade-1-2 carries a "marked-late" verdict with no timestamp, and
  // grade-1-1/grade-1-3 exercise the all-absent/default case).
  const FROZEN_FULL =
    '{"v":1,"rows":[{"id":"grade-1-0","studentName":"Maria Alvarez","nameMatch":"matched","rosterCandidates":["Maria Alvarez"],"submissionText":"Utilitarian calculus applied to the trolley problem shows that pulling the lever minimizes total harm, though quantifying happiness across people remains genuinely hard.","state":"ready","totalScore":"9/10","strengths":"Clear thesis and strong use of the reading.","improvements":"Consider addressing the counterargument from deontological ethics.","overallComment":"Strong work, Maria - clear thesis and strong use of the reading. Consider addressing the counterargument from deontological ethics.","error":"","userEdited":false,"assessment":"essay-2","submissionTimeStatus":"known","submittedAt":"2026-09-01T23:59:00Z"},{"id":"grade-1-1","studentName":"Diego Chen","nameMatch":"unmatched","rosterCandidates":[],"submissionText":"I could not read this submission clearly off the screen.","state":"failed","totalScore":"","strengths":"","improvements":"","overallComment":"","error":"Gemini rejected the request (400).","userEdited":false,"submissionTimeStatus":"unknown","submittedAt":""},{"id":"grade-1-2","studentName":"Priya Nair","nameMatch":"no-roster","rosterCandidates":[],"submissionText":"Consequentialism is the view that only outcomes matter morally.","state":"ready","totalScore":"10/10 (my own call)","strengths":"My own hand-typed strengths.","improvements":"My own hand-typed improvements.","overallComment":"My own hand-typed comment.","error":"","userEdited":true,"submissionTimeStatus":"marked-late","submittedAt":""},{"id":"grade-1-3","studentName":"Sam Lee","nameMatch":"ambiguous","rosterCandidates":["Sam Lee","Samuel Lee"],"submissionText":"No strong opinion either way on the reading.","state":"pending","totalScore":"","strengths":"","improvements":"","overallComment":"","error":"","userEdited":false,"submissionTimeStatus":"unknown","submittedAt":""}]}';

  // Captured verbatim from a real run of serializeGradingRowsWithoutSubmissionText
  // against the same oracleRows - identical except every submissionText is "".
  const FROZEN_NOTEXT =
    '{"v":1,"rows":[{"id":"grade-1-0","studentName":"Maria Alvarez","nameMatch":"matched","rosterCandidates":["Maria Alvarez"],"submissionText":"","state":"ready","totalScore":"9/10","strengths":"Clear thesis and strong use of the reading.","improvements":"Consider addressing the counterargument from deontological ethics.","overallComment":"Strong work, Maria - clear thesis and strong use of the reading. Consider addressing the counterargument from deontological ethics.","error":"","userEdited":false,"assessment":"essay-2","submissionTimeStatus":"known","submittedAt":"2026-09-01T23:59:00Z"},{"id":"grade-1-1","studentName":"Diego Chen","nameMatch":"unmatched","rosterCandidates":[],"submissionText":"","state":"failed","totalScore":"","strengths":"","improvements":"","overallComment":"","error":"Gemini rejected the request (400).","userEdited":false,"submissionTimeStatus":"unknown","submittedAt":""},{"id":"grade-1-2","studentName":"Priya Nair","nameMatch":"no-roster","rosterCandidates":[],"submissionText":"","state":"ready","totalScore":"10/10 (my own call)","strengths":"My own hand-typed strengths.","improvements":"My own hand-typed improvements.","overallComment":"My own hand-typed comment.","error":"","userEdited":true,"submissionTimeStatus":"marked-late","submittedAt":""},{"id":"grade-1-3","studentName":"Sam Lee","nameMatch":"ambiguous","rosterCandidates":["Sam Lee","Samuel Lee"],"submissionText":"","state":"pending","totalScore":"","strengths":"","improvements":"","overallComment":"","error":"","userEdited":false,"submissionTimeStatus":"unknown","submittedAt":""}]}';

  it("matches the frozen literal byte-for-byte (full write)", () => {
    expect(serializeGradingRows(oracleRows)).toBe(FROZEN_FULL);
  });

  it("matches the frozen literal byte-for-byte (quota-fallback write)", () => {
    expect(serializeGradingRowsWithoutSubmissionText(oracleRows)).toBe(FROZEN_NOTEXT);
  });

  it("still round-trips the same representative table through deserializeGradingRows", () => {
    expect(deserializeGradingRows(serializeGradingRows(oracleRows))).toEqual(oracleRows);
  });

  it("none of these rows contain a student id field anywhere in the wire format (R0-2 / item 6)", () => {
    expect(FROZEN_FULL).not.toMatch(/userId|canvasSubmissionId|"studentId"/);
  });
});

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D21d: course
// scoping's read/write round trip. Mirrors discussion-serialization.test.ts's
// own D21d migration block - a course id is not a student id (the test just
// above pins that boundary) and is enumerated explicitly here, same as every
// other field (see grading-row-serialization.ts's own D21d header note).
// ---------------------------------------------------------------------------

describe("course (D21d)", () => {
  it("round-trips a real course tag", () => {
    const rows = [makeRow({ id: "a", course: "course-A" })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].course).toBe("course-A");
  });

  it("a row that never had a course round-trips with it still absent, and the written JSON carries no course key", () => {
    const rows = [makeRow({ id: "a" })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].course).toBeUndefined();
    expect(JSON.parse(serializeGradingRows(rows)).rows[0]).not.toHaveProperty("course");
  });

  it("a pre-existing global-table row (no course key at all in the raw JSON) deserializes as UNATTRIBUTED, not adopted into any course", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "legacy-1", studentName: "Maria Alvarez", submissionText: "An old submission." }],
    });
    expect(deserializeGradingRows(raw)[0].course).toBeUndefined();
  });

  it("a non-string persisted course coerces to absent rather than a default", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "a", studentName: "Maria", submissionText: "x", course: 12345 }],
    });
    expect(deserializeGradingRows(raw)[0].course).toBeUndefined();
  });

  it("the quota-fallback write also round-trips a real course tag (dropping submissionText does not drop course)", () => {
    const rows = [makeRow({ id: "a", course: "course-A" })];
    const restored = deserializeGradingRows(serializeGradingRowsWithoutSubmissionText(rows));
    expect(restored[0].course).toBe("course-A");
  });
});

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D22b/D23e:
// assessment's own read/write round trip - byte-for-byte mirror of the
// "course (D21d)" block above, since `assessment` is deliberately given the
// identical treatment `course` already got.
// ---------------------------------------------------------------------------

describe("assessment (D22b/D23e)", () => {
  it("round-trips a real assessment tag", () => {
    const rows = [makeRow({ id: "a", assessment: "essay-2" })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].assessment).toBe("essay-2");
  });

  it("a row that never had an assessment round-trips with it still absent, and the written JSON carries no assessment key", () => {
    const rows = [makeRow({ id: "a" })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].assessment).toBeUndefined();
    expect(JSON.parse(serializeGradingRows(rows)).rows[0]).not.toHaveProperty("assessment");
  });

  it("a pre-existing row (no assessment key at all in the raw JSON) deserializes as UNATTRIBUTED, not adopted into any assessment", () => {
    const raw = JSON.stringify({
      v: GRADING_TABLE_VERSION,
      rows: [{ id: "legacy-1", studentName: "Maria Alvarez", submissionText: "An old submission." }],
    });
    expect(deserializeGradingRows(raw)[0].assessment).toBeUndefined();
  });

  it("the quota-fallback write also round-trips a real assessment tag (dropping submissionText does not drop assessment)", () => {
    const rows = [makeRow({ id: "a", assessment: "essay-2" })];
    const restored = deserializeGradingRows(serializeGradingRowsWithoutSubmissionText(rows));
    expect(restored[0].assessment).toBe("essay-2");
  });

  it("course and assessment round-trip together on the same row, independently", () => {
    const rows = [makeRow({ id: "a", course: "course-A", assessment: "essay-2" })];
    const restored = deserializeGradingRows(serializeGradingRows(rows));
    expect(restored[0].course).toBe("course-A");
    expect(restored[0].assessment).toBe("essay-2");
  });
});
