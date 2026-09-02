"use client";

import { useEffect, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import controls from "./RecordingControls.module.css";
import type { UseLectureScriptReturn } from "./useLectureScript";

// docs/recording-controls-ux-acceptance-criteria.md CC10: this disclosure's
// open state persists under this exact key, mirroring SourceDevicesPanel's
// "Recording options" treatment. Read in a MOUNT EFFECT (setState after an
// await), never in the useState initializer - an initializer-seeded `open`
// never showed on reload because React only warns on the hydration
// mismatch (section 11 of that document). Guarded by typeof window and
// try/catch (a blocked-storage throw here white-screens the app per
// REGRESSION 382); written with localStorage.setItem on the <details>
// onToggle event only.
const SCRIPT_OPEN_KEY = "ta-rec-script-open";

function readScriptOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SCRIPT_OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

export default function LectureScriptPanel({
  scriptTopic,
  setScriptTopic,
  scriptObjectives,
  setScriptObjectives,
  scriptMinutes,
  setScriptMinutes,
  script,
  setScript,
  scriptBusy,
  scriptError,
  prompterOn,
  setPrompterOn,
  prompterSize,
  setPrompterSize,
  handleGenerateScript,
}: UseLectureScriptReturn) {
  // REGRESSION FIX (group R, hydration): reading localStorage inside the
  // useState initializer made the server (and the client's first render,
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
  // separate effect keyed on open - an effect there would also fire for this
  // mount-triggered read and briefly overwrite the persisted "true" with
  // "false" before the read's setState lands.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setOpen(readScriptOpen());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <details
      className={styles.adaptDisclosure}
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
        try {
          localStorage.setItem(SCRIPT_OPEN_KEY, String(next));
        } catch {
          // Blocked storage - the open state simply does not persist this
          // session; never throw through the render path.
        }
      }}
    >
      <summary>Lecture script and teleprompter</summary>
      <div className={styles.adaptDisclosureBody}>
        <p className={styles.adaptPanelSubtitle}>Draft a teleprompter-ready script with AI, edit it, then read it while you record.</p>
        <div className={styles.adaptRow}>
          <TextField
            label="Topic"
            value={scriptTopic}
            onChange={(e) => setScriptTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !(scriptBusy || !scriptTopic.trim())) {
                e.preventDefault();
                void handleGenerateScript();
              }
            }}
            size="small"
            className={controls.fieldGrow}
          />
          <TextField
            select
            label="Length"
            value={scriptMinutes}
            onChange={(e) => setScriptMinutes(e.target.value as "2" | "5" | "10" | "15")}
            size="small"
            className={controls.fieldXs}
          >
            <MenuItem value="2">2 min</MenuItem>
            <MenuItem value="5">5 min</MenuItem>
            <MenuItem value="10">10 min</MenuItem>
            <MenuItem value="15">15 min</MenuItem>
          </TextField>
          {/* CC1: "Generate script" inside the script disclosure is outlined -
              it is never this screen's sole primary (that is Start
              preview/Record/Stop/Resume on the Stage). */}
          <Button
            variant="outlined"
            size="small"
            disabled={scriptBusy || !scriptTopic.trim()}
            loading={scriptBusy}
            loadingPosition="start"
            onClick={() => void handleGenerateScript()}
          >
            {scriptBusy ? "Writing…" : script ? "Regenerate" : "Generate script"}
          </Button>
        </div>
        <TextField
          label="Objectives / notes (optional)"
          value={scriptObjectives}
          onChange={(e) => setScriptObjectives(e.target.value)}
          multiline
          minRows={2}
          fullWidth
          size="small"
        />
        {scriptError && (
          <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>{scriptError}</p>
        )}
        {script && (
          <>
            <TextField
              label="Script"
              multiline
              minRows={6}
              fullWidth
              value={script}
              onChange={(e) => setScript(e.target.value)}
              size="small"
            />
            <div className={styles.ghActions}>
              <span className={styles.ghMeta}>{script.trim().split(/\s+/).length} words · ~{Math.max(1, Math.round(script.trim().split(/\s+/).length / 140))} min at speaking pace</span>
              <Button
                variant="text"
                size="small"
                onClick={() => void navigator.clipboard.writeText(script)}
              >
                Copy
              </Button>
              {/* CC4: a single two-state control (on/off) is NOT a
                  SegmentedToggle - one MUI Button with a stable label. A
                  pressed toggle does not wear the primary fill (AM11's
                  selected treatment): outlined always, with controls.pressed
                  carrying the selected look. */}
              <Button
                variant="outlined"
                size="small"
                aria-pressed={prompterOn}
                className={prompterOn ? controls.pressed : undefined}
                onClick={() => setPrompterOn((v) => !v)}
              >
                Teleprompter
              </Button>
            </div>
            {/* CC3: a row holds fields OR buttons, never both - the Text
                size select is a field and gets its own .adaptRow under the
                Copy/Teleprompter button row. */}
            {prompterOn && (
              <div className={styles.adaptRow}>
                <TextField
                  select
                  size="small"
                  label="Text size"
                  value={prompterSize}
                  onChange={(e) => setPrompterSize(e.target.value as "sm" | "md" | "lg")}
                  className={controls.fieldXs}
                >
                  <MenuItem value="sm">Small</MenuItem>
                  <MenuItem value="md">Medium</MenuItem>
                  <MenuItem value="lg">Large</MenuItem>
                </TextField>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
