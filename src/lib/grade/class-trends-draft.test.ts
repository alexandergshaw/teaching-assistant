import { describe, it, expect } from "vitest";
import { composeClassTrendsDraft } from "./class-trends-draft";
import { computeClassTrends } from "./class-trends";
import type { AreaAttribution, AreaTrend, AreaTrendDirection, ClassTrendsReport } from "./class-trends";
import type { ClassTrendsInsightObservation } from "./class-trends-insight";
import type { GradeResult, GradingRunEntry, RubricAreaResult } from "./types";

// N13a: backlog's own default was 5 (DEFAULT_CLASS_TRENDS_DRAFT_FLOOR,
// removed by this backlog item - straight removal, no replacement bound).
// This fixture size is now an arbitrary sample size, not a floor boundary;
// kept at 5 only because most of these fixtures were already written
// against it and there is no reason to churn the numbers.
const SAMPLE_SIZE = 5;

function makeArea(
  overrides: Partial<AreaTrend> & { direction: AreaTrendDirection }
): AreaTrend {
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
    // N13b Wave 2: numbers-only subset, null unless a test explicitly sets it
    // (most fixtures in this file do not exercise the subset clause).
    missedSubset: overrides.missedSubset ?? null,
  };
}

function makeReport(
  areas: AreaTrend[],
  totalResults = SAMPLE_SIZE,
  knownIdentifiers: readonly string[] = [],
  instructorAttribution: AreaAttribution[] = []
): ClassTrendsReport {
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
    // N13b Wave 1: the run's own identifier strings, scan-only for the
    // name-filter denylist. Default empty - most fixtures in this file do
    // not exercise the filter at all.
    knownIdentifiers,
    // N13b Wave 2: the named per-area subset list. Default empty - most
    // fixtures in this file do not exercise it. NEVER read by
    // composeClassTrendsDraft (its first parameter type omits this field -
    // W2-11), so this field exists purely to satisfy ClassTrendsReport's
    // shape for fixtures built directly rather than through
    // computeClassTrends.
    instructorAttribution,
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

// N13b Wave 1 (security R5): the pre-existing free-text leak (L5/L6/L7/L8),
// per docs/n13b-wave1-test-notes.md. A distinctive, two-word marker that
// cannot occur incidentally and is long enough not to over-match.
const SEED = "Zbrinqua Qwelford";

describe("composeClassTrendsDraft - the name filter (N13b Wave 1, W1-1..W1-9)", () => {
  it("W1-1: a name in assignmentName does not reach the class text (L8)", () => {
    const area = makeArea({ direction: "high" });
    const report = makeReport([area], SAMPLE_SIZE, [SEED]);
    const result = composeClassTrendsDraft(report, [], `Makeup exam - ${SEED}`);
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });

  it("W1-2: a name embedded in displayArea does not reach the class text (L7)", () => {
    const area = makeArea({ direction: "low", displayArea: `Peer review of ${SEED}` });
    const report = makeReport([area], SAMPLE_SIZE, [SEED]);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });

  it("W1-3: a name in an observation's reading does not reach the class text (L5/L6)", () => {
    const observation = makeObservation({ reading: `echoing ${SEED} verbatim` });
    const report = makeReport([], SAMPLE_SIZE, [SEED]);
    const result = composeClassTrendsDraft(report, [observation], "Essay 1");
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });

  it("W1-3b: a name in an observation's concept does not reach the class text (L5/L6)", () => {
    const observation = makeObservation({ concept: `the framing ${SEED} used` });
    const report = makeReport([], SAMPLE_SIZE, [SEED]);
    const result = composeClassTrendsDraft(report, [observation], "Essay 1");
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });

  describe("W1-4: clean-pass controls (anti-degenerate; discriminates the reject-everything mutant)", () => {
    it("(i) a clean high area still renders ok and contains its displayArea", () => {
      const area = makeArea({ direction: "high", displayArea: "Thesis Statement" });
      const report = makeReport([area], SAMPLE_SIZE, [SEED]);
      const result = composeClassTrendsDraft(report, [], "Essay 1");
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.markdown).toContain("Thesis Statement");
      }
    });

    it("(ii) a clean observation still renders ok and contains the fixed marker", () => {
      const observation = makeObservation({
        concept: "correlation vs causation",
        reading: "several conflated the ideas",
      });
      const report = makeReport([], SAMPLE_SIZE, [SEED]);
      const result = composeClassTrendsDraft(report, [observation], "Essay 1");
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.markdown).toContain("my own reading, not a count");
      }
    });

    it("(iii) a clean assignmentName still renders ok and contains the opening line", () => {
      const area = makeArea({ direction: "high" });
      const report = makeReport([area], SAMPLE_SIZE, [SEED]);
      const result = composeClassTrendsDraft(report, [], "Essay 1");
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.markdown).toContain("A note on Essay 1");
      }
    });
  });

  it("W1-5: the scan is a substring match, not field equality (W1-1/2/3 already embed SEED inside surrounding text - restated explicitly here)", () => {
    const observation = makeObservation({ reading: `a note that mentions ${SEED} in passing` });
    const report = makeReport([], SAMPLE_SIZE, [SEED]);
    const result = composeClassTrendsDraft(report, [observation], "Essay 1");
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });

  it("W1-6: a blank/whitespace-only identifier never suppresses a clean draft (anti match-everything)", () => {
    const area = makeArea({ direction: "high", displayArea: "Thesis Statement" });
    const report = makeReport([area], SAMPLE_SIZE, ["", "   "]);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain("Thesis Statement");
    }
  });

  it("W1-9: a case-mismatched identifier in an observation's reading is still suppressed (fail-open guard)", () => {
    const observation = makeObservation({ reading: `echoing ${SEED.toLowerCase()} verbatim` });
    const report = makeReport([], SAMPLE_SIZE, [SEED]);
    const result = composeClassTrendsDraft(report, [observation], "Essay 1");
    if (result.status === "ok") {
      expect(result.markdown.toLowerCase()).not.toContain(SEED.toLowerCase());
    }
  });

  it("W1-9b: a mixed-case identifier in assignmentName is still suppressed (fail-open guard)", () => {
    const mixedCase = "zBrinqua qWELFORD";
    const area = makeArea({ direction: "high" });
    const report = makeReport([area], SAMPLE_SIZE, [SEED]);
    const result = composeClassTrendsDraft(report, [], `Makeup exam - ${mixedCase}`);
    if (result.status === "ok") {
      expect(result.markdown.toLowerCase()).not.toContain(mixedCase.toLowerCase());
    }
  });
});

// W1-8: end-to-end reachability through the REAL production sequence
// (computeClassTrends -> composeClassTrendsDraft), the exact sequence the
// panels run. Duplicated fixture helpers, not imported from
// class-trends.test.ts (no-cross-test-file-imports).
function makeRubricAreaForRun(area: string, score: string): RubricAreaResult {
  return { area, score, comment: "" };
}

function makeGradedResultForRun(student: string, rubricAreas: RubricAreaResult[]): GradeResult {
  return {
    student,
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas,
    totalScore: "",
    feedback: "",
    mergedFileCount: 0,
    submittedFiles: [],
  };
}

function makeRunEntry(
  results: GradeResult[],
  rubricAreaNames: string[],
  assignmentName: string
): GradingRunEntry {
  return {
    courseName: "Test Course",
    assignmentName,
    canvasUrl: "https://example.instructure.com/courses/1/assignments/1",
    run: {
      results,
      rubricAreaNames,
      fullCreditChecklist: [],
    },
  };
}

describe("composeClassTrendsDraft - W1-8 end-to-end reachability through the real production sequence", () => {
  it("a seeded student name does not survive computeClassTrends -> composeClassTrendsDraft when it is also the rubric area name (L7 threat)", () => {
    const results = [
      makeGradedResultForRun(SEED, [makeRubricAreaForRun(`Peer review of ${SEED}`, "90%")]),
    ];
    const entry = makeRunEntry(results, [`Peer review of ${SEED}`], "Essay 1");
    const report = computeClassTrends(entry);
    const result = composeClassTrendsDraft(report, [], entry.assignmentName);
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });

  it("a seeded student name does not survive computeClassTrends -> composeClassTrendsDraft when it is also the assignment name (L8 threat)", () => {
    const results = [makeGradedResultForRun(SEED, [makeRubricAreaForRun("Thesis Statement", "90%")])];
    const entry = makeRunEntry(results, ["Thesis Statement"], `Makeup exam - ${SEED}`);
    const report = computeClassTrends(entry);
    const result = composeClassTrendsDraft(report, [], entry.assignmentName);
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });
});

// N13b Wave 2 (docs/n13b-wave2-test-notes.md section 4, Group B): the
// numbers-only subset clause and the compile-time/runtime privacy boundary
// on report.instructorAttribution.

describe("composeClassTrendsDraft - the subset clause renders even under partial coverage (W2-8, AC-6)", () => {
  it("partial coverage (resultsWithArea 3 of totalResults 5), direction mixed -> still renders (opposite gate from high/low)", () => {
    const area = makeArea({
      direction: "mixed",
      displayArea: "Thesis Statement",
      resultsWithArea: 3,
      totalResults: 5,
      missedSubset: { studentCount: 3, denominator: 3, unknownExcludedCount: 0 },
    });
    const report = makeReport([area], 5);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain("Thesis Statement");
    }
  });

  it("the motivating case: class of 9, 4 miss the same area, direction mixed -> subset clause present", () => {
    const area = makeArea({
      direction: "mixed",
      displayArea: "Thesis Statement",
      resultsWithArea: 9,
      totalResults: 9,
      missedSubset: { studentCount: 4, denominator: 9, unknownExcludedCount: 0 },
    });
    const report = makeReport([area], 9);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain("Thesis Statement");
    }
  });

  it("sabotage control: routing the subset clause through .filter(areaFullyCovered) (the high/low path's gate) would drop the partial-coverage clause, leaving no body content at all", () => {
    // Documents the discriminating mutation: with the SAME partially-covered,
    // non-high/low fixture, an areaFullyCovered-gated subset renderer
    // produces an empty draft ({status:"empty"}), never "ok". The real
    // implementation must NOT take this shape.
    const area = makeArea({
      direction: "mixed",
      displayArea: "Thesis Statement",
      resultsWithArea: 3,
      totalResults: 5,
      missedSubset: { studentCount: 3, denominator: 3, unknownExcludedCount: 0 },
    });
    const report = makeReport([area], 5);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).not.toBe("empty");
  });
});

describe("composeClassTrendsDraft - the subset clause states its OWN denominator, never totalResults (W2-9, AC-7)", () => {
  it('reuses the W2-8 partial-coverage construction: contains "3 of 3" (own basis), never "3 of 5" (totalResults)', () => {
    const area = makeArea({
      direction: "mixed",
      displayArea: "Thesis Statement",
      resultsWithArea: 3,
      totalResults: 5,
      missedSubset: { studentCount: 3, denominator: 3, unknownExcludedCount: 0 },
    });
    const report = makeReport([area], 5);
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).toContain("3 of 3 students");
      expect(result.markdown).not.toContain("3 of 5");
    }
  });
});

describe("composeClassTrendsDraft - PRIVACY (runtime, load-bearing): a name on instructorAttribution never reaches the returned Markdown (W2-10)", () => {
  it("a distinctive marker placed on instructorAttribution (absent from knownIdentifiers) does not appear in the ok markdown", () => {
    const area = makeArea({
      direction: "mixed",
      displayArea: "Thesis Statement",
      missedSubset: { studentCount: 3, denominator: 3, unknownExcludedCount: 0 },
    });
    // CRUCIAL (per the test notes' "can't-fail" trap): knownIdentifiers is []
    // here, NOT [marker] - a marker also present in knownIdentifiers would be
    // caught by Wave 1's own filter regardless of whether the subset renderer
    // itself leaks it, which would prove nothing about THIS renderer.
    const marker = "Zzxq Marker";
    const report: ClassTrendsReport = {
      ...makeReport([area], SAMPLE_SIZE, []),
      instructorAttribution: [
        {
          area: area.area,
          displayArea: area.displayArea,
          students: [{ displayName: marker, deductionLabel: "x" }],
        },
      ],
    };
    const result = composeClassTrendsDraft(report, [], "Essay 1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(marker);
    }
  });
});

describe("composeClassTrendsDraft - PRIVACY (compile-time, PRIMARY): instructorAttribution is UNREACHABLE through the composer's input type (W2-11, AC-8/R8 part b)", () => {
  it("reading .instructorAttribution off the composer's own parameter type is a compile error (tsc TS2578 if this directive is ever unused)", () => {
    const draftInput = {} as Parameters<typeof composeClassTrendsDraft>[0];
    // @ts-expect-error instructorAttribution must be unreachable via the
    // composer input type (AC-8 / R8 part b): reading it here MUST be a
    // compile error, so this directive MUST be "used". If the composer's
    // first parameter is ever widened back to the full ClassTrendsReport,
    // this line type-checks, the directive becomes unused, and `tsc` fails
    // with TS2578 - the type gate, not this vitest run, is what goes RED.
    void draftInput.instructorAttribution;
    // No runtime assertion needed or possible here - see this describe's own
    // title. This `expect` only keeps the test from being reported as having
    // no assertions.
    expect(true).toBe(true);
  });
});

describe("composeClassTrendsDraft - PRIVACY (source-text, OPTIONAL belt-and-braces): the composer BODY never names instructorAttribution (W2-11b)", () => {
  // DUPLICATED verbatim from classTrends.wiring.test.ts's stripComments, per
  // the no-cross-test-file-imports rule - never imported.
  function stripComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  }

  it("the body slice (between the signature's opening brace and the next top-level export) does not contain the token", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src/lib/grade/class-trends-draft.ts"), "utf8");
    const stripped = stripComments(source);

    const sigIdx = stripped.indexOf("export function composeClassTrendsDraft(");
    expect(sigIdx, "composer signature not found").toBeGreaterThan(-1);

    const bodyOpenIdx = stripped.indexOf("{", stripped.indexOf(")", sigIdx));
    expect(bodyOpenIdx, "composer body-opening brace not found").toBeGreaterThan(-1);

    const nextExportIdx = stripped.indexOf("export function", bodyOpenIdx + 1);
    const endIdx = nextExportIdx === -1 ? stripped.length : nextExportIdx;
    expect(endIdx).toBeGreaterThan(bodyOpenIdx);

    const body = stripped.slice(bodyOpenIdx, endIdx);
    expect(body).not.toContain("instructorAttribution");
  });
});

describe("composeClassTrendsDraft - the signature stays 3-param (W2-12)", () => {
  it("composeClassTrendsDraft.length is still 3 - the subset clause reads report, not a new channel", () => {
    expect(composeClassTrendsDraft.length).toBe(3);
  });
});

describe("composeClassTrendsDraft - INFO-2 end-to-end through the real production sequence, repo-shaped (W2-13, AC-8 on the unavailable path; R7)", () => {
  it("a run student's name, echoed by an observation, does not survive computeClassTrends(entry, {kind:'unavailable'}) -> composeClassTrendsDraft", () => {
    const results = [makeGradedResultForRun(SEED, [makeRubricAreaForRun("Thesis Statement", "50%")])];
    const entry = makeRunEntry(results, ["Thesis Statement"], "Essay 1");
    const report = computeClassTrends(entry, { kind: "unavailable", reason: "no roster identity on this surface" });
    const observation = makeObservation({ reading: `echoing ${SEED} verbatim` });
    const result = composeClassTrendsDraft(report, [observation], entry.assignmentName);
    if (result.status === "ok") {
      expect(result.markdown).not.toContain(SEED);
    }
  });
});
