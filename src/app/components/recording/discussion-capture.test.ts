// Unit tests for the pure discussion-capture module. Every test here is
// sabotage-checked - see the report handed back to the dispatcher for the
// exact sabotages run. Fixtures are frozen literals: the dedupe oracle below
// hardcodes the AC11 perturbation table (input pairs + expected same/
// different) rather than deriving expectations by calling the implementation
// under test, per this repo's "refactors disarm tests" and "fixtures must
// match emitted shape" lessons.

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
  normalizeForMatch,
  authorsMatch,
  postSimilarityDistance,
  isSamePost,
  partitionDraftOutcome,
  isDispatchableDraftItem,
  draftDispatchForce,
  shouldLoopContinue,
  shouldTickerRun,
  mergeCapturedPosts,
  sortReplyRows,
  moveRow,
  serializeReplyTable,
  deserializeReplyTable,
  type ReplyRow,
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
// AC11: normalizeForMatch / authorsMatch / postSimilarityDistance
// ---------------------------------------------------------------------------

describe("normalizeForMatch", () => {
  it("lowercases, strips punctuation to spaces, and collapses whitespace", () => {
    expect(normalizeForMatch("  Hello,  World!  ")).toBe("hello world");
  });

  it("does not glue adjacent words together across stripped punctuation", () => {
    expect(normalizeForMatch("user,name")).toBe("user name");
  });

  it("F3: collapses a straight-apostrophe contraction to one token, not two", () => {
    expect(normalizeForMatch("don't")).toBe("dont");
  });

  it("F3: collapses a curly-apostrophe (U+2019) contraction to one token, not two - what a real LMS renders", () => {
    expect(normalizeForMatch("don’t")).toBe("dont");
  });
});

describe("authorsMatch (AC11)", () => {
  it("matches identical names", () => {
    expect(authorsMatch("Maria Alvarez", "Maria Alvarez")).toBe(true);
  });

  it("matches case/whitespace variants", () => {
    expect(authorsMatch("Maria Alvarez", "  maria   alvarez ")).toBe(true);
  });

  it("matches a name against the same name plus a middle initial", () => {
    expect(authorsMatch("Maria Alvarez", "Maria J Alvarez")).toBe(true);
  });

  it("matches a full name against a surname-only read", () => {
    expect(authorsMatch("Maria Alvarez", "Alvarez")).toBe(true);
  });

  it("does not match different surnames", () => {
    expect(authorsMatch("Maria Alvarez", "Maria Chen")).toBe(false);
  });

  it("does not match same surname with disagreeing given names when both have more than one token", () => {
    expect(authorsMatch("Maria Alvarez", "John Alvarez")).toBe(false);
  });
});

describe("postSimilarityDistance (AC11)", () => {
  it("is 0 for identical text", () => {
    expect(postSimilarityDistance("hello world", "hello world")).toBe(0);
  });

  it("is 0 when one text is a prefix of the other (the truncate-to-shorter trick)", () => {
    const full = "the quick brown fox jumps over the lazy dog and keeps running";
    const truncated = "the quick brown fox jumps over the lazy dog";
    expect(postSimilarityDistance(full, truncated)).toBe(0);
  });

  it("is a small fraction for a single one-token substitution in a long post", () => {
    const a = "one two three four five six seven eight nine ten eleven twelve";
    const b = "one two three four five six seven eight nine ten eleven TWELVETYPO";
    const d = postSimilarityDistance(a, b);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(SIMILARITY_THRESHOLD);
  });

  it("is large for two texts sharing no tokens", () => {
    const d = postSimilarityDistance("alpha beta gamma delta", "zulu yankee xray whiskey");
    expect(d).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC11 / AC11a: isSamePost - frozen literal oracle
//
// Every input pair and its expected same/different verdict below is a
// hardcoded literal, reasoned by hand against the algorithm's documented
// rules (normalizeForMatch's strip, authorsMatch's surname anchor,
// postSimilarityDistance's truncate-to-shorter token Levenshtein, and
// AC11a's postedAt short-circuit) - never by calling isSamePost first and
// copying its answer. This is deliberately NOT a re-derivation of the
// scheme; it is an independent check of it.
// ---------------------------------------------------------------------------

const BASE_TEXT =
  "I really appreciated how the reading connected utilitarian calculus to the trolley problem, but I " +
  "think it glosses over how hard it is to actually quantify happiness across different people in " +
  "practice, which feels like the weakest link in the argument.";

// First 20 words of BASE_TEXT, used for the truncation-style perturbations.
const TRUNCATED_TEXT =
  "I really appreciated how the reading connected utilitarian calculus to the trolley problem, but I think it glosses over";

interface DedupeCase {
  name: string;
  a: { author: string; text: string; postedAt?: string };
  b: { author: string; text: string; postedAt?: string };
  expectedSame: boolean;
}

const DEDUPE_ORACLE: DedupeCase[] = [
  {
    name: "identical read",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "comma dropped",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: {
      author: "Maria Alvarez",
      text:
        "I really appreciated how the reading connected utilitarian calculus to the trolley problem but I " +
        "think it glosses over how hard it is to actually quantify happiness across different people in " +
        "practice which feels like the weakest link in the argument.",
    },
    expectedSame: true,
  },
  {
    name: "period added mid-sentence",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: {
      author: "Maria Alvarez",
      text: BASE_TEXT.replace("trolley problem,", "trolley problem. And"),
    },
    expectedSame: true,
  },
  {
    name: "truncated at Show more",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: TRUNCATED_TEXT },
    expectedSame: true,
  },
  {
    name: "cut at frame edge, mid-word",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: TRUNCATED_TEXT.slice(0, -3) + "ov" }, // "...glosses ov" (over cut mid-word)
    expectedSame: true,
  },
  {
    name: "one word misread (clean/dean style, later in the text)",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace("practice,", "practce,") },
    expectedSame: true,
  },
  {
    name: "one word misread inside the first 120 characters",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace("appreciated", "apreciated") },
    expectedSame: true,
  },
  {
    name: "leading quote artifact",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: `"${BASE_TEXT}` },
    expectedSame: true,
  },
  {
    name: "model rewrapped whitespace",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace(/ /g, "  ").replace("trolley", "\n trolley") },
    expectedSame: true,
  },
  {
    name: "author read with middle initial",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria J Alvarez", text: BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "author surname only (avatar clipped)",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Alvarez", text: BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "model prefixed a short timestamp fragment onto the text",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: "Mar 12 " + BASE_TEXT },
    expectedSame: true,
  },
  {
    name: "Show more suffix kept",
    a: { author: "Maria Alvarez", text: TRUNCATED_TEXT },
    b: { author: "Maria Alvarez", text: TRUNCATED_TEXT + " Show more" },
    expectedSame: true,
  },
  {
    name: "first word dropped",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Maria Alvarez", text: BASE_TEXT.replace("I really", "really") },
    expectedSame: true,
  },
  // --- negative cases: genuinely different posts ---
  {
    name: "different author, same text",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: { author: "Diego Chen", text: BASE_TEXT },
    expectedSame: false,
  },
  {
    name: "same author, unrelated text",
    a: { author: "Maria Alvarez", text: BASE_TEXT },
    b: {
      author: "Maria Alvarez",
      text: "The scheduling conflict this week made it hard for our study group to meet before the deadline.",
    },
    expectedSame: false,
  },
  {
    name: "AC11a: both sides carry postedAt and they differ -- conclusive, short-circuits even with identical text",
    a: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    b: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 14 at 2:00 PM" },
    expectedSame: false,
  },
  {
    name: "AC11a: both sides carry the same postedAt and authors match -- short-circuits to same despite unrelated text",
    a: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    b: {
      author: "Maria Alvarez",
      text: "Completely different unrelated sentence about something else entirely.",
      postedAt: "mar 12 at 9:04 pm",
    },
    expectedSame: true,
  },
  {
    name: "AC11a: same postedAt but authors do not match -- still different",
    a: { author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    b: { author: "Diego Chen", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" },
    expectedSame: false,
  },
  {
    name: "below MIN_TOKENS_FOR_SIMILARITY: short posts require exact equality, not distance",
    a: { author: "Maria Alvarez", text: "I agree completely" },
    b: { author: "Maria Alvarez", text: "I agree totally" },
    expectedSame: false,
  },
  {
    name: "below MIN_TOKENS_FOR_SIMILARITY: identical short post (case/whitespace only) still matches",
    a: { author: "Maria Alvarez", text: "I agree completely" },
    b: { author: "Maria Alvarez", text: "  i AGREE   completely " },
    expectedSame: true,
  },
];

describe("isSamePost (AC11 / AC11a) - frozen literal oracle", () => {
  it.each(DEDUPE_ORACLE.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(isSamePost(c.a, c.b)).toBe(c.expectedSame);
  });

  it("SABOTAGE CHECK (b): documents that a hardcoded return-true implementation would fail the negative cases above", () => {
    // The negative-case rows in DEDUPE_ORACLE (different author, unrelated
    // text, differing postedAt, mismatched postedAt+author, distinct short
    // posts) are exactly the rows an `isSamePost` mutated to always return
    // `true` would fail. Verified by sabotage - see report.
    const negativeCases = DEDUPE_ORACLE.filter((c) => !c.expectedSame);
    expect(negativeCases.length).toBeGreaterThan(0);
    for (const c of negativeCases) {
      expect(isSamePost(c.a, c.b)).toBe(false);
    }
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
  it("forces for retry and redraftAll; not for auto or the bulk draftMissing action", () => {
    expect(draftDispatchForce("retry")).toBe(true);
    expect(draftDispatchForce("redraftAll")).toBe(true); // AC29: explicitly armed overwrite
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
// AC12 / AC13 / AC54: mergeCapturedPosts
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ReplyRow>): ReplyRow {
  return {
    id: "disc-1-0",
    author: "Maria Alvarez",
    post: BASE_TEXT,
    reply: "",
    userEdited: false,
    state: "pending",
    error: null,
    firstSeenAt: 1000,
    order: 0,
    ...overrides,
  };
}

describe("mergeCapturedPosts (AC12 / AC13)", () => {
  it("adds a genuinely new post as a new pending row and reports its id in addedIds", () => {
    const { rows, addedIds } = mergeCapturedPosts([], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("pending");
    expect(rows[0].reply).toBe("");
    expect(rows[0].userEdited).toBe(false);
    expect(rows[0].firstSeenAt).toBe(5000);
    expect(addedIds).toEqual([rows[0].id]);
  });

  it("does not mutate the input rows array or its row objects", () => {
    const original = [makeRow({ id: "row-a" })];
    const frozenCopy = JSON.parse(JSON.stringify(original));
    mergeCapturedPosts(original, [{ author: "Someone Else", text: "totally unrelated content here" }], 9999);
    expect(original).toEqual(frozenCopy);
  });

  it("extends an existing row's post text when the incoming read is longer, without resetting reply/state/userEdited/order/firstSeenAt", () => {
    const existing = makeRow({ id: "row-a", post: TRUNCATED_TEXT, reply: "My drafted reply", state: "ready", userEdited: true, order: 3, firstSeenAt: 111 });
    const { rows, addedIds } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(rows).toHaveLength(1);
    expect(rows[0].post).toBe(BASE_TEXT);
    expect(rows[0].reply).toBe("My drafted reply");
    expect(rows[0].state).toBe("ready");
    expect(rows[0].userEdited).toBe(true);
    expect(rows[0].order).toBe(3);
    expect(rows[0].firstSeenAt).toBe(111);
    expect(addedIds).toEqual([]);
  });

  it("does NOT shorten an existing row's post when the incoming read is shorter than what is stored", () => {
    const existing = makeRow({ id: "row-a", post: BASE_TEXT });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: TRUNCATED_TEXT }], 5000);
    expect(rows[0].post).toBe(BASE_TEXT);
  });

  it("fills postedAt on an existing row that lacked one", () => {
    const existing = makeRow({ id: "row-a", post: TRUNCATED_TEXT });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" }], 5000);
    expect(rows[0].postedAt).toBe("Mar 12 at 9:04 PM");
  });

  it("AC54: when two incoming entries in the same batch match and have equal-length text, the first wins", () => {
    const { rows, addedIds } = mergeCapturedPosts(
      [],
      [
        { author: "Maria Alvarez", text: BASE_TEXT },
        { author: "Maria Alvarez", text: BASE_TEXT }, // identical length, arrives second
      ],
      5000
    );
    expect(rows).toHaveLength(1);
    expect(addedIds).toHaveLength(1);
  });

  it("matches incoming posts against each other within one batch, collapsing duplicates to one row", () => {
    const { rows } = mergeCapturedPosts(
      [],
      [
        { author: "Maria Alvarez", text: TRUNCATED_TEXT },
        { author: "Maria Alvarez", text: BASE_TEXT }, // same post, fuller read, arrives second
      ],
      5000
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].post).toBe(BASE_TEXT);
  });

  it("preserves the ordering of existing rows and appends new ones", () => {
    const rowA = makeRow({ id: "a", author: "Alice One", post: "alpha content here about topic one for testing", order: 0 });
    const rowB = makeRow({ id: "b", author: "Bob Two", post: "beta content here about topic two for testing", order: 1 });
    const { rows } = mergeCapturedPosts([rowA, rowB], [{ author: "Carol Three", text: "gamma content here about topic three testing" }], 5000);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", rows[2].id]);
  });

  it("AC23b: refuses to add a new row once the table is at MAX_TABLE_ROWS, but still allows an update merge", () => {
    const rows: ReplyRow[] = Array.from({ length: MAX_TABLE_ROWS }, (_, i) =>
      makeRow({ id: `row-${i}`, author: `Author ${i}`, post: `unique content number ${i} about topic ${i}`, order: i })
    );
    const { rows: afterAdd, addedIds, capped } = mergeCapturedPosts(rows, [{ author: "New Author", text: "a brand new post nobody has seen yet in this table" }], 5000);
    expect(afterAdd).toHaveLength(MAX_TABLE_ROWS);
    expect(addedIds).toEqual([]);
    // BL5: a refused new-row post at the ceiling must be reported, since
    // comparing afterAdd.length (already capped at MAX_TABLE_ROWS) against
    // the ceiling after the fact can never detect this.
    expect(capped).toBe(true);

    // An update to an existing row (matches row-0) is still allowed through,
    // and is NOT reported as capped - it never tried to grow the table.
    const { rows: afterUpdate, capped: cappedOnUpdate } = mergeCapturedPosts(rows, [{ author: "Author 0", text: rows[0].post + " with quite a bit more detail added on now" }], 5000);
    expect(afterUpdate).toHaveLength(MAX_TABLE_ROWS);
    expect(afterUpdate[0].post.length).toBeGreaterThan(rows[0].post.length);
    expect(cappedOnUpdate).toBe(false);
  });

  it("BL5: is NOT capped when the table has room", () => {
    const { capped } = mergeCapturedPosts([], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(capped).toBe(false);
  });

  it("SABOTAGE CHECK (f): documents that comparing output length against MAX_TABLE_ROWS after the fact (the original, dead detector) would find capped always false here, unlike the in-band flag above", () => {
    const rows: ReplyRow[] = Array.from({ length: MAX_TABLE_ROWS }, (_, i) =>
      makeRow({ id: `row-${i}`, author: `Author ${i}`, post: `unique content number ${i} about topic ${i}`, order: i })
    );
    const { rows: afterAdd, capped } = mergeCapturedPosts(rows, [{ author: "New Author", text: "a brand new post nobody has seen yet in this table" }], 5000);
    // The dead detector's own precondition, reproduced: output length is
    // never over the ceiling, so `output.length - MAX_TABLE_ROWS > 0` is
    // always false - the real flag disagrees with it.
    expect(afterAdd.length - MAX_TABLE_ROWS).toBeLessThanOrEqual(0);
    expect(capped).toBe(true);
  });

  it("N2: two separate calls sharing the same `now` never collide on minted id - the counter is module-scoped, not local to one call", () => {
    const { rows: firstRows } = mergeCapturedPosts([], [{ author: "Alice One", text: "unique content for the first call about a topic" }], 5000);
    const { rows: secondRows } = mergeCapturedPosts([], [{ author: "Bob Two", text: "unique content for the second call about a topic" }], 5000);
    expect(firstRows[0].id).not.toBe(secondRows[0].id);
  });

  it("SABOTAGE CHECK (c): documents that resetting `reply` on an update-merge would fail the extend-without-reset test above", () => {
    const existing = makeRow({ id: "row-a", post: TRUNCATED_TEXT, reply: "Hand-written reply", userEdited: true });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(rows[0].reply).toBe("Hand-written reply");
  });
});

// ---------------------------------------------------------------------------
// AC14: sortReplyRows
// ---------------------------------------------------------------------------

describe("sortReplyRows (AC14)", () => {
  const rowA = makeRow({ id: "a", author: "alvarez", firstSeenAt: 300, order: 2 });
  const rowB = makeRow({ id: "b", author: "Chen", firstSeenAt: 100, order: 0 });
  const rowC = makeRow({ id: "c", author: "Baxter", firstSeenAt: 200, order: 1 });
  const rows = [rowA, rowB, rowC];

  it("captured-asc orders by firstSeenAt ascending", () => {
    expect(sortReplyRows(rows, "captured-asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("captured-desc orders by firstSeenAt descending", () => {
    expect(sortReplyRows(rows, "captured-desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("name-asc uses base-sensitivity localeCompare so case does not straddle capitals", () => {
    expect(sortReplyRows(rows, "name-asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("name-desc reverses name-asc", () => {
    expect(sortReplyRows(rows, "name-desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("custom sorts by order ascending", () => {
    expect(sortReplyRows(rows, "custom").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const copy = rows.slice();
    sortReplyRows(rows, "captured-asc");
    expect(rows).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// AC53: moveRow
// ---------------------------------------------------------------------------

describe("moveRow (AC53)", () => {
  it("swaps two adjacent rows and switches sort to custom", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), makeRow({ id: "c", order: 2 })];
    const result = moveRow(rows, "custom", "b", "up");
    expect(result.sort).toBe("custom");
    expect(result.atBoundary).toBe(false);
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op with atBoundary true when moving the first row up", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 })];
    const result = moveRow(rows, "custom", "a", "up");
    expect(result.atBoundary).toBe(true);
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.sort).toBe("custom");
  });

  it("is a no-op with atBoundary true when moving the last row down", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 })];
    const result = moveRow(rows, "custom", "b", "down");
    expect(result.atBoundary).toBe(true);
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("rewrites order to displayed index before swapping when leaving a non-custom sort", () => {
    // Displayed (name-asc) order is a, b, c but the stored `order` values are
    // stale capture-time values that do not reflect that. AC53 requires the
    // swap to operate on what is ON SCREEN.
    const displayed = [makeRow({ id: "a", author: "Alvarez", order: 50 }), makeRow({ id: "b", author: "Baxter", order: 10 }), makeRow({ id: "c", author: "Chen", order: 90 })];
    const result = moveRow(displayed, "name-asc", "b", "up");
    expect(result.sort).toBe("custom");
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    // custom order re-sort of the result reproduces exactly this sequence.
    expect(sortReplyRows(result.rows, "custom").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("returns the rows unchanged (by identity of the id sequence) when the row id is not found", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 })];
    const result = moveRow(rows, "custom", "missing", "up");
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.atBoundary).toBe(false);
  });

  it("BL4/AC40: preserves object identity for a row NOT involved in the swap - this is what lets Set D's React.memo skip re-rendering it", () => {
    const untouched = makeRow({ id: "c", order: 2 });
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), untouched];
    const result = moveRow(rows, "custom", "b", "up");
    const resultUntouched = result.rows.find((r) => r.id === "c");
    expect(resultUntouched).toBe(untouched);
  });

  it("SABOTAGE CHECK (g): documents that unconditionally cloning every row (the previously-shipped, untested duplicate's behaviour) would fail the identity check above", () => {
    // This reproduces the exact divergence BL4 found: useReplyRows.ts's own
    // inline moveRow did `displayed.map((r, i) => ({ ...r, order: i }))` -
    // a new object for every row, always - instead of this tested
    // function's `row.order === i ? row : { ...row, order: i }`. Verified
    // by sabotage (temporarily reverting this file's moveRow to the
    // clone-everything shape) - see report.
    const untouched = makeRow({ id: "c", order: 2 });
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), untouched];
    const result = moveRow(rows, "custom", "b", "up");
    expect(result.rows.find((r) => r.id === "c")).toBe(untouched);
  });
});

// ---------------------------------------------------------------------------
// AC22: serializeReplyTable / deserializeReplyTable
// ---------------------------------------------------------------------------

describe("serializeReplyTable / deserializeReplyTable (AC22)", () => {
  it("round-trips a well-formed table", () => {
    const rows = [makeRow({ id: "a", postedAt: "Mar 12 at 9:04 PM" }), makeRow({ id: "b", state: "ready", reply: "Great point!" })];
    const raw = serializeReplyTable(rows);
    const restored = deserializeReplyTable(raw);
    expect(restored).toEqual(rows);
  });

  it("normalizes a drafting row to pending on write, since nothing is in flight after a reload", () => {
    const rows = [makeRow({ id: "a", state: "drafting" })];
    const raw = serializeReplyTable(rows);
    const restored = deserializeReplyTable(raw);
    expect(restored[0].state).toBe("pending");
  });

  it("preserves the error reason for a failed row", () => {
    const rows = [makeRow({ id: "a", state: "failed", error: "Reading the screen failed: 429" })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].state).toBe("failed");
    expect(restored[0].error).toBe("Reading the screen failed: 429");
  });

  it("preserves userEdited across the round trip", () => {
    const rows = [makeRow({ id: "a", userEdited: true })];
    const restored = deserializeReplyTable(serializeReplyTable(rows));
    expect(restored[0].userEdited).toBe(true);
  });

  it("BL4: nulls a stale `error` on a non-failed row, enforcing the ReplyRow invariant (error set only when state === 'failed') even against a row that should never occur but is defended against anyway", () => {
    // Checks serializeReplyTable's OWN raw output, not the round trip
    // through deserializeReplyTable - deserializeReplyTable enforces this
    // same invariant independently on read, which would mask a regression
    // in serializeReplyTable's write-side enforcement if this test only
    // checked the round trip.
    const rows = [makeRow({ id: "a", state: "ready", error: "stale error from a previous failure" })];
    const raw = JSON.parse(serializeReplyTable(rows)) as { rows: Array<{ error: string | null }> };
    expect(raw.rows[0].error).toBeNull();
  });

  it.each([null, "", "not json at all {{{", "[]", '{"v":1}', '{"v":1,"rows":"not-an-array"}', '{"v":99,"rows":[]}'])(
    "never throws on garbage input %j, and returns an empty array",
    (garbage) => {
      expect(() => deserializeReplyTable(garbage)).not.toThrow();
      expect(deserializeReplyTable(garbage)).toEqual([]);
    }
  );

  it("drops an individual malformed row (no usable id) but keeps the rest", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "keep-me", author: "Maria", post: "hello" }, { author: "No Id Here", post: "dropped" }, null, "not an object"],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored.map((r) => r.id)).toEqual(["keep-me"]);
  });

  it("defaults missing order to the array index, missing firstSeenAt to 0, missing userEdited to false, and an unknown state to pending", () => {
    const raw = JSON.stringify({
      v: DISCUSSION_TABLE_VERSION,
      rows: [{ id: "a", author: "Maria", post: "hello" }, { id: "b", author: "Diego", post: "world", state: "not-a-real-state" }],
    });
    const restored = deserializeReplyTable(raw);
    expect(restored[0]).toMatchObject({ order: 0, firstSeenAt: 0, userEdited: false, state: "pending" });
    expect(restored[1]).toMatchObject({ order: 1, state: "pending" });
  });

  it("SABOTAGE CHECK (d): documents that a throwing deserializeReplyTable would fail the garbage-input tests above", () => {
    // Every garbage fixture in the it.each block above is exactly what a
    // deserializeReplyTable that does `JSON.parse(raw)` with no try/catch
    // (or that skips the typeof/Array.isArray guards) would throw on.
    // Verified by sabotage - see report.
    expect(deserializeReplyTable("{ this is not valid json")).toEqual([]);
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
