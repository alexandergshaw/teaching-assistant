"use client";

import { useState, useEffect, useCallback } from "react";
import type { Device } from "./types";

export interface UseDevicesReturn {
  devices: { cameras: Device[]; mics: Device[] };
  loadDevices: () => Promise<void>;
  requestAccess: () => Promise<void>;
}

export function useDevices({
  setError,
}: {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): UseDevicesReturn {
  const [devices, setDevices] = useState<{ cameras: Device[]; mics: Device[] }>({
    cameras: [],
    mics: [],
  });

  const loadDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError("This browser exposes no media devices here. Camera and microphone need a secure context - use HTTPS or http://localhost, not a LAN IP address.");
        return;
      }
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      // Before the first permission grant, browsers return devices with EMPTY
      // deviceIds - useless (and identical) select options. Filter them out;
      // the list is re-enumerated with real ids after getUserMedia succeeds.
      const videoDevices = deviceList.filter((d) => d.kind === "videoinput" && d.deviceId);
      const audioDevices = deviceList.filter((d) => d.kind === "audioinput" && d.deviceId);

      const cameras = videoDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));

      const mics = audioDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));

      setDevices({ cameras, mics });
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
      setError(err instanceof Error ? `Could not list devices: ${err.message}` : "Could not list devices.");
    }
  }, [setError]);

  useEffect(() => {
    let cancelled = false;

    const initDevices = async () => {
      if (cancelled) return;
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setError("Camera and microphone are disabled on insecure pages. Open the app over HTTPS or at http://localhost - browsers block media devices on plain-HTTP addresses (e.g. a LAN IP).");
        return;
      }
      if (!navigator.mediaDevices) {
        setError("This browser does not expose camera/microphone APIs on this page (no navigator.mediaDevices). Use HTTPS or localhost in a modern browser.");
        return;
      }
      await loadDevices();
    };

    initDevices();

    const handleDeviceChange = () => {
      if (!cancelled) loadDevices();
    };

    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [loadDevices, setError]);

  // Ask for camera+mic permission once (falling back to mic-only), purely to
  // unlock device names/ids in the pickers; the probe stream is stopped at once.
  const requestAccess = async () => {
    try {
      setError(null);
      let probe: MediaStream;
      try {
        probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      probe.getTracks().forEach((t) => t.stop());
      await loadDevices();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Access was blocked. Click the camera icon in the address bar (or the browser's site settings) and allow camera and microphone, then try again."
          : name === "NotFoundError"
            ? "The operating system reports no camera or microphone. Check that devices are connected and not disabled in OS privacy settings."
            : name === "NotReadableError"
              ? "A camera or microphone is in use by another application. Close it and try again."
              : "Could not get camera/microphone access. Use HTTPS or localhost and check the browser's site permissions."
      );
    }
  };

  return { devices, loadDevices, requestAccess };
}
