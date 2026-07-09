"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import TabHeader from "./TabHeader";
import styles from "../page.module.css";

interface Device {
  deviceId: string;
  label: string;
}

interface Take {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  createdAt: number;
}

type RecState = "idle" | "recording" | "paused";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function RecordingTab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const elapsedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Config the current stream was opened with (see the restart effect).
  const appliedCfgRef = useRef("");
  // True once the user explicitly picked a device/source or started a preview,
  // so changing a select (re)starts the stream - but nothing auto-starts on
  // mount from persisted choices.
  const userPickedRef = useRef(false);

  const [devices, setDevices] = useState<{ cameras: Device[]; mics: Device[] }>({
    cameras: [],
    mics: [],
  });

  const [cameraId, setCameraId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-camera") ?? "";
  });

  const [micId, setMicId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-mic") ?? "";
  });

  const [resolution, setResolution] = useState<"720" | "1080">(() => {
    if (typeof window === "undefined") return "720";
    const saved = localStorage.getItem("ta-rec-res");
    return saved === "1080" ? "1080" : "720";
  });

  const [mirror, setMirror] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-mirror") === "1";
  });

  const [source, setSource] = useState<"camera" | "screen">("camera");
  const [recState, setRecState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [hasStream, setHasStream] = useState(false);
  // Whether the live stream carries an audio track (drives the meter hint).
  const [hasAudio, setHasAudio] = useState(true);

  const loadDevices = async () => {
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
  };

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
  }, []);

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

  const stopMeter = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const startMeter = useCallback((stream: MediaStream) => {
    stopMeter();
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const audioCtx =
        typeof window !== "undefined" && window.AudioContext
          ? new window.AudioContext()
          : typeof window !== "undefined" && (window as unknown as Record<string, unknown>).webkitAudioContext
            ? new ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)()
            : null;

      if (!audioCtx) {
        console.warn("AudioContext not supported");
        return;
      }

      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += (data[i] - 128) * (data[i] - 128);
        const rms = Math.sqrt(sum / data.length) / 128;
        // Raw RMS of speech is tiny; amplify so normal talking visibly moves the bar.
        setLevel(Math.min(rms * 4, 1));
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error("Failed to start level meter:", err);
    }
  }, []);

  const stopEverything = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject !== null) {
      videoRef.current.srcObject = null;
    }
    stopMeter();
    setRecState("idle");
    setHasStream(false);
  }, []);

  const startPreview = useCallback(async () => {
    try {
      setError(null);
      await stopEverything();

      let stream: MediaStream;

      if (source === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: cameraId ? { exact: cameraId } : undefined,
            width: { ideal: resolution === "1080" ? 1920 : 1280 },
            height: { ideal: resolution === "1080" ? 1080 : 720 },
          },
          audio: micId ? { deviceId: { exact: micId } } : true,
        });
      } else {
        const displayMediaDevices = navigator.mediaDevices as unknown as {
          getDisplayMedia: (constraints: { video: unknown; audio: unknown }) => Promise<MediaStream>;
        };
        stream = await displayMediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        if (micId) {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: micId } },
            });
            const audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack) {
              stream.addTrack(audioTrack);
            }
          } catch (err) {
            console.warn("Could not add selected mic to screen share:", err);
          }
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // Remember which config this stream was opened with, so the restart
      // effect only reacts to real device/resolution/source changes.
      appliedCfgRef.current = `${source}|${cameraId}|${micId}|${resolution}`;
      setHasAudio(stream.getAudioTracks().length > 0);
      setHasStream(true);

      await loadDevices();
      startMeter(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          void stopEverything();
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.includes("Permission denied")
            ? "Permission denied. Please enable camera/screen and microphone access in your browser settings (HTTPS required)."
            : `Failed to start preview: ${err.message}`
          : "Failed to start preview. Please check permissions and HTTPS.";
      setError(message);
      await stopEverything();
    }
  }, [cameraId, micId, resolution, source, stopEverything, startMeter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-camera", cameraId);
  }, [cameraId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-mic", micId);
  }, [micId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-res", resolution);
  }, [resolution]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-mirror", mirror ? "1" : "0");
  }, [mirror]);

  // (Re)start the preview whenever the user picks a device, source, or
  // resolution - including the first pick, so selecting a camera takes effect
  // immediately. Never fires from persisted choices on mount, and never
  // interrupts an active recording.
  useEffect(() => {
    const cfg = `${source}|${cameraId}|${micId}|${resolution}`;
    if (userPickedRef.current && recState === "idle" && appliedCfgRef.current !== cfg) {
      void startPreview();
    }
  }, [cameraId, micId, resolution, source, recState, startPreview]);

  useEffect(() => {
    if (recState !== "recording") {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [recState]);

  const pickMimeType = (): string => {
    const types = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  const startRecording = async () => {
    if (!streamRef.current) return;
    try {
      setError(null);
      chunksRef.current = [];
      setBytes(0);
      elapsedRef.current = 0;
      setElapsed(0);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType } : undefined
      );

      let recordedBytes = 0;

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) {
          chunksRef.current.push(evt.data);
          recordedBytes += evt.data.size;
          setBytes(recordedBytes);
        }
      };

      recorder.onstop = () => {
        const actualMimeType = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        const url = URL.createObjectURL(blob);
        setTakes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: `Take ${prev.length + 1}`,
            url,
            mimeType: actualMimeType,
            sizeBytes: blob.size,
            durationSec: elapsedRef.current,
            createdAt: Date.now(),
          },
        ]);
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecState("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start recording");
    }
  };

  const pauseRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.pause();
      setRecState("paused");
    }
  };

  const resumeRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "paused") {
      recorderRef.current.resume();
      setRecState("recording");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecState("idle");
  };

  const handleRename = (id: string) => {
    const take = takes.find((t) => t.id === id);
    if (!take) return;
    const newName = window.prompt("Rename take:", take.name);
    if (newName && newName.trim()) {
      setTakes((prev) =>
        prev.map((t) => (t.id === id ? { ...t, name: newName.trim() } : t))
      );
    }
  };

  const handleDownload = (take: Take) => {
    const ext = take.mimeType.includes("mp4") ? "mp4" : "webm";
    const safeName = take.name.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
    const a = document.createElement("a");
    a.href = take.url;
    a.download = `${safeName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = (id: string) => {
    setTakes((prev) => {
      const take = prev.find((t) => t.id === id);
      if (take) {
        URL.revokeObjectURL(take.url);
      }
      return prev.filter((t) => t.id !== id);
    });
  };

  // Unmount-only cleanup. Latest takes/stopEverything are read through refs so
  // this never re-runs (a deps-based cleanup would kill the stream and revoke
  // take URLs every time a take is added).
  const takesRef = useRef(takes);
  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);
  const stopEverythingRef = useRef(stopEverything);
  useEffect(() => {
    stopEverythingRef.current = stopEverything;
  }, [stopEverything]);
  useEffect(() => {
    return () => {
      void stopEverythingRef.current();
      takesRef.current.forEach((take) => {
        URL.revokeObjectURL(take.url);
      });
    };
  }, []);

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Recording"
        title="Record from a camera"
        subtitle="Record video from any attached camera or your screen, preview it live, and download the takes."
      />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <h2 className={styles.adaptPanelTitle}>Source &amp; devices</h2>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <TextField
            select
            label="Source"
            value={source}
            onChange={(e) => { userPickedRef.current = true; setSource(e.target.value as "camera" | "screen"); }}
            size="small"
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="camera">Camera</MenuItem>
            <MenuItem value="screen">Screen</MenuItem>
          </TextField>

          <TextField
            select
            label="Camera"
            value={cameraId}
            onChange={(e) => { userPickedRef.current = true; setCameraId(e.target.value); }}
            size="small"
            sx={{ minWidth: 160 }}
            disabled={source === "screen"}
          >
            {devices.cameras.length === 0 && <MenuItem value="">No cameras found</MenuItem>}
            {devices.cameras.length > 0 &&
              cameraId &&
              !devices.cameras.some((d) => d.deviceId === cameraId) && (
                <MenuItem value={cameraId}>(Disconnected)</MenuItem>
              )}
            {devices.cameras.map((cam) => (
              <MenuItem key={cam.deviceId} value={cam.deviceId}>
                {cam.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Microphone"
            value={micId}
            onChange={(e) => { userPickedRef.current = true; setMicId(e.target.value); }}
            size="small"
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">System default</MenuItem>
            {devices.mics.map((mic) => (
              <MenuItem key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Resolution"
            value={resolution}
            onChange={(e) => { userPickedRef.current = true; setResolution(e.target.value as "720" | "1080"); }}
            size="small"
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="720">720p</MenuItem>
            <MenuItem value="1080">1080p</MenuItem>
          </TextField>

          <FormControlLabel
            control={
              <Checkbox
                checked={mirror}
                onChange={(e) => setMirror(e.target.checked)}
                disabled={source === "screen"}
              />
            }
            label="Mirror preview"
          />
        </div>
        {(devices.cameras.length === 0 || devices.mics.length === 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Cameras and microphones appear here after the browser grants access.
            </p>
            <Button variant="outlined" size="small" onClick={() => void requestAccess()}>
              Grant access
            </Button>
          </div>
        )}
      </div>

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <h2 className={styles.adaptPanelTitle}>Stage</h2>
        </div>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            maxHeight: "48vh",
            background: "#0f172a",
            borderRadius: 12,
            transform: source === "camera" && mirror ? "scaleX(-1)" : undefined,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {recState !== "idle" && (
              <>
                <span className={styles.navBadge}>{recState === "recording" ? "REC" : "PAUSED"}</span>
                <span className={styles.ghMetaMono}>{fmt(elapsed)}</span>
                <span className={styles.ghMeta}>
                  {(bytes / 1048576).toFixed(1)} MB
                </span>
              </>
            )}
          </div>

          <span className={styles.ghMeta}>Mic level</span>
          <div
            title="Live microphone input level"
            style={{
              height: 8,
              background: "color-mix(in srgb, var(--field-border) 40%, transparent)",
              borderRadius: 999,
              width: 180,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(level * 100)}%`,
                height: "100%",
                background: "var(--success)",
                borderRadius: 999,
                transition: "width 0.05s ease",
              }}
            />
          </div>
          {hasStream && !hasAudio && (
            <span className={styles.ghMeta} style={{ color: "var(--warning)" }}>No mic on this stream</span>
          )}
          {!hasStream && <span className={styles.ghMeta}>Start the preview to test your mic</span>}
        </div>

        <div className={styles.ghActions}>
          {!hasStream ? (
            <Button variant="contained" onClick={() => { userPickedRef.current = true; void startPreview(); }}>
              Start preview
            </Button>
          ) : recState === "idle" ? (
            <>
              <Button variant="contained" onClick={startRecording}>
                Record
              </Button>
              <Button variant="text" onClick={stopEverything}>
                Stop preview
              </Button>
            </>
          ) : recState === "recording" ? (
            <>
              <Button variant="outlined" onClick={pauseRecording}>
                Pause
              </Button>
              <Button variant="contained" color="error" onClick={stopRecording}>
                Stop
              </Button>
            </>
          ) : (
            <>
              <Button variant="contained" onClick={resumeRecording}>
                Resume
              </Button>
              <Button variant="contained" color="error" onClick={stopRecording}>
                Stop
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={styles.ghPanel}>
        <h3 className={styles.adaptPanelTitle}>Takes</h3>
        {takes.length === 0 ? (
          <p className={styles.fieldHint}>No takes yet - record something.</p>
        ) : (
          takes.map((take) => (
            <div key={take.id} className={styles.ghRow}>
              <div className={styles.ghRowTop}>
                <div className={styles.ghRowTitle}>
                  <div className={styles.ghRowName}>{take.name}</div>
                </div>
                <div className={styles.ghActions}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => handleRename(take.id)}
                  >
                    Rename
                  </button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleDownload(take)}
                  >
                    Download
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => handleDelete(take.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <div className={styles.ghMeta}>
                {fmt(take.durationSec)} · {(take.sizeBytes / 1048576).toFixed(1)} MB · {new Date(take.createdAt).toLocaleString()}
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>
                  Play
                </summary>
                <video
                  controls
                  src={take.url}
                  style={{
                    maxWidth: "100%",
                    borderRadius: 8,
                    marginTop: 8,
                    background: "#0f172a",
                  }}
                />
              </details>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
