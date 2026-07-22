"use client";

import { Button, TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import { backupSupported, clearBackupDir, pickBackupDir } from "@/lib/backup-dir";
import styles from "../../page.module.css";
import type { UseDevicesReturn } from "./useDevices";
import type { UseRecordingSettingsReturn } from "./useRecordingSettings";
import type { UseBackgroundEffectReturn } from "./useBackgroundEffect";
import type { UsePipWebcamReturn } from "./usePipWebcam";
import type { UseTitleCardsReturn } from "./useTitleCards";
import type { DirHandle } from "@/lib/backup-dir";

interface SourceDevicesPanelProps {
  devices: UseDevicesReturn["devices"];
  requestAccess: UseDevicesReturn["requestAccess"];
  settings: UseRecordingSettingsReturn;
  bg: UseBackgroundEffectReturn;
  pip: UsePipWebcamReturn;
  cards: UseTitleCardsReturn;
  backupDir: DirHandle | null;
  setBackupDir: (value: DirHandle | null) => void;
  userPickedRef: React.MutableRefObject<boolean>;
  bgImageRef: React.MutableRefObject<HTMLImageElement | null>;
  bgFileRef: React.RefObject<HTMLInputElement | null>;
}

export default function SourceDevicesPanel({
  devices,
  requestAccess,
  settings,
  bg,
  pip,
  cards,
  backupDir,
  setBackupDir,
  userPickedRef,
  bgImageRef,
  bgFileRef,
}: SourceDevicesPanelProps) {
  const {
    source,
    setSource,
    cameraId,
    setCameraId,
    micId,
    setMicId,
    resolution,
    setResolution,
    mirror,
    setMirror,
    noiseSuppression,
    setNoiseSuppression,
    echoCancellation,
    setEchoCancellation,
    autoGain,
    setAutoGain,
    useCountdown,
    setUseCountdown,
    autoStopMin,
    setAutoStopMin,
  } = settings;

  const { bgMode, setBgMode, bgStatus } = bg;
  const { pipEnabled, setPipEnabled, pipCorner, setPipCorner } = pip;
  const {
    cardsOn,
    setCardsOn,
    cardTitle,
    setCardTitle,
    cardSubtitle,
    setCardSubtitle,
    cardClosing,
    setCardClosing,
    cardSeconds,
    setCardSeconds,
    cardBg,
    setCardBg,
    cardText,
    setCardText,
  } = cards;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Source &amp; devices</h2>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <TextField
          select
          label="Source"
          value={source}
          onChange={(e) => { userPickedRef.current = true; setSource(e.target.value as "camera" | "screen" | "audio"); }}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="camera">Camera</MenuItem>
          <MenuItem value="screen">Screen</MenuItem>
          <MenuItem value="audio">Audio only (microphone)</MenuItem>
        </TextField>

        <TextField
          select
          label="Camera"
          value={cameraId}
          onChange={(e) => { userPickedRef.current = true; setCameraId(e.target.value); }}
          size="small"
          sx={{ minWidth: 160 }}
          disabled={source !== "camera"}
        >
          {devices.cameras.length === 0 && <MenuItem value="">No cameras found</MenuItem>}
          {devices.cameras.length > 0 &&
            cameraId &&
            !devices.cameras.some((d: { deviceId: string; label: string }) => d.deviceId === cameraId) && (
              <MenuItem value={cameraId}>(Disconnected)</MenuItem>
            )}
          {devices.cameras.map((cam: { deviceId: string; label: string }) => (
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
          <MenuItem value="off">No microphone (mute)</MenuItem>
          {devices.mics.map((mic: { deviceId: string; label: string }) => (
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
          disabled={source !== "camera"}
        >
          <MenuItem value="720">720p</MenuItem>
          <MenuItem value="1080">1080p</MenuItem>
        </TextField>
      </div>
      {devices.cameras.length > 0 && (
        <p className={styles.fieldHint} style={{ margin: "8px 0 0" }}>
          {devices.cameras.length} camera{devices.cameras.length === 1 ? "" : "s"}, {devices.mics.length} mic{devices.mics.length === 1 ? "" : "s"} detected
          {cameraId
            ? ` - using: ${devices.cameras.find((d) => d.deviceId === cameraId)?.label ?? "previous camera (reselect)"}`
            : " - no camera selected yet"}
        </p>
      )}
      {(devices.cameras.length === 0 || devices.mics.length === 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Cameras and microphones appear here after the browser grants access.
          </p>
          <Button variant="outlined" size="small" onClick={() => void requestAccess()}>
            Grant access
          </Button>
        </div>
      )}

      <details className={styles.adaptDisclosure} style={{ marginTop: 4 }}>
        <summary>Recording options</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={mirror}
                  onChange={(e) => setMirror(e.target.checked)}
                  disabled={source !== "camera"}
                  size="small"
                />
              }
              label="Mirror preview"
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={noiseSuppression} onChange={(e) => { userPickedRef.current = true; setNoiseSuppression(e.target.checked); }} />}
              label="Noise suppression"
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={echoCancellation} onChange={(e) => { userPickedRef.current = true; setEchoCancellation(e.target.checked); }} />}
              label="Echo cancellation"
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={autoGain} onChange={(e) => { userPickedRef.current = true; setAutoGain(e.target.checked); }} />}
              label="Auto gain"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={useCountdown}
                  onChange={(e) => setUseCountdown(e.target.checked)}
                  size="small"
                />
              }
              label="3-2-1 countdown"
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
            <TextField
              select
              size="small"
              label="Auto-stop"
              value={autoStopMin}
              onChange={(e) => setAutoStopMin(e.target.value as "0" | "5" | "10" | "15" | "30")}
              sx={{ minWidth: 110 }}
            >
              <MenuItem value="0">Off</MenuItem>
              <MenuItem value="5">5 min</MenuItem>
              <MenuItem value="10">10 min</MenuItem>
              <MenuItem value="15">15 min</MenuItem>
              <MenuItem value="30">30 min</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              label="Background"
              value={bgMode}
              onChange={(e) => setBgMode(e.target.value as "none" | "blur" | "image")}
              sx={{ minWidth: 140 }}
              disabled={source !== "camera" || bgStatus === "failed"}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="blur">Blur</MenuItem>
              <MenuItem value="image">Image</MenuItem>
            </TextField>
            {bgMode === "image" && (
              <Button variant="outlined" size="small" onClick={() => bgFileRef.current?.click()}>
                Choose image
              </Button>
            )}
            <input
              ref={bgFileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const img = new Image();
                img.onload = () => { bgImageRef.current = img; };
                img.src = URL.createObjectURL(f);
                e.target.value = "";
              }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={pipEnabled}
                  onChange={(e) => setPipEnabled(e.target.checked)}
                  disabled={source !== "screen"}
                  size="small"
                />
              }
              label="Webcam bubble"
            />
            {pipEnabled && source === "screen" && (
              <TextField
                select
                label="Bubble corner"
                value={pipCorner}
                onChange={(e) => setPipCorner(e.target.value as "br" | "bl" | "tr" | "tl")}
                size="small"
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="br">Bottom right</MenuItem>
                <MenuItem value="bl">Bottom left</MenuItem>
                <MenuItem value="tr">Top right</MenuItem>
                <MenuItem value="tl">Top left</MenuItem>
              </TextField>
            )}
          </div>
          {bgStatus === "loading" && <span className={styles.ghMeta}>Loading background model...</span>}
          {bgStatus === "failed" && <span className={styles.ghMeta} style={{ color: "var(--warning)" }}>Background effects unavailable (model failed to load)</span>}
          {bgMode !== "none" && bgStatus === "ready" && <span className={styles.ghMeta}>Effect is applied to the recording; the preview stays raw.</span>}

          <div className={styles.field} style={{ marginTop: 16 }}>
            <label className={styles.adaptPanelSubtitle} style={{ display: "block", marginBottom: 8 }}>Backup</label>
            {!backupSupported() ? (
              <p className={styles.fieldHint}>Automatic backup needs Chrome or Edge (File System Access API). Takes can still be downloaded manually.</p>
            ) : backupDir ? (
              <>
                <span className={styles.ghMeta}>Backing up to: <strong>{backupDir.name}</strong></span>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={async () => {
                      try {
                        const h = await pickBackupDir();
                        if (h) setBackupDir(h);
                      } catch {
                        // user cancelled
                      }
                    }}
                  >
                    Change
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={async () => {
                      await clearBackupDir();
                      setBackupDir(null);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    try {
                      const h = await pickBackupDir();
                      if (h) setBackupDir(h);
                    } catch {
                      // user cancelled
                    }
                  }}
                >
                  Choose backup folder
                </Button>
                <p className={styles.fieldHint} style={{ marginTop: 8 }}>Every finished recording is automatically saved there.</p>
              </>
            )}
          </div>

          <div className={styles.field} style={{ marginTop: 16 }}>
            <FormControlLabel
              control={<Checkbox checked={cardsOn} onChange={(e) => setCardsOn(e.target.checked)} size="small" disabled={source === "audio"} />}
              label="Add title and closing cards"
            />
            {cardsOn && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                  <TextField
                    label="Title"
                    value={cardTitle}
                    onChange={(e) => setCardTitle(e.target.value)}
                    size="small"
                    sx={{ flex: "1 1 200px" }}
                  />
                  <TextField
                    label="Subtitle"
                    value={cardSubtitle}
                    onChange={(e) => setCardSubtitle(e.target.value)}
                    size="small"
                    sx={{ flex: "1 1 200px" }}
                  />
                  <TextField
                    label="Closing line"
                    value={cardClosing}
                    onChange={(e) => setCardClosing(e.target.value)}
                    size="small"
                    sx={{ flex: "1 1 200px" }}
                  />
                  <TextField
                    select
                    label="Card length"
                    value={cardSeconds}
                    onChange={(e) => setCardSeconds(e.target.value as "2" | "3" | "5")}
                    size="small"
                    sx={{ minWidth: 110 }}
                  >
                    <MenuItem value="2">2 s</MenuItem>
                    <MenuItem value="3">3 s</MenuItem>
                    <MenuItem value="5">5 s</MenuItem>
                  </TextField>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Background
                    <input
                      type="color"
                      value={cardBg}
                      onChange={(e) => setCardBg(e.target.value)}
                      style={{ width: 32, height: 28, border: "none", background: "transparent", cursor: "pointer" }}
                      aria-label="Card background color"
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Text
                    <input
                      type="color"
                      value={cardText}
                      onChange={(e) => setCardText(e.target.value)}
                      style={{ width: 32, height: 28, border: "none", background: "transparent", cursor: "pointer" }}
                      aria-label="Card text color"
                    />
                  </label>
                </div>
                <p className={styles.fieldHint} style={{ marginTop: 8 }}>Cards are added around your video: the title card records first (mic muted) and a notice on the preview counts down until your video starts; the closing card is appended after you press Stop.</p>
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
