"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Button, IconButton, ListItemText, Menu, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "./RecordingControls.module.css";
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
  registerMoreRef,
}: {
  take: Take;
  hideAudioOnly: boolean;
  busyReason: string | null;
  handleExtractAudio: (take: Take) => Promise<void>;
  handleDelete: (id: string) => void;
  registerMoreRef: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  // docs/recording-controls-ux-acceptance-criteria.md CC5: a plain boolean
  // arming state is correct here - the thing being confirmed (this take's
  // deletion) cannot change while the menu is open.
  const [armed, setArmed] = useState(false);
  const close = () => {
    setAnchorEl(null);
    setArmed(false);
  };

  const consequenceId = `take-delete-consequence-${take.id}`;
  // CC5: "This take is not saved anywhere else." only when neither backup
  // nor the library save reached "done"; otherwise a copy survives the
  // session and the softer line applies.
  const notSavedElsewhere = take.backup !== "done" && take.dbSave !== "done";
  const consequenceText = notSavedElsewhere
    ? "This take is not saved anywhere else."
    : "This removes the take from this session.";

  return (
    <>
      <IconButton
        ref={(el) => registerMoreRef(take.id, el)}
        size="small"
        aria-label={`More actions for ${take.name}`}
        title="More actions"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ padding: "var(--space-1)" }}
      >
        <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="3" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="11" r="1.2" fill="currentColor" />
        </svg>
      </IconButton>
      {/* REGRESSION FIX (group R): `disableRestoreFocus` was scoped to the
          WHOLE Menu, so it also disabled MUI's own restore for Escape,
          click-away, Audio only and the Cancel item - none of which unmount
          the anchor, so focus fell through to <body> on every close path
          except the one it was meant to cover. MUI's own restore is a no-op
          on a detached anchor (the delete path), so dropping the prop here
          costs nothing on that path and fixes every other one; the keyed-ref
          layout-effect focus in TakesPanel already retargets focus after a
          real delete. */}
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
        {/* CC5: one MenuItem element whose label swaps "Delete" ->
            "Confirm delete" in place (the GradingTableRow.tsx:143-147
            trick), so the item that is keyboard-focused when Enter arms it
            is the SAME item Enter then confirms on - two different
            MenuItems here would unmount the focused element mid-keypress. */}
        {!armed ? (
          <MenuItem dense onClick={() => setArmed(true)}>
            <ListItemText primary="Delete" />
          </MenuItem>
        ) : (
          <MenuItem
            dense
            aria-describedby={consequenceId}
            onClick={() => {
              setAnchorEl(null);
              setArmed(false);
              handleDelete(take.id);
            }}
          >
            <ListItemText
              primary="Confirm delete"
              secondary={<span id={consequenceId}>{consequenceText}</span>}
            />
          </MenuItem>
        )}
        {armed && (
          <MenuItem dense onClick={() => setArmed(false)}>
            <ListItemText primary="Cancel" />
          </MenuItem>
        )}
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
  // CC5 focus-after-removal: the keyed-ref-map idiom from
  // DiscussionRepliesPanel.tsx:476-503 - focus lands on the next take's More
  // button, else this panel's own container (TakesPanel already has
  // containerRef).
  const moreButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingFocusIdRef = useRef<string | null>(null);
  const pendingFocusFallbackRef = useRef(false);

  const registerMoreRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) moreButtonRefs.current.set(id, el);
    else moreButtonRefs.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const targetId = pendingFocusIdRef.current;
    const wantsFallback = pendingFocusFallbackRef.current;
    pendingFocusIdRef.current = null;
    pendingFocusFallbackRef.current = false;
    if (!targetId && !wantsFallback) return;
    const next = targetId ? moreButtonRefs.current.get(targetId) : null;
    if (next) next.focus();
    else containerRef?.current?.focus();
  });

  const handleDeleteWithFocus = useCallback(
    (id: string) => {
      const idx = takes.findIndex((t) => t.id === id);
      const fallback = takes[idx + 1] ?? takes[idx - 1] ?? null;
      if (fallback) {
        pendingFocusIdRef.current = fallback.id;
      } else {
        pendingFocusFallbackRef.current = true;
      }
      handleDelete(id);
    },
    [takes, handleDelete]
  );

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
                  className={controls.fieldGrow}
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
                {/* CC6: a button is never REMOVED while busy - these two stay
                    mounted and become disabled with the reason attached
                    (title), rather than swapped out for a bare text line. */}
                {!isAudio && (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={Boolean(busyReason)}
                    title={busyReason ?? undefined}
                    onClick={(e) => onTalkThrough(take, e.currentTarget)}
                  >
                    Talk through this
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  disabled={Boolean(busyReason)}
                  title={busyReason ?? undefined}
                  onClick={(e) => onDraftAnnouncement(take, e.currentTarget)}
                >
                  Draft announcement
                </Button>
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
                  handleDelete={handleDeleteWithFocus}
                  registerMoreRef={registerMoreRef}
                />
              </div>
            </div>
            {/* CC3: a row holds fields OR buttons, never both - the busy
                reason used to sit inline in the button row above; a
                disabled button's title is unreachable by keyboard, so this
                is a visible reason line of its own under the cluster,
                outside .ghRowTop rather than squeezed into its title/actions
                split. */}
            {busyReason && <p className={styles.fieldHint}>{busyReason}</p>}
            <div className={styles.ghActions}>
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
            {/* REGRESSION FIX (group R): this was a bare <details> with an
                inline-styled <summary>, the one disclosure on this surface
                not using the shared idiom its two siblings (Recording
                options, Lecture script) already use. */}
            <details className={styles.adaptDisclosure}>
              <summary>Play</summary>
              <div className={styles.adaptDisclosureBody}>
                {isAudio ? (
                  <audio controls className={controls.playerAudio} src={take.url} />
                ) : (
                  <video controls className={controls.playerVideo} src={take.url} />
                )}
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
