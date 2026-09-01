import { describe, it, expect } from "vitest";
import {
  buildLegibilityProbeRunLog,
  summarizeLegibilityProbeRunLog,
  legibilityProbeLogSummaryLine,
  formatLegibilityProbeLogCsv,
  formatLegibilityProbeLogJson,
  legibilityProbeLogFileName,
  type LegibilityProbeLogRun,
} from "./legibility-probe-log";

const AT = "2026-08-31T09:00:00.000Z";

function run(overrides: Partial<LegibilityProbeLogRun> = {}): LegibilityProbeLogRun {
  return {
    at: AT,
    frameCount: 3,
    wireBytes: 12345,
    captureParametersLine: "Source 1920x1080px -> sent at 960x540px, JPEG quality 0.7, 3 frames, 12.0 KB on the wire.",
    outcome: "success",
    noticeText: "The model returned a transcription below.",
    transcript: "Hello world",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildLegibilityProbeRunLog - order preservation.
// ---------------------------------------------------------------------------

describe("buildLegibilityProbeRunLog", () => {
  it("uses the runs list in the exact order given, never reordering or dropping", () => {
    const runs = [run({ at: "2026-08-31T09:00:00.000Z" }), run({ at: "2026-08-31T09:05:00.000Z" }), run({ at: "2026-08-31T09:10:00.000Z" })];
    const log = buildLegibilityProbeRunLog(runs);
    expect(log.runs.map((r) => r.at)).toEqual([
      "2026-08-31T09:00:00.000Z",
      "2026-08-31T09:05:00.000Z",
      "2026-08-31T09:10:00.000Z",
    ]);
  });

  it("produces a true, useful record for zero runs (never gated on there being results)", () => {
    const log = buildLegibilityProbeRunLog([]);
    expect(log.runs).toEqual([]);
    expect(summarizeLegibilityProbeRunLog(log).totalRuns).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// summarizeLegibilityProbeRunLog - exhaustive outcome counting. Sabotage-
// checked: a version of the switch that mapped "warning" into the same
// bucket as "success" (an easy copy-paste mistake given both are non-error)
// was manually tried against these exact numbers and turned this test red -
// see this file's own report for the mutation tried.
// ---------------------------------------------------------------------------

describe("summarizeLegibilityProbeRunLog", () => {
  it("counts success/warning/error independently, summing to totalRuns", () => {
    // Every bucket gets a DIFFERENT count (3/2/1) - not just "at least one
    // run per outcome" - so a bug that swapped which counter any TWO
    // outcomes increment cannot hide behind two buckets landing on the same
    // number (the "default on both sides" pitfall AGENTS.md warns about).
    const log = buildLegibilityProbeRunLog([
      run({ outcome: "success" }),
      run({ outcome: "success" }),
      run({ outcome: "success" }),
      run({ outcome: "warning" }),
      run({ outcome: "warning" }),
      run({ outcome: "error" }),
    ]);
    const summary = summarizeLegibilityProbeRunLog(log);
    expect(summary.totalRuns).toBe(6);
    expect(summary.successCount).toBe(3);
    expect(summary.warningCount).toBe(2);
    expect(summary.errorCount).toBe(1);
    expect(summary.successCount + summary.warningCount + summary.errorCount).toBe(summary.totalRuns);
  });

  it("throws on an unhandled outcome rather than silently miscounting it (exhaustiveness guard)", () => {
    const log = buildLegibilityProbeRunLog([run()]);
    (log.runs[0] as unknown as { outcome: string }).outcome = "not-a-real-outcome";
    expect(() => summarizeLegibilityProbeRunLog(log)).toThrow(/Unhandled legibility probe outcome/);
  });
});

// ---------------------------------------------------------------------------
// legibilityProbeLogSummaryLine - frozen literal oracle.
// ---------------------------------------------------------------------------

describe("legibilityProbeLogSummaryLine", () => {
  it("renders the exact sentence for a mixed-outcome session", () => {
    const summary = summarizeLegibilityProbeRunLog(
      buildLegibilityProbeRunLog([run({ outcome: "success" }), run({ outcome: "error" })])
    );
    expect(legibilityProbeLogSummaryLine(summary)).toBe("2 probe runs this session - 1 legible, 0 near-empty, 1 failed.");
  });

  it("renders the singular 'run' and a true zero-run sentence", () => {
    expect(legibilityProbeLogSummaryLine(summarizeLegibilityProbeRunLog(buildLegibilityProbeRunLog([run()])))).toBe(
      "1 probe run this session - 1 legible, 0 near-empty, 0 failed."
    );
    expect(legibilityProbeLogSummaryLine(summarizeLegibilityProbeRunLog(buildLegibilityProbeRunLog([])))).toBe(
      "0 probe runs this session - 0 legible, 0 near-empty, 0 failed."
    );
  });
});

// ---------------------------------------------------------------------------
// formatLegibilityProbeLogCsv - frozen literal oracle, escaping included.
// ---------------------------------------------------------------------------

describe("formatLegibilityProbeLogCsv", () => {
  it("renders the exact header + row, escaping a newline in the transcript", () => {
    const log = buildLegibilityProbeRunLog([
      run({ transcript: "Line one\nLine two", noticeText: "" }),
    ]);
    const csv = formatLegibilityProbeLogCsv(log);
    expect(csv).toBe(
      [
        "At,Frame count,Wire bytes,Capture parameters,Outcome,Notice,Transcript",
        `${AT},3,12345,"Source 1920x1080px -> sent at 960x540px, JPEG quality 0.7, 3 frames, 12.0 KB on the wire.",success,,"Line one` +
          "\nLine two\"",
      ].join("\r\n")
    );
  });

  it("renders the exact header row alone for zero runs", () => {
    expect(formatLegibilityProbeLogCsv(buildLegibilityProbeRunLog([]))).toBe(
      "At,Frame count,Wire bytes,Capture parameters,Outcome,Notice,Transcript"
    );
  });
});

// ---------------------------------------------------------------------------
// formatLegibilityProbeLogJson - object shape, exportedAt.
// ---------------------------------------------------------------------------

describe("formatLegibilityProbeLogJson", () => {
  it("wraps the log in an object with exportedAt, never a bare array", () => {
    const log = buildLegibilityProbeRunLog([run()]);
    const parsed = JSON.parse(formatLegibilityProbeLogJson(log, { exportedAt: AT }));
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.exportedAt).toBe(AT);
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].transcript).toBe("Hello world");
  });
});

// ---------------------------------------------------------------------------
// legibilityProbeLogFileName.
// ---------------------------------------------------------------------------

describe("legibilityProbeLogFileName", () => {
  it("stamps the timestamp with no course/name segment", () => {
    expect(legibilityProbeLogFileName("csv", "2026-08-31T09:05:07.000Z")).toBe("legibility-probe-log-20260831-090507.csv");
    expect(legibilityProbeLogFileName("json", "2026-08-31T09:05:07.000Z")).toBe("legibility-probe-log-20260831-090507.json");
  });
});
