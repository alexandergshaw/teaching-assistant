// Re-encode a video at a different playback speed: play the source through a
// canvas at the chosen rate, record the canvas stream, and mix the source's
// own (pitch-corrected) audio into the recording via a
// MediaStreamAudioDestinationNode. Runs in real time - source duration / rate,
// see speedAdjustedDurationSec - and the draw loop is driven by the
// worker-backed frame ticker so a hidden tab cannot starve it of frames.
//
// See docs/video-speed-adjust-acceptance-criteria.md for the research behind
// the fixed rate set, the pitch-preservation flags, and the abort contract.

import { awaitVideoMetadata, ensureFiniteDuration } from "./caption-burn";
import { startFrameTicker, type FrameTicker } from "./frame-ticker";

/** The offered multipliers. Deliberately a fixed set, not a range: outside a
 *  narrow window browsers stop time-stretching audio and emit silence, and a
 *  silent output with no error is this feature's worst failure. */
export const SPEED_RATES = [0.5, 0.75, 1.25, 1.5, 1.75, 2] as const;
export type SpeedRate = (typeof SPEED_RATES)[number];

export function isSpeedRate(value: unknown): value is SpeedRate {
  return typeof value === "number" && (SPEED_RATES as readonly number[]).includes(value);
}

/** 1.5 -> "1.5x"; 2 -> "2x"; 0.5 -> "0.5x". Trailing zeros are trimmed, so
 *  there is exactly one spelling of each rate everywhere in the UI. */
export function formatSpeedLabel(rate: number): string {
  const rounded = Math.round(rate * 100) / 100;
  return `${rounded}x`;
}

/** "Week 3 module" + 1.5 -> "Week 3 module (1.5x)". */
export function speedAdjustedName(sourceName: string, rate: number): string {
  return `${sourceName} (${formatSpeedLabel(rate)})`;
}

/** Both the output's duration and the wall-clock render time - they are the
 *  same number (see the acceptance criteria's Mechanism section). Returns
 *  null for a null, zero, negative, NaN or Infinity source duration, or a
 *  rate <= 0. */
export function speedAdjustedDurationSec(sourceSec: number | null, rate: number): number | null {
  if (sourceSec === null || !Number.isFinite(sourceSec) || sourceSec <= 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return sourceSec / rate;
}

export interface SpeedProgress {
  /** 0-100, integer, monotonic. */
  pct: number;
  /** Where the source element has reached, in source seconds. */
  elapsedSourceSec: number;
  /** Wall-clock seconds still to wait: (sourceDur - elapsedSourceSec) / rate. */
  remainingWallSec: number;
}

/** The pure arithmetic behind SpeedProgress, extracted so it is
 *  node-testable in isolation from the renderer that calls it. A non-finite
 *  or non-positive sourceDurationSec or rate reports 0 progress and 0
 *  remaining time rather than NaN or Infinity. */
export function computeSpeedProgress(elapsedSourceSec: number, sourceDurationSec: number, rate: number): SpeedProgress {
  if (!Number.isFinite(sourceDurationSec) || sourceDurationSec <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return { pct: 0, elapsedSourceSec, remainingWallSec: 0 };
  }
  const pct = Math.min(100, Math.round((elapsedSourceSec / sourceDurationSec) * 100));
  const remainingWallSec = Math.max(0, (sourceDurationSec - elapsedSourceSec) / rate);
  return { pct, elapsedSourceSec, remainingWallSec };
}

export interface SpeedAdjustResult {
  blob: Blob;
  /** From ensureFiniteDuration on the SOURCE - never measured on the output. */
  sourceDurationSec: number;
  /** sourceDurationSec / rate. */
  outputDurationSec: number;
  /** False when the element exposed no preservesPitch-family property, so the
   *  caller can say so rather than letting the user discover it. */
  pitchPreserved: boolean;
}

export interface SpeedAdjustOptions {
  onProgress?: (progress: SpeedProgress) => void;
  signal?: AbortSignal;
}

/**
 * Re-encode a video blob at `rate` times its original speed, audio included
 * and pitch-corrected via the preservesPitch family of properties.
 *
 * Runs in WALL-CLOCK REAL TIME: source duration / rate (see
 * speedAdjustedDurationSec). Nothing is audible while it runs -
 * createMediaElementSource re-routes the element into the graph, and the
 * graph connects only to a MediaStreamAudioDestinationNode, never to
 * ac.destination. (v.muted stays false because a MUTED element feeds silence
 * into the graph, not because anyone wants sound.)
 *
 * Because it can run for tens of minutes, a caller must be able to give up:
 * pass `signal` and the run stops promptly and rejects with an AbortError
 * rather than holding the user for the rest of the render. No blob is
 * returned on abort, and nothing is saved.
 */
export async function renderSpeedAdjustedVideo(source: Blob, rate: number, options?: SpeedAdjustOptions): Promise<SpeedAdjustResult> {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Speed must be a positive number.");
  }

  const { onProgress, signal } = options ?? {};

  if (signal?.aborted) {
    throw new DOMException("Speed change cancelled", "AbortError");
  }

  const url = URL.createObjectURL(source);
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = false;
  v.src = url;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Could not create canvas context");
  }

  const ac = new AudioContext();

  // Hoisted above the try block so the finally block below can tear every
  // one of them down on every exit path - including a throw reached before
  // the old code's two hand-picked cleanup points (v.ended, AbortError).
  // canvas.captureStream(30) in particular keeps a 30Hz capture timer alive
  // per invocation, and SpeedPanel never unmounts, so a render that throws
  // partway through would otherwise leak a ticker and two live MediaStreams
  // for the rest of the session.
  let ticker: FrameTicker | null = null;
  let rec: MediaRecorder | null = null;
  let canvasStream: MediaStream | null = null;
  let destStream: MediaStream | null = null;

  try {
    await awaitVideoMetadata(v);
    const dur = await ensureFiniteDuration(v);

    // Only now set the pitch-preservation flags and the playback rate:
    // setting them before ensureFiniteDuration's own seek would make that
    // probe run at the wrong rate.
    const el = v as HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
    let pitchPreserved = false;
    // Both are set, explicitly, even though the specified default is already
    // `true` - it removes this feature's dependence on a default staying put,
    // and it makes the intent legible at the one place where getting it wrong
    // turns every lecture into a chipmunk. The webkit form is Safari 17.1 and
    // older; there is deliberately no moz form (deprecated in Firefox 101,
    // disabled by default in 115).
    for (const key of ["preservesPitch", "webkitPreservesPitch"] as const) {
      if (key in el) {
        el[key] = true;
        pitchPreserved = true;
      }
    }
    v.playbackRate = rate;

    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;

    const mimeTypeCandidates = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    let mimeType = "";
    for (const candidate of mimeTypeCandidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        mimeType = candidate;
        break;
      }
    }

    // The audio graph: the source element's own audio, pitch-corrected by the
    // playbackRate + preservesPitch combination above, routed into the
    // recorded stream. Never connected to ac.destination, so nothing plays
    // aloud while this runs.
    const mediaSource = ac.createMediaElementSource(v);
    const dest = ac.createMediaStreamDestination();
    mediaSource.connect(dest);
    destStream = dest.stream;

    const chunks: Blob[] = [];
    canvasStream = canvas.captureStream(30);
    const recStream = new MediaStream([...canvasStream.getVideoTracks(), ...destStream.getAudioTracks()]);
    rec = new MediaRecorder(recStream, { mimeType });
    const activeRec = rec;

    activeRec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    let lastReportedPct = 0;
    let aborted = false;
    let recorderError: Error | null = null;
    let decodeError: Error | null = null;

    // The only completion signal used to be rec.onstop. Per the MediaStream
    // Recording spec, a mid-encode recorder failure fires `error`, flushes a
    // final `dataavailable` with whatever chunks arrived, then fires `stop` -
    // so without this handler that failure resolved this promise NORMALLY
    // with a truncated blob and the full computed duration, and got saved as
    // if it were a complete video. Capture the error here; rec.onstop below
    // rejects with it instead of resolving.
    activeRec.onerror = (event) => {
      const err = (event as unknown as { error?: DOMException }).error;
      recorderError = new Error(err?.message ? `The recorder failed: ${err.message}` : "The recorder reported an error.");
    };

    // Without this, a mid-playback decode error or stall never sets
    // v.ended, the ticker keeps drawing (or the source just stalls), and
    // the promise never settles - the only escape is Cancel, which reports
    // the same "Cancelled - nothing was saved" text as a genuine user
    // cancellation. Stop everything and let this settle as a distinguishable
    // rendering failure instead.
    v.onerror = () => {
      if (aborted) return;
      const mediaError = v.error;
      decodeError = new Error(mediaError?.message ? `Video playback failed: ${mediaError.message}` : "Video playback failed.");
      ticker?.stop();
      if (activeRec.state !== "inactive") activeRec.stop();
    };

    activeRec.start(1000);

    try {
      await v.play();
    } catch (err) {
      activeRec.stop();
      throw new Error(`Failed to play video: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    ticker = startFrameTicker(30, () => {
      if (signal?.aborted) {
        aborted = true;
        ticker?.stop();
        v.pause();
        if (activeRec.state !== "inactive") activeRec.stop();
        return;
      }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      if (onProgress) {
        const progress = computeSpeedProgress(v.currentTime, dur, rate);
        if (progress.pct !== lastReportedPct) {
          lastReportedPct = progress.pct;
          onProgress(progress);
        }
      }
      if (v.ended) {
        ticker?.stop();
        activeRec.stop();
      }
    });

    await new Promise<void>((resolve, reject) => {
      activeRec.onstop = () => {
        if (!aborted && decodeError) {
          reject(decodeError);
        } else if (!aborted && recorderError) {
          reject(recorderError);
        } else {
          resolve();
        }
      };
    });

    if (aborted) {
      throw new DOMException("Speed change cancelled", "AbortError");
    }

    const blob = new Blob(chunks, { type: activeRec.mimeType || mimeType || "video/webm" });

    return {
      blob,
      sourceDurationSec: dur,
      outputDurationSec: dur / rate,
      pitchPreserved,
    };
  } finally {
    // Tear down everything this call created, on every exit path - see the
    // note above the hoisted declarations.
    ticker?.stop();
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // Already stopping or stopped.
      }
    }
    for (const stream of [canvasStream, destStream]) {
      stream?.getTracks().forEach((track) => track.stop());
    }
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
    try {
      await ac.close();
    } catch {
      // Ignore close errors
    }
  }
}
