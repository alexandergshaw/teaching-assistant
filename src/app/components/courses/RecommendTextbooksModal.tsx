"use client";

// F1: "Recommend textbooks" - opened from the course row's Description cell
// (the button and wiring live in CourseRow.tsx, a later wave; this file only
// owns the modal itself).
//
// A1-A4: built on MUI `Dialog` (already imported and used elsewhere in this
// feature - CoursesTable.tsx's copy-confirmation dialog) rather than a
// hand-rolled `<section role="dialog" aria-modal="true">`. A hand-rolled
// `aria-modal="true"` tells assistive tech the rest of the page is inert
// while Tab still walks straight out into the table behind the backdrop -
// the AT's model and the keyboard's behavior diverge. Dialog is built on
// Modal (Dialog.js -> Modal.js), and Modal always wraps its content in
// Unstable_TrapFocus (disableAutoFocus/disableEnforceFocus/
// disableRestoreFocus all default to `false`), so it supplies, for free:
// focus lands inside the dialog on open, Tab cycles within it, Escape
// closes it, and focus returns to the launching cell button on close. It
// also auto-wires `aria-labelledby` from `<DialogTitle>` via DialogContext
// (Dialog.js/DialogTitle.js) - verified against @mui/material 9.0.1 source
// under node_modules/@mui/material.
import { useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { recommendTextbooksAction } from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { formatTextbookValue, type TextbookRecommendation } from "@/lib/textbook-recommendations";
import type { Source } from "@/lib/llm";
import type { Course } from "@/lib/supabase/courses";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface RecommendTextbooksModalProps {
  course: Course;
  onSaveTextbook: (value: string) => Promise<boolean>;
  onClose: () => void;
}

/** Meta line under a result's title: only the fields that are actually present. */
function metaLine(rec: TextbookRecommendation): string {
  return [
    rec.edition && `Edition: ${rec.edition}`,
    rec.isbn && `ISBN: ${rec.isbn}`,
    rec.publisher && `Publisher: ${rec.publisher}`,
    rec.year && `Year: ${rec.year}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function RecommendTextbooksModal({ course, onSaveTextbook, onClose }: RecommendTextbooksModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TextbookRecommendation[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndex, setSavedIndex] = useState<number | null>(null);

  const description = (course.description ?? "").trim();

  const search = async () => {
    if (!description || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setSavedIndex(null);
    const result = await recommendTextbooksAction(course.name, description, getStoredProvider());
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      setResults(null);
      setSources([]);
      return;
    }
    setResults(result.recommendations);
    setSources(result.sources);
    // B4: "the arrival of search results" has to reach the always-mounted
    // status region below like any other notice - when the action itself
    // gives no note, synthesize a short summary (found-count or "no
    // results") rather than leaving the live region silent on a fresh
    // search. Replaces the separate, non-live "no results" paragraph this
    // file used to render only when `!note`.
    if (result.note) {
      setNote(result.note);
    } else if (result.recommendations.length === 0) {
      setNote("No results were returned. Try again in a moment.");
    } else {
      setNote(`Found ${result.recommendations.length} textbook recommendation${result.recommendations.length === 1 ? "" : "s"}.`);
    }
  };

  const saveRecommendation = async (rec: TextbookRecommendation, index: number) => {
    setSavingIndex(index);
    setSavedIndex(null);
    setError(null);
    const ok = await onSaveTextbook(formatTextbookValue(rec));
    setSavingIndex(null);
    if (ok) {
      setSavedIndex(index);
    } else {
      setError(`Could not save "${rec.title}" to the textbook field.`);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      slotProps={{ paper: { className: styles.previewModal } }}
    >
      <div className={styles.previewHeader}>
        <div>
          <DialogTitle sx={{ padding: 0, fontSize: "var(--font-size-lg)", color: "var(--text-primary)", wordBreak: "break-word" }}>
            Recommend textbooks
          </DialogTitle>
          <p className={styles.previewMeta}>{course.name}</p>
        </div>
        <button type="button" className={styles.previewCloseButton} onClick={onClose}>
          Close
        </button>
      </div>

      <DialogContent sx={{ padding: "0 var(--space-4)", overflow: "auto", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }} role="status" aria-live="polite">
          <Button
            size="small"
            variant="contained"
            disabled={busy || !description}
            onClick={() => void search()}
            sx={{ textTransform: "none" }}
          >
            {results ? "Search again" : "Find Cengage MindTap textbooks"}
          </Button>
          {busy && (
            <>
              <CircularProgress size={18} />
              <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Searching…</span>
            </>
          )}
        </div>

        {/* AC3: says so plainly and keeps the search button disabled - a
            search is never run against an empty description. */}
        {!description && (
          <p className={`${styles.fieldHint} ${tableStyles.mt3}`}>
            This course has no description recorded yet. Add one before requesting textbook
            recommendations - the search is grounded in the course description.
          </p>
        )}

        {/* B4: always mounted (never conditional) so a screen reader
            registers these two regions before the first mutation and
            actually announces the arrival of an error, a notice, or search
            results - the same rule A5 applies to CoursesTable.tsx's own
            status regions. */}
        <p role="alert" className={`${styles.previewMeta} ${tableStyles.dangerText}`} style={{ margin: error ? "var(--space-3) 0 0" : 0 }}>
          {error ?? ""}
        </p>
        <p role="status" aria-live="polite" className={styles.fieldHint} style={{ margin: note ? "var(--space-3) 0 0" : 0 }}>
          {note ?? ""}
        </p>

        {description && (
          <>
            {results && results.length > 0 && (
              <ul
                className={tableStyles.stackMd}
                style={{
                  listStyle: "none",
                  margin: "var(--space-4) 0 0",
                  padding: 0,
                }}
              >
                {results.map((rec, index) => (
                  <li
                    key={`${rec.title}-${index}`}
                    style={{ border: "1px solid var(--field-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}>
                      <div>
                        <strong>{rec.title}</strong>
                        {rec.authors && <p className={styles.previewMeta}>{rec.authors}</p>}
                      </div>
                      {rec.unverified && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeWarning}`}>Link not corroborated</span>
                      )}
                    </div>

                    {metaLine(rec) && (
                      <p className={`${styles.previewMeta} ${tableStyles.mt2}`}>
                        {metaLine(rec)}
                      </p>
                    )}

                    {rec.whyItFits && <p className={tableStyles.mt2}>{rec.whyItFits}</p>}

                    {/* AC6: a fabricated/uncorroborated URL is never rendered as a
                        working link - only shown when applyUrlCorroboration kept it. */}
                    {!rec.unverified && rec.url && (
                      <p className={tableStyles.mt2} style={{ wordBreak: "break-word" }}>
                        <a href={rec.url} target="_blank" rel="noreferrer" className={styles.linkButton}>
                          {rec.url}
                        </a>
                      </p>
                    )}

                    <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={savingIndex === index}
                        onClick={() => void saveRecommendation(rec, index)}
                        sx={{ textTransform: "none" }}
                      >
                        Use this textbook
                      </Button>
                      {savingIndex === index && (
                        <>
                          <CircularProgress size={16} />
                          <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Saving…</span>
                        </>
                      )}
                      {savedIndex === index && (
                        <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Saved to Textbook</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {sources.length > 0 && (
              <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--field-border)", paddingTop: "var(--space-3)" }}>
                <p className={styles.fieldHint}>Grounding sources</p>
                <ul className={tableStyles.mt2} style={{ paddingLeft: "var(--space-4)" }}>
                  {sources.map((s, i) => (
                    <li key={`${s.uri}-${i}`}>
                      <a href={s.uri} target="_blank" rel="noreferrer" className={styles.linkButton}>
                        {s.title || s.uri}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
