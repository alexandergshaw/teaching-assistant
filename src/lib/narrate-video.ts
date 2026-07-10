// Client-side helpers for narrating an existing video: sample frames for the
// AI, then re-encode the video with synthesized narration scheduled on the
// timeline (replacing or mixed with the original audio). Real-time re-encode
// driven by a worker ticker so hidden tabs cannot starve it of frames.

import { ensureFiniteDuration } from "./caption-burn";
import { startFrameTicker } from "./frame-ticker";

export async function extractVideoFrames(
  url: string,
  maxFrames = 24
): Promise<{ frames: Array<{ timeSec: number; base64: string }>; durationSec: number }> {
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = true;
  v.src = url;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
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
    canvas.width = 640;
    canvas.height = v.videoHeight && v.videoWidth ? Math.round((640 * v.videoHeight) / v.videoWidth) : 360;

    const step = Math.max(5, dur / maxFrames);
    const frames: Array<{ timeSec: number; base64: string }> = [];

    for (let t = 0; t < dur; t += step) {
      v.currentTime = Math.min(t, Math.max(0, dur - 0.1));
      await new Promise<void>((resolve) => {
        v.onseeked = () => {
          resolve();
        };
      });
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
      if (b64) {
        frames.push({ timeSec: t, base64: b64 });
      }
    }

    return { frames, durationSec: dur };
  } finally {
    v.removeAttribute("src");
  }
}

export interface NarrationClip {
  startSec: number;
  base64: string;
  mimeType: string;
}

export async function renderNarratedVideo(
  source: Blob,
  clips: NarrationClip[],
  mode: "replace" | "mix",
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const url = URL.createObjectURL(source);
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = mode === "mix" ? false : true;
  v.src = url;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Could not create canvas context");
  }

  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();

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

    // If mixing, connect the video's audio to the destination
    if (mode === "mix") {
      const source = ac.createMediaElementSource(v);
      source.connect(dest);
    }

    // Decode all audio clips
    const decodedClips: Map<number, AudioBuffer> = new Map();
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      try {
        const bytes = Uint8Array.from(atob(clip.base64), (c) => c.charCodeAt(0));
        const buf = await ac.decodeAudioData(bytes.buffer.slice(0));
        decodedClips.set(i, buf);
      } catch {
        // Skip decoding failures
      }
    }

    const chunks: Blob[] = [];
    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const recStream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(recStream, { mimeType });

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

    // Keep track of active buffer sources to stop them on cleanup
    const activeNodes: AudioBufferSourceNode[] = [];

    // Start narration clips at their scheduled times
    for (let i = 0; i < clips.length; i++) {
      const buf = decodedClips.get(i);
      if (buf) {
        const startTime = ac.currentTime + clips[i].startSec;
        try {
          const srcNode = ac.createBufferSource();
          srcNode.buffer = buf;
          srcNode.connect(dest);
          srcNode.start(startTime);
          activeNodes.push(srcNode);
        } catch {
          // Skip playback errors
        }
      }
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
    try {
      await ac.close();
    } catch {
      // Ignore close errors
    }
  }
}
