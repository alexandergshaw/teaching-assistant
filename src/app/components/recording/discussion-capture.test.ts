// Unit tests for the pure discussion-capture module - the frame/capture
// side (constants, target-width resolution, frame-signature change
// detection, batch packing) and the loop-policy predicates (loop
// continuation, ticker gating, draft dispatch force/eligibility, and
// draft-outcome partitioning).
//
// This file was split from a single discussion-capture.test.ts to stay
// under this directory's line-count ceiling (see
// recording-split.structure.test.ts). See also:
//   - discussion-capture.rows.test.ts (the reply-table side: merge, sort,
//     move, serialize/deserialize)
//   - discussion-capture.dedupe.test.ts (normalizeForMatch / authorsMatch /
//     postSimilarityDistance / isSamePost, including the frozen dedupe
//     oracle)
//
// Every test here is sabotage-checked - see the report handed back to the
// dispatcher for the exact sabotages run.

import { describe, it, expect } from "vitest";
import {
  FRAME_SAMPLE_INTERVAL_MS,
  FRAME_MIN_KEEP_INTERVAL_MS,
  FRAME_TARGET_WIDTH,
  FRAME_MIN_SCALE,
  FRAME_JPEG_QUALITY,
  SIGNATURE_GRID,
  FRAME_CHANGE_THRESHOLD,
  MAX_PENDING_FRAMES,
  EXTRACT_BATCH_WIRE_BUDGET,
  STALL_NOTICE_TICKS,
  MAX_TABLE_ROWS,
  PREFIX_TOKENS,
  SIMILARITY_THRESHOLD,
  MIN_TOKENS_FOR_SIMILARITY,
  DISCUSSION_TABLE_VERSION,
  resolveTargetWidth,
  computeFrameSignature,
  framesDifferEnough,
  packFrameBatch,
  partitionDraftOutcome,
  isDispatchableDraftItem,
  draftDispatchForce,
  shouldLoopContinue,
  shouldTickerRun,
  accumulateDroppedFrames,
  type FrameSignature,
} from "./discussion-capture";

// ---------------------------------------------------------------------------
// AC8: capture-only constants - pinned so a drift is visible in a diff.
// ---------------------------------------------------------------------------

describe("capture-only constants (AC8)", () => {
  it("match the values fixed in the acceptance criteria", () => {
    expect(FRAME_SAMPLE_INTERVAL_MS).toBe(500);
    expect(FRAME_MIN_KEEP_INTERVAL_MS).toBe(1200);
    expect(FRAME_TARGET_WIDTH).toBe(1920);
    expect(FRAME_MIN_SCALE).toBe(0.5);
    expect(FRAME_JPEG_QUALITY).toBe(0.55);
    expect(SIGNATURE_GRID).toBe(32);
    expect(FRAME_CHANGE_THRESHOLD).toBe(6);
    expect(MAX_PENDING_FRAMES).toBe(16);
    expect(EXTRACT_BATCH_WIRE_BUDGET).toBe(3_000_000);
    expect(STALL_NOTICE_TICKS).toBe(60);
    expect(MAX_TABLE_ROWS).toBe(500);
    expect(PREFIX_TOKENS).toBe(40);
    expect(SIMILARITY_THRESHOLD).toBe(0.25);
    expect(MIN_TOKENS_FOR_SIMILARITY).toBe(4);
    expect(DISCUSSION_TABLE_VERSION).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC8a: resolveTargetWidth
// ---------------------------------------------------------------------------

describe("resolveTargetWidth (AC8a)", () => {
  it("never upscales past the source width", () => {
    expect(resolveTargetWidth(1280)).toBe(1280);
  });

  it("does not downscale a 1920 source", () => {
    expect(resolveTargetWidth(1920)).toBe(1920);
  });

  it("keeps a QHD (2560) source at FRAME_TARGET_WIDTH (1920), since 2560*0.5=1280 is below the floor", () => {
    expect(resolveTargetWidth(2560)).toBe(1920);
  });

  it("floors a 4K (3840) source at half scale (1920), not the old min(1280, w) result", () => {
    expect(resolveTargetWidth(3840)).toBe(1920);
  });

  it("SABOTAGE-relevant: floor prevents an 8K-scale source from going below half", () => {
    // At FRAME_MIN_SCALE=0.5, an extreme source width still resolves to
    // at least half its own width, never a fixed 1280 regardless of size.
    expect(resolveTargetWidth(7680)).toBe(3840);
  });
});

// ---------------------------------------------------------------------------
// AC9 / AC9a: change detection
// ---------------------------------------------------------------------------

function solidPixels(width: number, height: number, gray: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[o] = gray;
    out[o + 1] = gray;
    out[o + 2] = gray;
    out[o + 3] = 255;
  }
  return out;
}

describe("computeFrameSignature (AC9a)", () => {
  it("returns a signature of length width * height", () => {
    const sig = computeFrameSignature(solidPixels(4, 4, 100), 4, 4);
    expect(sig.length).toBe(16);
  });

  it("computes the expected luma for a known solid color", () => {
    // Pure red (255,0,0) -> luma = round(0.299*255) = 76.
    const pixels = new Uint8ClampedArray(4);
    pixels[0] = 255;
    pixels[1] = 0;
    pixels[2] = 0;
    pixels[3] = 255;
    const sig = computeFrameSignature(pixels, 1, 1);
    expect(sig[0]).toBe(76);
  });

  it("a solid white frame and a solid black frame produce maximally different signatures", () => {
    const white = computeFrameSignature(solidPixels(4, 4, 255), 4, 4);
    const black = computeFrameSignature(solidPixels(4, 4, 0), 4, 4);
    expect(white[0]).toBe(255);
    expect(black[0]).toBe(0);
  });
});

describe("framesDifferEnough (AC9)", () => {
  const grayA = computeFrameSignature(solidPixels(4, 4, 100), 4, 4);
  const grayB = computeFrameSignature(solidPixels(4, 4, 101), 4, 4); // 1 unit off, below default threshold
  const grayFar = computeFrameSignature(solidPixels(4, 4, 200), 4, 4); // 100 units off, above threshold

  it("is always true when the previous signature is null (first frame of a session)", () => {
    expect(framesDifferEnough(null, grayA)).toBe(true);
  });

  it("is false when the mean absolute difference is below the default threshold", () => {
    expect(framesDifferEnough(grayA, grayB)).toBe(false);
  });

  it("is true when the mean absolute difference exceeds the default threshold", () => {
    expect(framesDifferEnough(grayA, grayFar)).toBe(true);
  });

  it("honors an explicit threshold override", () => {
    // 1 unit of difference exceeds a threshold of 0.
    expect(framesDifferEnough(grayA, grayB, 0)).toBe(true);
  });

  it("SABOTAGE CHECK (a): flipping the comparison direction changes these exact outcomes", () => {
    // This test documents the sabotage performed on framesDifferEnough's
    // `sum / len > threshold` comparison (flipped to `<`) - see the report
    // for confirmation this test went red under that mutation and passed
    // again once reverted.
    expect(framesDifferEnough(grayA, grayFar)).toBe(true);
    expect(framesDifferEnough(grayA, grayB)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC10a: packFrameBatch
// ---------------------------------------------------------------------------

describe("packFrameBatch (AC10a)", () => {
  it("returns an empty array for an empty queue", () => {
    expect(packFrameBatch([], 6, 1000)).toEqual([]);
  });

  it("packs frames oldest-first up to the count ceiling when bytes allow", () => {
    const frames = [{ base64: "a" }, { base64: "b" }, { base64: "c" }, { base64: "d" }];
    const result = packFrameBatch(frames, 2, 1000);
    expect(result).toEqual([{ base64: "a" }, { base64: "b" }]);
  });

  it("stops packing once the wire-byte budget would be exceeded", () => {
    const frames = [{ base64: "aaaaa" }, { base64: "bbbbb" }, { base64: "ccccc" }];
    // Budget fits exactly two 5-char frames (10) but not three (15).
    const result = packFrameBatch(frames, 10, 10);
    expect(result).toEqual([{ base64: "aaaaa" }, { base64: "bbbbb" }]);
  });

  it("always returns at least one frame, even when it alone exceeds the budget", () => {
    const frames = [{ base64: "aaaaaaaaaa" }, { base64: "b" }];
    const result = packFrameBatch(frames, 10, 1);
    expect(result).toEqual([{ base64: "aaaaaaaaaa" }]);
  });

  it("SABOTAGE CHECK (e): a byte-budget-ignoring implementation would pack all three frames here", () => {
    const frames = [{ base64: "aaaaa" }, { base64: "bbbbb" }, { base64: "ccccc" }];
    const result = packFrameBatch(frames, 10, 10);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// F10: partitionDraftOutcome - the row-stuck-on-"Drafting"-forever fix.
// ---------------------------------------------------------------------------

describe("partitionDraftOutcome (F10)", () => {
  it("puts every id in `unchanged` when nothing was edited since dispatch", () => {
    const result = partitionDraftOutcome(["a", "b", "c"], () => true);
    expect(result).toEqual({ unchanged: ["a", "b", "c"], editedDuringDispatch: [] });
  });

  it("puts every id in `editedDuringDispatch` when everything was edited since dispatch", () => {
    const result = partitionDraftOutcome(["a", "b", "c"], () => false);
    expect(result).toEqual({ unchanged: [], editedDuringDispatch: ["a", "b", "c"] });
  });

  it("splits a mixed batch by the predicate, preserving each id's original order within its bucket", () => {
    const editedIds = new Set(["b", "d"]);
    const result = partitionDraftOutcome(["a", "b", "c", "d"], (id) => !editedIds.has(id));
    expect(result.unchanged).toEqual(["a", "c"]);
    expect(result.editedDuringDispatch).toEqual(["b", "d"]);
  });

  it("returns two empty arrays for an empty id list", () => {
    expect(partitionDraftOutcome([], () => true)).toEqual({ unchanged: [], editedDuringDispatch: [] });
  });

  it("SABOTAGE-relevant: a swapped-branch implementation would put edited ids in `unchanged`", () => {
    // Documents the exact outcome an inverted `if (isUnchangedSince(id))`
    // (i.e. `if (!isUnchangedSince(id))` swapped in the wrong branch) would
    // get backwards - a row the user edited would be treated as a real
    // failure/model-text target instead of being resolved to the user's own
    // text. Verified by sabotage - see report.
    const result = partitionDraftOutcome(["edited-row"], () => false);
    expect(result.editedDuringDispatch).toContain("edited-row");
    expect(result.unchanged).not.toContain("edited-row");
  });
});

// ---------------------------------------------------------------------------
// BL1/S1: isDispatchableDraftItem
// ---------------------------------------------------------------------------

describe("isDispatchableDraftItem (AC52 / S1)", () => {
  it("is dispatchable when forced, regardless of userEdited", () => {
    expect(isDispatchableDraftItem({ force: true }, { userEdited: true })).toBe(true);
    expect(isDispatchableDraftItem({ force: true }, { userEdited: false })).toBe(true);
  });

  it("is dispatchable, unforced, when the row's reply is machine-authored (userEdited false) - the S1 case of a stale draft left by a failed redraft", () => {
    expect(isDispatchableDraftItem({ force: false }, { userEdited: false })).toBe(true);
  });

  it("is NOT dispatchable, unforced, when the row's reply is user-authored - AC52's actual protection", () => {
    expect(isDispatchableDraftItem({ force: false }, { userEdited: true })).toBe(false);
  });

  it("SABOTAGE-relevant: a reply-emptiness-based implementation would disagree with the userEdited-based one on a failed-redraft row (userEdited=false, reply already non-empty)", () => {
    // This is exactly S1's bug: the old guard skipped any row whose `reply`
    // was non-empty, which silently dropped a row like this one from every
    // Retry / "Draft the missing replies" dispatch. The fact under test here
    // is that userEdited alone - not reply's emptiness - decides dispatch.
    expect(isDispatchableDraftItem({ force: false }, { userEdited: false })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NEW-1: shouldLoopContinue - the consumer loops' continuation predicate.
// The closest a vitest test here can get to guarding the StrictMode
// double-invoke hang (no hook is ever rendered in this repo) - pins the
// LOGIC of the fix, not the effect-timing race it survives.
// ---------------------------------------------------------------------------

describe("shouldLoopContinue (NEW-1)", () => {
  it("continues when active and the epoch still matches", () => {
    expect(shouldLoopContinue(true, 1, 1)).toBe(true);
  });

  it("stops on a real unmount (loopsActive false), regardless of epoch", () => {
    expect(shouldLoopContinue(false, 1, 1)).toBe(false);
  });

  it("stops a StrictMode-orphaned instance once a newer epoch has started, even though loopsActive has already flipped back to true", () => {
    // loopsActive alone is true again by the time an orphaned instance
    // resumes (see shouldLoopContinue's header in discussion-capture.ts) -
    // only the epoch mismatch stops it.
    expect(shouldLoopContinue(true, 2, 1)).toBe(false);
  });

  it("SABOTAGE-relevant: a loopsActive-only predicate (the pre-fix shape) disagrees with shouldLoopContinue on the orphaned-instance case above - this IS NEW-1's bug shape", () => {
    const loopsActiveOnlyPredicate = (loopsActive: boolean) => loopsActive;
    expect(shouldLoopContinue(true, 2, 1)).toBe(false);
    expect(loopsActiveOnlyPredicate(true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NEW-2: shouldTickerRun - whether the shared wake ticker has anything to
// wake either consumer loop for, right now.
// ---------------------------------------------------------------------------

describe("shouldTickerRun (NEW-2)", () => {
  const idle = { capturing: false, pendingFrames: 0, extracting: false, drafting: false, draftQueueSize: 0 };

  it("is false when nothing is happening", () => {
    expect(shouldTickerRun(idle)).toBe(false);
  });

  it("is true for each individual signal alone: capturing, pendingFrames, extracting, drafting, draftQueueSize", () => {
    expect(shouldTickerRun({ ...idle, capturing: true })).toBe(true);
    expect(shouldTickerRun({ ...idle, pendingFrames: 3 })).toBe(true);
    expect(shouldTickerRun({ ...idle, extracting: true })).toBe(true);
    expect(shouldTickerRun({ ...idle, drafting: true })).toBe(true);
    expect(shouldTickerRun({ ...idle, draftQueueSize: 1 })).toBe(true);
  });

  it("SABOTAGE-relevant: an accidental AND of the fields (instead of OR) disagrees with shouldTickerRun on every single-signal case above", () => {
    const andOfFieldsPredicate = (args: Parameters<typeof shouldTickerRun>[0]) =>
      args.capturing && args.pendingFrames > 0 && args.extracting && args.drafting && args.draftQueueSize > 0;
    expect(shouldTickerRun({ ...idle, capturing: true })).toBe(true);
    expect(andOfFieldsPredicate({ ...idle, capturing: true })).toBe(false);
    expect(shouldTickerRun({ ...idle, draftQueueSize: 1 })).toBe(true);
    expect(andOfFieldsPredicate({ ...idle, draftQueueSize: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S1: draftDispatchForce - which of the four dispatch sites forces past
// isDispatchableDraftItem's userEdited guard.
// ---------------------------------------------------------------------------

describe("draftDispatchForce (S1)", () => {
  it("forces for retry, redraftAll and redraftRow; not for auto or the bulk draftMissing action", () => {
    expect(draftDispatchForce("retry")).toBe(true);
    expect(draftDispatchForce("redraftAll")).toBe(true); // AC29: explicitly armed overwrite
    expect(draftDispatchForce("redraftRow")).toBe(true); // CC19: single-row, explicit, same rationale as retry
    expect(draftDispatchForce("auto")).toBe(false);
    expect(draftDispatchForce("draftMissing")).toBe(false); // AC52 stays for an un-targeted click
  });

  it("S1: the exact hand-edit -> Redraft every reply -> failed -> Retry sequence is dispatchable end to end, unlike the bulk action on the same row", () => {
    // Mirrors the real sequence in useDiscussionReplies.ts. S7's markDrafting
    // no longer clears userEdited, so a row hand-edited and then sent
    // through a "Redraft every reply" that itself fails is left
    // `state: "failed"`, `userEdited: true` - the instructor's own text
    // still sitting in `reply`, untouched by markDrafting or markFailed
    // (neither one writes to `reply`).
    const rowAfterFailedRedraftOfEditedText = { userEdited: true };
    // The bulk action still respects the guard - not what closed S1.
    expect(isDispatchableDraftItem({ force: draftDispatchForce("draftMissing") }, rowAfterFailedRedraftOfEditedText)).toBe(false);
    // Retry, on the SAME row, reaches it - this is the fix.
    expect(isDispatchableDraftItem({ force: draftDispatchForce("retry") }, rowAfterFailedRedraftOfEditedText)).toBe(true);
  });

  it("SABOTAGE-relevant: reverting retry's force value to false reproduces S1's exact dead-button bug on this row shape", () => {
    const rowAfterFailedRedraftOfEditedText = { userEdited: true };
    // The sabotaged mapping: retry no longer forces (S1's bug, reintroduced).
    const sabotagedDraftDispatchForce = (source: "auto" | "retry" | "draftMissing" | "redraftAll") =>
      source === "redraftAll";
    expect(isDispatchableDraftItem({ force: sabotagedDraftDispatchForce("retry") }, rowAfterFailedRedraftOfEditedText)).toBe(
      false
    ); // the bug: Retry can no longer reach this row
    expect(isDispatchableDraftItem({ force: draftDispatchForce("retry") }, rowAfterFailedRedraftOfEditedText)).toBe(
      true
    ); // the actual, un-sabotaged behavior
  });
});

// ---------------------------------------------------------------------------
// docs/REGRESSION.md entry 383's Limits: accumulateDroppedFrames, the
// monotone dropped-frames fold across Start/Stop cycles. Both
// GradingRecordingPanel.tsx and useDiscussionReplies.ts thread the hook's
// live droppedFrames value through this function instead of reading it
// directly - see either call site's own comment for the full account.
//
// The implementation and its full frozen-literal oracle now live in
// src/lib/dropped-frame-accumulator.test.ts (see discussion-capture.ts's own
// header for why: module-deck-capture had grown an independent, identical
// copy of this same fold). Kept here: the one named regression scenario, and
// the sabotage-comparison test below, both re-exercised through THIS module's
// own re-export so a break in the re-export path itself still fails a test
// in this file rather than only in the shared lib's.
// ---------------------------------------------------------------------------

describe("accumulateDroppedFrames (re-exported from @/lib/dropped-frame-accumulator)", () => {
  it("THE regression test: two Start/Stop cycles, with drops in the first, report the TOTAL across both - not just the most recent cycle", () => {
    let total = 0;
    total = accumulateDroppedFrames(0, 6, total); // cycle 1 climbs to 6 live drops
    total = accumulateDroppedFrames(6, 0, total); // Stop, then Start resets the hook's live counter to 0
    total = accumulateDroppedFrames(0, 3, total); // cycle 2 climbs to 3 live drops
    // Reading the live value alone at this point would report 3 - cycle 1's
    // 6 drops silently vanished the moment cycle 2 started. The correct
    // session total is 9.
    expect(total).toBe(9);
  });

  it("SABOTAGE-relevant: reading the live value straight through (no accumulator) reproduces the exact under-report this function exists to prevent", () => {
    // The sabotaged shape: a consumer that reads the hook's live droppedFrames
    // directly instead of folding it through accumulateDroppedFrames - this
    // is precisely GradingRecordingPanel.tsx's and useDiscussionReplies.ts's
    // pre-fix behavior.
    const liveValueOnly = (nextLive: number) => nextLive;
    let sessionTotalViaAccumulator = 0;
    sessionTotalViaAccumulator = accumulateDroppedFrames(0, 6, sessionTotalViaAccumulator);
    sessionTotalViaAccumulator = accumulateDroppedFrames(6, 0, sessionTotalViaAccumulator);
    sessionTotalViaAccumulator = accumulateDroppedFrames(0, 3, sessionTotalViaAccumulator);
    const sabotagedLiveReadAfterSecondCycle = liveValueOnly(3);
    expect(sabotagedLiveReadAfterSecondCycle).toBe(3); // the bug: cycle 1's 6 drops are gone
    expect(sessionTotalViaAccumulator).toBe(9); // the fix: both cycles counted
    expect(sessionTotalViaAccumulator).not.toBe(sabotagedLiveReadAfterSecondCycle);
  });
});

// ---------------------------------------------------------------------------
// FrameSignature type sanity (exercises the exported type alias compiles and
// is usable by a consumer, matching how a sibling hook would use it).
// ---------------------------------------------------------------------------

describe("FrameSignature usage", () => {
  it("is a Uint8Array that computeFrameSignature returns and framesDifferEnough accepts", () => {
    const sig: FrameSignature = computeFrameSignature(solidPixels(2, 2, 50), 2, 2);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(framesDifferEnough(sig, sig)).toBe(false);
  });
});
