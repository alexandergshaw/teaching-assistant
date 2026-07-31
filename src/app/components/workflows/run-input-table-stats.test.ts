import { describe, it, expect } from "vitest";
import {
  computeVisibleTableRows,
  computeGradeStats,
  computeGradeDistribution,
  gradeIssue,
} from "./run-input-table-stats";

describe("computeVisibleTableRows", () => {
  it("returns an empty list when there is no table prompt active", () => {
    expect(computeVisibleTableRows(null, [{ a: "1" }], "", null, null)).toEqual([]);
  });

  it("returns an empty list when the prompt is not a table", () => {
    const rows = [{ a: "1" }];
    expect(computeVisibleTableRows({ kind: "text" }, rows, "", null, null)).toEqual([]);
  });

  it("returns rows in original order (with their index) when there is no search or sort", () => {
    const rows = [{ name: "Bob" }, { name: "Alice" }];
    const result = computeVisibleTableRows({ kind: "table" }, rows, "", null, null);
    expect(result).toEqual([
      { row: { name: "Bob" }, index: 0 },
      { row: { name: "Alice" }, index: 1 },
    ]);
  });

  it("uses tableFrozenOrder when set, ignoring search/sort entirely", () => {
    const rows = [{ name: "Bob" }, { name: "Alice" }, { name: "Carl" }];
    const result = computeVisibleTableRows(
      { kind: "table" },
      rows,
      "zzz-does-not-match-anything",
      { key: "name", dir: "asc" },
      [2, 0]
    );
    expect(result).toEqual([
      { row: { name: "Carl" }, index: 2 },
      { row: { name: "Bob" }, index: 0 },
    ]);
  });

  it("drops frozen indices that no longer resolve to a row", () => {
    const rows = [{ name: "Bob" }];
    const result = computeVisibleTableRows({ kind: "table" }, rows, "", null, [0, 5]);
    expect(result).toEqual([{ row: { name: "Bob" }, index: 0 }]);
  });

  it("filters rows by a case-insensitive search across non-link columns", () => {
    const rows = [{ name: "Bob Smith" }, { name: "Alice Jones" }];
    const result = computeVisibleTableRows(
      { kind: "table", columns: [{ key: "name" }] },
      rows,
      "alice",
      null,
      null
    );
    expect(result).toEqual([{ row: { name: "Alice Jones" }, index: 1 }]);
  });

  it("excludes link columns from the search match", () => {
    const rows = [{ name: "Bob", url: "https://example.com/alice-profile" }];
    const result = computeVisibleTableRows(
      { kind: "table", columns: [{ key: "name" }, { key: "url", link: true }] },
      rows,
      "alice",
      null,
      null
    );
    expect(result).toEqual([]);
  });

  it("sorts numerically when both values parse as numbers", () => {
    const rows = [{ score: "10" }, { score: "2" }, { score: "30" }];
    const asc = computeVisibleTableRows({ kind: "table" }, rows, "", { key: "score", dir: "asc" }, null);
    expect(asc.map((r) => r.row.score)).toEqual(["2", "10", "30"]);
    const desc = computeVisibleTableRows({ kind: "table" }, rows, "", { key: "score", dir: "desc" }, null);
    expect(desc.map((r) => r.row.score)).toEqual(["30", "10", "2"]);
  });

  it("sorts non-numeric values lexicographically and places numeric values before non-numeric ones ascending", () => {
    const rows = [{ score: "abc" }, { score: "5" }];
    const asc = computeVisibleTableRows({ kind: "table" }, rows, "", { key: "score", dir: "asc" }, null);
    expect(asc.map((r) => r.row.score)).toEqual(["5", "abc"]);
  });

  it("combines search and sort together", () => {
    const rows = [
      { name: "Zed Team", score: "5" },
      { name: "Zed Squad", score: "20" },
      { name: "Other", score: "99" },
    ];
    const result = computeVisibleTableRows(
      { kind: "table", columns: [{ key: "name" }, { key: "score" }] },
      rows,
      "zed",
      { key: "score", dir: "desc" },
      null
    );
    expect(result.map((r) => r.row.name)).toEqual(["Zed Squad", "Zed Team"]);
  });
});

describe("computeGradeStats", () => {
  it("returns null when the table has no grade column", () => {
    expect(computeGradeStats(false, [{ grade: "90", outOf: "100" }])).toBeNull();
  });

  it("counts missing and invalid grades separately from valid ones", () => {
    const rows = [
      { grade: "", outOf: "100" }, // missing
      { grade: "abc", outOf: "100" }, // invalid (not numeric)
      { grade: "-5", outOf: "100" }, // invalid (negative)
      { grade: "150", outOf: "100" }, // invalid (exceeds outOf)
      { grade: "80", outOf: "100" }, // valid
    ];
    const stats = computeGradeStats(true, rows);
    expect(stats).not.toBeNull();
    expect(stats!.missing).toBe(1);
    expect(stats!.invalid).toBe(3);
    expect(stats!.avg).toBe(80);
    expect(stats!.min).toBe(80);
    expect(stats!.max).toBe(80);
  });

  it("returns null aggregates (but real counts) when there are no valid grades at all", () => {
    const rows = [{ grade: "", outOf: "100" }, { grade: "xyz", outOf: "100" }];
    const stats = computeGradeStats(true, rows);
    expect(stats).toEqual({ invalid: 1, missing: 1, avg: null, median: null, min: null, max: null });
  });

  it("computes the median for an odd count as the middle value", () => {
    const rows = [{ grade: "70" }, { grade: "90" }, { grade: "80" }];
    const stats = computeGradeStats(true, rows);
    expect(stats!.median).toBe(80);
  });

  it("computes the median for an even count as the average of the two middle values", () => {
    const rows = [{ grade: "70" }, { grade: "80" }, { grade: "90" }, { grade: "100" }];
    const stats = computeGradeStats(true, rows);
    expect(stats!.median).toBe(85);
  });

  it("allows a grade at exactly outOf (boundary, not invalid)", () => {
    const rows = [{ grade: "100", outOf: "100" }];
    const stats = computeGradeStats(true, rows);
    expect(stats!.invalid).toBe(0);
    expect(stats!.avg).toBe(100);
  });

  it("treats a grade with no outOf as valid (outOf check only applies when outOf is finite)", () => {
    const rows = [{ grade: "80" }];
    const stats = computeGradeStats(true, rows);
    expect(stats!.invalid).toBe(0);
    expect(stats!.avg).toBe(80);
  });
});

describe("computeGradeDistribution", () => {
  it("returns null when the table has no grade column", () => {
    expect(computeGradeDistribution(false, [{ grade: "95", outOf: "100" }])).toBeNull();
  });

  it("returns null when no row has both a grade and a positive outOf", () => {
    expect(computeGradeDistribution(true, [{ grade: "", outOf: "100" }, { grade: "90", outOf: "0" }])).toBeNull();
  });

  it("buckets rows into the four percentage bands", () => {
    const rows = [
      { grade: "95", outOf: "100" }, // 95% -> success
      { grade: "85", outOf: "100" }, // 85% -> accent
      { grade: "75", outOf: "100" }, // 75% -> warning
      { grade: "50", outOf: "100" }, // 50% -> danger
      { grade: "90", outOf: "100" }, // 90% -> success (boundary)
    ];
    const dist = computeGradeDistribution(true, rows);
    expect(dist).not.toBeNull();
    expect(dist!.total).toBe(5);
    const byBand = Object.fromEntries(dist!.segments.map((s) => [s.band, s.count]));
    expect(byBand).toEqual({ success: 2, accent: 1, warning: 1, danger: 1 });
  });

  it("skips rows without a grade or without a positive numeric outOf", () => {
    const rows = [
      { grade: "", outOf: "100" },
      { grade: "80", outOf: "0" },
      { grade: "80", outOf: "abc" },
      { grade: "80", outOf: "100" },
    ];
    const dist = computeGradeDistribution(true, rows);
    expect(dist!.total).toBe(1);
  });

  it("builds a readable ariaLabel summarizing every band", () => {
    const rows = [{ grade: "95", outOf: "100" }];
    const dist = computeGradeDistribution(true, rows);
    expect(dist!.ariaLabel).toBe("1 at 90%+, 0 at 80-89%, 0 at 70-79%, 0 at below 70%");
  });

  // These three mirror tableGradeIssue's invalid-grade rule in
  // run-results.tsx: a row that rule flags must be excluded from the
  // distribution entirely, never folded into a percentage band. Extraction
  // previously dropped this exclusion (a "150/100" grade landed in
  // "success", "-5" in "danger", and "abc" fell through to "danger" via a
  // NaN comparison) - these are the cases that let that divergence through.
  it("excludes a grade that exceeds a valid positive outOf, rather than banding it", () => {
    const rows = [{ grade: "150", outOf: "100" }];
    const dist = computeGradeDistribution(true, rows);
    expect(dist).toBeNull();
  });

  it("excludes a negative grade, rather than banding it as danger", () => {
    const rows = [{ grade: "-5", outOf: "100" }];
    const dist = computeGradeDistribution(true, rows);
    expect(dist).toBeNull();
  });

  it("excludes a non-numeric grade, rather than letting a NaN comparison fall through to danger", () => {
    const rows = [{ grade: "abc", outOf: "100" }];
    const dist = computeGradeDistribution(true, rows);
    expect(dist).toBeNull();
  });

  it("excludes invalid rows alongside valid ones, banding only the valid grades", () => {
    const rows = [
      { grade: "95", outOf: "100" }, // valid -> success
      { grade: "150", outOf: "100" }, // invalid: over outOf
      { grade: "-5", outOf: "100" }, // invalid: negative
      { grade: "abc", outOf: "100" }, // invalid: non-numeric
    ];
    const dist = computeGradeDistribution(true, rows);
    expect(dist).not.toBeNull();
    expect(dist!.total).toBe(1);
    const byBand = Object.fromEntries(dist!.segments.map((s) => [s.band, s.count]));
    expect(byBand).toEqual({ success: 1, accent: 0, warning: 0, danger: 0 });
  });

  it("matches the live distribution for a mixed fixture (valid, missing, over-max, negative, non-numeric)", () => {
    const rows = [
      { grade: "95", outOf: "100" }, // valid -> success
      { grade: "85", outOf: "100" }, // valid -> accent
      { grade: "", outOf: "100" }, // missing
      { grade: "150", outOf: "100" }, // invalid: over outOf
      { grade: "-5", outOf: "100" }, // invalid: negative
      { grade: "abc", outOf: "100" }, // invalid: non-numeric
    ];

    // The "live" computation this function must match: bucket only rows
    // gradeIssue does not flag (mirrors tableGradeBand's neutral-exclusion
    // in run-results.tsx, driven by the same shared predicate).
    const liveCounts = { success: 0, accent: 0, warning: 0, danger: 0 };
    for (const row of rows) {
      const raw = row.grade.trim();
      if (raw === "" || gradeIssue(row) !== null) continue;
      const outOf = parseFloat(row.outOf.trim());
      if (!Number.isFinite(outOf) || outOf <= 0) continue;
      const pct = (parseFloat(raw) / outOf) * 100;
      const band = pct >= 90 ? "success" : pct >= 80 ? "accent" : pct >= 70 ? "warning" : "danger";
      liveCounts[band] += 1;
    }
    const liveTotal = liveCounts.success + liveCounts.accent + liveCounts.warning + liveCounts.danger;

    const dist = computeGradeDistribution(true, rows);
    expect(dist).not.toBeNull();
    expect(dist!.total).toBe(liveTotal);
    const byBand = Object.fromEntries(dist!.segments.map((s) => [s.band, s.count]));
    expect(byBand).toEqual(liveCounts);
    expect(byBand).toEqual({ success: 1, accent: 1, warning: 0, danger: 0 });
  });
});

describe("gradeIssue", () => {
  it("is not an issue for an empty grade (comment-only posting)", () => {
    expect(gradeIssue({ grade: "", outOf: "100" })).toBeNull();
  });

  it("flags a non-numeric grade", () => {
    expect(gradeIssue({ grade: "abc", outOf: "100" })).toBe("not a number");
  });

  it("flags a negative grade", () => {
    expect(gradeIssue({ grade: "-5", outOf: "100" })).toBe("below 0");
  });

  it("flags a grade exceeding a positive outOf", () => {
    expect(gradeIssue({ grade: "150", outOf: "100" })).toBe("above 100");
  });

  it("does not flag a grade at exactly outOf", () => {
    expect(gradeIssue({ grade: "100", outOf: "100" })).toBeNull();
  });

  it("does not flag a grade with no outOf to compare against", () => {
    expect(gradeIssue({ grade: "80" })).toBeNull();
  });
});
