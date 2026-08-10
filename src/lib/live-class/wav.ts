// Browser-safe WAV encoding for the live-class fallback transcription path
// (see docs on the module for the two transcription paths: the Web Speech
// API, and this one - recording short audio segments and sending them to
// Gemini). Gemini accepts audio/wav (and mp3/aiff/aac/ogg/flac) but not the
// audio/webm that Chrome's MediaRecorder produces, so a segment is decoded to
// raw PCM and re-encoded as WAV here before upload.
//
// No React, no Node built-ins, no "use server": this file is imported from
// both a client component (to record/encode in the browser) and a server
// action (which never touches the DOM, but shares this pure math), so it may
// only use plain JS/TypedArray value types - never `AudioContext`,
// `document`, or `window` at module scope.

/**
 * The sample rate every fallback-recorded segment is resampled to before
 * encoding, in Hz. Gemini's audio pricing (32 tokens/second) does not depend
 * on sample rate, so this is chosen purely to keep file size small while
 * comfortably covering speech's useful bandwidth.
 */
export const LIVE_SAMPLE_RATE = 16000;

/**
 * Mix N channels of Web Audio PCM down to mono by averaging, then resample to
 * targetRate by linear interpolation.
 *
 * Never upsamples: when targetRate is at or above inputRate, the mixed mono
 * signal is returned unchanged, at its original length, rather than
 * stretched. Empty input (no channels, or every channel of length 0) returns
 * an empty Float32Array. This function never throws - a malformed rate just
 * skips the resample step and returns the mixed mono signal as-is.
 */
export function downsampleToMono(input: Float32Array[], inputRate: number, targetRate: number): Float32Array {
  if (!Array.isArray(input) || input.length === 0) return new Float32Array(0);

  const channelCount = input.length;
  let length = 0;
  for (const channel of input) {
    if (channel && channel.length > length) length = channel.length;
  }
  if (length === 0) return new Float32Array(0);

  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < channelCount; c++) {
      const channel = input[c];
      sum += channel && i < channel.length ? channel[i] : 0;
    }
    mono[i] = sum / channelCount;
  }

  if (!Number.isFinite(inputRate) || !Number.isFinite(targetRate) || inputRate <= 0 || targetRate <= 0) {
    return mono;
  }
  // Never upsample: targetRate >= inputRate returns the mixed mono signal at
  // its original length.
  if (targetRate >= inputRate) return mono;

  const ratio = inputRate / targetRate;
  const outputLength = Math.max(1, Math.floor(length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const srcIndexLow = Math.floor(srcPos);
    const srcIndexHigh = Math.min(srcIndexLow + 1, length - 1);
    const frac = srcPos - srcIndexLow;
    output[i] = mono[srcIndexLow] * (1 - frac) + mono[srcIndexHigh] * frac;
  }
  return output;
}

function writeAsciiString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

/**
 * Encode mono PCM samples as a standard 16-bit PCM mono WAV file: a 44-byte
 * RIFF header followed by little-endian int16 samples. Each sample is
 * clamped to [-1, 1] before scaling so an out-of-range float (from clipping
 * or gain applied upstream) is never allowed to wrap around.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAsciiString(view, 8, "WAVE");
  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // subchunk size for PCM
  view.setUint16(20, 1, true); // audioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const scaled = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
    view.setInt16(offset, scaled, true);
    offset += 2;
  }

  return buffer;
}

/**
 * Estimate a WAV file's byte size for a given duration: the 44-byte header
 * plus 16-bit mono PCM data at sampleRate (default LIVE_SAMPLE_RATE). Used to
 * keep a recorded segment safely under the 4.5MB request body Vercel
 * Functions enforce at the PLATFORM layer (see src/lib/chat/attachments.ts's
 * header comment for the fullest statement of this constraint -
 * next.config.ts's serverActions.bodySizeLimit cannot raise it) before it is
 * ever recorded.
 */
export function estimateWavBytes(seconds: number, sampleRate: number = LIVE_SAMPLE_RATE): number {
  return 44 + Math.round(seconds * sampleRate * 2);
}

/**
 * Convert an ArrayBuffer to a base64 string, converting in 0x8000-byte chunks
 * (matching the chunked btoa idiom in
 * src/lib/workflows/registry/steps.visualizer.ts) so a large recorded segment
 * never blows the call stack passing through
 * `String.fromCharCode(...bytes)`.
 */
export function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
