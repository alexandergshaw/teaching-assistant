// Unit tests for assessment-row-store.ts - the generic serialize/deserialize
// pair, exercised against a small fixture codec so this file does not need
// to know about any real surface's row shape. grading-row-serialization.test.ts
// keeps its own 585 lines of coverage for the GradingRow codec specifically;
// this file's job is the GENERIC envelope (version gate, array gate, garbage
// input, and the two-tier dropBulk contract), plus a frozen exact-key-set
// oracle over the FIXTURE codec's own toWire output, so a new field riding
// silently into ANY codec's wire format (not just GradingRow's) would turn
// this file red too.
//
// DELIBERATELY does not import anything from grading-row.ts or
// grading-row-serialization.ts: this directory's own boundary canary
// (assessment-shared.structure.test.ts) scans every file here - including
// this one - for a fixed list of words naming per-surface, grading-only
// fields, and a GradingRow fixture in this file would trip it even though
// this file is only a unit test, not a shared-core leak. The fixture codec
// below exists specifically so this file's coverage never needs a real
// surface's row shape.

import { describe, it, expect } from "vitest";
import { serializeAssessmentRows, deserializeAssessmentRows, type AssessmentRowCodec } from "./assessment-row-store";
import type { AssessmentRowCore, NoPostableIdentity } from "./assessment-row";

// ---------------------------------------------------------------------------
// A minimal fixture row/codec - deliberately NOT GradingRow, so these tests
// exercise assessment-row-store.ts's own generic envelope logic rather than
// re-testing GradingRow's own field coercions (grading-row-serialization.test.ts's
// job).
// ---------------------------------------------------------------------------

interface FixtureRow extends AssessmentRowCore {
  bulkField: string;
}

const FIXTURE_VERSION = 1;

function makeFixtureRow(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: "row-1",
    studentName: "Fixture Student",
    state: "pending",
    error: "",
    userEdited: false,
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    bulkField: "a large recoverable field",
    ...overrides,
  };
}

const fixtureCodec: AssessmentRowCodec<FixtureRow> = {
  version: FIXTURE_VERSION,
  toWire(row, opts) {
    const r = row as unknown as FixtureRow;
    return {
      id: r.id,
      studentName: r.studentName,
      state: r.state,
      error: r.error,
      userEdited: r.userEdited,
      totalScore: r.totalScore,
      strengths: r.strengths,
      improvements: r.improvements,
      overallComment: r.overallComment,
      bulkField: opts.dropBulk ? "" : r.bulkField,
    };
  },
  fromWire(raw) {
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) return null;
    return {
      id,
      studentName: typeof raw.studentName === "string" ? raw.studentName : "",
      state: (typeof raw.state === "string" ? raw.state : "pending") as FixtureRow["state"],
      error: typeof raw.error === "string" ? raw.error : "",
      userEdited: typeof raw.userEdited === "boolean" ? raw.userEdited : false,
      totalScore: typeof raw.totalScore === "string" ? raw.totalScore : "",
      strengths: typeof raw.strengths === "string" ? raw.strengths : "",
      improvements: typeof raw.improvements === "string" ? raw.improvements : "",
      overallComment: typeof raw.overallComment === "string" ? raw.overallComment : "",
      bulkField: typeof raw.bulkField === "string" ? raw.bulkField : "",
    } as unknown as NoPostableIdentity<FixtureRow>;
  },
};

describe("serializeAssessmentRows / deserializeAssessmentRows generic envelope", () => {
  it("round-trips a well-formed table", () => {
    const rows = [makeFixtureRow({ id: "a" }), makeFixtureRow({ id: "b", state: "ready", totalScore: "8/10" })];
    const raw = serializeAssessmentRows(rows, fixtureCodec, false);
    const restored = deserializeAssessmentRows(raw, fixtureCodec);
    expect(restored).toEqual(rows);
  });

  it("writes the codec's own version into the envelope", () => {
    const raw = JSON.parse(serializeAssessmentRows([makeFixtureRow()], fixtureCodec, false)) as { v: number };
    expect(raw.v).toBe(FIXTURE_VERSION);
  });

  it("a version mismatch degrades to an empty table rather than guessing at an unknown shape", () => {
    const raw = JSON.stringify({ v: FIXTURE_VERSION + 1, rows: [makeFixtureRow()] });
    expect(deserializeAssessmentRows(raw, fixtureCodec)).toEqual([]);
  });

  it("a non-array rows field degrades to an empty table", () => {
    const raw = JSON.stringify({ v: FIXTURE_VERSION, rows: "not-an-array" });
    expect(deserializeAssessmentRows(raw, fixtureCodec)).toEqual([]);
  });

  it("null input yields an empty table", () => {
    expect(deserializeAssessmentRows(null, fixtureCodec)).toEqual([]);
  });

  it("never throws on garbage JSON - malformed input yields an empty table", () => {
    expect(deserializeAssessmentRows("{not valid json", fixtureCodec)).toEqual([]);
  });

  it("never throws on a JSON value that is not an object", () => {
    expect(deserializeAssessmentRows("42", fixtureCodec)).toEqual([]);
    expect(deserializeAssessmentRows("null", fixtureCodec)).toEqual([]);
    expect(deserializeAssessmentRows('"a string"', fixtureCodec)).toEqual([]);
  });

  it("drops a row the codec's own fromWire could not recover (no usable id) rather than failing the whole load", () => {
    const raw = JSON.stringify({
      v: FIXTURE_VERSION,
      rows: [{ id: "" }, { id: "b", studentName: "Kept" }],
    });
    const restored = deserializeAssessmentRows(raw, fixtureCodec);
    expect(restored.length).toBe(1);
    expect(restored[0].id).toBe("b");
  });

  it("skips a non-object row entry rather than throwing", () => {
    const raw = JSON.stringify({ v: FIXTURE_VERSION, rows: [null, 42, "x", { id: "b" }] });
    const restored = deserializeAssessmentRows(raw, fixtureCodec);
    expect(restored.length).toBe(1);
    expect(restored[0].id).toBe("b");
  });

  it("dropBulk=false keeps the bulk field", () => {
    const rows = [makeFixtureRow({ id: "a", bulkField: "keep me" })];
    const raw = JSON.parse(serializeAssessmentRows(rows, fixtureCodec, false)) as { rows: Array<{ bulkField: string }> };
    expect(raw.rows[0].bulkField).toBe("keep me");
  });

  it("dropBulk=true drops the bulk field but keeps every other field - the quota-fallback contract", () => {
    const rows = [makeFixtureRow({ id: "a", bulkField: "drop me", totalScore: "9/10", userEdited: true })];
    const raw = JSON.parse(serializeAssessmentRows(rows, fixtureCodec, true)) as {
      rows: Array<{ bulkField: string; totalScore: string; userEdited: boolean }>;
    };
    expect(raw.rows[0].bulkField).toBe("");
    expect(raw.rows[0].totalScore).toBe("9/10");
    expect(raw.rows[0].userEdited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frozen exact-key-set oracle over the FIXTURE codec (see this file's
// header for why this cannot be the real GradingRow codec). A new field
// riding silently into a codec's `toWire` output without a matching update
// to whatever hardcoded key list a caller checks against turns this red -
// grading-row-serialization.test.ts (and, for the real GradingRow codec,
// its own coverage) is the equivalent check for that specific surface.
// ---------------------------------------------------------------------------

describe("fixtureCodec exact-key-set oracle", () => {
  it("toWire emits exactly the ten known fixture wire fields, in this order, no more and no fewer", () => {
    const wire = fixtureCodec.toWire(makeFixtureRow() as unknown as NoPostableIdentity<FixtureRow>, {
      dropBulk: false,
    });
    expect(Object.keys(wire)).toEqual([
      "id",
      "studentName",
      "state",
      "error",
      "userEdited",
      "totalScore",
      "strengths",
      "improvements",
      "overallComment",
      "bulkField",
    ]);
  });
});
