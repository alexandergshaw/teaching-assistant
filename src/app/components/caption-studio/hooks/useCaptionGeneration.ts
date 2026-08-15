import { useCallback, useRef, useState } from "react";
import { describeScreenRecordingAction } from "@/app/actions";
import { awaitVideoFrameData, awaitVideoMetadata, ensureFiniteDuration, seekVideoTo } from "@/lib/caption-burn";
import { getStoredProvider } from "@/lib/llm-provider";
import { buildVttContent, gatherRecordingContext, type EditableCaption } from "../utils/captions";
import { fmtTime } from "../utils/formatting";

export function useCaptionGeneration(
  videoUrl: string | null,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  fileName: string
) {
  const [captions, setCaptions] = useState<EditableCaption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "sampling" | "describing">("idle");
  const [cueAudio, setCueAudio] = useState<Record<number, { url: string; base64: string; mimeType: string }>>({});
  const cueAudioRef = useRef(cueAudio);

  const extractFrames = useCallback(async (): Promise<{ frames: Array<{ timeSec: number; base64: string }>; dur: number }> => {
    if (!videoUrl) throw new Error("No video URL");

    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = videoUrl;

    try {
      // Every await below rejects rather than hangs. Each path out of this
      // function must settle: the only feedback the user gets while it runs is
      // the button's "Reading video..." label, so a pending promise reads as a
      // frozen app with nothing to act on.
      await awaitVideoMetadata(v);
      const dur = await ensureFiniteDuration(v);
      // Metadata alone leaves drawImage painting nothing. The t=0 sample below
      // seeks nowhere (the video is already there), so without this wait the
      // first frame handed to the vision model would be blank.
      await awaitVideoFrameData(v);
      const step = Math.max(5, dur / 24);
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = Math.round(640 * (v.videoHeight / v.videoWidth)) || 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      const frames: Array<{ timeSec: number; base64: string }> = [];
      // A stalled seek yields a frame whose pixels do not match its timestamp,
      // so a few are tolerable but a run of them is not: the model would be
      // captioning one moment of the video labelled as several. Give up rather
      // than spend ten seconds per sample producing that.
      let stalledSeeks = 0;
      for (let t = 0; t < dur; t += step) {
        if ((await seekVideoTo(v, Math.min(t, Math.max(0, dur - 0.1)))) === "stalled") {
          stalledSeeks += 1;
          if (stalledSeeks >= 3) {
            throw new Error("The browser kept stalling while reading this video. Try re-importing it, or convert it to MP4/WebM.");
          }
        }
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
        frames.push({ timeSec: t, base64: b64 });
      }
      return { frames, dur };
    } finally {
      v.removeAttribute("src");
      v.load();
    }
  }, [videoUrl]);

  const handleGenerate = useCallback(
    async (context: string, usePageContext: boolean) => {
      if (!videoUrl) return;
      try {
        setError(null);
        setBusy("sampling");
        const { frames, dur } = await extractFrames();
        setBusy("describing");
        const page = usePageContext ? gatherRecordingContext().text : "";
        const combined = [context.trim(), page].filter(Boolean).join("\n\n");
        const r = await describeScreenRecordingAction(frames, dur, combined, getStoredProvider());
        setBusy("idle");
        if ("error" in r) {
          setError(r.error);
          return;
        }
        for (const url of Object.values(cueAudio)) {
          URL.revokeObjectURL(url.url);
        }
        setCueAudio({});
        setCaptions(r.captions);
      } catch (err) {
        setBusy("idle");
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    },
    [videoUrl, cueAudio, extractFrames]
  );

  const handleDownloadVtt = useCallback(() => {
    if (!captions) return;
    const vtt = buildVttContent(captions);
    const blob = new Blob([vtt], { type: "text/vtt" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // Named from the imported file, not from videoRef.src: that src is a blob
    // url, so its last path segment is the object url's UUID and every download
    // landed in the user's folder as an unrecognisable <uuid>.vtt.
    const base = fileName.replace(/\.[^/.]+$/, "").trim() || "video";
    a.download = `${base}.vtt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [captions, fileName]);

  const handleCopyCaptions = useCallback(() => {
    if (!captions) return;
    const text = captions.map((c) => `${fmtTime(c.start)}-${fmtTime(c.end)} ${c.text}`).join("\n");
    navigator.clipboard.writeText(text);
  }, [captions]);

  const updateCue = useCallback((i: number, patch: Partial<EditableCaption>) => {
    setCaptions((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const updated = { ...next[i], ...patch };
      updated.start = Math.max(0, updated.start);
      updated.end = Math.max(updated.start + 0.1, updated.end);
      next[i] = updated;
      return next;
    });
  }, []);

  const sortCaptions = useCallback(() => {
    setCaptions((prev) => {
      if (!prev) return prev;
      return [...prev].sort((a, b) => a.start - b.start);
    });
  }, []);

  const handleUpdateCaption = useCallback(
    (i: number, text: string) => {
      updateCue(i, { text });
      if (cueAudio[i]) {
        URL.revokeObjectURL(cueAudio[i].url);
        setCueAudio((prev) => {
          const next = { ...prev };
          delete next[i];
          return next;
        });
      }
    },
    [updateCue, cueAudio]
  );

  const handleRemoveCaption = useCallback(
    (i: number) => {
      for (const url of Object.values(cueAudio)) {
        URL.revokeObjectURL(url.url);
      }
      setCueAudio({});
      setCaptions((prev) => {
        if (!prev) return prev;
        return prev.filter((_, idx) => idx !== i);
      });
    },
    [cueAudio]
  );

  const handleAddCaptionAtPlayhead = useCallback(() => {
    const t = Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10;
    setCaptions((prev) => {
      const next = prev ? [...prev] : [];
      next.push({ start: t, end: t + 2, text: "New caption", position: "bottom" });
      return next.sort((a, b) => a.start - b.start);
    });
  }, [videoRef]);

  const handleShiftAllCaptions = useCallback(
    (delta: number) => {
      setCaptions((prev) => {
        if (!prev) return prev;
        return prev.map((c) => {
          const start = Math.max(0, +(c.start + delta).toFixed(1));
          const end = Math.max(start + 0.1, +(c.end + delta).toFixed(1));
          return { ...c, start, end };
        });
      });
      sortCaptions();
    },
    [sortCaptions]
  );

  return {
    captions,
    setCaptions,
    error,
    setError,
    busy,
    cueAudio,
    setCueAudio,
    cueAudioRef,
    extractFrames,
    handleGenerate,
    handleDownloadVtt,
    handleCopyCaptions,
    updateCue,
    sortCaptions,
    handleUpdateCaption,
    handleRemoveCaption,
    handleAddCaptionAtPlayhead,
    handleShiftAllCaptions,
  };
}
