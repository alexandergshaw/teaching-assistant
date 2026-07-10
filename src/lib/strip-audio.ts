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
