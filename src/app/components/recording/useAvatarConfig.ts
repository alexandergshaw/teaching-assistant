"use client";

import { useEffect, useState } from "react";
import { avatarStudioConfiguredAction } from "@/app/actions";

function readPersisted(key: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) ?? "";
}

export interface UseAvatarConfigReturn {
  configured: boolean | null;
  cameraId: string;
  setCameraId: (value: string) => void;
  micId: string;
  setMicId: (value: string) => void;
}

/**
 * Configuration gating (F5) and this view's own camera/mic device
 * SELECTION (F1) - split out of useAvatarStudio.ts, which composes this
 * alongside the other avatar-studio concerns. See useAvatarStudio.ts's
 * UseAvatarStudioReturn for the full contract these fields are part of.
 */
export function useAvatarConfig(): UseAvatarConfigReturn {
  // ---- configuration gating ------------------------------------------------
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await avatarStudioConfiguredAction();
      if (!cancelled) setConfigured(r.configured);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- device selection ------------------------------------------------
  // Deliberately separate state from the Record view's settings.cameraId /
  // settings.micId (and their own persisted keys). That state also feeds
  // useRecorder.ts's live-preview effect, so sharing it here meant picking a
  // device in this view silently started the hidden Record view's camera or
  // microphone too - this hook only ever reads the device LIST from the
  // useDevices instance in RecordingTab.tsx, never its selection.
  const [cameraId, setCameraId] = useState<string>(() => readPersisted("ta-rec-avatar-camera"));
  const [micId, setMicId] = useState<string>(() => readPersisted("ta-rec-avatar-mic"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-camera", cameraId);
  }, [cameraId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-mic", micId);
  }, [micId]);

  return { configured, cameraId, setCameraId, micId, setMicId };
}
