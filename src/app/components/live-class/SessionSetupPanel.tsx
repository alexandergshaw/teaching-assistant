"use client";

// Pre-session setup (U2): a course tile picker, an optional module picker,
// and a mic picker (reusing useDevices, per C8), plus the transcription-path
// override (U6). Every control here is already persisted by
// useLiveClassSettings under its own "ta-live-*" keys.

import { Button, MenuItem, TextField } from "@mui/material";
import { floatingWindowSelectSlotProps } from "../ui/floating-window-menu";
import styles from "../../page.module.css";
import type { UseLiveClassSettingsReturn } from "./useLiveClassSettings";
import type { Device } from "../recording/types";
import type { TranscriptionOverride } from "./types";

interface SessionSetupPanelProps {
  settings: UseLiveClassSettingsReturn;
  mics: Device[];
  micError: string | null;
  requestMicAccess: () => Promise<void>;
  supportsWebSpeech: boolean;
  supportsSegmented: boolean;
  onStart: () => void;
  starting: boolean;
  startError: string | null;
}

export default function SessionSetupPanel({
  settings,
  mics,
  micError,
  requestMicAccess,
  supportsWebSpeech,
  supportsSegmented,
  onStart,
  starting,
  startError,
}: SessionSetupPanelProps) {
  const neitherPathSupported = !supportsWebSpeech && !supportsSegmented;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Session setup</h2>
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          Choose the course and (optionally) the module this class covers, then pick a microphone. These stay fixed
          for the whole session.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <TextField
          select
          slotProps={floatingWindowSelectSlotProps}
          label="Course"
          value={settings.courseId}
          onChange={(e) => settings.setCourseId(e.target.value)}
          size="small"
          sx={{ minWidth: 220 }}
        >
          {settings.courses === null ? (
            <MenuItem disabled>Loading courses…</MenuItem>
          ) : settings.courses.length > 0 ? (
            settings.courses.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled>No course tiles yet</MenuItem>
          )}
        </TextField>

        <TextField
          select
          slotProps={floatingWindowSelectSlotProps}
          label="Module (optional)"
          value={settings.moduleValue}
          onChange={(e) => settings.setModuleValue(e.target.value)}
          size="small"
          sx={{ minWidth: 220 }}
          disabled={!settings.courseId || !settings.modulesSupported}
        >
          <MenuItem value="">Whole course (no specific module)</MenuItem>
          {settings.moduleOptions.map((m) => (
            <MenuItem key={m.value} value={m.value}>
              {m.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          slotProps={floatingWindowSelectSlotProps}
          label="Microphone"
          value={settings.micId}
          onChange={(e) => settings.setMicId(e.target.value)}
          size="small"
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">System default</MenuItem>
          {mics.map((mic) => (
            <MenuItem key={mic.deviceId} value={mic.deviceId}>
              {mic.label}
            </MenuItem>
          ))}
        </TextField>
      </div>

      {settings.courseId && !settings.modulesSupported && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          This course tile has no live LMS connection, so no module list is available - the session will use
          course-level material instead.
        </p>
      )}
      {settings.moduleOptionsError && <p className={styles.error}>{settings.moduleOptionsError}</p>}
      {settings.coursesError && <p className={styles.error}>{settings.coursesError}</p>}

      {mics.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Microphones appear here after the browser grants access.
          </p>
          <Button variant="outlined" size="small" onClick={() => void requestMicAccess()}>
            Grant access
          </Button>
        </div>
      )}
      {micError && <p className={styles.error}>{micError}</p>}

      <details className={styles.adaptDisclosure}>
        <summary>Transcription</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <TextField
            select
            slotProps={floatingWindowSelectSlotProps}
            size="small"
            label="Transcription path"
            value={settings.transcriptionOverride}
            onChange={(e) => settings.setTranscriptionOverride(e.target.value as TranscriptionOverride)}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="auto">Automatic (Web Speech, falling back to audio segments)</MenuItem>
            <MenuItem value="web-speech" disabled={!supportsWebSpeech}>
              Web Speech only{!supportsWebSpeech ? " (not supported in this browser)" : ""}
            </MenuItem>
            <MenuItem value="segmented" disabled={!supportsSegmented}>
              Audio-segment fallback only{!supportsSegmented ? " (not supported in this browser)" : ""}
            </MenuItem>
          </TextField>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Web Speech (Chrome/Edge) transcribes with the lowest latency and uses the browser&apos;s default input
            device - it cannot target a specific microphone. The audio-segment fallback records from the
            microphone chosen above, in ~15 second clips, and works in any browser that supports MediaRecorder and
            AudioContext.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={settings.noiseSuppression}
                onChange={(e) => settings.setNoiseSuppression(e.target.checked)}
              />
              Noise suppression
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={settings.echoCancellation}
                onChange={(e) => settings.setEchoCancellation(e.target.checked)}
              />
              Echo cancellation
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={settings.autoGain}
                onChange={(e) => settings.setAutoGain(e.target.checked)}
              />
              Auto gain
            </label>
          </div>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            These default to off (unlike the Recording tab) - they are tuned for one presenter close to the mic and
            tend to suppress a student speaking from across the room. They only apply to the audio-segment
            fallback; Web Speech controls its own capture.
          </p>
        </div>
      </details>

      <details className={styles.adaptDisclosure}>
        <summary>Notifications</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.answerSound}
              onChange={(e) => settings.setAnswerSound(e.target.checked)}
            />
            Play a sound when a new answer arrives
          </label>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Off by default - a classroom is exactly where an unexpected noise is unwelcome. A short generated tone,
            never a sound file, and it never plays for an answer you already saw.
          </p>
        </div>
      </details>

      {neitherPathSupported && (
        <p className={styles.error}>
          This browser supports neither transcription path (no Web Speech API, and no MediaRecorder/AudioContext
          support). Live Class Mode needs Chrome or Edge.
        </p>
      )}
      {startError && <p className={styles.error}>{startError}</p>}

      <div className={styles.ghActions}>
        <Button
          variant="contained"
          onClick={onStart}
          disabled={starting || neitherPathSupported || !settings.courseId}
        >
          {starting ? "Starting…" : "Start live class"}
        </Button>
      </div>
    </div>
  );
}
