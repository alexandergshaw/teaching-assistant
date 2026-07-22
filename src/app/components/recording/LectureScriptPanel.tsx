"use client";

import { Button, TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import type { UseLectureScriptReturn } from "./useLectureScript";

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
  return (
    <details className={styles.adaptDisclosure}>
      <summary>Lecture script &amp; teleprompter</summary>
      <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
        <p className={styles.adaptPanelSubtitle} style={{ marginBottom: 12 }}>Draft a teleprompter-ready script with AI, edit it, then read it while you record.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
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
            sx={{ flex: "1 1 260px" }}
          />
          <TextField
            select
            label="Length"
            value={scriptMinutes}
            onChange={(e) => setScriptMinutes(e.target.value as "2" | "5" | "10" | "15")}
            size="small"
            sx={{ minWidth: 110 }}
          >
            <MenuItem value="2">2 min</MenuItem>
            <MenuItem value="5">5 min</MenuItem>
            <MenuItem value="10">10 min</MenuItem>
            <MenuItem value="15">15 min</MenuItem>
          </TextField>
          <Button
            variant="contained"
            size="small"
            disabled={scriptBusy || !scriptTopic.trim()}
            onClick={() => void handleGenerateScript()}
          >
            {scriptBusy ? "Writing..." : script ? "Regenerate" : "Generate script"}
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
          sx={{ marginBottom: 12 }}
        />
        {scriptError && <p className={styles.error}>{scriptError}</p>}
        {script && (
          <>
            <TextField
              multiline
              minRows={6}
              fullWidth
              value={script}
              onChange={(e) => setScript(e.target.value)}
              size="small"
              sx={{ marginBottom: 12 }}
            />
            <div className={styles.ghActions} style={{ alignItems: "center", marginBottom: 16 }}>
              <span className={styles.ghMeta}>{script.trim().split(/\s+/).length} words · ~{Math.max(1, Math.round(script.trim().split(/\s+/).length / 140))} min at speaking pace</span>
              <Button
                variant="text"
                size="small"
                onClick={() => void navigator.clipboard.writeText(script)}
              >
                Copy
              </Button>
              <Button
                variant={prompterOn ? "contained" : "outlined"}
                size="small"
                onClick={() => setPrompterOn((v) => !v)}
              >
                {prompterOn ? "Hide teleprompter" : "Teleprompter"}
              </Button>
              {prompterOn && (
                <TextField
                  select
                  size="small"
                  label="Text size"
                  value={prompterSize}
                  onChange={(e) => setPrompterSize(e.target.value as "sm" | "md" | "lg")}
                  sx={{ minWidth: 110 }}
                >
                  <MenuItem value="sm">Small</MenuItem>
                  <MenuItem value="md">Medium</MenuItem>
                  <MenuItem value="lg">Large</MenuItem>
                </TextField>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
