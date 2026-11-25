// Client-side helpers for narrating an existing video: sample frames for the
// AI, then re-encode the video with synthesized narration scheduled on the
// timeline (replacing or mixed with the original audio). Real-time re-encode
// driven by a worker ticker so hidden tabs cannot starve it of frames.

import { awaitVideoFrameData, awaitVideoMetadata, ensureFiniteDuration, seekVideoTo } from "./caption-burn";
import { startFrameTicker } from "./frame-ticker";
import { narrationFrameChange, narrationNoteTimes, narrationProbeTimes, selectNarrationFrameTimes } from "./narration-frame-selection";
import { UPLOAD_WIRE_BUDGET_BYTES } from "./upload-budget";

export async function extractVideoFrames(
  url: string,
  maxFrames = 24,
  narration?: { timestampNotes: string; signal: AbortSignal },
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
    await awaitVideoMetadata(v);
    const dur = await ensureFiniteDuration(v, narration?.signal);

    const seekFrame = async (time: number) => {
      narration?.signal.throwIfAborted();
      if (await seekVideoTo(v, time) === "stalled") {
        throw new Error("The browser could not seek through the recording.");
      }
      await awaitVideoFrameData(v);
      narration?.signal.throwIfAborted();
    };

    let times: number[];
    if (narration) {
      canvas.width = 112;
      canvas.height = 64;
      const probes = [];
      let previous: Uint8ClampedArray | undefined;
      for (const time of narrationProbeTimes(dur)) {
        await seekFrame(time);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        probes.push({ timeSec: v.currentTime, change: previous ? narrationFrameChange(previous, pixels, canvas.width) : 0 });
        previous = pixels;
      }
      times = selectNarrationFrameTimes(dur, maxFrames, probes, narrationNoteTimes(narration.timestampNotes, dur));
    } else {
      times = [];
      const step = Math.max(5, dur / maxFrames);
      for (let time = 0; time < dur; time += step) times.push(Math.min(time, Math.max(0, dur - 0.1)));
    }

    const scale = 640 / (narration ? Math.max(v.videoWidth, v.videoHeight, 1) : Math.max(v.videoWidth, 1));
    canvas.width = v.videoWidth ? Math.max(1, Math.round(v.videoWidth * scale)) : 640;
    canvas.height = v.videoHeight && v.videoWidth ? Math.max(1, Math.round(v.videoHeight * scale)) : 360;

    const frames: Array<{ timeSec: number; base64: string }> = [];
    // Leave room for context and the action envelope in the existing request cap.
    const frameBudget = Math.floor((UPLOAD_WIRE_BUDGET_BYTES - 384 * 1024) / maxFrames);

    for (const time of times) {
      await seekFrame(time);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      let b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
      if (narration && b64 && b64.length > frameBudget) {
        b64 = canvas.toDataURL("image/jpeg", 0.35).split(",")[1];
        if (b64 && b64.length > frameBudget) throw new Error("A video frame is too large to draft narration.");
      }
      if (b64) {
        frames.push({ timeSec: v.currentTime, base64: b64 });
      }
    }

    return { frames, durationSec: dur };
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

export interface NarrationClip {
  startSec: number;
  base64: string;
  mimeType: string;
}

function peakNormalizationGain(buffers: Iterable<AudioBuffer>): number {
  let peak = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let index = 0; index < samples.length; index++) {
        peak = Math.max(peak, Math.abs(samples[index]));
      }
    }
  }
  return peak > 0 ? Math.min(2, 0.8 / peak) : 1;
}

export async function renderNarratedVideo(
  source: Blob,
  clips: NarrationClip[],
  mode: "replace" | "mix",
  onProgress?: (pct: number) => void,
  options?: { audioContext: AudioContext; strict: true; signal?: AbortSignal },
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

  const ac = options?.audioContext ?? new AudioContext();
  const dest = ac.createMediaStreamDestination();
  let recordingStream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let stopTicker: (() => void) | undefined;
  const onAbort = () => {
    if (recorder?.state === "recording") recorder.stop();
    v.pause();
  };

  try {
    options?.signal?.throwIfAborted();
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    if (options?.strict && ac.state !== "running") {
      throw new Error("Audio playback could not start. Click Render again to enable audio.");
    }
    await awaitVideoMetadata(v);
    const dur = await ensureFiniteDuration(v, options?.signal);
    if (options?.strict) await awaitVideoFrameData(v);

    // Set canvas dimensions
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;

    // Determine MIME type for the recorder
    const mimeTypeCandidates = [
      options?.strict ? "video/mp4;codecs=avc1,mp4a.40.2" : "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ];
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
        if (options?.strict) throw new Error(`Could not decode narration clip ${i + 1}.`);
      }
      options?.signal?.throwIfAborted();
    }

    const narrationGain = options?.strict ? ac.createGain() : undefined;
    if (narrationGain) {
      narrationGain.gain.value = peakNormalizationGain(decodedClips.values());
      narrationGain.connect(dest);
    }

    const chunks: Blob[] = [];
    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const recStream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    recordingStream = recStream;
    const rec = new MediaRecorder(recStream, { mimeType });
    recorder = rec;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    const finished = new Promise<string | null>((resolve) => {
      rec.onstop = () => resolve(null);
      rec.onerror = () => resolve("The browser stopped recording the narrated video.");
      v.onerror = () => resolve("The source video could not finish playing.");
    });

    let lastReportedPct = 0;

    if (options?.strict) ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    options?.signal?.throwIfAborted();
    rec.start(1000);

    // Play the video
    try {
      await v.play();
    } catch (err) {
      if (rec.state !== "inactive") rec.stop();
      options?.signal?.throwIfAborted();
      throw new Error(`Failed to play video: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    options?.signal?.throwIfAborted();

    // Use one clock origin for all cues in the strict narration export.
    const playbackStart = ac.currentTime - v.currentTime;

    // Start narration clips at their scheduled times
    for (let i = 0; i < clips.length; i++) {
      const buf = decodedClips.get(i);
      if (buf) {
        const startTime = (options?.strict ? playbackStart : ac.currentTime) + clips[i].startSec;
        try {
          const srcNode = ac.createBufferSource();
          srcNode.buffer = buf;
          srcNode.connect(narrationGain ?? dest);
          const offset = options?.strict ? Math.max(0, ac.currentTime - startTime) : 0;
          if (offset >= buf.duration) {
            throw new Error("This narration cue passed before playback could start.");
          }
          srcNode.start(Math.max(startTime, ac.currentTime), offset);
        } catch {
          if (options?.strict) throw new Error(`Could not schedule narration clip ${i + 1}.`);
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
      if (v.ended && rec.state !== "inactive") {
        ticker.stop();
        rec.stop();
      }
    });
    stopTicker = () => ticker.stop();

    const error = await finished;
    options?.signal?.throwIfAborted();
    if (error) throw new Error(error);

    // Build output blob
    const out = new Blob(chunks, { type: rec.mimeType || mimeType || "video/webm" });

    return out;
  } finally {
    options?.signal?.removeEventListener("abort", onAbort);
    stopTicker?.();
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recordingStream?.getTracks().forEach((track) => track.stop());
    v.onerror = null;
    v.pause();
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
    v.load();
    try {
      await ac.close();
    } catch {
      // Ignore close errors
    }
  }
}
