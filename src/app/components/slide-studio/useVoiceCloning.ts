"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVoiceCloneAction, listElevenVoicesAction } from "@/app/actions";
import { resolveVoiceId, setVoiceId } from "@/lib/voice-id";
import { useSupabase } from "@/context/SupabaseProvider";
import { saveRecordingFile } from "@/lib/recording-files";

export interface UseVoiceCloningReturn {
  cloneVoiceId: string;
  setCloneVoiceId: (id: string) => void;
  cloneName: string;
  setCloneName: (n: string) => void;
  cloneBusy: boolean;
  setCloneBusy: (b: boolean) => void;
  cloneError: string | null;
  setCloneError: (e: string | null) => void;
  cloneNote: string | null;
  setCloneNote: (n: string | null) => void;
  sampleRecState: "idle" | "recording";
  setSampleRecState: (s: "idle" | "recording") => void;
  sampleUrl: string | null;
  setSampleUrl: (u: string | null) => void;
  sampleBlob: Blob | null;
  setSampleBlob: (b: Blob | null) => void;
  sampleElapsed: number;
  setSampleElapsed: (e: number) => void;
  sampleMics: Array<{ deviceId: string; label: string }>;
  setSampleMics: (m: Array<{ deviceId: string; label: string }>) => void;
  sampleMicId: string;
  setSampleMicId: (id: string) => void;
  stockVoices: Array<{ voiceId: string; name: string; category: string }> | null;
  setStockVoices: (v: Array<{ voiceId: string; name: string; category: string }> | null) => void;
  stockLoading: boolean;
  setStockLoading: (b: boolean) => void;
  stockSel: string;
  setStockSel: (s: string) => void;
  sampleSaved: "idle" | "done" | "failed";
  setSampleSaved: (s: "idle" | "done" | "failed") => void;
  sampleRecRef: React.MutableRefObject<MediaRecorder | null>;
  sampleStreamRef: React.MutableRefObject<MediaStream | null>;
  sampleIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  sampleStartRef: React.MutableRefObject<number>;
  cloneFileRef: React.MutableRefObject<HTMLInputElement | null>;
  enumerateSampleMics: () => Promise<void>;
  handleStartRecording: () => Promise<void>;
  handleStopRecording: () => void;
  handleDiscardSample: () => void;
  handleCreateCloneFromSample: () => Promise<void>;
  handleCreateClone: (fileList: FileList | null) => Promise<void>;
  handleLoadStockVoices: () => Promise<void>;
  handleUseStockVoice: () => Promise<void>;
}

export function useVoiceCloning(): UseVoiceCloningReturn {
  const { supabase, user } = useSupabase();

  const [cloneVoiceId, setCloneVoiceId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-voice-id") ?? "";
  });
  const [cloneName, setCloneName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-slides-clone-name") ?? "";
  });
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneNote, setCloneNote] = useState<string | null>(null);
  const [sampleRecState, setSampleRecState] = useState<"idle" | "recording">("idle");
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleBlob, setSampleBlob] = useState<Blob | null>(null);
  const [sampleElapsed, setSampleElapsed] = useState(0);
  const [sampleMics, setSampleMics] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [sampleMicId, setSampleMicId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-sample-mic-id") ?? "";
  });
  const [stockVoices, setStockVoices] = useState<Array<{ voiceId: string; name: string; category: string }> | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSel, setStockSel] = useState<string>("");
  const [sampleSaved, setSampleSaved] = useState<"idle" | "done" | "failed">("idle");

  const sampleRecRef = useRef<MediaRecorder | null>(null);
  const sampleStreamRef = useRef<MediaStream | null>(null);
  const sampleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleStartRef = useRef<number>(0);
  const cloneFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cloneVoiceId) return;
      const id = await resolveVoiceId();
      if (!cancelled && id) setCloneVoiceId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [cloneVoiceId]);

  useEffect(() => {
    return () => {
      if (sampleRecRef.current) {
        try {
          sampleRecRef.current.stop();
        } catch {
          // recorder already stopped
        }
      }
      if (sampleStreamRef.current) {
        sampleStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (sampleIntervalRef.current) {
        clearInterval(sampleIntervalRef.current);
      }
      if (sampleUrl) {
        URL.revokeObjectURL(sampleUrl);
      }
    };
  }, [sampleUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-clone-name", cloneName);
  }, [cloneName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-sample-mic-id", sampleMicId);
  }, [sampleMicId]);

  const enumerateSampleMics = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return;
      }
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = deviceList.filter((d) => d.kind === "audioinput" && d.deviceId);
      const mics = audioDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));
      setSampleMics(mics);
    } catch (err) {
      console.error("Failed to enumerate sample mics:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initMics = async () => {
      if (!cancelled) {
        await enumerateSampleMics();
      }
    };

    initMics();

    const handleDeviceChange = () => {
      if (!cancelled) {
        void enumerateSampleMics();
      }
    };

    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [enumerateSampleMics]);

  const handleStartRecording = useCallback(async () => {
    setCloneError(null);
    setSampleSaved("idle");
    try {
      const audioConstraints: MediaTrackConstraints = {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      };

      if (sampleMicId) {
        audioConstraints.deviceId = { exact: sampleMicId };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      } catch (err) {
        const errName = (err as DOMException)?.name;
        const shouldRetry =
          sampleMicId && (errName === "OverconstrainedError" || errName === "NotFoundError");
        if (shouldRetry) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true,
            },
          });
        } else {
          throw err;
        }
      }

      sampleStreamRef.current = stream;

      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      if (!mimeType) {
        setCloneError("Audio recording not supported in this browser.");
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      sampleRecRef.current = recorder;
      setSampleRecState("recording");
      setSampleElapsed(0);

      sampleIntervalRef.current = setInterval(() => {
        setSampleElapsed((prev) => prev + 1);
      }, 1000);

      recorder.onstop = () => {
        if (sampleIntervalRef.current) {
          clearInterval(sampleIntervalRef.current);
          sampleIntervalRef.current = null;
        }
        stream.getTracks().forEach((t) => t.stop());
        sampleStreamRef.current = null;
      };

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          const blob = new Blob([e.data], { type: mimeType });
          setSampleBlob(blob);
          setSampleUrl(URL.createObjectURL(blob));
          if (user && supabase) {
            void (async () => {
              try {
                await saveRecordingFile(supabase, user.id, blob, {
                  name: `Voice sample ${new Date().toLocaleString()}`,
                  kind: "recording",
                  mimeType: blob.type || "audio/webm",
                  durationSec: Math.max(1, Math.round((Date.now() - sampleStartRef.current) / 1000)),
                });
                setSampleSaved("done");
              } catch (err) {
                console.error("Library save failed:", err);
                setSampleSaved("failed");
              }
            })();
          }
        }
      };

      recorder.start();
      sampleStartRef.current = Date.now();

      await enumerateSampleMics();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not access microphone.");
      setSampleRecState("idle");
    }
  }, [sampleMicId, enumerateSampleMics, supabase, user]);

  const handleStopRecording = useCallback(() => {
    if (sampleRecRef.current && sampleRecState === "recording") {
      sampleRecRef.current.stop();
      setSampleRecState("idle");
    }
  }, [sampleRecState]);

  const handleDiscardSample = useCallback(() => {
    if (sampleUrl) {
      URL.revokeObjectURL(sampleUrl);
    }
    setSampleUrl(null);
    setSampleBlob(null);
    setSampleElapsed(0);
    setSampleSaved("idle");
  }, [sampleUrl]);

  const handleCreateCloneFromSample = useCallback(async () => {
    if (!sampleBlob || !cloneName.trim()) return;
    if (sampleBlob.size > 6.5 * 1024 * 1024) {
      setCloneError("The sample is too large - keep it under about 90 seconds.");
      return;
    }
    setCloneBusy(true);
    setCloneError(null);
    setCloneNote(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => {
          const result = rd.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        rd.onerror = reject;
        rd.readAsDataURL(sampleBlob);
      });
      const r = await createVoiceCloneAction(cloneName.trim(), [
        {
          base64,
          mimeType: sampleBlob.type || "audio/webm",
          fileName: "voice-sample.webm",
        },
      ]);
      if ("error" in r) {
        setCloneError(r.error);
        return;
      }
      setCloneVoiceId(r.voiceId);
      setVoiceId(r.voiceId);
      setCloneNote(`Voice created. All audio generation now uses "${cloneName.trim()}".`);
      handleDiscardSample();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not create voice clone.");
    } finally {
      setCloneBusy(false);
    }
  }, [sampleBlob, cloneName, handleDiscardSample]);

  const handleCreateClone = useCallback(async (fileList: FileList | null) => {
    const picked = Array.from(fileList ?? []);
    if (!picked.length) return;
    if (!cloneName.trim()) { setCloneError("Enter a name for the voice first."); return; }
    setCloneBusy(true); setCloneError(null); setCloneNote(null);
    try {
      const files = await Promise.all(picked.map(async (f) => ({
        base64: await new Promise<string>((resolve, reject) => { const rd = new FileReader(); rd.onload = () => resolve((rd.result as string).split(",")[1] ?? ""); rd.onerror = reject; rd.readAsDataURL(f); }),
        mimeType: f.type || "audio/mpeg",
        fileName: f.name,
      })));
      const r = await createVoiceCloneAction(cloneName, files);
      if ("error" in r) { setCloneError(r.error); return; }
      setCloneVoiceId(r.voiceId);
      setVoiceId(r.voiceId);
      setCloneNote(`Voice created. All audio generation now uses "${cloneName.trim()}".`);
      if (user && supabase) {
        for (const f of picked) {
          void (async () => {
            try {
              await saveRecordingFile(supabase, user.id, f, {
                name: f.name.replace(/\.[^/.]+$/, "") || f.name,
                kind: "recording",
                mimeType: f.type || "audio/mpeg",
                durationSec: null,
              });
            } catch (err) {
              console.error("Failed to save voice file to library:", err);
            }
          })();
        }
      }
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not read the audio files.");
    } finally {
      setCloneBusy(false);
    }
  }, [cloneName, user, supabase]);

  const handleLoadStockVoices = useCallback(async () => {
    setStockLoading(true);
    setCloneError(null);
    try {
      const r = await listElevenVoicesAction();
      if ("error" in r) {
        setCloneError(r.error);
        return;
      }
      setStockVoices(r.voices);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not load voices.");
    } finally {
      setStockLoading(false);
    }
  }, []);

  const handleUseStockVoice = useCallback(async () => {
    if (!stockSel || !stockVoices) return;
    const selected = stockVoices.find((v) => v.voiceId === stockSel);
    if (!selected) return;
    setCloneVoiceId(stockSel);
    setVoiceId(stockSel);
    setCloneNote(`Voice set to ${selected.name}. All narration will use it.`);
    setStockSel("");
  }, [stockSel, stockVoices]);

  return {
    cloneVoiceId,
    setCloneVoiceId,
    cloneName,
    setCloneName,
    cloneBusy,
    setCloneBusy,
    cloneError,
    setCloneError,
    cloneNote,
    setCloneNote,
    sampleRecState,
    setSampleRecState,
    sampleUrl,
    setSampleUrl,
    sampleBlob,
    setSampleBlob,
    sampleElapsed,
    setSampleElapsed,
    sampleMics,
    setSampleMics,
    sampleMicId,
    setSampleMicId,
    stockVoices,
    setStockVoices,
    stockLoading,
    setStockLoading,
    stockSel,
    setStockSel,
    sampleSaved,
    setSampleSaved,
    sampleRecRef,
    sampleStreamRef,
    sampleIntervalRef,
    sampleStartRef,
    cloneFileRef,
    enumerateSampleMics,
    handleStartRecording,
    handleStopRecording,
    handleDiscardSample,
    handleCreateCloneFromSample,
    handleCreateClone,
    handleLoadStockVoices,
    handleUseStockVoice,
  };
}
