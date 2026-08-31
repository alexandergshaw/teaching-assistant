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
  if (signal?.aborted) {
    throw new DOMException("Audio extraction was cancelled.", "AbortError");
  }
  const url = URL.createObjectURL(source);
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = false;
  v.src = url;

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

    // Determine MIME type for the recorder
    const mimeTypeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    let mimeType = "";
    for (const candidate of mimeTypeCandidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        mimeType = candidate;
        break;
      }
    }

    const chunks: Blob[] = [];
    const audioCtx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)();
    const source_ = audioCtx.createMediaElementSource(v);
    const dest = audioCtx.createMediaStreamDestination();
    source_.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType });

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    let lastReportedPct = 0;
    let aborted = false;
    let progressInterval: ReturnType<typeof setInterval> | null = null;

    // Stops playback and the recorder the moment the caller gives up, rather
    // than letting the element run out the remaining wall-clock time in the
    // background. The recorder still fires onstop, so the await below resolves
    // and the `aborted` check turns it into a rejection.
    const onAbort = () => {
      aborted = true;
      if (progressInterval !== null) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      v.pause();
      if (rec.state !== "inactive") rec.stop();
    };
    signal?.addEventListener("abort", onAbort);

    try {
      // Start recording
      rec.start(1000);

      // Play the video
      try {
        await v.play();
      } catch (err) {
        rec.stop();
        audioCtx.close();
        throw new Error(`Failed to play video: ${err instanceof Error ? err.message : "Unknown error"}`);
      }

      if (signal?.aborted && !aborted) onAbort();

      // Progress tracking loop
      progressInterval = setInterval(() => {
        if (onProgress) {
          const pct = Math.min(100, Math.round((v.currentTime / dur) * 100));
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            onProgress(pct);
          }
        }
        if (v.ended) {
          if (progressInterval !== null) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          rec.stop();
        }
      }, 100);

      // Wait for recorder to stop
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
      });

      if (progressInterval !== null) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      // A cancelled run has partial audio in `chunks`. Never hand that back as
      // if it were the whole recording - a truncated audio blob would be
      // transcribed and drafted from without anything indicating it is short.
      if (aborted) {
        audioCtx.close();
        throw new DOMException("Audio extraction was cancelled.", "AbortError");
      }

      // Build output blob
      const out = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });

      audioCtx.close();
      return out;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      if (progressInterval !== null) clearInterval(progressInterval);
    }
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
  }
}
