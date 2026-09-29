import { describe, it, expect } from "vitest";
import { composeClassTrendsDraft } from "./class-trends-draft";
import type { AreaTrend, AreaTrendDirection, ClassTrendsReport } from "./class-trends";
import type { ClassTrendsInsightObservation } from "./class-trends-insight";

// N13a: backlog's own default was 5 (DEFAULT_CLASS_TRENDS_DRAFT_FLOOR,
// removed by this backlog item - straight removal, no replacement bound).
// This fixture size is now an arbitrary sample size, not a floor boundary;
// kept at 5 only because most of these fixtures were already written
// against it and there is no reason to churn the numbers.
const SAMPLE_SIZE = 5;

function makeArea(overrides: Partial<AreaTrend> & { direction: AreaTrendDirection }): AreaTrend {
  return {
    area: overrides.area ?? "thesis-statement",
    displayArea: overrides.displayArea ?? "Thesis Statement",
    resultsWithArea: overrides.resultsWithArea ?? SAMPLE_SIZE,
    totalResults: overrides.totalResults ?? SAMPLE_SIZE,
    scoredCount: overrides.scoredCount ?? SAMPLE_SIZE,
    unscoredCount: overrides.unscoredCount ?? 0,
    percentValues: overrides.percentValues ?? [],
    rawValues: overrides.rawValues ?? [],
    averagePercent: overrides.averagePercent ?? null,
    averageRaw: overrides.averageRaw ?? null,
    direction: overrides.direction,
    summary: overrides.summary ?? "Across the 5 submissions graded so far, 5 of 5 covered it.",
  };
}

function makeReport(areas: AreaTrend[], totalResults = SAMPLE_SIZE): ClassTrendsReport {
  return {
    totalResults,
    // N13a: rows this run emitted instead of grading - none, for this
    // fixture's fixtures, which build reports directly rather than through
    // computeClassTrends.
    ungraded: { notAttempted: 0, gradingFailed: 0 },
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

describe("composeClassTrendsDraft - the floor was removed (backlog N13a)", () => {
  it("drafts from as few as one graded result - no below-floor refusal remains", () => {
    // Below the old DEFAULT_CLASS_TRENDS_DRAFT_FLOOR of 5: this used to
    // return { status: "below-floor", ... } and now must draft normally,
    // proving the removal rather than merely the absence of a deleted
    // assertion.
    const area = makeArea({ direction: "high", resultsWithArea: 1, totalResults: 1 });
    const report = makeReport([area], 1);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain(area.displayArea);
    }
  });

  it("has no 'below-floor' status in its result union at all", () => {
    // A two-submission run: previously refused outright (2 < floor of 5).
    const area = makeArea({ direction: "low", resultsWithArea: 2, totalResults: 2 });
    const report = makeReport([area], 2);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    const status: string = result.status;
    expect(status).not.toBe("below-floor");
    expect(["ok", "empty", "rejected"]).toContain(status);
  });

  it("composeClassTrendsDraft takes exactly three parameters - no floor argument remains", () => {
    expect(composeClassTrendsDraft.length).toBe(3);
  });
});

describe("composeClassTrendsDraft - the coverage denominator (Amendment 2)", () => {
  it("drops a clause whose area is not covered by every graded result, even with a small run", () => {
    // resultsWithArea === SAMPLE_SIZE but totalResults is larger - this area
    // is covered by fewer results than the draft's own opening line states.
    const partiallyCovered = makeArea({
      direction: "high",
      resultsWithArea: SAMPLE_SIZE,
      totalResults: SAMPLE_SIZE + 1,
    });
    const report = makeReport([partiallyCovered], SAMPLE_SIZE + 1);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    // No area is fully covered, and no observation was given, so the draft
    // has no body clauses at all - the explicit empty state.
    expect(result).toEqual({ status: "empty" });
  });

  it("renders a clause when resultsWithArea === totalResults exactly", () => {
    const fullyCovered = makeArea({
      direction: "low",
      resultsWithArea: SAMPLE_SIZE + 1,
      totalResults: SAMPLE_SIZE + 1,
    });
    const report = makeReport([fullyCovered], SAMPLE_SIZE + 1);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain(fullyCovered.displayArea);
    }
  });
});

describe("composeClassTrendsDraft - direction filtering", () => {
  it("omits mixed/no-scale/insufficient-data areas entirely", () => {
    const mixed = makeArea({ direction: "mixed", area: "a" });
    const noScale = makeArea({ direction: "no-scale", area: "b" });
    const insufficient = makeArea({ direction: "insufficient-data", area: "c" });
    const report = makeReport([mixed, noScale, insufficient], SAMPLE_SIZE);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result).toEqual({ status: "empty" });
  });
});

describe("composeClassTrendsDraft - the empty state (Amendment 3)", () => {
  it("returns an explicit empty status, never an ok status with an empty-sounding body", () => {
    const report = makeReport([], SAMPLE_SIZE);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result).toEqual({ status: "empty" });
    expect(result.status).not.toBe("ok");
  });
});

describe("composeClassTrendsDraft - provenance and the assignmentName/displayArea phrase filters", () => {
  it("rejects with an actionable reason when the assignment name itself contains a forbidden phrase", () => {
    const report = makeReport([makeArea({ direction: "high" })], SAMPLE_SIZE);
    const result = composeClassTrendsDraft(report, [], "The Class Final");
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
    const report = makeReport([bad, good], SAMPLE_SIZE);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).not.toContain("Understanding of the class material");
      expect(result.markdown).toContain("Citations");
    }
  });
});

describe("composeClassTrendsDraft - the inferred clause marker", () => {
  it("always wraps an observation's text in the fixed marker substring", () => {
    const report = makeReport([], SAMPLE_SIZE);
    const result = composeClassTrendsDraft(report, [makeObservation()], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain("my own reading, not a count");
    }
  });

  it("drops an observation whose reading contains a likely singular-submission phrase", () => {
    const report = makeReport([], SAMPLE_SIZE);
    const singular = makeObservation({ reading: "one submission confused X and Y" });
    const result = composeClassTrendsDraft(report, [singular], "Essay 1");
    expect(result).toEqual({ status: "empty" });
  });

  it("drops an observation whose concept contains a likely singular-submission phrase", () => {
    const report = makeReport([], SAMPLE_SIZE);
    const singular = makeObservation({ concept: "a single submission's odd framing" });
    const result = composeClassTrendsDraft(report, [singular], "Essay 1");
    expect(result).toEqual({ status: "empty" });
  });

  it("does NOT drop an equivalent singular claim phrased outside the phrase list (known accepted gap)", () => {
    const report = makeReport([], SAMPLE_SIZE);
    // "a lone response" is an equivalent singular construction that the
    // best-effort phrase list does not catch - recorded as an accepted gap,
    // not a passing property, per the design's own residual 9.
    const equivalent = makeObservation({ reading: "a lone response mixed up X and Y" });
    const result = composeClassTrendsDraft(report, [equivalent], "Essay 1");
    expect(result.status).toBe("ok");
  });
});

describe("composeClassTrendsDraft - the coverage sentence is emitted, not inspected for a digit", () => {
  it("the opening line matches the fixed coverage template with totalResults at its one known position", () => {
    const report = makeReport([makeArea({ direction: "high" })], SAMPLE_SIZE);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
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
    const report = makeReport([area], SAMPLE_SIZE);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
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
    const report = makeReport([], SAMPLE_SIZE);
    const observation = makeObservation({
      concept: "a pattern across the class",
      reading: "several submissions showed this",
    });
    const result = composeClassTrendsDraft(report, [observation], "Essay 1");
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      // Pinning the fact (this is the composed-markdown rejection, not the
      // assignmentName one) and not the exact wording of either reason.
      expect(result.reason.toLowerCase()).not.toContain("assignment name");
    }
  });
});
