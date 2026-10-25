// Re-encode a video without its audio track by playing it through a canvas
// and recording the canvas stream only. Runs in real time; the draw loop is
// driven by a worker ticker so a hidden tab cannot starve it of frames.

import { ensureFiniteDuration } from "./caption-burn";
import { startFrameTicker } from "./frame-ticker";

export async function stripAudio(source: Blob, onProgress?: (pct: number) => void): Promise<Blob> {
  const url = URL.createObjectURL(source);
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = true;
  v.src = url;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Could not create canvas context");
  }

  try {
    // Wait for metadata to be available
    await new Promise<void>((resolve, reject) => {
      if (v.readyState >= 1) {
        resolve();
        return;
      }
      const onLoaded = () => {
        v.removeEventListener("loadedmetadata", onLoaded);
        v.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        v.removeEventListener("loadedmetadata", onLoaded);
        v.removeEventListener("error", onError);
        reject(new Error("Failed to load video metadata"));
      };
      v.addEventListener("loadedmetadata", onLoaded);
      v.addEventListener("error", onError);
    });

    const dur = await ensureFiniteDuration(v);

    // Set canvas dimensions
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;

    // Determine MIME type for the recorder
    const mimeTypeCandidates = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    let mimeType = "";
    for (const candidate of mimeTypeCandidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        mimeType = candidate;
        break;
      }
    }

    const chunks: Blob[] = [];
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType });

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    let lastReportedPct = 0;

    // Start recording
    rec.start(1000);

    // Play the video
    try {
      await v.play();
    } catch (err) {
      rec.stop();
      throw new Error(`Failed to play video: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    // Draw loop
    const ticker = startFrameTicker(30, () => {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      if (onProgress) {
        const pct = Math.min(100, Math.round((v.currentTime / dur) * 100));
        if (pct !== lastReportedPct) {
          lastReportedPct = pct;
          onProgress(pct);
        }
      }
      if (v.ended) {
        ticker.stop();
        rec.stop();
      }
    });

    // Wait for recorder to stop
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });

    // Build output blob
    const out = new Blob(chunks, { type: rec.mimeType || mimeType || "video/webm" });

    return out;
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
  }
}

/**
 * Re-encode just the audio of a video blob.
 *
 * Runs in WALL-CLOCK REAL TIME: a 20-minute video takes 20 minutes, because it
 * works by playing the element and tapping it through a MediaStream. Nothing is
 * audible while it runs - createMediaElementSource re-routes the element into
 * the graph, and the graph connects only to a MediaStreamAudioDestinationNode,
 * never to audioCtx.destination. (v.muted stays false because a MUTED element
 * feeds silence into the graph, not because anyone wants sound.)
 *
 * Because it is this slow, a caller must be able to give up: pass `signal` and
 * the run stops promptly and rejects with an AbortError rather than holding the
 * user for the rest of the recording.
 */
export async function extractAudioOnly(
  source: Blob,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const cancelled = () => new DOMException("Audio extraction was cancelled.", "AbortError");
  if (signal?.aborted) throw cancelled();
  const url = URL.createObjectURL(source);
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = false;
  v.src = url;
  let audioCtx: AudioContext | undefined;
  let audioSource: MediaElementAudioSourceNode | undefined;
  let destination: MediaStreamAudioDestinationNode | undefined;
  let recorder: MediaRecorder | undefined;
  let progressInterval: ReturnType<typeof setInterval> | undefined;
  const pendingCleanups = new Set<() => void>();
  const stopMedia = () => {
    v.pause();
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };
  // Every local wait owns both its timeout and abort listener. Observing late
  // promise settlement prevents unhandled rejections without accepting partial audio.
  const bounded = <T>(work: () => Promise<T>, timeoutMs: number): Promise<T> => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); pendingCleanups.delete(cleanup); };
    const abort = () => { cleanup(); reject(cancelled()); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Audio preparation timed out.")); }, timeoutMs);
    pendingCleanups.add(cleanup);
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      if (signal?.aborted) throw cancelled();
      return work();
    }).then(value => { cleanup(); if (signal?.aborted) reject(cancelled()); else resolve(value); }, error => { cleanup(); reject(error); });
  });
  let clearMetadata: (() => void) | undefined;
  try {
    await bounded(() => new Promise<void>((resolve, reject) => {
      if (v.readyState >= 1) { resolve(); return; }
      const cleanup = () => { v.removeEventListener("loadedmetadata", loaded); v.removeEventListener("error", failed); };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Failed to load video metadata")); };
      clearMetadata = cleanup;
      v.addEventListener("loadedmetadata", loaded);
      v.addEventListener("error", failed);
    }), 20_000);
    const duration = await bounded(() => ensureFiniteDuration(v, signal), 20_000);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not determine the video duration.");
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(candidate => MediaRecorder.isTypeSupported(candidate)) ?? "";
    const chunks: Blob[] = [];
    audioCtx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();
    audioSource = audioCtx.createMediaElementSource(v);
    destination = audioCtx.createMediaStreamDestination();
    audioSource.connect(destination);
    recorder = new MediaRecorder(destination.stream, { mimeType });
    recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
    // Install before start/play: stop may fire synchronously in an abort or play failure.
    const stopped = new Promise<void>((resolve, reject) => {
      recorder!.onstop = () => resolve();
      recorder!.onerror = () => reject(new Error("Could not record the video's audio."));
    });
    // Playback may fail before this promise is awaited.
    void stopped.catch(() => undefined);
    recorder.start(1000);
    await bounded(() => v.play(), 20_000);
    let lastReportedPct = -1;
    progressInterval = setInterval(() => {
      if (signal?.aborted) return;
      const pct = Math.min(100, Math.round(v.currentTime / duration * 100));
      if (pct !== lastReportedPct) { lastReportedPct = pct; onProgress?.(pct); }
      if (v.ended && recorder?.state !== "inactive") recorder?.stop();
    }, 100);
    await bounded(() => stopped, duration * 1000 + 20_000);
    if (signal?.aborted) throw cancelled();
    return new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
  } finally {
    clearMetadata?.();
    for (const cleanup of pendingCleanups) cleanup();
    if (progressInterval !== undefined) clearInterval(progressInterval);
    stopMedia();
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; }
    audioSource?.disconnect();
    destination?.stream.getTracks().forEach(track => track.stop());
    if (audioCtx) void audioCtx.close().catch(() => undefined);
    // Release any pending bounded duration primitive listeners as well.
    v.dispatchEvent(new Event("error"));
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}
