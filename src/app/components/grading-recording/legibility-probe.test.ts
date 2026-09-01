import { describe, it, expect } from "vitest";
import {
  PROBE_MAX_FRAMES,
  PROBE_NEAR_EMPTY_MAX_CHARS,
  PROBE_EMPTY_MESSAGE,
  canRunProbe,
  buildLegibilityProbePrompt,
  isProbeTranscriptEmpty,
  isProbeTranscriptNearEmpty,
  describeProbeNearEmptyMessage,
  deriveProbeResultNotice,
  describeCaptureParameters,
  summarizeFrameEncodeParameters,
  type ProbeCaptureParameters,
  type FrameEncodeFacts,
} from "./legibility-probe";

describe("PROBE_MAX_FRAMES", () => {
  it("pins the constant", () => {
    expect(PROBE_MAX_FRAMES).toBe(6);
  });
});

describe("canRunProbe - the 'Run legibility probe' button's gate", () => {
  it("refuses when nothing is queued, regardless of busy state", () => {
    expect(canRunProbe(0, false)).toBe(false);
    expect(canRunProbe(0, true)).toBe(false);
  });

  it("refuses while a probe is already in flight, even with frames queued", () => {
    expect(canRunProbe(3, true)).toBe(false);
  });

  it("allows once frames are queued and nothing is in flight", () => {
    expect(canRunProbe(1, false)).toBe(true);
    expect(canRunProbe(6, false)).toBe(true);
  });
});

describe("buildLegibilityProbePrompt - the probe's ONLY prompt (frozen literal per frame count)", () => {
  it("asks for verbatim transcription, never grading or structure extraction, for a multi-frame batch", () => {
    const prompt = buildLegibilityProbePrompt(3);
    expect(prompt).toContain("3 screen-capture frames");
    expect(prompt).toContain("LEGIBILITY TEST, not a grading task");
    expect(prompt).toContain("VERBATIM");
    expect(prompt).toContain("Do NOT grade, score, extract structure");
    expect(prompt).toContain("do not infer anything the frames do not literally show");
    // "rubric" DOES appear once, inside the prohibition itself ("no rubric
    // matching") - the thing this assertion must actually rule out is the
    // prompt ASKING for a score, not merely mentioning the word while
    // forbidding it.
    expect(prompt).not.toMatch(/score the submission|assign a score|provide a score/i);
  });

  it("singularizes 'frame' for a single-frame batch", () => {
    const prompt = buildLegibilityProbePrompt(1);
    expect(prompt).toContain("1 screen-capture frame ");
    expect(prompt).not.toContain("1 screen-capture frames");
  });

  it("explicitly asks the model to name the illegible region rather than skip it silently", () => {
    const prompt = buildLegibilityProbePrompt(2);
    expect(prompt).toContain("too small, blurry, or low-contrast");
    expect(prompt).toContain("name the region");
    expect(prompt).toContain("rather than skipping it silently");
  });

  it("explicitly forbids inventing a student name or a score", () => {
    const prompt = buildLegibilityProbePrompt(2);
    expect(prompt).toContain("Do not invent a student name, a score");
  });
});

describe("isProbeTranscriptEmpty / isProbeTranscriptNearEmpty - R1a's near-empty catch, mirroring rubric-input.ts's isExtractionSuspiciouslyShort", () => {
  it("pins the threshold constant", () => {
    expect(PROBE_NEAR_EMPTY_MAX_CHARS).toBe(40);
  });

  it("empty: true only for blank/whitespace-only text", () => {
    expect(isProbeTranscriptEmpty("")).toBe(true);
    expect(isProbeTranscriptEmpty("   \n\t  ")).toBe(true);
    expect(isProbeTranscriptEmpty("a")).toBe(false);
  });

  it("near-empty: false for an actually-empty string - that is the hard 'error' case, not this warning-adjacent one", () => {
    expect(isProbeTranscriptNearEmpty("")).toBe(false);
    expect(isProbeTranscriptNearEmpty("   ")).toBe(false);
  });

  it("near-empty: true at exactly the threshold (boundary inclusive)", () => {
    const exactlyForty = "a".repeat(40);
    expect(exactlyForty.length).toBe(40);
    expect(isProbeTranscriptNearEmpty(exactlyForty)).toBe(true);
  });

  it("near-empty: false one character past the threshold", () => {
    expect(isProbeTranscriptNearEmpty("a".repeat(41))).toBe(false);
  });

  it("near-empty: counts TRIMMED length, so padding whitespace cannot push real short text over the line", () => {
    const padded = `   ${"a".repeat(10)}   `;
    expect(isProbeTranscriptNearEmpty(padded)).toBe(true);
  });

  it("near-empty: a genuine 'I could not read anything' explanation is NOT flagged - it is already the loud, honest answer R1a asks for", () => {
    const realExplanation =
      "The text on this page is far too small and blurred to read reliably at this resolution.";
    expect(realExplanation.length).toBeGreaterThan(PROBE_NEAR_EMPTY_MAX_CHARS);
    expect(isProbeTranscriptNearEmpty(realExplanation)).toBe(false);
  });

  it("near-empty: a real multi-sentence transcription is comfortably clear of the threshold", () => {
    const realistic =
      "Discussion post by Jamie Lee: I think the argument in chapter 3 is the strongest because it directly addresses the counterexample raised in lecture.";
    expect(isProbeTranscriptNearEmpty(realistic)).toBe(false);
  });
});

describe("PROBE_EMPTY_MESSAGE / describeProbeNearEmptyMessage - frozen literals, must never read as success", () => {
  it("pins the empty message and states plainly that this is the finding R1 exists to surface", () => {
    expect(PROBE_EMPTY_MESSAGE).toBe(
      "The model transcribed nothing at all from these frames. This is the finding R1 exists to surface, not a run that simply had nothing to read - do not treat this as success."
    );
  });

  it("pins singular/plural character wording for the near-empty message", () => {
    expect(describeProbeNearEmptyMessage(1)).toBe(
      "Only 1 character came back. That is too little to be either a real transcription or a real explanation of what could not be read - treat this as an illegible run, not a successful one."
    );
    expect(describeProbeNearEmptyMessage(12)).toBe(
      "Only 12 characters came back. That is too little to be either a real transcription or a real explanation of what could not be read - treat this as an illegible run, not a successful one."
    );
  });
});

describe("deriveProbeResultNotice - the one decision LegibilityProbeModal.tsx renders from", () => {
  it("an action-level error always yields kind 'error' with the error text passed through unchanged", () => {
    const notice = deriveProbeResultNotice({ error: "Reading the screen failed: 429 Rate limit exceeded" });
    expect(notice).toEqual({ kind: "error", text: "Reading the screen failed: 429 Rate limit exceeded" });
  });

  it("a fully-empty transcript yields kind 'error' (never 'warning' or silent success) with PROBE_EMPTY_MESSAGE - R1a's headline case", () => {
    const notice = deriveProbeResultNotice({ transcript: "   " });
    expect(notice.kind).toBe("error");
    expect(notice.text).toBe(PROBE_EMPTY_MESSAGE);
  });

  it("a near-empty but non-blank transcript yields kind 'warning', never 'success'", () => {
    const notice = deriveProbeResultNotice({ transcript: "N/A" });
    expect(notice.kind).toBe("warning");
    expect(notice.text).toBe(describeProbeNearEmptyMessage(3));
  });

  it("a real transcription yields kind 'success'", () => {
    const notice = deriveProbeResultNotice({
      transcript: "Discussion post by Jamie Lee: I think the argument in chapter 3 is the strongest.",
    });
    expect(notice.kind).toBe("success");
  });

  it("the success/warning boundary matches isProbeTranscriptNearEmpty exactly, at the pinned threshold", () => {
    const atThreshold = deriveProbeResultNotice({ transcript: "a".repeat(PROBE_NEAR_EMPTY_MAX_CHARS) });
    const pastThreshold = deriveProbeResultNotice({ transcript: "a".repeat(PROBE_NEAR_EMPTY_MAX_CHARS + 1) });
    expect(atThreshold.kind).toBe("warning");
    expect(pastThreshold.kind).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// summarizeFrameEncodeParameters - the grouping logic underneath
// describeCaptureParameters, tested directly so the GROUPING behaviour (does
// this batch actually agree on each parameter) is pinned independently of
// the exact sentence wording. LP3 FIX: this is the honesty fix itself - a
// batch where frames disagree must be reported as disagreeing, never
// collapsed to one frame's value.
// ---------------------------------------------------------------------------

function frame(overrides: Partial<FrameEncodeFacts> = {}): FrameEncodeFacts {
  return {
    sourceWidth: 3840,
    sourceHeight: 2160,
    encodedWidth: 1920,
    encodedHeight: 1080,
    encodedQuality: 0.55,
    ...overrides,
  };
}

describe("summarizeFrameEncodeParameters - a UNIFORM run (every frame agrees)", () => {
  it("collapses to one group per field and reports zero re-encoded frames", () => {
    const summary = summarizeFrameEncodeParameters([frame(), frame(), frame()]);
    expect(summary.totalFrames).toBe(3);
    expect(summary.sourceDimGroups).toEqual([{ label: "3840x2160px", count: 3 }]);
    expect(summary.encodedDimGroups).toEqual([{ label: "1920x1080px", count: 3 }]);
    expect(summary.qualityGroups).toEqual([{ quality: 0.55, count: 3 }]);
    expect(summary.reencodedGroups).toEqual([]);
  });
});

describe("summarizeFrameEncodeParameters - a MIXED run (some frames re-encoded at half quality)", () => {
  it("splits the quality into groups and names the lower-quality group as re-encoded", () => {
    const frames = [
      frame({ encodedQuality: 0.55 }),
      frame({ encodedQuality: 0.55 }),
      frame({ encodedQuality: 0.55 }),
      frame({ encodedQuality: 0.55 }),
      frame({ encodedQuality: 0.275 }),
      frame({ encodedQuality: 0.275 }),
    ];
    const summary = summarizeFrameEncodeParameters(frames);
    expect(summary.totalFrames).toBe(6);
    // Dimensions still agree across every frame in this run - only quality
    // varies - so those groups stay collapsed to one entry each.
    expect(summary.sourceDimGroups).toEqual([{ label: "3840x2160px", count: 6 }]);
    expect(summary.encodedDimGroups).toEqual([{ label: "1920x1080px", count: 6 }]);
    expect(summary.qualityGroups).toEqual([
      { quality: 0.55, count: 4 },
      { quality: 0.275, count: 2 },
    ]);
    expect(summary.reencodedGroups).toEqual([{ quality: 0.275, count: 2 }]);
  });
});

describe("summarizeFrameEncodeParameters - a SINGLE-frame run", () => {
  it("reports one frame in every group and no re-encode", () => {
    const summary = summarizeFrameEncodeParameters([frame({ sourceWidth: 1600, sourceHeight: 900, encodedWidth: 1600, encodedHeight: 900 })]);
    expect(summary.totalFrames).toBe(1);
    expect(summary.sourceDimGroups).toEqual([{ label: "1600x900px", count: 1 }]);
    expect(summary.encodedDimGroups).toEqual([{ label: "1600x900px", count: 1 }]);
    expect(summary.qualityGroups).toEqual([{ quality: 0.55, count: 1 }]);
    expect(summary.reencodedGroups).toEqual([]);
  });
});

describe("summarizeFrameEncodeParameters - dimensions can disagree too (a resize between capture and this batch)", () => {
  it("groups source dimensions separately when frames disagree, independent of quality agreeing", () => {
    const summary = summarizeFrameEncodeParameters([
      frame({ sourceWidth: 3840, sourceHeight: 2160 }),
      frame({ sourceWidth: 3840, sourceHeight: 2160 }),
      frame({ sourceWidth: 1920, sourceHeight: 1080 }),
    ]);
    expect(summary.sourceDimGroups).toEqual([
      { label: "3840x2160px", count: 2 },
      { label: "1920x1080px", count: 1 },
    ]);
    expect(summary.qualityGroups).toEqual([{ quality: 0.55, count: 3 }]);
    expect(summary.reencodedGroups).toEqual([]);
  });
});

describe("describeCaptureParameters - R1b's repeatability line (frozen literal)", () => {
  const formatWireBytes = (bytes: number) => `${(bytes / 1000).toFixed(1)}kB (fake)`;

  it("a UNIFORM run: renders one value per field, no re-encode note", () => {
    const params: ProbeCaptureParameters = {
      frames: [frame(), frame(), frame()],
      wireBytes: 512000,
    };
    expect(describeCaptureParameters(params, formatWireBytes)).toBe(
      "Source 3840x2160px -> sent at 1920x1080px, JPEG quality 0.55, 3 frames, 512.0kB (fake) on the wire."
    );
  });

  it("a MIXED run: names both quality groups with their counts AND states explicitly how many frames were re-encoded", () => {
    const params: ProbeCaptureParameters = {
      frames: [
        frame({ encodedQuality: 0.55 }),
        frame({ encodedQuality: 0.55 }),
        frame({ encodedQuality: 0.55 }),
        frame({ encodedQuality: 0.55 }),
        frame({ encodedQuality: 0.275 }),
        frame({ encodedQuality: 0.275 }),
      ],
      wireBytes: 900000,
    };
    expect(describeCaptureParameters(params, formatWireBytes)).toBe(
      "Source 3840x2160px -> sent at 1920x1080px, JPEG quality 0.55 (4 of 6), 0.275 (2 of 6), 6 frames, 900.0kB (fake) on the wire." +
        " 2 of 6 frames were re-encoded at 0.275 to fit the size budget."
    );
  });

  it("a SINGLE-frame run: singularizes 'frame' and never appends a re-encode note", () => {
    const params: ProbeCaptureParameters = {
      frames: [frame({ sourceWidth: 1600, sourceHeight: 900, encodedWidth: 1600, encodedHeight: 900 })],
      wireBytes: 100000,
    };
    expect(describeCaptureParameters(params, formatWireBytes)).toBe(
      "Source 1600x900px -> sent at 1600x900px, JPEG quality 0.55, 1 frame, 100.0kB (fake) on the wire."
    );
  });

  it("calls the injected formatter with exactly the wireBytes field, not some derived value", () => {
    let seen: number | null = null;
    const params: ProbeCaptureParameters = {
      frames: [frame(), frame()],
      wireBytes: 777,
    };
    describeCaptureParameters(params, (bytes) => {
      seen = bytes;
      return "X";
    });
    expect(seen).toBe(777);
  });
});
