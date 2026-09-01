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
  // AC5: whether the CURRENT screen stream's display track actually carries
  // audio. undefined = unknown (no screen stream yet, or the caller has not
  // wired this) - in that case the checkbox stays enabled, since disabling it
  // by default would contradict "default on". false = confirmed no display
  // audio track on this stream, so the checkbox renders disabled and unchecked
  // with the reason attached via aria-describedby, per AC5's third row.
  // This is a genuine cross-agent seam this file's contract does not name:
  // Agent E must source it from Agent A's useRecorder (alongside the already-
  // named screenAudioNotice) and pass it through here.
  hasDisplayAudioTrack?: boolean;
  // S1 fix: the disabled-checkbox hint used to hard-code AC5's THIRD row
  // ("This browser does not share system audio.") for every
  // hasDisplayAudioTrack === false case, but useRecorder.ts correctly
  // distinguishes that from the SECOND row ("System audio was not shared...")
  // via browserMayOfferDisplayAudio(). On Chrome/Windows sharing a window,
  // the stage said one thing and this panel said the other, simultaneously,
  // with the false one attached to the checkbox via aria-describedby. Passing
  // the real notice down and rendering it verbatim removes the second,
  // possibly-contradictory copy of the string.
  screenAudioNotice?: string | null;
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
  hasDisplayAudioTrack,
  screenAudioNotice,
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
    shareSystemAudio,
    setShareSystemAudio,
  } = settings;

  const { bgMode, setBgMode, bgStatus } = bg;
  const {
    pipEnabled,
    setPipEnabled,
    pipCorner,
    setPipCorner,
    bubbleShape,
    setBubbleShape,
    bubbleSize,
    setBubbleSize,
  } = pip;
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

  const screenAudioDisabled = hasDisplayAudioTrack === false;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Source &amp; devices</h2>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
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

        {/* AC27: a source decision, not an option - shown in the main row so
            it is seen before Share, not buried in the collapsed disclosure. */}
        {source === "screen" && (
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={screenAudioDisabled ? false : shareSystemAudio}
                onChange={(e) => setShareSystemAudio(e.target.checked)}
                disabled={screenAudioDisabled}
                aria-describedby={screenAudioDisabled ? "screen-audio-disabled-hint" : undefined}
              />
            }
            label="Share system audio"
          />
        )}

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
      {source === "screen" && screenAudioDisabled && (
        <p id="screen-audio-disabled-hint" className={styles.fieldHint} style={{ margin: "var(--space-1) 0 0" }}>
          {/* S1 fix: render the real reason useRecorder.ts computed
              (screenAudioNotice), rather than restating a hard-coded string
              that only ever matches AC5's THIRD row. That fixed string was
              wrong whenever the true reason was the SECOND row ("offered,
              none granted" - e.g. Chrome/Windows sharing a window), which
              produced two contradictory system-audio messages on screen at
              once. Falls back to the same third-row copy only if the caller
              has not wired screenAudioNotice through yet. */}
          {screenAudioNotice ?? "This browser does not share system audio. Your microphone is still being recorded."}
        </p>
      )}
      {devices.cameras.length > 0 && (
        <p className={styles.fieldHint} style={{ margin: "var(--space-2) 0 0" }}>
          {devices.cameras.length} camera{devices.cameras.length === 1 ? "" : "s"}, {devices.mics.length} mic{devices.mics.length === 1 ? "" : "s"} detected
          {cameraId
            ? ` - using: ${devices.cameras.find((d) => d.deviceId === cameraId)?.label ?? "previous camera (reselect)"}`
            : " - no camera selected yet"}
        </p>
      )}
      {(devices.cameras.length === 0 || devices.mics.length === 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Cameras and microphones appear here after the browser grants access.
          </p>
          <Button variant="outlined" size="small" onClick={() => void requestAccess()}>
            Grant access
          </Button>
        </div>
      )}

      {/* AC27: the headline feature gets its own always-visible group, not
          hidden behind a disclosure the user has to know to open. */}
      {source === "screen" && (
        <div role="group" aria-label="Webcam bubble" className={styles.field} style={{ marginTop: "var(--space-3)" }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={pipEnabled}
                onChange={(e) => setPipEnabled(e.target.checked)}
                size="small"
              />
            }
            label="Webcam bubble"
          />
          {pipEnabled && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <TextField
                select
                label="Bubble shape"
                value={bubbleShape}
                onChange={(e) => setBubbleShape(e.target.value as "circle" | "rounded")}
                size="small"
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="circle">Circle</MenuItem>
                <MenuItem value="rounded">Rounded square</MenuItem>
              </TextField>
              <TextField
                select
                label="Bubble size"
                value={bubbleSize}
                onChange={(e) => setBubbleSize(e.target.value as "sm" | "md" | "lg")}
                size="small"
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="sm">Small</MenuItem>
                <MenuItem value="md">Medium</MenuItem>
                <MenuItem value="lg">Large</MenuItem>
              </TextField>
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
            </div>
          )}
        </div>
      )}

      <details className={styles.adaptDisclosure} style={{ marginTop: "var(--space-1)" }}>
        <summary>Recording options</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <label className={styles.adaptPanelSubtitle} style={{ display: "block" }}>Audio processing</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
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
          </div>

          <label className={styles.adaptPanelSubtitle} style={{ display: "block", marginTop: "var(--space-4)" }}>Timing</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
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
          </div>

          <label className={styles.adaptPanelSubtitle} style={{ display: "block", marginTop: "var(--space-4)" }}>Appearance</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
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
          </div>
          {bgStatus === "loading" && <span className={styles.ghMeta} role="status" aria-live="polite">Loading background model…</span>}
          {bgStatus === "failed" && <span className={styles.ghMeta} style={{ color: "var(--warning)" }}>Background effects unavailable (model failed to load)</span>}
          {bgMode !== "none" && bgStatus === "ready" && <span className={styles.ghMeta}>Effect is applied to the recording; the preview stays raw.</span>}

          <div className={styles.field} style={{ marginTop: "var(--space-4)" }}>
            <label className={styles.adaptPanelSubtitle} style={{ display: "block", marginBottom: "var(--space-2)" }}>Backup</label>
            {!backupSupported() ? (
              <p className={styles.fieldHint}>Automatic backup needs Chrome or Edge (File System Access API). Takes can still be downloaded manually.</p>
            ) : backupDir ? (
              <>
                <span className={styles.ghMeta}>Backing up to: <strong>{backupDir.name}</strong></span>
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
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
                <p className={styles.fieldHint} style={{ marginTop: "var(--space-2)" }}>Every finished recording is automatically saved there.</p>
              </>
            )}
          </div>

          <div className={styles.field} style={{ marginTop: "var(--space-4)" }}>
            <label className={styles.adaptPanelSubtitle} style={{ display: "block", marginBottom: "var(--space-2)" }}>Cards</label>
            <FormControlLabel
              control={<Checkbox checked={cardsOn} onChange={(e) => setCardsOn(e.target.checked)} size="small" disabled={source === "audio"} />}
              label="Add title and closing cards"
            />
            {cardsOn && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
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
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
                    Background
                    <input
                      type="color"
                      value={cardBg}
                      onChange={(e) => setCardBg(e.target.value)}
                      style={{ width: 32, height: 28, border: "none", background: "transparent", cursor: "pointer" }}
                      aria-label="Card background color"
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
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
                <p className={styles.fieldHint} style={{ marginTop: "var(--space-2)" }}>Cards are added around your video: the title card records first (mic muted) and a notice on the preview counts down until your video starts; the closing card is appended after you press Stop.</p>
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
