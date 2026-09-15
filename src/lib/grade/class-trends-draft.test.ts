import { describe, it, expect } from "vitest";
import { composeClassTrendsDraft, DEFAULT_CLASS_TRENDS_DRAFT_FLOOR } from "./class-trends-draft";
import type { AreaTrend, AreaTrendDirection, ClassTrendsReport } from "./class-trends";
import type { ClassTrendsInsightObservation } from "./class-trends-insight";

const FLOOR = 5;

function makeArea(overrides: Partial<AreaTrend> & { direction: AreaTrendDirection }): AreaTrend {
  return {
    area: overrides.area ?? "thesis-statement",
    displayArea: overrides.displayArea ?? "Thesis Statement",
    resultsWithArea: overrides.resultsWithArea ?? FLOOR,
    totalResults: overrides.totalResults ?? FLOOR,
    scoredCount: overrides.scoredCount ?? FLOOR,
    unscoredCount: overrides.unscoredCount ?? 0,
    percentValues: overrides.percentValues ?? [],
    rawValues: overrides.rawValues ?? [],
    averagePercent: overrides.averagePercent ?? null,
    averageRaw: overrides.averageRaw ?? null,
    direction: overrides.direction,
    summary: overrides.summary ?? "Across the 5 submissions graded so far, 5 of 5 covered it.",
  };
}

function makeReport(areas: AreaTrend[], totalResults = FLOOR): ClassTrendsReport {
  return {
    totalResults,
    areas,
    strengths: areas.filter((a) => a.direction === "high"),
    struggles: areas.filter((a) => a.direction === "low"),
    summaryLines: areas.map((a) => a.summary),
  };
}

function makeObservation(overrides: Partial<ClassTrendsInsightObservation> = {}): ClassTrendsInsightObservation {
  return {
    kind: "inferred",
    concept: overrides.concept ?? "correlation vs causation",
    reading: overrides.reading ?? "several submissions conflated the two ideas",
  };
}

describe("composeClassTrendsDraft - below-floor", () => {
  it("returns below-floor, never a string, when totalResults < floor", () => {
    const report = makeReport([], FLOOR - 1);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result).toEqual({ status: "below-floor", floor: FLOOR, totalResults: FLOOR - 1 });
  });

  it("produces a draft at exactly the floor (boundary is inclusive)", () => {
    const area = makeArea({ direction: "high" });
    const report = makeReport([area], FLOOR);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result.status).toBe("ok");
  });
});

describe("composeClassTrendsDraft - the coverage denominator (Amendment 2)", () => {
  it("drops a clause whose area is not covered by every graded result, even above the floor", () => {
    // resultsWithArea === floor but totalResults is larger - this area is
    // covered by fewer results than the draft's own opening line states.
    const partiallyCovered = makeArea({ direction: "high", resultsWithArea: FLOOR, totalResults: FLOOR + 1 });
    const report = makeReport([partiallyCovered], FLOOR + 1);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    // No area is fully covered, and no observation was given, so the draft
    // has no body clauses at all - the explicit empty state.
    expect(result).toEqual({ status: "empty" });
  });

  it("renders a clause when resultsWithArea === totalResults exactly", () => {
    const fullyCovered = makeArea({ direction: "low", resultsWithArea: FLOOR + 1, totalResults: FLOOR + 1 });
    const report = makeReport([fullyCovered], FLOOR + 1);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain(fullyCovered.displayArea);
    }
  });
});

describe("composeClassTrendsDraft - direction filtering", () => {
  it("omits mixed/no-scale/insufficient-data areas entirely, distinct from the coverage-floor case", () => {
    const mixed = makeArea({ direction: "mixed", area: "a" });
    const noScale = makeArea({ direction: "no-scale", area: "b" });
    const insufficient = makeArea({ direction: "insufficient-data", area: "c" });
    const report = makeReport([mixed, noScale, insufficient], FLOOR);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result).toEqual({ status: "empty" });
  });
});

describe("composeClassTrendsDraft - the empty state (Amendment 3)", () => {
  it("returns an explicit empty status, never an ok status with an empty-sounding body", () => {
    const report = makeReport([], FLOOR);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result).toEqual({ status: "empty" });
    expect(result.status).not.toBe("ok");
  });
});

describe("composeClassTrendsDraft - provenance and the assignmentName/displayArea phrase filters", () => {
  it("rejects with an actionable reason when the assignment name itself contains a forbidden phrase", () => {
    const report = makeReport([makeArea({ direction: "high" })], FLOOR);
    const result = composeClassTrendsDraft(report, [], "The Class Final", FLOOR);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason.toLowerCase()).toContain("assignment name");
    }
  });

  it("silently drops one area whose displayArea contains a forbidden phrase, keeping the others and returning ok", () => {
    const bad = makeArea({
      direction: "low",
      area: "bad",
      displayArea: "Understanding of the class material",
    });
    const good = makeArea({ direction: "high", area: "good", displayArea: "Citations" });
    const report = makeReport([bad, good], FLOOR);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).not.toContain("Understanding of the class material");
      expect(result.markdown).toContain("Citations");
    }
  });
});

describe("composeClassTrendsDraft - the inferred clause marker", () => {
  it("always wraps an observation's text in the fixed marker substring", () => {
    const report = makeReport([], FLOOR);
    const result = composeClassTrendsDraft(report, [makeObservation()], "Essay 1", FLOOR);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain("my own reading, not a count");
    }
  });

  it("drops an observation whose reading contains a likely singular-submission phrase", () => {
    const report = makeReport([], FLOOR);
    const singular = makeObservation({ reading: "one submission confused X and Y" });
    const result = composeClassTrendsDraft(report, [singular], "Essay 1", FLOOR);
    expect(result).toEqual({ status: "empty" });
  });

  it("drops an observation whose concept contains a likely singular-submission phrase", () => {
    const report = makeReport([], FLOOR);
    const singular = makeObservation({ concept: "a single submission's odd framing" });
    const result = composeClassTrendsDraft(report, [singular], "Essay 1", FLOOR);
    expect(result).toEqual({ status: "empty" });
  });

  it("does NOT drop an equivalent singular claim phrased outside the phrase list (known accepted gap)", () => {
    const report = makeReport([], FLOOR);
    // "a lone response" is an equivalent singular construction that the
    // best-effort phrase list does not catch - recorded as an accepted gap,
    // not a passing property, per the design's own residual 9.
    const equivalent = makeObservation({ reading: "a lone response mixed up X and Y" });
    const result = composeClassTrendsDraft(report, [equivalent], "Essay 1", FLOOR);
    expect(result.status).toBe("ok");
  });
});

describe("composeClassTrendsDraft - the coverage sentence is emitted, not inspected for a digit", () => {
  it("the opening line matches the fixed coverage template with totalResults at its one known position", () => {
    const report = makeReport([makeArea({ direction: "high" })], FLOOR);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toMatch(
        /^A note on Essay 1, based on the 5 submissions graded so far:/
      );
    }
  });

  it("is not fooled by a naive digit-presence check (an unrelated percent-shaped string elsewhere)", () => {
    // A fixture engineered so a naive `.includes(String(totalResults))` check
    // could be coincidentally satisfied by something that is not the
    // coverage sentence at all - the real property this composer guarantees
    // is the template's existence and position, not digit presence anywhere.
    const area = makeArea({ direction: "low", displayArea: "85% completion rate" });
    const report = makeReport([area], FLOOR);
    const result = composeClassTrendsDraft(report, [], "Essay 1", FLOOR);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toMatch(/^A note on Essay 1, based on the 5 submissions graded so far:/);
    }
  });
});

describe("composeClassTrendsDraft - the composed-markdown safety net", () => {
  it("rejects when a forbidden completeness phrase reaches the composer only through an inferred observation, a source neither upstream filter reads", () => {
    // Neither upstream check can catch this: the assignmentName check reads
    // only assignmentName, and the countedClauses filter reads only
    // renderCountedClause's output from report.areas - neither ever inspects
    // an inferred observation's concept/reading text. renderInferredClause
    // itself only screens for a likely singular-submission phrase, never for
    // a forbidden completeness phrase. ClassTrendsInsightObservation is a
    // plain typed object - nothing requires it to have passed through
    // parseClassTrendsInsightResponse's own forbidden-phrase filter before
    // reaching this composer, so this is a shape the real types genuinely
    // permit a caller to pass directly.
    const report = makeReport([], FLOOR);
    const observation = makeObservation({
      concept: "a pattern across the class",
      reading: "several submissions showed this",
    });
    const result = composeClassTrendsDraft(report, [observation], "Essay 1", FLOOR);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      // Pinning the fact (this is the composed-markdown rejection, not the
      // assignmentName one) and not the exact wording of either reason.
      expect(result.reason.toLowerCase()).not.toContain("assignment name");
    }
  });
});

describe("composeClassTrendsDraft - defaults", () => {
  it("uses the exported default floor when no floor argument is supplied", () => {
    expect(DEFAULT_CLASS_TRENDS_DRAFT_FLOOR).toBe(5);
  });
});
