"use client";

import { useEffect, useState } from "react";
import { Button, TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import { backupSupported, clearBackupDir, pickBackupDir } from "@/lib/backup-dir";
import styles from "../../page.module.css";
import controls from "./RecordingControls.module.css";
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

// docs/recording-controls-ux-acceptance-criteria.md CC10: the "Recording
// options" <details> open state persists under this exact key. Read in a
// MOUNT EFFECT (setState after an await), never in the useState initializer:
// the server renders the <details> closed and React only warns on a boolean
// attribute mismatch at hydration, so an initializer-seeded `open` never
// showed on reload (section 11 of that document). The read is guarded by
// typeof window and try/catch (a blocked-storage throw here white-screens
// the app per REGRESSION 382); written with localStorage.setItem on the
// <details> onToggle event only.
const OPTIONS_OPEN_KEY = "ta-rec-options-open";

function readOptionsOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(OPTIONS_OPEN_KEY) === "true";
  } catch {
    return false;
  }
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

  // REGRESSION FIX (group R, hydration): reading localStorage inside the
  // useState initializer made the server (and the client's FIRST render,
  // before hydration) always compute `false`, while a returning instructor's
  // client had "true" persisted. React's hydrateBooleanAttribute only WARNS
  // on that <details open> mismatch - it does not correct the DOM attribute
  // to match the client value - so the persisted-open state silently failed
  // to show until the instructor toggled the disclosure once by hand.
  // Initialising to `false` on both server and client keeps the first paint
  // identical, then a mount effect reads the real value using this repo's
  // setState-in-effect idiom (async IIFE + cancelled flag, setState only
  // after an await) so eslint's setState-in-effect rule passes. The write
  // moves onto the <details> onToggle handler itself (below) instead of a
  // separate effect keyed on optionsOpen - an effect there would also fire
  // for this mount-triggered read and briefly overwrite the persisted
  // "true" with "false" before the read's setState lands.
  const [optionsOpen, setOptionsOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setOptionsOpen(readOptionsOpen());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Source and devices</h2>
      </div>

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Source</legend>
        <div className={styles.adaptRow}>
          <TextField
            select
            label="Source"
            value={source}
            onChange={(e) => { userPickedRef.current = true; setSource(e.target.value as "camera" | "screen" | "audio"); }}
            size="small"
            className={controls.fieldMd}
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
            className={controls.fieldMd}
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
            className={controls.fieldMd}
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
            className={controls.fieldMd}
            disabled={source !== "camera"}
          >
            <MenuItem value="720">720p</MenuItem>
            <MenuItem value="1080">1080p</MenuItem>
          </TextField>
        </div>
        {source === "screen" && screenAudioDisabled && (
          <p id="screen-audio-disabled-hint" className={styles.fieldHint}>
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
          <p className={styles.fieldHint}>
            {devices.cameras.length} camera{devices.cameras.length === 1 ? "" : "s"}, {devices.mics.length} mic{devices.mics.length === 1 ? "" : "s"} detected
            {cameraId
              ? ` - using: ${devices.cameras.find((d) => d.deviceId === cameraId)?.label ?? "previous camera (reselect)"}`
              : " - no camera selected yet"}
          </p>
        )}
        {(devices.cameras.length === 0 || devices.mics.length === 0) && (
          <div className={styles.ghActions}>
            <p className={styles.fieldHint}>
              Cameras and microphones appear here after the browser grants access.
            </p>
            <Button variant="outlined" size="small" onClick={() => void requestAccess()}>
              Grant access
            </Button>
          </div>
        )}
      </fieldset>

      {/* AC27: the headline feature gets its own always-visible group, not
          hidden behind a disclosure the user has to know to open. */}
      {source === "screen" && (
        <fieldset className={controls.section}>
          <legend className={controls.sectionLegend}>Webcam bubble</legend>
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
            <div className={styles.adaptRow}>
              <TextField
                select
                label="Bubble shape"
                value={bubbleShape}
                onChange={(e) => setBubbleShape(e.target.value as "circle" | "rounded")}
                size="small"
                className={controls.fieldSm}
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
                className={controls.fieldSm}
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
                className={controls.fieldSm}
              >
                <MenuItem value="br">Bottom right</MenuItem>
                <MenuItem value="bl">Bottom left</MenuItem>
                <MenuItem value="tr">Top right</MenuItem>
                <MenuItem value="tl">Top left</MenuItem>
              </TextField>
            </div>
          )}
        </fieldset>
      )}

      <details
        className={styles.adaptDisclosure}
        open={optionsOpen}
        onToggle={(e) => {
          const next = (e.currentTarget as HTMLDetailsElement).open;
          setOptionsOpen(next);
          try {
            localStorage.setItem(OPTIONS_OPEN_KEY, String(next));
          } catch {
            // Blocked storage (private mode, quota) - the open state simply
            // does not persist this session; never throw through the render
            // path.
          }
        }}
      >
        <summary>Recording options</summary>
        <div className={styles.adaptDisclosureBody}>
          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Audio processing</legend>
            <div className={styles.adaptRow}>
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
          </fieldset>

          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Timing</legend>
            <div className={styles.adaptRow}>
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
                className={controls.fieldXs}
              >
                <MenuItem value="0">Off</MenuItem>
                <MenuItem value="5">5 min</MenuItem>
                <MenuItem value="10">10 min</MenuItem>
                <MenuItem value="15">15 min</MenuItem>
                <MenuItem value="30">30 min</MenuItem>
              </TextField>
            </div>
          </fieldset>

          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Appearance</legend>
            <div className={styles.adaptRow}>
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
                className={controls.fieldSm}
                disabled={source !== "camera" || bgStatus === "failed"}
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="blur">Blur</MenuItem>
                <MenuItem value="image">Image</MenuItem>
              </TextField>
              {bgMode === "image" && (
                <Button variant="outlined" size="small" className={controls.fieldRowButton} onClick={() => bgFileRef.current?.click()}>
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
            {bgStatus === "failed" && <span className={styles.ghMeta} style={{ color: "var(--warning-ink)" }}>Background effects unavailable (model failed to load)</span>}
            {bgMode !== "none" && bgStatus === "ready" && <span className={styles.ghMeta}>Effect is applied to the recording; the preview stays raw.</span>}
          </fieldset>

          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Backup</legend>
            {!backupSupported() ? (
              <p className={styles.fieldHint}>Automatic backup needs Chrome or Edge (File System Access API). Takes can still be downloaded manually.</p>
            ) : backupDir ? (
              <>
                <span className={styles.ghMeta}>Backing up to: <strong>{backupDir.name}</strong></span>
                <div className={styles.ghActions}>
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
                <p className={styles.fieldHint}>Every finished recording is automatically saved there.</p>
              </>
            )}
          </fieldset>

          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Cards</legend>
            <FormControlLabel
              control={<Checkbox checked={cardsOn} onChange={(e) => setCardsOn(e.target.checked)} size="small" disabled={source === "audio"} />}
              label="Add title and closing cards"
            />
            {cardsOn && (
              <>
                <div className={styles.adaptRow}>
                  <TextField
                    label="Title"
                    value={cardTitle}
                    onChange={(e) => setCardTitle(e.target.value)}
                    size="small"
                    className={controls.fieldGrow}
                  />
                  <TextField
                    label="Subtitle"
                    value={cardSubtitle}
                    onChange={(e) => setCardSubtitle(e.target.value)}
                    size="small"
                    className={controls.fieldGrow}
                  />
                  <TextField
                    label="Closing line"
                    value={cardClosing}
                    onChange={(e) => setCardClosing(e.target.value)}
                    size="small"
                    className={controls.fieldGrow}
                  />
                  <TextField
                    select
                    label="Card length"
                    value={cardSeconds}
                    onChange={(e) => setCardSeconds(e.target.value as "2" | "3" | "5")}
                    size="small"
                    className={controls.fieldXs}
                  >
                    <MenuItem value="2">2 s</MenuItem>
                    <MenuItem value="3">3 s</MenuItem>
                    <MenuItem value="5">5 s</MenuItem>
                  </TextField>
                  <label className={styles.ghMeta}>
                    Background
                    <input
                      type="color"
                      value={cardBg}
                      onChange={(e) => setCardBg(e.target.value)}
                      style={{ width: 32, height: 28, marginLeft: "var(--space-1)", border: "none", background: "transparent", cursor: "pointer" }}
                      aria-label="Card background color"
                    />
                  </label>
                  <label className={styles.ghMeta}>
                    Text
                    <input
                      type="color"
                      value={cardText}
                      onChange={(e) => setCardText(e.target.value)}
                      style={{ width: 32, height: 28, marginLeft: "var(--space-1)", border: "none", background: "transparent", cursor: "pointer" }}
                      aria-label="Card text color"
                    />
                  </label>
                </div>
                <p className={styles.fieldHint}>Cards are added around your video: the title card records first (mic muted) and a notice on the preview counts down until your video starts; the closing card is appended after you press Stop.</p>
              </>
            )}
          </fieldset>
        </div>
      </details>
    </div>
  );
}
