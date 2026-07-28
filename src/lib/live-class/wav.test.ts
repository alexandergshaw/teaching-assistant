import { describe, it, expect } from "vitest";
import {
  downsampleToMono,
  encodeWav,
  estimateWavBytes,
  base64FromArrayBuffer,
  LIVE_SAMPLE_RATE,
} from "./wav";

// A known 1kHz sine wave, sampled at the given rate for the given duration.
function sineWave(frequencyHz: number, sampleRate: number, seconds: number): Float32Array {
  const length = Math.round(sampleRate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
  }
  return out;
}

describe("downsampleToMono", () => {
  it("downsamples a known 1kHz sine to the right length", () => {
    const inputRate = 48000;
    const targetRate = 16000;
    const seconds = 0.5;
    const sine = sineWave(1000, inputRate, seconds);
    const result = downsampleToMono([sine], inputRate, targetRate);
    const expectedLength = Math.floor(sine.length / (inputRate / targetRate));
    expect(result.length).toBe(expectedLength);
    // Downsampled signal should still be bounded like a sine wave.
    for (const sample of result) {
      expect(sample).toBeGreaterThanOrEqual(-1.01);
      expect(sample).toBeLessThanOrEqual(1.01);
    }
  });

  it("mixes stereo channels to mono by averaging", () => {
    const left = new Float32Array([1, 1, 1, 1]);
    const right = new Float32Array([-1, -1, -1, -1]);
    // Same rate in/out so no resampling occurs - isolates the mixing math.
    const result = downsampleToMono([left, right], 16000, 16000);
    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });

  it("mixes three channels of distinct constant values", () => {
    const a = new Float32Array([0.3, 0.3]);
    const b = new Float32Array([0.6, 0.6]);
    const c = new Float32Array([0.9, 0.9]);
    const result = downsampleToMono([a, b, c], 8000, 8000);
    expect(result[0]).toBeCloseTo(0.6, 5);
    expect(result[1]).toBeCloseTo(0.6, 5);
  });

  it("refuses to upsample: targetRate >= inputRate returns the mixed mono at the original length", () => {
    const mono = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const sameRate = downsampleToMono([mono], 16000, 16000);
    expect(sameRate.length).toBe(mono.length);
    expect(Array.from(sameRate)).toEqual(Array.from(mono));

    const higherTarget = downsampleToMono([mono], 16000, 48000);
    expect(higherTarget.length).toBe(mono.length);
    expect(Array.from(higherTarget)).toEqual(Array.from(mono));
  });

  it("is safe on empty input and never throws", () => {
    expect(downsampleToMono([], 48000, 16000)).toEqual(new Float32Array(0));
    expect(downsampleToMono([new Float32Array(0)], 48000, 16000)).toEqual(new Float32Array(0));
    expect(() => downsampleToMono([], 0, 0)).not.toThrow();
    expect(() => downsampleToMono([new Float32Array([1, 2])], 0, 16000)).not.toThrow();
  });
});

describe("encodeWav", () => {
  it("writes an exactly-correct 44-byte header", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const sampleRate = 16000;
    const buffer = encodeWav(samples, sampleRate);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const ascii = (offset: number, len: number) => String.fromCharCode(...bytes.subarray(offset, offset + len));

    const dataLength = samples.length * 2;

    expect(ascii(0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + dataLength);
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16); // fmt subchunk size
    expect(view.getUint16(20, true)).toBe(1); // audioFormat = PCM
    expect(view.getUint16(22, true)).toBe(1); // numChannels = mono
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint32(28, true)).toBe(sampleRate * 2); // byteRate
    expect(view.getUint16(32, true)).toBe(2); // blockAlign
    expect(view.getUint16(34, true)).toBe(16); // bitsPerSample
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(dataLength);
    expect(buffer.byteLength).toBe(44 + dataLength);
  });

  it("writes correctly clamped, little-endian int16 samples", () => {
    const samples = new Float32Array([0, 1, -1, 2, -2, 0.5, -0.5]);
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);

    expect(view.getInt16(44 + 0 * 2, true)).toBe(0);
    expect(view.getInt16(44 + 1 * 2, true)).toBe(0x7fff); // +1 -> max positive int16
    expect(view.getInt16(44 + 2 * 2, true)).toBe(-0x8000); // -1 -> max negative int16
    expect(view.getInt16(44 + 3 * 2, true)).toBe(0x7fff); // clamped from 2
    expect(view.getInt16(44 + 4 * 2, true)).toBe(-0x8000); // clamped from -2
    expect(view.getInt16(44 + 5 * 2, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(view.getInt16(44 + 6 * 2, true)).toBe(Math.round(-0.5 * 0x8000));
  });

  it("handles an empty sample array", () => {
    const buffer = encodeWav(new Float32Array(0), 16000);
    expect(buffer.byteLength).toBe(44);
    const view = new DataView(buffer);
    expect(view.getUint32(40, true)).toBe(0);
  });
});

describe("estimateWavBytes", () => {
  it("estimates ~480KB for a 15-second segment at 16kHz", () => {
    const bytes = estimateWavBytes(15, LIVE_SAMPLE_RATE);
    expect(bytes).toBe(44 + 15 * 16000 * 2);
    // ~480KB using the decimal-KB convention (480,000 data bytes + header).
    expect(bytes).toBeGreaterThan(470_000);
    expect(bytes).toBeLessThan(490_000);
  });

  it("defaults sampleRate to LIVE_SAMPLE_RATE", () => {
    expect(estimateWavBytes(10)).toBe(estimateWavBytes(10, LIVE_SAMPLE_RATE));
  });

  it("matches the documented formula: 44 + seconds * sampleRate * 2", () => {
    expect(estimateWavBytes(1, 8000)).toBe(44 + 1 * 8000 * 2);
    expect(estimateWavBytes(0, 16000)).toBe(44);
  });
});

describe("base64FromArrayBuffer", () => {
  it("round-trips a small buffer through atob", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 128, 64]);
    const base64 = base64FromArrayBuffer(bytes.buffer);
    const decoded = atob(base64);
    const roundTripped = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) roundTripped[i] = decoded.charCodeAt(i);
    expect(Array.from(roundTripped)).toEqual(Array.from(bytes));
  });

  it("round-trips a large (>100KB) buffer through atob, exercising the chunked path", () => {
    const size = 150_000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;

    const base64 = base64FromArrayBuffer(bytes.buffer);
    const decoded = atob(base64);
    expect(decoded.length).toBe(size);

    const roundTripped = new Uint8Array(size);
    for (let i = 0; i < size; i++) roundTripped[i] = decoded.charCodeAt(i);
    expect(Array.from(roundTripped)).toEqual(Array.from(bytes));
  });
});
