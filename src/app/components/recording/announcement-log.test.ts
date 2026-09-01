import { describe, it, expect } from "vitest";
import {
  emptyAnnouncementLogCollected,
  buildAnnouncementRunLog,
  summarizeAnnouncementRunLog,
  announcementLogSummaryLine,
  formatAnnouncementLogCsv,
  formatAnnouncementLogJson,
  announcementLogFileName,
  type AnnouncementLogCollected,
} from "./announcement-log";

const AT = "2026-08-31T09:00:00.000Z";

function log(overrides: Partial<AnnouncementLogCollected> = {}, takeName = "Week 3 lecture", takeDurationSec = 120) {
  return buildAnnouncementRunLog({
    takeName,
    takeDurationSec,
    collected: { ...emptyAnnouncementLogCollected(), ...overrides },
  });
}

// ---------------------------------------------------------------------------
// buildAnnouncementRunLog.
// ---------------------------------------------------------------------------

describe("buildAnnouncementRunLog", () => {
  it("carries the take's identity plus every collected field through unchanged", () => {
    const collected: AnnouncementLogCollected = {
      transcriptionPath: "segments",
      chunkRetries: [{ at: AT, chunkNumber: 2, restart: false }],
      draftAttempts: [{ at: AT, ok: true, error: "" }],
      imageAttempts: [{ at: AT, outcome: "generated", error: "" }],
      postAttempts: [{ at: AT, ok: true, error: "", imageUploadFailed: false, course: "CS 101" }],
    };
    const run = buildAnnouncementRunLog({ takeName: "My take", takeDurationSec: 90, collected });
    expect(run.takeName).toBe("My take");
    expect(run.takeDurationSec).toBe(90);
    expect(run.transcriptionPath).toBe("segments");
    expect(run.chunkRetries).toEqual(collected.chunkRetries);
    expect(run.draftAttempts).toEqual(collected.draftAttempts);
    expect(run.imageAttempts).toEqual(collected.imageAttempts);
    expect(run.postAttempts).toEqual(collected.postAttempts);
  });

  it("produces a true, useful record for a run that never started (never gated on there being results)", () => {
    const run = log();
    expect(run.transcriptionPath).toBe("");
    expect(run.chunkRetries).toEqual([]);
    expect(run.draftAttempts).toEqual([]);
    expect(run.imageAttempts).toEqual([]);
    expect(run.postAttempts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeAnnouncementRunLog - exhaustive image-outcome counting and
// aggregate draft/post failure counts. Sabotage-checked: a version that
// counted `imagesFailed` from `imageAttempts.length` instead of filtering by
// outcome (an easy off-by-mistake when a discarded/generated attempt is also
// present) was manually tried against these exact numbers and turned this
// test red - see this file's own report for the mutation tried.
// ---------------------------------------------------------------------------

describe("summarizeAnnouncementRunLog", () => {
  it("counts draft/image/post attempts and failures independently", () => {
    // The three image-outcome buckets get a DIFFERENT count each (1/2/3) -
    // not just "at least one of each" - so a bug that swapped which counter
    // any TWO outcomes increment cannot hide behind two buckets landing on
    // the same number (the "default on both sides" pitfall AGENTS.md warns
    // about).
    const run = log({
      transcriptionPath: "real-time",
      chunkRetries: [{ at: AT, chunkNumber: 1, restart: true }],
      draftAttempts: [
        { at: AT, ok: false, error: "model timeout" },
        { at: AT, ok: true, error: "" },
      ],
      imageAttempts: [
        { at: AT, outcome: "generated", error: "" },
        { at: AT, outcome: "failed", error: "content policy" },
        { at: AT, outcome: "failed", error: "content policy" },
        { at: AT, outcome: "discarded", error: "" },
        { at: AT, outcome: "discarded", error: "" },
        { at: AT, outcome: "discarded", error: "" },
      ],
      postAttempts: [
        { at: AT, ok: false, error: "Canvas refused", imageUploadFailed: false, course: "CS 101" },
        { at: AT, ok: true, error: "", imageUploadFailed: true, course: "CS 101" },
      ],
    });
    const summary = summarizeAnnouncementRunLog(run);
    expect(summary.transcriptionPath).toBe("real-time");
    expect(summary.chunkRetryCount).toBe(1);
    expect(summary.draftAttempts).toBe(2);
    expect(summary.draftFailures).toBe(1);
    expect(summary.imagesGenerated).toBe(1);
    expect(summary.imagesFailed).toBe(2);
    expect(summary.imagesDiscarded).toBe(3);
    expect(summary.postAttempts).toBe(2);
    expect(summary.postFailures).toBe(1);
    expect(summary.postsWithImageUploadFailure).toBe(1);
  });

  it("throws on an unhandled image outcome rather than silently miscounting it (exhaustiveness guard)", () => {
    const run = log({ imageAttempts: [{ at: AT, outcome: "generated", error: "" }] });
    (run.imageAttempts[0] as unknown as { outcome: string }).outcome = "not-a-real-outcome";
    expect(() => summarizeAnnouncementRunLog(run)).toThrow(/Unhandled announcement image outcome/);
  });
});

// ---------------------------------------------------------------------------
// announcementLogSummaryLine - frozen literal oracle.
// ---------------------------------------------------------------------------

describe("announcementLogSummaryLine", () => {
  it("renders the exact sentence for a run that never started", () => {
    expect(announcementLogSummaryLine(summarizeAnnouncementRunLog(log()))).toBe(
      "Transcription: not started. 0 draft attempts, 0 failed. Image: 0 generated, 0 failed, 0 discarded. 0 post attempts, 0 failed."
    );
  });

  it("renders the exact sentence with chunk retries and an image-upload-failure clause", () => {
    const run = log({
      transcriptionPath: "segments",
      chunkRetries: [
        { at: AT, chunkNumber: 2, restart: false },
        { at: AT, chunkNumber: 1, restart: true },
      ],
      draftAttempts: [{ at: AT, ok: true, error: "" }],
      imageAttempts: [{ at: AT, outcome: "generated", error: "" }],
      postAttempts: [{ at: AT, ok: true, error: "", imageUploadFailed: true, course: "CS 101" }],
    });
    expect(announcementLogSummaryLine(summarizeAnnouncementRunLog(run))).toBe(
      "Transcription: segments (2 chunk retries). 1 draft attempt, 0 failed. Image: 1 generated, 0 failed, 0 discarded. 1 post attempt, 0 failed, 1 with a failed image upload."
    );
  });
});

// ---------------------------------------------------------------------------
// formatAnnouncementLogCsv - frozen literal oracle, escaping included.
// ---------------------------------------------------------------------------

describe("formatAnnouncementLogCsv", () => {
  it("renders the exact five-section CSV, escaping a comma in a course name", () => {
    const run = log({
      transcriptionPath: "cached",
      chunkRetries: [{ at: AT, chunkNumber: 3, restart: false }],
      draftAttempts: [{ at: AT, ok: false, error: "The model returned an empty response." }],
      imageAttempts: [{ at: AT, outcome: "failed", error: "content policy" }],
      postAttempts: [{ at: AT, ok: true, error: "", imageUploadFailed: false, course: "CS 101, Section A" }],
    });
    expect(formatAnnouncementLogCsv(run)).toBe(
      [
        "=== Run ===",
        "Field,Value",
        "Take,Week 3 lecture",
        "Take duration (seconds),120",
        "Transcription path,cached",
        "",
        "=== Chunk retries ===",
        "At,Chunk number,Restart",
        `${AT},3,No`,
        "",
        "=== Draft attempts ===",
        "At,OK,Error",
        `${AT},No,The model returned an empty response.`,
        "",
        "=== Image attempts ===",
        "At,Outcome,Error",
        `${AT},failed,content policy`,
        "",
        "=== Post attempts ===",
        "At,OK,Error,Image upload failed,Course",
        `${AT},Yes,,No,"CS 101, Section A"`,
      ].join("\r\n")
    );
  });
});

// ---------------------------------------------------------------------------
// formatAnnouncementLogJson - object shape, exportedAt.
// ---------------------------------------------------------------------------

describe("formatAnnouncementLogJson", () => {
  it("wraps the log in an object with exportedAt, never a bare array", () => {
    const run = log({ transcriptionPath: "segments" });
    const parsed = JSON.parse(formatAnnouncementLogJson(run, { exportedAt: AT }));
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.exportedAt).toBe(AT);
    expect(parsed.takeName).toBe("Week 3 lecture");
    expect(parsed.transcriptionPath).toBe("segments");
  });
});

// ---------------------------------------------------------------------------
// announcementLogFileName.
// ---------------------------------------------------------------------------

describe("announcementLogFileName", () => {
  it("slugifies the take name and stamps the timestamp", () => {
    expect(announcementLogFileName("Week 3: Intro!", "csv", "2026-08-31T09:05:07.000Z")).toBe(
      "announcement-log-week-3-intro-20260831-090507.csv"
    );
  });

  it("drops a blank take-name segment without a dangling double dash", () => {
    expect(announcementLogFileName("", "json", "2026-08-31T09:05:07.000Z")).toBe("announcement-log-20260831-090507.json");
  });
});
