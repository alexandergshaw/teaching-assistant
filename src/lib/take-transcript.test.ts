import { describe, it, expect } from "vitest";
import { planTranscriptChunks, planSegmentSubchunks, sliceMonoSamples, joinTranscriptChunks, TRANSCRIBE_CHUNK_SECONDS } from "./take-transcript";
import { encodeWav, base64FromArrayBuffer } from "@/lib/live-class/wav";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

describe("planTranscriptChunks", () => {
  it("covers [0, durationSec) contiguously and non-overlapping for an exact multiple", () => {
    const chunks = planTranscriptChunks(180, 60);
    expect(chunks).toEqual([
      { index: 0, startSec: 0, endSec: 60 },
      { index: 1, startSec: 60, endSec: 120 },
      { index: 2, startSec: 120, endSec: 180 },
    ]);
    // Contiguous: every chunk's end is the next chunk's start.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startSec).toBe(chunks[i - 1].endSec);
    }
  });

  it("produces a correct short final chunk for a non-multiple duration", () => {
    const chunks = planTranscriptChunks(150, 60);
    expect(chunks).toEqual([
      { index: 0, startSec: 0, endSec: 60 },
      { index: 1, startSec: 60, endSec: 120 },
      { index: 2, startSec: 120, endSec: 150 },
    ]);
    expect(chunks[2].endSec - chunks[2].startSec).toBe(30);
  });

  it("returns [] for zero, negative, NaN and Infinity durations", () => {
    expect(planTranscriptChunks(0)).toEqual([]);
    expect(planTranscriptChunks(-5)).toEqual([]);
    expect(planTranscriptChunks(NaN)).toEqual([]);
    expect(planTranscriptChunks(Infinity)).toEqual([]);
  });

  it("returns [] for a non-positive or non-finite chunkSeconds, rather than looping forever", () => {
    expect(planTranscriptChunks(120, 0)).toEqual([]);
    expect(planTranscriptChunks(120, -1)).toEqual([]);
    expect(planTranscriptChunks(120, NaN)).toEqual([]);
  });

  it("defaults chunkSeconds to TRANSCRIBE_CHUNK_SECONDS", () => {
    expect(TRANSCRIBE_CHUNK_SECONDS).toBe(60);
    const chunks = planTranscriptChunks(90);
    expect(chunks).toEqual([
      { index: 0, startSec: 0, endSec: 60 },
      { index: 1, startSec: 60, endSec: 90 },
    ]);
  });
});

describe("sliceMonoSamples", () => {
  const sampleRate = 16000;
  // 10 seconds of samples, value = index, so slices can be checked by content.
  const mono = new Float32Array(10 * sampleRate).map((_, i) => i);

  it("slices the exact sample range for a plan within bounds", () => {
    const plan = { index: 0, startSec: 2, endSec: 4 };
    const out = sliceMonoSamples(mono, sampleRate, plan);
    expect(out.length).toBe(2 * sampleRate);
    expect(out[0]).toBe(2 * sampleRate);
    expect(out[out.length - 1]).toBe(4 * sampleRate - 1);
  });

  it("clamps a start before 0", () => {
    const plan = { index: 0, startSec: -5, endSec: 1 };
    const out = sliceMonoSamples(mono, sampleRate, plan);
    expect(out.length).toBe(1 * sampleRate);
    expect(out[0]).toBe(0);
  });

  it("clamps an end past the buffer's length", () => {
    const plan = { index: 0, startSec: 9, endSec: 999 };
    const out = sliceMonoSamples(mono, sampleRate, plan);
    expect(out.length).toBe(mono.length - 9 * sampleRate);
  });

  it("returns an empty array for an empty range (end <= start)", () => {
    expect(sliceMonoSamples(mono, sampleRate, { index: 0, startSec: 5, endSec: 5 }).length).toBe(0);
    expect(sliceMonoSamples(mono, sampleRate, { index: 0, startSec: 8, endSec: 3 }).length).toBe(0);
  });
});

describe("joinTranscriptChunks", () => {
  it("trims each part and joins with a single space", () => {
    expect(joinTranscriptChunks(["  hello  ", "world  "])).toBe("hello world");
  });

  it("drops empty and whitespace-only parts", () => {
    expect(joinTranscriptChunks(["hello", "", "   ", "world"])).toBe("hello world");
  });

  it("returns an empty string when every part is empty", () => {
    expect(joinTranscriptChunks(["", "  ", ""])).toBe("");
  });

  it("returns an empty string for an empty input array", () => {
    expect(joinTranscriptChunks([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// planSegmentSubchunks: oversize-segment sub-chunking (W1a, ARC-T1)
// ---------------------------------------------------------------------------

const RATE = 16000;

// The REAL wire unit checkWireBudget compares: base64 string length of the
// encoded WAV of `n` mono samples. Never a hand-typed byte count.
function wireLen(n: number): number {
  return base64FromArrayBuffer(encodeWav(new Float32Array(n), RATE)).length;
}

// Derived independently from the PUBLIC budget (no internal constant from the
// leaf is imported) and validated against the real encoders below.
const MAX = Math.floor((3 * Math.floor(UPLOAD_WIRE_BUDGET_BYTES / 4) - 44) / 2);

function expectCoverage(n: number): ReturnType<typeof planSegmentSubchunks> {
  const chunks = planSegmentSubchunks(n, RATE);
  expect(chunks[0].startSample).toBe(0);
  expect(chunks[chunks.length - 1].endSample).toBe(n);
  let sum = 0;
  for (let i = 0; i < chunks.length; i++) {
    expect(chunks[i].endSample).toBeGreaterThan(chunks[i].startSample);
    if (i > 0) expect(chunks[i].startSample).toBe(chunks[i - 1].endSample);
    sum += chunks[i].endSample - chunks[i].startSample;
  }
  expect(sum).toBe(n);
  return chunks;
}

function expectEveryChunkWithinBudget(chunks: ReturnType<typeof planSegmentSubchunks>): void {
  for (const c of chunks) {
    expect(wireLen(c.endSample - c.startSample)).toBeLessThanOrEqual(UPLOAD_WIRE_BUDGET_BYTES);
  }
}

describe("planSegmentSubchunks - MAX self-derivation", () => {
  it("the test-derived MAX is the real encoder boundary", () => {
    expect(wireLen(MAX)).toBeLessThanOrEqual(UPLOAD_WIRE_BUDGET_BYTES);
    expect(wireLen(MAX + 1)).toBeGreaterThan(UPLOAD_WIRE_BUDGET_BYTES);
  });
});

describe("planSegmentSubchunks - Family A (seconds)", () => {
  const singles: Array<[string, number]> = [
    ["1s", 1 * RATE],
    ["60s", 60 * RATE],
    ["86s", 86 * RATE],
  ];
  for (const [label, n] of singles) {
    it(`${label} stays one chunk, covers, and fits the wire budget`, () => {
      const chunks = expectCoverage(n);
      expect(chunks).toEqual([{ startSample: 0, endSample: n }]);
      expectEveryChunkWithinBudget(chunks);
    });
  }

  const splits: Array<[string, number]> = [
    ["87s", 87 * RATE],
    ["120s", 120 * RATE],
  ];
  for (const [label, n] of splits) {
    it(`${label} splits into at least ceil(n/MAX) chunks, covers, and each fits`, () => {
      const chunks = expectCoverage(n);
      expect(chunks.length).toBeGreaterThanOrEqual(Math.ceil(n / MAX));
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expectEveryChunkWithinBudget(chunks);
    });
  }

  it("600s covers and splits into at least 7 chunks (chunks not encoded: memory)", () => {
    const n = 600 * RATE;
    const chunks = expectCoverage(n);
    expect(chunks.length).toBeGreaterThanOrEqual(7);
  });

  it("0s returns an empty plan", () => {
    expect(planSegmentSubchunks(0 * RATE, RATE)).toEqual([]);
  });
});

describe("planSegmentSubchunks - Family B (exact byte boundary)", () => {
  it("exact-MAX is exactly one chunk and fits", () => {
    const chunks = expectCoverage(1_376_234);
    expect(chunks).toHaveLength(1);
    expectEveryChunkWithinBudget(chunks);
  });

  it("exact-MAX+1 splits into at least two chunks, each fitting", () => {
    const chunks = expectCoverage(1_376_235);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expectEveryChunkWithinBudget(chunks);
  });
});

describe("planSegmentSubchunks - Family C (guard inputs)", () => {
  for (const input of [0, -1, NaN, Infinity]) {
    it(`returns [] for ${String(input)}`, () => {
      expect(planSegmentSubchunks(input, RATE)).toEqual([]);
    });
  }
});
