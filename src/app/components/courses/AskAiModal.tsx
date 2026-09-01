"use client";

// The "Ask AI" window opened from a course row: a question box answered
// against the facts the app already holds for that course.

import { useState, type RefObject } from "react";
import { Button, TextField, CircularProgress } from "@mui/material";
import { askAboutCourseAction } from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { renderCourseFacts } from "@/lib/course-facts";
import type { Course } from "@/lib/supabase/courses";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";
import { ModalShell } from "../ui/ModalShell";

const SUGGESTIONS = [
  "What is this course missing before the term starts?",
  "Suggest three assessments that fit this schedule.",
  "Where is this schedule too heavy or too light?",
  "Draft a welcome announcement for this course.",
];

export default function AskAiModal({
  course,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  course: Course;
  onClose: () => void;
  /** The opener to return focus to on close, forwarded to ModalShell. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setAnswer("");
    const result = await askAboutCourseAction(renderCourseFacts(course), trimmed, getStoredProvider());
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setAnswer(result.answer);
  };

  return (
    <ModalShell
      label={`Ask AI about ${course.name}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            <h3>Ask AI</h3>
            <p className={styles.previewMeta}>{course.name}</p>
          </div>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: "0 var(--space-4)" }}>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label="Question"
            placeholder="Ask anything about this course"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
          />
          <div className={`${tableStyles.rowSm} ${tableStyles.mt2}`}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={styles.linkButton}
                disabled={busy}
                onClick={() => {
                  setQuestion(s);
                  void ask(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            <Button
              size="small"
              variant="contained"
              disabled={busy || question.trim() === ""}
              onClick={() => void ask(question)}
              sx={{ textTransform: "none" }}
            >
              Ask
            </Button>
            {busy && (
              <>
                <CircularProgress size={18} />
                <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Asking...</span>
              </>
            )}
          </div>
          {error && (
            <p className={`${styles.previewMeta} ${tableStyles.dangerLink} ${tableStyles.mt2}`}>
              {error}
            </p>
          )}
        </div>

        <div className={styles.previewContent} style={{ overflow: "auto" }}>
          {answer ? (
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "var(--font-size-md)" }}>
              {answer}
            </pre>
          ) : (
            <p className={styles.previewMeta}>
              Answers are grounded in this course&apos;s own recorded facts - its schedule, dates,
              textbook, and description.
            </p>
          )}
        </div>
    </ModalShell>
  );
}
