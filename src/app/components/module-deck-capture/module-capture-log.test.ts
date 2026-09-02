import { describe, it, expect } from "vitest";
import {
  buildModuleDeckCaptureRunLog,
  condenseModuleDeckCaptureBatches,
  formatModuleDeckCaptureLogCsv,
  formatModuleDeckCaptureLogJson,
  makeModuleDeckCaptureLogBatch,
  moduleDeckCaptureLogFileName,
  moduleDeckCaptureLogSummaryLine,
  summarizeModuleDeckCaptureRunLog,
  MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD,
  MODULE_DECK_CAPTURE_FRAMES_SAMPLED_NOTE,
  MODULE_DECK_CAPTURE_SCROLL_RATE_NOT_MEASURED_NOTE,
  type ModuleDeckCaptureLogBatch,
  type ModuleDeckCaptureLogInput,
  type ModuleDeckCaptureRunLog,
} from "./module-capture-log";

const AT = "2026-09-01T10:00:00.000Z";
const AT_END = "2026-09-01T10:20:00.000Z";

function emptyInput(overrides: Partial<ModuleDeckCaptureLogInput> = {}): ModuleDeckCaptureLogInput {
  return {
    startedAt: AT,
    endedAt: null,
    settings: {
      courseName: "",
      moduleLabel: "",
      templateId: "",
      resolvedSlideCount: 0,
      provider: "",
      contextText: "",
    },
    droppedFrames: 0,
    estimatedScrollRatePxPerSec: null,
    frameEncodeFacts: [],
    batches: [],
    encodeNotices: [],
    blocks: { blocksExtracted: 0, blocksIllegible: 0, reductionStages: [] },
    generationAttempts: [],
    materialsText: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildModuleDeckCaptureRunLog
// ---------------------------------------------------------------------------

describe("buildModuleDeckCaptureRunLog", () => {
  it("spreads every input field through unchanged and stamps the feature name", () => {
    const log = buildModuleDeckCaptureRunLog(emptyInput({ droppedFrames: 4 }));
    expect(log.droppedFrames).toBe(4);
    expect(log.feature).toBe("Module walkthrough deck capture");
  });

  it("groups capture resolution via summarizeFrameEncodeParameters over every sent frame", () => {
    const log = buildModuleDeckCaptureRunLog(
      emptyInput({
        frameEncodeFacts: [
          { sourceWidth: 1920, sourceHeight: 1080, encodedWidth: 1920, encodedHeight: 1080, encodedQuality: 80 },
          { sourceWidth: 3840, sourceHeight: 2160, encodedWidth: 1920, encodedHeight: 1080, encodedQuality: 40 },
        ],
      })
    );
    expect(log.captureResolution.totalFrames).toBe(2);
    // Two DIFFERENT source resolutions collapsing to the same encoded
    // resolution is exactly the honest-grouping case this reuse exists for -
    // never presenting one frame's value as if it described both.
    expect(log.captureResolution.sourceDimGroups).toEqual([
      { label: "1920x1080px", count: 1 },
      { label: "3840x2160px", count: 1 },
    ]);
    expect(log.captureResolution.encodedDimGroups).toEqual([{ label: "1920x1080px", count: 2 }]);
    expect(log.captureResolution.reencodedGroups).toEqual([{ quality: 40, count: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// makeModuleDeckCaptureLogBatch
// ---------------------------------------------------------------------------

describe("makeModuleDeckCaptureLogBatch", () => {
  it("defaults every field but at/index/framesSent to its nothing-went-wrong value", () => {
    expect(makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 3 })).toEqual({
      at: AT,
      index: 0,
      framesSent: 3,
      wireBytes: 0,
      outcome: "extracted",
      error: "",
      outputTokens: undefined,
    });
  });

  it("carries an error batch's verbatim message", () => {
    const batch = makeModuleDeckCaptureLogBatch({ at: AT, index: 2, framesSent: 5, outcome: "error", error: "503 Service Unavailable" });
    expect(batch.error).toBe("503 Service Unavailable");
    expect(batch.outcome).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// summarizeModuleDeckCaptureRunLog - exhaustive outcome counting, derived
// token cost, and the honest UNMEASURED/measured split for output tokens.
// ---------------------------------------------------------------------------

describe("summarizeModuleDeckCaptureRunLog", () => {
  it("counts every ModuleDeckCaptureBatchOutcome bucket independently with DIFFERENT counts per bucket", () => {
    // Each bucket gets a different count (1/2/3/4) so a bug that swapped
    // which counter any two outcomes increment cannot hide behind two
    // buckets landing on the same number (same discipline
    // grading-recording-log.test.ts uses for GradingRowState).
    const batches: ModuleDeckCaptureLogBatch[] = [
      makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 1, outcome: "extracted" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 1, framesSent: 1, outcome: "empty" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 2, framesSent: 1, outcome: "empty" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 3, framesSent: 1, outcome: "wire-budget-rejected" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 4, framesSent: 1, outcome: "wire-budget-rejected" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 5, framesSent: 1, outcome: "wire-budget-rejected" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 6, framesSent: 1, outcome: "error" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 7, framesSent: 1, outcome: "error" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 8, framesSent: 1, outcome: "error" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 9, framesSent: 1, outcome: "error" }),
    ];
    const summary = summarizeModuleDeckCaptureRunLog(buildModuleDeckCaptureRunLog(emptyInput({ batches })));
    expect(summary.batchesSent).toBe(10);
    expect(summary.batchesExtracted).toBe(1);
    expect(summary.batchesEmpty).toBe(2);
    expect(summary.batchesWireBudgetRejected).toBe(3);
    expect(summary.batchesErrored).toBe(4);
  });

  it("excludes wire-budget-rejected batches from framesSentTotal and the derived token total (they never crossed the wire)", () => {
    const batches: ModuleDeckCaptureLogBatch[] = [
      makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 6, outcome: "extracted" }),
      makeModuleDeckCaptureLogBatch({ at: AT, index: 1, framesSent: 6, outcome: "wire-budget-rejected" }),
    ];
    const summary = summarizeModuleDeckCaptureRunLog(buildModuleDeckCaptureRunLog(emptyInput({ batches })));
    expect(summary.framesSentTotal).toBe(6);
    // 1,225 + 1,120 * 6 = 7,945 for the one real call; the rejected batch
    // contributes nothing.
    expect(summary.derivedInputTokensTotal).toBe(7_945);
  });

  it("reports outputTokensTotal as null the instant ANY batch or attempt is missing it (UNMEASURED), a real number only when every entry has one", () => {
    const withGap = summarizeModuleDeckCaptureRunLog(
      buildModuleDeckCaptureRunLog(
        emptyInput({
          batches: [makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 1, outputTokens: 500 })],
          generationAttempts: [{ at: AT, outcome: "success", error: "", materialsCharacterCount: 10, resolvedSlideCount: 7 }],
        })
      )
    );
    expect(withGap.outputTokensTotal).toBeNull();

    const complete = summarizeModuleDeckCaptureRunLog(
      buildModuleDeckCaptureRunLog(
        emptyInput({
          batches: [makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 1, outputTokens: 500 })],
          generationAttempts: [
            { at: AT, outcome: "success", error: "", materialsCharacterCount: 10, resolvedSlideCount: 7, outputTokens: 1_500 },
          ],
        })
      )
    );
    expect(complete.outputTokensTotal).toBe(2_000);
  });

  it("sums reduction characters removed across every stage", () => {
    const summary = summarizeModuleDeckCaptureRunLog(
      buildModuleDeckCaptureRunLog(
        emptyInput({
          blocks: {
            blocksExtracted: 50,
            blocksIllegible: 2,
            reductionStages: [
              { stage: "chrome-suppression", charactersRemoved: 146_000 },
              { stage: "duplicate-join", charactersRemoved: 52_000 },
            ],
          },
        })
      )
    );
    expect(summary.reductionCharactersRemovedTotal).toBe(198_000);
  });

  it("throws on an unhandled batch outcome rather than silently miscounting it (exhaustiveness guard)", () => {
    const batches = [makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 1 })];
    (batches[0] as unknown as { outcome: string }).outcome = "not-a-real-outcome";
    const log = buildModuleDeckCaptureRunLog(emptyInput({ batches }));
    expect(() => summarizeModuleDeckCaptureRunLog(log)).toThrow(/Unhandled module deck capture batch outcome/);
  });
});

// ---------------------------------------------------------------------------
// The three loss channels stay distinct - backpressure, reduction, and the
// unmeasured scroll-rate channel never conflate into one number or one line.
// ---------------------------------------------------------------------------

describe("the three loss channels stay distinct", () => {
  it("backpressure drops and reduction losses are independent counters", () => {
    const summary = summarizeModuleDeckCaptureRunLog(
      buildModuleDeckCaptureRunLog(
        emptyInput({
          droppedFrames: 40,
          blocks: { blocksExtracted: 10, blocksIllegible: 0, reductionStages: [{ stage: "chrome-suppression", charactersRemoved: 1_000 }] },
        })
      )
    );
    expect(summary.droppedFrames).toBe(40);
    expect(summary.reductionCharactersRemovedTotal).toBe(1_000);
  });

  it("never counts the scroll-rate (never-photographed) channel as a dropped frame", () => {
    const csvNotMeasured = formatModuleDeckCaptureLogCsv(
      buildModuleDeckCaptureRunLog(emptyInput({ droppedFrames: 5, estimatedScrollRatePxPerSec: null }))
    );
    expect(csvNotMeasured).toContain("Dropped frames (backpressure),5");
    expect(csvNotMeasured).toContain(MODULE_DECK_CAPTURE_SCROLL_RATE_NOT_MEASURED_NOTE);

    const csvMeasured = formatModuleDeckCaptureLogCsv(
      buildModuleDeckCaptureRunLog(emptyInput({ droppedFrames: 5, estimatedScrollRatePxPerSec: 650 }))
    );
    expect(csvMeasured).toContain("Estimated scroll rate,650 px/s");
    expect(csvMeasured).not.toContain(MODULE_DECK_CAPTURE_SCROLL_RATE_NOT_MEASURED_NOTE);
    // Still the same, unrelated dropped-frames figure - the estimate does
    // not fold into or replace it.
    expect(csvMeasured).toContain("Dropped frames (backpressure),5");
  });

  it("always states the fixed frames-sampled note - never a derived guess", () => {
    const csv = formatModuleDeckCaptureLogCsv(buildModuleDeckCaptureRunLog(emptyInput()));
    expect(csv).toContain(`Frames sampled,${MODULE_DECK_CAPTURE_FRAMES_SAMPLED_NOTE}`);
  });
});

// ---------------------------------------------------------------------------
// moduleDeckCaptureLogSummaryLine - frozen literal oracle.
// ---------------------------------------------------------------------------

describe("moduleDeckCaptureLogSummaryLine", () => {
  it("renders the base sentence with no trailing clauses when nothing dropped/failed/reduced", () => {
    const summary = summarizeModuleDeckCaptureRunLog(
      buildModuleDeckCaptureRunLog(
        emptyInput({ batches: [makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 6, outcome: "extracted" })] })
      )
    );
    expect(moduleDeckCaptureLogSummaryLine(summary)).toBe(
      "6 frames sent across 1 vision call (1 extracted, 0 empty, 0 rejected for wire budget, 0 failed). " +
        "Derived input token cost (not measured): ~7945. Output token cost: UNMEASURED."
    );
  });

  it("appends the backpressure, reduction, and generation-failure clauses only when non-zero", () => {
    const summary = summarizeModuleDeckCaptureRunLog(
      buildModuleDeckCaptureRunLog(
        emptyInput({
          droppedFrames: 7,
          batches: [makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 6, outcome: "extracted" })],
          blocks: { blocksExtracted: 1, blocksIllegible: 0, reductionStages: [{ stage: "chrome-suppression", charactersRemoved: 900 }] },
          generationAttempts: [{ at: AT, outcome: "error", error: "timeout", materialsCharacterCount: 10, resolvedSlideCount: 7 }],
        })
      )
    );
    expect(moduleDeckCaptureLogSummaryLine(summary)).toBe(
      "6 frames sent across 1 vision call (1 extracted, 0 empty, 0 rejected for wire budget, 0 failed). " +
        "7 frames dropped to backpressure. 900 characters removed by reduction before generation. " +
        "1 of 1 deck generation attempt failed. " +
        "Derived input token cost (not measured): ~7945. Output token cost: UNMEASURED."
    );
  });
});

// ---------------------------------------------------------------------------
// condenseModuleDeckCaptureBatches - pasteability of a long run.
// ---------------------------------------------------------------------------

describe("condenseModuleDeckCaptureBatches", () => {
  it("returns every batch individually below the condense threshold, even with errors present", () => {
    const batches: ModuleDeckCaptureLogBatch[] = Array.from({ length: 10 }, (_, i) =>
      makeModuleDeckCaptureLogBatch({ at: AT, index: i, framesSent: 1, outcome: i === 5 ? "error" : "extracted" })
    );
    expect(batches.length).toBeLessThan(MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD);
    const rows = condenseModuleDeckCaptureBatches(batches);
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.kind === "batch")).toBe(true);
  });

  it("collapses the repetitive middle above the threshold, keeps the first/last 15 routine batches, and NEVER collapses a non-routine batch regardless of position", () => {
    const batches: ModuleDeckCaptureLogBatch[] = Array.from({ length: 90 }, (_, i) =>
      makeModuleDeckCaptureLogBatch({
        at: AT,
        index: i,
        framesSent: 1,
        outcome: i === 50 ? "error" : "extracted",
        error: i === 50 ? "network reset mid-batch" : "",
      })
    );
    const rows = condenseModuleDeckCaptureBatches(batches);

    const batchRows = rows.filter((r) => r.kind === "batch");
    const collapsedRows = rows.filter((r) => r.kind === "collapsed");

    // 15 kept from the start + 15 kept from the end + the always-kept error
    // batch = 31 individually-rendered rows.
    expect(batchRows).toHaveLength(31);
    const errorRow = batchRows.find((r) => r.kind === "batch" && r.batch.outcome === "error");
    expect(errorRow).toBeDefined();
    if (errorRow?.kind === "batch") {
      expect(errorRow.batch.index).toBe(50);
      expect(errorRow.batch.error).toBe("network reset mid-batch");
    }

    // The error batch splits the collapsed middle into two runs: indices
    // 15-49 (35 routine batches) and 51-74 (24 routine batches).
    expect(collapsedRows).toHaveLength(2);
    if (collapsedRows[0].kind === "collapsed" && collapsedRows[1].kind === "collapsed") {
      expect(collapsedRows[0].collapsedCount).toBe(35);
      expect(collapsedRows[1].collapsedCount).toBe(24);
      expect(collapsedRows[0].collapsedCount + collapsedRows[1].collapsedCount).toBe(59);
    }

    // Every routine batch is accounted for exactly once: 30 kept + 59 collapsed = 89.
    const routineKept = batchRows.filter((r) => r.kind === "batch" && r.batch.outcome !== "error").length;
    const routineCollapsed = collapsedRows.reduce((sum, r) => (r.kind === "collapsed" ? sum + r.collapsedCount : sum), 0);
    expect(routineKept + routineCollapsed).toBe(89);
  });
});

// ---------------------------------------------------------------------------
// formatModuleDeckCaptureLogCsv - frozen literal oracle, escaping included.
// materialsText must NEVER appear in the CSV (JSON-only).
// ---------------------------------------------------------------------------

describe("formatModuleDeckCaptureLogCsv", () => {
  const MATERIALS_TEXT = "SESSION MATERIALS TEXT MARKER - should only ever appear in the JSON export";

  function buildFullLog(): ModuleDeckCaptureRunLog {
    return buildModuleDeckCaptureRunLog(
      emptyInput({
        startedAt: AT,
        endedAt: AT_END,
        settings: {
          courseName: "CS 250",
          moduleLabel: "Week 4: Abstraction",
          templateId: "classic-lecture",
          resolvedSlideCount: 7,
          provider: "gemini",
          contextText: "Focus on the recursion examples",
        },
        droppedFrames: 12,
        estimatedScrollRatePxPerSec: 650,
        frameEncodeFacts: [
          { sourceWidth: 1920, sourceHeight: 1080, encodedWidth: 1920, encodedHeight: 1080, encodedQuality: 80 },
          { sourceWidth: 1920, sourceHeight: 1080, encodedWidth: 1920, encodedHeight: 1080, encodedQuality: 80 },
          { sourceWidth: 1920, sourceHeight: 1080, encodedWidth: 1920, encodedHeight: 1080, encodedQuality: 80 },
        ],
        batches: [
          makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 3, wireBytes: 500_000, outcome: "extracted" }),
          makeModuleDeckCaptureLogBatch({
            at: AT,
            index: 1,
            framesSent: 2,
            wireBytes: 300_000,
            outcome: "error",
            error: 'Batch failed: "503", retry needed',
          }),
        ],
        encodeNotices: [{ at: AT, text: "One captured frame was too large to send" }],
        blocks: {
          blocksExtracted: 120,
          blocksIllegible: 4,
          reductionStages: [
            // Deliberately out of pipeline order - the renderer must still
            // print them in the fixed DE16 order.
            { stage: "duplicate-join", charactersRemoved: 52_000, blocksAffected: 340 },
            { stage: "chrome-suppression", charactersRemoved: 146_000, blocksAffected: 801 },
            { stage: "proportional-downsampling", charactersRemoved: 15_000 },
            { stage: "control-text-removal", charactersRemoved: 8_000, blocksAffected: 120 },
          ],
        },
        generationAttempts: [{ at: AT_END, outcome: "success", error: "", materialsCharacterCount: 98_000, resolvedSlideCount: 7 }],
        materialsText: MATERIALS_TEXT,
      })
    );
  }

  it("renders the exact five-section CSV, escaping a comma-and-quote error, ordering reduction stages, and never leaking materialsText", () => {
    const csv = formatModuleDeckCaptureLogCsv(buildFullLog());
    expect(csv).toBe(
      [
        "=== Run ===",
        "Field,Value",
        "Feature,Module walkthrough deck capture",
        `Started,${AT}`,
        `Ended,${AT_END}`,
        "Course,CS 250",
        "Module,Week 4: Abstraction",
        "Template,classic-lecture",
        "Resolved slide count,7",
        "Provider,gemini",
        "Context,Focus on the recursion examples",
        `Frames sampled,${MODULE_DECK_CAPTURE_FRAMES_SAMPLED_NOTE}`,
        "Dropped frames (backpressure),12",
        "Estimated scroll rate,650 px/s (the measured safe ceiling is ~683 px/s at 1080p (content viewport height / 1.5s); a normal skim runs 500-800 px/s and can silently lose up to 15% of the module between kept frames)",
        "Capture resolution (source),1920x1080px",
        "Capture resolution (encoded),1920x1080px",
        "Capture resolution (JPEG quality),80",
        "Materials handed to generator (character count),74",
        "Materials handed to generator (full text),see JSON export",
        "Derived input tokens for this run (not measured),8050",
        "Output tokens for this run,UNMEASURED",
        "",
        "=== Batches ===",
        "Index,At,Frames sent,Wire bytes,Outcome,Error,Derived input tokens,Output tokens",
        `0,${AT},3,500000,extracted,,4585,UNMEASURED`,
        `1,${AT},2,300000,error,"Batch failed: ""503"", retry needed",3465,UNMEASURED`,
        "",
        "=== Encode notices ===",
        "At,Text",
        `${AT},One captured frame was too large to send`,
        "",
        "=== Blocks ===",
        "Field,Value",
        "Blocks extracted,120",
        "Blocks illegible,4",
        "Stage,Characters removed,Blocks affected",
        "chrome-suppression,146000,801",
        "duplicate-join,52000,340",
        "control-text-removal,8000,120",
        "proportional-downsampling,15000,",
        "",
        "=== Generation attempts ===",
        "At,Outcome,Error,Materials characters,Resolved slide count,Output tokens",
        `${AT_END},success,,98000,7,UNMEASURED`,
      ].join("\r\n")
    );
    expect(csv).not.toContain(MATERIALS_TEXT);
  });

  it("reports 'still running' when endedAt is null", () => {
    const csv = formatModuleDeckCaptureLogCsv(buildModuleDeckCaptureRunLog(emptyInput({ endedAt: null })));
    expect(csv).toContain("Ended,still running");
  });

  it("adds the condensing note only at/above the batch threshold", () => {
    const small = formatModuleDeckCaptureLogCsv(
      buildModuleDeckCaptureRunLog(
        emptyInput({ batches: [makeModuleDeckCaptureLogBatch({ at: AT, index: 0, framesSent: 1 })] })
      )
    );
    expect(small).not.toContain("the repetitive middle below is summarised");

    const big = formatModuleDeckCaptureLogCsv(
      buildModuleDeckCaptureRunLog(
        emptyInput({
          batches: Array.from({ length: MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD }, (_, i) =>
            makeModuleDeckCaptureLogBatch({ at: AT, index: i, framesSent: 1 })
          ),
        })
      )
    );
    expect(big).toContain("the repetitive middle below is summarised");
    expect(big).toContain("collapsed (");
  });
});

// ---------------------------------------------------------------------------
// formatModuleDeckCaptureLogJson - object shape, exportedAt, full materialsText.
// ---------------------------------------------------------------------------

describe("formatModuleDeckCaptureLogJson", () => {
  it("wraps the log in an object with exportedAt, never a bare array, and carries materialsText IN FULL", () => {
    const materialsText = "the exact text handed to the deck generator, verbatim, no summarising";
    const log = buildModuleDeckCaptureRunLog(emptyInput({ materialsText }));
    const parsed = JSON.parse(formatModuleDeckCaptureLogJson(log, { exportedAt: AT }));
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.exportedAt).toBe(AT);
    expect(parsed.feature).toBe("Module walkthrough deck capture");
    expect(parsed.materialsText).toBe(materialsText);
  });
});

// ---------------------------------------------------------------------------
// moduleDeckCaptureLogFileName
// ---------------------------------------------------------------------------

describe("moduleDeckCaptureLogFileName", () => {
  it("slugifies the module label and stamps the timestamp", () => {
    expect(moduleDeckCaptureLogFileName("Week 4: Abstraction!", "csv", "2026-09-01T10:05:07.000Z")).toBe(
      "module-deck-capture-log-week-4-abstraction-20260901-100507.csv"
    );
  });

  it("drops a blank module segment without a dangling double dash", () => {
    expect(moduleDeckCaptureLogFileName("", "json", "2026-09-01T10:05:07.000Z")).toBe(
      "module-deck-capture-log-20260901-100507.json"
    );
  });
});
