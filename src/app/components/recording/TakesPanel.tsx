"use client";

import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { fmt } from "./types";
import type { Take } from "./types";

interface TakesPanelProps {
  takes: Take[];
  takeNameDrafts: Record<string, string>;
  setTakeNameDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveTakeName: (take: Take) => void;
  handleDownload: (take: Take) => void;
  handleDelete: (id: string) => void;
  handleExtractAudio: (take: Take) => Promise<void>;
  extractingAudioId: string | null;
}

export default function TakesPanel({
  takes,
  takeNameDrafts,
  setTakeNameDrafts,
  saveTakeName,
  handleDownload,
  handleDelete,
  handleExtractAudio,
  extractingAudioId,
}: TakesPanelProps) {
  return (
    <div className={styles.ghPanel}>
      <h3 className={styles.adaptPanelTitle}>Takes</h3>
      {takes.length === 0 ? (
        <p className={styles.fieldHint}>No takes yet - record something.</p>
      ) : (
        takes.map((take) => (
          <div key={take.id} className={styles.ghRow}>
            <div className={styles.ghRowTop}>
              <div className={styles.ghRowTitle}>
                <TextField
                  size="small"
                  type="text"
                  className={styles.ccItemName}
                  title={take.name}
                  value={takeNameDrafts[take.id] ?? take.name}
                  onChange={(e) => setTakeNameDrafts((prev) => ({ ...prev, [take.id]: e.target.value }))}
                  onBlur={() => saveTakeName(take)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              </div>
              <div className={styles.ghActions}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => void handleDownload(take)}
                >
                  Download
                </Button>
                {!take.mimeType.startsWith("audio/") && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void handleExtractAudio(take)}
                    disabled={extractingAudioId !== null}
                  >
                    {extractingAudioId?.startsWith(take.id) ? `Audio... ${extractingAudioId.split("|")[1]}%` : "Audio only"}
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => void handleDelete(take.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
              <span className={styles.ghMeta}>
                {fmt(take.durationSec)} · {(take.sizeBytes / 1048576).toFixed(1)} MB · {new Date(take.createdAt).toLocaleString()}
              </span>
              {take.backup === "done" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Backed up</span>}
              {take.backup === "failed" && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Backup failed</span>}
              {take.backup === "pending" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Backing up...</span>}
              {take.dbSave === "done" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>In library</span>}
              {take.dbSave === "failed" && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Library save failed</span>}
              {take.dbSave === "pending" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Saving to library...</span>}
            </div>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "var(--accent-ink)", fontWeight: 600 }}>
                Play
              </summary>
              {take.mimeType.startsWith("audio/") ? (
                <audio
                  controls
                  src={take.url}
                  style={{
                    width: "100%",
                    marginTop: 8,
                  }}
                />
              ) : (
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
              )}
            </details>
          </div>
        ))
      )}
    </div>
  );
}
