"use client";

import { useState } from "react";
import { Button, IconButton, ListItemText, Menu, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { fmt } from "./types";
import type { Take } from "./types";
import type { PostedAnnouncementInfo } from "./useTakeAnnouncement";

interface TakesPanelProps {
  takes: Take[];
  takeNameDrafts: Record<string, string>;
  setTakeNameDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveTakeName: (take: Take) => void;
  handleDownload: (take: Take) => void;
  handleDelete: (id: string) => void;
  handleExtractAudio: (take: Take) => Promise<void>;
  extractingAudioId: string | null;
  // AC15/AC26/AC28: the two new per-take actions. sourceEl is captured
  // synchronously from event.currentTarget at click time (never
  // document.activeElement, never after an await) so the caller can restore
  // focus there when the surface it opens is closed again.
  onTalkThrough: (take: Take, sourceEl: HTMLElement) => void;
  onDraftAnnouncement: (take: Take, sourceEl: HTMLElement) => void;
  // AC15b: while a walkthrough capture, an audio extraction, or an
  // announcement draft is running (on ANY take), the other long-running
  // per-take actions are disabled on every row, not just the busy one - the
  // recorder and the transcription queue are singletons. Carries the reason
  // (null when nothing is busy), per this repo's disabled-control precedent
  // (GeneratedPostSection AC 12b): a blocked control states why rather than
  // just greying out.
  busyReason: string | null;
  postedByTakeId: Record<string, PostedAnnouncementInfo>;
  // AC28/modal-focus-restoration Decision 5: this panel outlives any single
  // row, so it is the fallback focus-restoration target when the row that
  // opened a surface no longer exists (e.g. the take was deleted while its
  // pane was open).
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function TakeOverflowMenu({
  take,
  hideAudioOnly,
  busyReason,
  handleExtractAudio,
  handleDelete,
}: {
  take: Take;
  hideAudioOnly: boolean;
  busyReason: string | null;
  handleExtractAudio: (take: Take) => Promise<void>;
  handleDelete: (id: string) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = () => setAnchorEl(null);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`More actions for ${take.name}`}
        title="More actions"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ padding: "var(--space-1)", color: "var(--text-secondary)" }}
      >
        <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="3" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="11" r="1.2" fill="currentColor" />
        </svg>
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        {!hideAudioOnly && (
          <MenuItem
            dense
            disabled={busyReason !== null}
            onClick={() => {
              close();
              void handleExtractAudio(take);
            }}
          >
            <ListItemText primary="Audio only" secondary={busyReason ?? undefined} />
          </MenuItem>
        )}
        <MenuItem
          dense
          onClick={() => {
            close();
            handleDelete(take.id);
          }}
        >
          <ListItemText primary="Delete" />
        </MenuItem>
      </Menu>
    </>
  );
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
  onTalkThrough,
  onDraftAnnouncement,
  busyReason,
  postedByTakeId,
  containerRef,
}: TakesPanelProps) {
  return (
    <div className={styles.ghPanel} ref={containerRef} tabIndex={-1}>
      <h3 className={styles.adaptPanelTitle}>Takes</h3>
      {takes.length === 0 ? (
        <p className={styles.fieldHint}>No takes yet - record something.</p>
      ) : (
        <p className={styles.fieldHint}>
          Takes are kept for this session only - download them or use them before you reload.
        </p>
      )}
      {takes.map((take) => {
        const isAudio = take.mimeType.startsWith("audio/");
        const posted = postedByTakeId[take.id];
        const extractingThis = extractingAudioId?.startsWith(take.id) ?? false;
        return (
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
                {/* AC15b/GeneratedPostSection AC 12b precedent: while another
                    take's pipeline is running, these two actions are
                    replaced by the reason - not just greyed out - since the
                    recorder and the transcription queue are singletons and
                    a control that reads "disabled" with no explanation looks
                    broken rather than busy. */}
                {busyReason ? (
                  <span className={styles.ghMeta}>{busyReason}</span>
                ) : (
                  <>
                    {!isAudio && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => onTalkThrough(take, e.currentTarget)}
                      >
                        Talk through this
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => onDraftAnnouncement(take, e.currentTarget)}
                    >
                      Draft announcement
                    </Button>
                  </>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => void handleDownload(take)}
                >
                  Download
                </Button>
                <TakeOverflowMenu
                  take={take}
                  hideAudioOnly={isAudio}
                  busyReason={busyReason}
                  handleExtractAudio={handleExtractAudio}
                  handleDelete={handleDelete}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginTop: "var(--space-2)" }}>
              <span className={styles.ghMeta}>
                {fmt(take.durationSec)} · {(take.sizeBytes / 1048576).toFixed(1)} MB · {new Date(take.createdAt).toLocaleString()}
              </span>
              {take.sourceTakeName && (
                <span className={styles.ghMeta}>from: {take.sourceTakeName}</span>
              )}
              {extractingThis && (
                <span className={styles.ghMeta}>Extracting audio… {extractingAudioId?.split("|")[1]}%</span>
              )}
              {take.backup === "done" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Backed up</span>}
              {take.backup === "failed" && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Backup failed</span>}
              {take.backup === "pending" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Backing up…</span>}
              {take.dbSave === "done" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>In library</span>}
              {take.dbSave === "failed" && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Library save failed</span>}
              {take.dbSave === "pending" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Saving to library…</span>}
              {posted && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Announcement posted</span>}
            </div>
            <details style={{ marginTop: "var(--space-2)" }}>
              <summary style={{ cursor: "pointer", color: "var(--accent-ink)", fontWeight: 600 }}>
                Play
              </summary>
              {isAudio ? (
                <audio
                  controls
                  src={take.url}
                  style={{
                    width: "100%",
                    marginTop: "var(--space-2)",
                  }}
                />
              ) : (
                <video
                  controls
                  src={take.url}
                  style={{
                    maxWidth: "100%",
                    borderRadius: "var(--radius-sm)",
                    marginTop: "var(--space-2)",
                    // A video letterbox is not a themed surface - fixed
                    // dark-neutral (the brand navy) regardless of theme, per
                    // the aesthetics pass's capture-stage rule, rather than
                    // the raw #0f172a this carried before.
                    background: "var(--navy)",
                  }}
                />
              )}
            </details>
          </div>
        );
      })}
    </div>
  );
}
