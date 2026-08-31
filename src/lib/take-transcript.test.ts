import { describe, it, expect } from "vitest";
import { planTranscriptChunks, sliceMonoSamples, joinTranscriptChunks, TRANSCRIBE_CHUNK_SECONDS } from "./take-transcript";

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
