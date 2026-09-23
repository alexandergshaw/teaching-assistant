import { describe, it, expect } from "vitest";
import { snapshotRowCodec } from "./snapshot-row-serialization";
import type { SnapshotAssessmentRow } from "./snapshot-row";

// ---------------------------------------------------------------------------
// Oracle A: the codec. Every case goes through snapshotRowCodec.toWire/
// .fromWire - the bare functions are not exported (confirmed:
// `grep -n "^export" snapshot-row-serialization.ts` shows only
// SNAPSHOT_TABLE_VERSION and snapshotRowCodec).
//
// FROZEN LITERAL ORACLE, NOT A ROUND TRIP. Every expected value below is
// hand-written. The only round-trip-shaped case (A7, the happy path) is
// explicitly marked non-load-bearing for the contested values - it proves
// continuity end to end, nothing more.
//
// Duplicated per-file per the test notes' M1: this makeFullRow is NOT
// imported from snapshot-row.test.ts (cross-*.test.ts imports re-run the
// other file's describe blocks).
// ---------------------------------------------------------------------------

function makeFullRow(overrides: Partial<SnapshotAssessmentRow> = {}): SnapshotAssessmentRow {
  return {
    id: "snap-row-1",
    studentName: "Priya N.",
    state: "ready",
    error: "",
    userEdited: false,
    totalScore: "8/10",
    strengths: "Clear thesis.",
    improvements: "Cite the rubric line.",
    overallComment: "Solid work overall.",
    shotReports: [{ shotIndex: 1, role: "post", status: "read", shotId: "shot-id-1" }],
    rubricAreas: [
      {
        area: "Clarity",
        score: "4/5",
        quote: "As I see it...",
        shotIndex: 1,
        source: "shot",
        verified: true,
        shotId: "shot-id-1",
      },
    ],
    missingRoles: ["replies"],
    instructionLikeContent: false,
    instructionLikeContentQuote: undefined,
    imageFallbackNote: undefined,
    evidenceDropped: false,
    strengthsNotice: "",
    cohortKey: "a1b2c3d4",
    ...overrides,
  };
}

describe("snapshotRowCodec.version", () => {
  it("is pinned to 1 (a silent bump discards every previously-stored table via assessment-row-store's obj.v !== codec.version check)", () => {
    expect(snapshotRowCodec.version).toBe(1);
  });
});

describe("snapshotRowCodec.toWire", () => {
  it("writes the full 17-key literal, unchanged for an already-ready/error-free row (A2 case 1)", () => {
    const row = makeFullRow();
    const result = snapshotRowCodec.toWire(row, { dropBulk: false });
    expect(result).toEqual({
      id: "snap-row-1",
      studentName: "Priya N.",
      state: "ready",
      error: "",
      userEdited: false,
      totalScore: "8/10",
      strengths: "Clear thesis.",
      improvements: "Cite the rubric line.",
      overallComment: "Solid work overall.",
      shotReports: [{ shotIndex: 1, role: "post", status: "read", shotId: "shot-id-1" }],
      rubricAreas: [
        {
          area: "Clarity",
          score: "4/5",
          quote: "As I see it...",
          shotIndex: 1,
          source: "shot",
          verified: true,
          shotId: "shot-id-1",
        },
      ],
      missingRoles: ["replies"],
      instructionLikeContent: false,
      instructionLikeContentQuote: undefined,
      imageFallbackNote: undefined,
      evidenceDropped: false,
      strengthsNotice: "",
      cohortKey: "a1b2c3d4",
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "studentName",
        "state",
        "error",
        "userEdited",
        "totalScore",
        "strengths",
        "improvements",
        "overallComment",
        "shotReports",
        "rubricAreas",
        "missingRoles",
        "instructionLikeContent",
        "instructionLikeContentQuote",
        "imageFallbackNote",
        "evidenceDropped",
        "strengthsNotice",
        "cohortKey",
      ].sort()
    );
  });

  it("never leaks an extra property via a spread - needs a deliberately malformed input to be meaningful", () => {
    const dirty = { ...makeFullRow(), foo: "bar" } as unknown as SnapshotAssessmentRow;
    const result = snapshotRowCodec.toWire(dirty, { dropBulk: false });
    expect("foo" in result).toBe(false);
  });

  it("normalizes state 'grading' to 'pending' on write", () => {
    const result = snapshotRowCodec.toWire(makeFullRow({ state: "grading" }), { dropBulk: false });
    expect(result.state).toBe("pending");
  });

  it("forces error to '' when state is not 'failed'", () => {
    const result = snapshotRowCodec.toWire(makeFullRow({ state: "ready", error: "stale failure" }), {
      dropBulk: false,
    });
    expect(result.error).toBe("");
  });

  it("preserves error when state is 'failed' (M-a: error is not always the constant '')", () => {
    const result = snapshotRowCodec.toWire(makeFullRow({ state: "failed", error: "quota exceeded" }), {
      dropBulk: false,
    });
    expect(result.error).toBe("quota exceeded");
  });

  it("CONTESTED VALUE 2: evidenceDropped is preserved, not reset, on an ordinary full write", () => {
    const result = snapshotRowCodec.toWire(makeFullRow({ evidenceDropped: true }), { dropBulk: false });
    expect(result.evidenceDropped).toBe(true);
  });

  it("dropBulk: true forces rubricAreas to [] and evidenceDropped to true", () => {
    const result = snapshotRowCodec.toWire(makeFullRow({ evidenceDropped: false }), { dropBulk: true });
    expect(result.rubricAreas).toEqual([]);
    expect(result.evidenceDropped).toBe(true);
  });
});

describe("snapshotRowCodec.fromWire - missing/empty id returns null", () => {
  it.each([[{}], [{ id: "" }], [{ id: "   " }], [{ id: 42 }]])("returns null for %j", (raw) => {
    expect(snapshotRowCodec.fromWire(raw as Record<string, unknown>)).toBeNull();
  });
});

describe("snapshotRowCodec.fromWire - happy path (non-load-bearing continuity check, not a contested-value proof)", () => {
  it("round-trips a full valid wire object to the exact expected row", () => {
    const wire = {
      id: "snap-row-1",
      studentName: "Priya N.",
      state: "ready",
      error: "",
      userEdited: false,
      totalScore: "8/10",
      strengths: "Clear thesis.",
      improvements: "Cite the rubric line.",
      overallComment: "Solid work overall.",
      shotReports: [{ shotIndex: 1, role: "post", status: "read", shotId: "shot-id-1" }],
      rubricAreas: [
        {
          area: "Clarity",
          score: "4/5",
          quote: "As I see it...",
          shotIndex: 1,
          source: "shot",
          verified: true,
          shotId: "shot-id-1",
        },
      ],
      missingRoles: ["replies"],
      instructionLikeContent: false,
      instructionLikeContentQuote: undefined,
      imageFallbackNote: undefined,
      evidenceDropped: false,
      strengthsNotice: "",
      cohortKey: "a1b2c3d4",
    };
    expect(snapshotRowCodec.fromWire(wire)).toEqual(makeFullRow());
  });
});

describe("snapshotRowCodec.fromWire - CONTESTED VALUE 1: userEdited", () => {
  it.each([
    [{ id: "x" }, true],
    [{ id: "x", userEdited: null }, true],
    [{ id: "x", userEdited: "true" }, true],
    [{ id: "x", userEdited: 1 }, true],
    [{ id: "x", userEdited: false }, false],
  ])("defaults to true on a corrupt/missing value, but preserves an explicit false (%j -> %s)", (raw, expected) => {
    const result = snapshotRowCodec.fromWire(raw as Record<string, unknown>);
    expect(result?.userEdited).toBe(expected);
  });
});

describe("snapshotRowCodec.fromWire - CONTESTED VALUE 3a: shotReports drops non-finite shotIndex entries", () => {
  it("drops NaN/wrong-type/Infinity/missing shotIndex entries, keeping only the one valid entry", () => {
    const raw = {
      id: "x",
      shotReports: [
        { shotIndex: 1, role: "post", status: "read" },
        { shotIndex: NaN, role: "post", status: "read" },
        { shotIndex: "2", role: "post", status: "read" },
        { shotIndex: Infinity, role: "post", status: "read" },
        {},
      ],
    };
    const result = snapshotRowCodec.fromWire(raw);
    expect(result?.shotReports).toHaveLength(1);
    expect(result?.shotReports).toEqual([{ shotIndex: 1, role: "post", status: "read", reason: undefined, shotId: null }]);
  });
});

describe("snapshotRowCodec.fromWire - CONTESTED VALUE 3b: rubricAreas drops non-finite shotIndex entries (a separate filter block from shotReports)", () => {
  it("drops NaN/wrong-type/Infinity/missing shotIndex entries, keeping only the one valid entry", () => {
    const raw = {
      id: "x",
      rubricAreas: [
        { area: "A", score: "1/1", quote: "q", shotIndex: 1, verified: true },
        { area: "A", score: "1/1", quote: "q", shotIndex: NaN, verified: true },
        { area: "A", score: "1/1", quote: "q", shotIndex: "2", verified: true },
        { area: "A", score: "1/1", quote: "q", shotIndex: Infinity, verified: true },
        {},
      ],
    };
    const result = snapshotRowCodec.fromWire(raw);
    expect(result?.rubricAreas).toHaveLength(1);
    expect(result?.rubricAreas).toEqual([
      { area: "A", score: "1/1", quote: "q", shotIndex: 1, source: "unknown", verified: true, shotId: null },
    ]);
  });
});

describe("snapshotRowCodec.fromWire - shotReports.role defaults to 'other' rather than dropping the entry", () => {
  it("keeps an entry with an invalid role, defaulting role to 'other'", () => {
    const raw = { id: "x", shotReports: [{ shotIndex: 1, role: "not-a-role", status: "read" }] };
    const result = snapshotRowCodec.fromWire(raw);
    expect(result?.shotReports).toHaveLength(1);
    expect(result?.shotReports[0].role).toBe("other");
  });
});

describe("snapshotRowCodec.fromWire - shotReports.status defaults to 'not-read'", () => {
  it("defaults an invalid/missing status to 'not-read'", () => {
    const raw = { id: "x", shotReports: [{ shotIndex: 1, role: "post", status: "bogus" }] };
    const result = snapshotRowCodec.fromWire(raw);
    expect(result?.shotReports[0].status).toBe("not-read");
  });
});

describe("snapshotRowCodec.fromWire - CONTESTED VALUE 5: shotId (R1) - a legacy row with no shotId field renders IDENTICALLY to a hallucinated-index row whose shotId later fails to resolve, both as null (Ruling R1-D's owner decision)", () => {
  it.each([
    [{ shotIndex: 1, role: "post", status: "read" }, null],
    [{ shotIndex: 1, role: "post", status: "read", shotId: null }, null],
    [{ shotIndex: 1, role: "post", status: "read", shotId: 42 }, null],
    [{ shotIndex: 1, role: "post", status: "read", shotId: "shot-id-9" }, "shot-id-9"],
  ])("shotReports[].shotId defaults to null on a missing/corrupt value, preserving an explicit string (%j -> %s)", (entry, expected) => {
    const result = snapshotRowCodec.fromWire({ id: "x", shotReports: [entry] });
    expect(result?.shotReports[0].shotId).toBe(expected);
  });

  it.each([
    [{ area: "A", score: "1/1", quote: "q", shotIndex: 1, verified: true }, null],
    [{ area: "A", score: "1/1", quote: "q", shotIndex: 1, verified: true, shotId: null }, null],
    [{ area: "A", score: "1/1", quote: "q", shotIndex: 1, verified: true, shotId: 42 }, null],
    [{ area: "A", score: "1/1", quote: "q", shotIndex: 1, verified: true, shotId: "shot-id-9" }, "shot-id-9"],
  ])("rubricAreas[].shotId defaults to null on a missing/corrupt value, preserving an explicit string (%j -> %s)", (entry, expected) => {
    const result = snapshotRowCodec.fromWire({ id: "x", rubricAreas: [entry] });
    expect(result?.rubricAreas[0].shotId).toBe(expected);
  });
});

describe("snapshotRowCodec.fromWire - CONTESTED VALUE 4: evidenceDropped", () => {
  it.each([
    [{ id: "x" }, false],
    [{ id: "x", evidenceDropped: null }, false],
    [{ id: "x", evidenceDropped: "yes" }, false],
    [{ id: "x", evidenceDropped: true }, true],
  ])("defaults to false on a corrupt/missing value, but preserves an explicit true (%j -> %s)", (raw, expected) => {
    const result = snapshotRowCodec.fromWire(raw as Record<string, unknown>);
    expect(result?.evidenceDropped).toBe(expected);
  });
});

describe("snapshotRowCodec.fromWire - missingRoles filters invalid entries, defaults to []", () => {
  it("keeps only valid role strings", () => {
    const raw = { id: "x", missingRoles: ["replies", "not-a-role", 42, null, "submission"] };
    const result = snapshotRowCodec.fromWire(raw);
    expect(result?.missingRoles).toEqual(["replies", "submission"]);
  });

  it("defaults to [] when not an array", () => {
    const result = snapshotRowCodec.fromWire({ id: "x", missingRoles: "not-an-array" });
    expect(result?.missingRoles).toEqual([]);
  });
});

describe("snapshotRowCodec.fromWire - never throws on malformed-but-object-shaped input", () => {
  it.each([
    [{ id: "x", shotReports: "not an array" }],
    [{ id: "x", shotReports: [null, 42, "string", {}] }],
    [{ id: "x", rubricAreas: [{ shotIndex: {} }] }],
    [{ id: "x", missingRoles: [{}, [], null] }],
  ])("does not throw for %j", (raw) => {
    expect(() => snapshotRowCodec.fromWire(raw as Record<string, unknown>)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Addendum additions 1-3: the READ-side state normalization/fallback/error
// gate. These are DIFFERENT lines from the write-side (toWire) cases above.
// ---------------------------------------------------------------------------

describe("snapshotRowCodec.fromWire - read-side state handling (addendum additions 1-3)", () => {
  it("normalizes state 'grading' to 'pending' on read (a different line from the write-side normalization)", () => {
    const result = snapshotRowCodec.fromWire({ id: "x", state: "grading" });
    expect(result?.state).toBe("pending");
  });

  it("falls back an invalid state string to 'pending'", () => {
    const result = snapshotRowCodec.fromWire({ id: "x", state: "banana" });
    expect(result?.state).toBe("pending");
  });

  it("gates error to '' unless state is 'failed', even when a stale error string is present", () => {
    const result = snapshotRowCodec.fromWire({ id: "x", state: "ready", error: "stale" });
    expect(result?.error).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Addendum addition 4: field-degradation table, driven off the returned
// row's own key list so a field added later without a case is visible.
// ---------------------------------------------------------------------------

describe("snapshotRowCodec.fromWire - field degradation coverage", () => {
  it("the degradation table below covers every top-level string/optional-string field fromWire coerces (id/state/error/userEdited/array fields excluded - each has its own dedicated case above)", () => {
    const full = snapshotRowCodec.fromWire({
      id: "x",
      studentName: "s",
      state: "ready",
      error: "",
      userEdited: false,
      totalScore: "t",
      strengths: "st",
      improvements: "i",
      overallComment: "o",
      shotReports: [],
      rubricAreas: [],
      missingRoles: [],
      instructionLikeContent: false,
      instructionLikeContentQuote: "q",
      imageFallbackNote: "f",
      evidenceDropped: false,
      strengthsNotice: "n",
      cohortKey: "k",
    }) as unknown as Record<string, unknown>;
    const excluded = new Set([
      "id",
      "state",
      "error",
      "userEdited",
      "shotReports",
      "rubricAreas",
      "missingRoles",
      "instructionLikeContent",
      "evidenceDropped",
    ]);
    const actualKeysToDegrade = Object.keys(full)
      .filter((k) => !excluded.has(k))
      .sort();
    const tableCoveredFields = [
      "studentName",
      "totalScore",
      "strengths",
      "improvements",
      "overallComment",
      "instructionLikeContentQuote",
      "imageFallbackNote",
      "strengthsNotice",
      "cohortKey",
    ].sort();
    expect(actualKeysToDegrade).toEqual(tableCoveredFields);
  });

  it.each([
    ["studentName", 42, ""],
    ["totalScore", 42, ""],
    ["strengths", 42, ""],
    ["improvements", 42, ""],
    ["overallComment", 42, ""],
    ["instructionLikeContentQuote", 42, undefined],
    ["imageFallbackNote", 42, undefined],
    ["strengthsNotice", 42, ""],
    ["cohortKey", 42, undefined],
  ])("degrades %s to its safe default when given a non-string value", (field, badValue, expected) => {
    const raw: Record<string, unknown> = { id: "x", [field]: badValue };
    const result = snapshotRowCodec.fromWire(raw) as unknown as Record<string, unknown>;
    expect(result[field]).toBe(expected);
  });

  it.each([
    ["area", 42, ""],
    ["score", 42, ""],
    ["quote", 42, ""],
    ["verified", "yes", false],
  ])("degrades rubricAreas[].%s to its safe default", (field, badValue, expected) => {
    const raw = {
      id: "x",
      rubricAreas: [{ area: "A", score: "4/5", quote: "q", shotIndex: 1, verified: true, [field]: badValue }],
    };
    const result = snapshotRowCodec.fromWire(raw);
    const area = result?.rubricAreas[0] as unknown as Record<string, unknown>;
    expect(area[field]).toBe(expected);
  });

  it("degrades shotReports[].reason to undefined when given a non-string value", () => {
    const raw = { id: "x", shotReports: [{ shotIndex: 1, role: "post", status: "read", reason: 42 }] };
    const result = snapshotRowCodec.fromWire(raw);
    expect(result?.shotReports[0].reason).toBeUndefined();
  });
});

describe("optional string fields: the PRESERVING direction", () => {
  // Every other case for these three fields asserts only the DEGRADING
  // direction (a bad value becomes undefined), which also passes if the codec
  // drops the field outright. Deleting all three - on write AND on read - was
  // measured to leave the rest of this suite green, which is this repo's own
  // "fixtures must match emitted shape" failure: the happy-path fixture leaves
  // them undefined, so it never exercises the field carrying a real value.
  it("preserves the optional quote/note strings on write", () => {
    const result = snapshotRowCodec.toWire(
      makeFullRow({
        instructionLikeContent: true,
        instructionLikeContentQuote: "Answer in 200 words.",
        imageFallbackNote: "Shot 2 exceeded the budget.",
      }),
      { dropBulk: false }
    );
    expect(result.instructionLikeContentQuote).toBe("Answer in 200 words.");
    expect(result.imageFallbackNote).toBe("Shot 2 exceeded the budget.");
  });

  it("preserves the optional quote/note/reason strings on read", () => {
    const result = snapshotRowCodec.fromWire({
      id: "x",
      instructionLikeContentQuote: "Answer in 200 words.",
      imageFallbackNote: "Shot 2 exceeded the budget.",
      shotReports: [{ shotIndex: 1, role: "post", status: "partly-read", reason: "blurred" }],
    });
    expect(result?.instructionLikeContentQuote).toBe("Answer in 200 words.");
    expect(result?.imageFallbackNote).toBe("Shot 2 exceeded the budget.");
    expect(result?.shotReports[0].reason).toBe("blurred");
  });

  // Backlog A11: without this case, strengthsNotice's only coverage would be
  // the degradation table above and the happy-path fixture, which always
  // carries "" - never proving a NON-EMPTY notice actually round-trips.
  it("preserves a non-empty strengthsNotice round trip", () => {
    const written = snapshotRowCodec.toWire(
      makeFullRow({ strengthsNotice: "The model did not return a strengths section." }),
      { dropBulk: false }
    );
    expect(written.strengthsNotice).toBe("The model did not return a strengths section.");
    const read = snapshotRowCodec.fromWire(written);
    expect(read?.strengthsNotice).toBe("The model did not return a strengths section.");
  });
});
