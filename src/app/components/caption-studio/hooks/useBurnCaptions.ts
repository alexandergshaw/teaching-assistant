import { useCallback, useRef, useState } from "react";
import { activeCaptionAt, captionLayout, captionBlockBaselineY, ensureFiniteDuration, wrapCaptionLines } from "@/lib/caption-burn";
import { saveRecordingFile } from "@/lib/recording-files";
import { startFrameTicker } from "@/lib/frame-ticker";
import type { RecordingFile } from "@/lib/recording-files";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { EditableCaption } from "../utils/captions";

export function useBurnCaptions(
  videoUrl: string | null,
  fileName: string,
  captions: EditableCaption[] | null,
  cueAudio: Record<number, { url: string; base64: string; mimeType: string }>,
  voMode: "original" | "voiceover" | "mix" | "none",
  previewing: boolean,
  endPreview: () => void,
  supabase: SupabaseClient | null,
  user: User | null
) {
  const [burning, setBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState(0);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burned, setBurned] = useState<{ url: string; name: string; mimeType: string } | null>(null);
  const [burnedRow, setBurnedRow] = useState<RecordingFile | null>(null);
  const [burnSave, setBurnSave] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const [renameNote, setRenameNote] = useState<string | null>(null);

  const burnAbortRef = useRef<(() => void) | null>(null);
  const burnedUrlRef = useRef<string | null>(null);

  const handleBurnCaptions = useCallback(async () => {
    if (previewing) endPreview();
    if (!videoUrl || !captions || captions.length === 0 || burning) return;

    if ((voMode === "voiceover" || voMode === "mix") && Object.keys(cueAudio).length === 0) {
      setBurnError("Generate voices for your captions first (or set Export audio to Original).");
      return;
    }

    setBurnError(null);
    if (burned) {
      if (burned.url) URL.revokeObjectURL(burned.url);
      setBurned(null);
    }
    setBurning(true);
    setBurnProgress(0);
    setBurnSave("idle");
    setBurnedRow(null);

    let audioContext: AudioContext | null = null;
    let cancelled = false;
    let ticker: { stop: () => void } | null = null;
    const voiceNodes: Array<AudioBufferSourceNode> = [];

    try {
      const v = document.createElement("video");
      v.src = videoUrl;
      v.playsInline = true;
      v.preload = "auto";

      await new Promise<void>((resolve) => {
        if (v.readyState >= 1) {
          resolve();
        } else {
          v.addEventListener("loadedmetadata", () => resolve(), { once: true });
        }
      });

      const dur = await ensureFiniteDuration(v);

      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth || 1280;
      canvas.height = v.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      let audioTracks: MediaStreamTrack[] = [];
      let voiceDest: MediaStreamAudioDestinationNode | null = null;
      const decodedVoices: Array<{ buffer: AudioBuffer; startSec: number }> = [];
      if (voMode !== "none") {
        try {
          audioContext = new AudioContext();
          if ((voMode === "voiceover" || voMode === "mix") && Object.keys(cueAudio).length > 0) {
            for (const [indexStr, entry] of Object.entries(cueAudio)) {
              try {
                const idx = Number(indexStr);
                const cue = captions[idx];
                if (!cue) continue;
                const bytes = Uint8Array.from(atob(entry.base64), (ch) => ch.charCodeAt(0));
                const buffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
                decodedVoices.push({ buffer, startSec: cue.start });
              } catch {
                // Skip failures
              }
            }
          }
          const src = audioContext.createMediaElementSource(v);
          const dest = audioContext.createMediaStreamDestination();
          voiceDest = dest;
          if (voMode === "original" || voMode === "mix") {
            src.connect(dest);
          }
          audioTracks = dest.stream.getAudioTracks();
        } catch {
          audioTracks = [];
        }
      } else {
        v.muted = true;
      }

      const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioTracks]);

      const mimeTypes = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
      let selectedMime = "video/webm";
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType: selectedMime });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (cancelled) {
          return;
        }

        const blob = new Blob(chunks, { type: selectedMime });
        const outUrl = URL.createObjectURL(blob);
        const base = fileName.replace(/\.[^/.]+$/, "") || "video";
        const outName = `${base}-captioned`;

        setBurned({ url: outUrl, name: outName, mimeType: blob.type || "video/webm" });
        burnedUrlRef.current = outUrl;
        setBurning(false);
        setBurnProgress(100);

        if (user && supabase) {
          setBurnSave("saving");
          saveRecordingFile(supabase, user.id, blob, {
            name: outName,
            kind: "captioned",
            mimeType: blob.type || "video/webm",
            durationSec: dur,
          })
            .then((result) => {
              setBurnedRow(result);
              setBurnSave("done");
            })
            .catch((err) => {
              console.error("Save failed:", err);
              setBurnSave("failed");
            });
        }
      };

      recorder.start(1000);

      let lastReportedProgress = 0;

      const drawLoop = () => {
        if (cancelled || v.ended) {
          ticker?.stop();
          v.pause();
          recorder.stop();
          burnAbortRef.current = null;
          if (audioContext && audioContext.state !== "closed") {
            try {
              audioContext.close();
            } catch {
              // Double-close guard
            }
          }
          return;
        }

        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

        const cue = activeCaptionAt(captions, v.currentTime);
        if (cue) {
          const layout = captionLayout(canvas.width, canvas.height);
          ctx.font = `600 ${layout.fontPx}px system-ui, sans-serif`;
          const lines = wrapCaptionLines(cue.text, layout.maxTextWidth, (s) => ctx.measureText(s).width);
          let baselineY = captionBlockBaselineY(canvas.height, layout, lines.length, cue.position);

          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const textWidth = ctx.measureText(line).width;
            const boxW = textWidth + layout.padX * 2;
            const boxH = layout.lineHeight;
            const boxX = (canvas.width - boxW) / 2;
            const boxY = baselineY - boxH / 2 - layout.lineHeight / 2;
            const lineY = boxY + boxH / 2;

            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(boxX, boxY, boxW, boxH, 8);
              ctx.fillStyle = "rgba(15,23,42,0.78)";
              ctx.fill();
            } else {
              ctx.fillStyle = "rgba(15,23,42,0.78)";
              ctx.fillRect(boxX, boxY, boxW, boxH);
            }

            ctx.fillStyle = "#f8fafc";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(line, canvas.width / 2, lineY);

            baselineY -= layout.lineHeight;
          }
        }

        const newProgress = Math.min(100, Math.round((v.currentTime / dur) * 100));
        if (newProgress !== lastReportedProgress) {
          lastReportedProgress = newProgress;
          setBurnProgress(newProgress);
        }
      };

      burnAbortRef.current = () => {
        cancelled = true;
        ticker?.stop();
        v.pause();
        v.removeAttribute("src");
        if (recorder.state !== "inactive") recorder.stop();
        for (const node of voiceNodes) {
          try {
            node.stop();
          } catch {
            // Guard
          }
        }
        if (audioContext && audioContext.state !== "closed") {
          try {
            audioContext.close();
          } catch {
            // Double-close guard
          }
        }
        setBurning(false);
        burnAbortRef.current = null;
      };

      v.currentTime = 0;
      await v.play();
      if (audioContext && decodedVoices.length > 0) {
        for (const { buffer, startSec } of decodedVoices) {
          const node = audioContext.createBufferSource();
          node.buffer = buffer;
          if (voiceDest) {
            node.connect(voiceDest);
            node.start(audioContext.currentTime + startSec);
            voiceNodes.push(node);
          }
        }
      }
      ticker = startFrameTicker(30, drawLoop);
    } catch (err) {
      const abort = burnAbortRef.current;
      if (abort) {
        abort();
      } else {
        if (audioContext && audioContext.state !== "closed") {
          try {
            audioContext.close();
          } catch {
            // Guard
          }
        }
        for (const node of voiceNodes) {
          try {
            node.stop();
          } catch {
            // Guard
          }
        }
        burnAbortRef.current = null;
      }
      setBurnError(err instanceof Error ? err.message : "An error occurred");
      setBurning(false);
    }
  }, [videoUrl, captions, burning, burned, fileName, user, supabase, voMode, cueAudio, previewing, endPreview]);

  return {
    burning,
    setBurning,
    burnProgress,
    setBurnProgress,
    burnError,
    setBurnError,
    burned,
    setBurned,
    burnedRow,
    setBurnedRow,
    burnSave,
    setBurnSave,
    renameNote,
    setRenameNote,
    burnAbortRef,
    burnedUrlRef,
    handleBurnCaptions,
  };
}
