"use client";

// The "Ask AI" window opened from a course row: a question box answered
// against the facts the app already holds for that course.

import { useState } from "react";
import { Button, TextField, CircularProgress } from "@mui/material";
import { askAboutCourseAction } from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { renderCourseFacts } from "@/lib/course-facts";
import type { Course } from "@/lib/supabase/courses";
import styles from "../../page.module.css";

const SUGGESTIONS = [
  "What is this course missing before the term starts?",
  "Suggest three assessments that fit this schedule.",
  "Where is this schedule too heavy or too light?",
  "Draft a welcome announcement for this course.",
];

export default function AskAiModal({ course, onClose }: { course: Course; onClose: () => void }) {
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
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.previewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Ask AI about ${course.name}`}
        onClick={(e) => e.stopPropagation()}
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

        <div style={{ padding: "0 1rem" }}>
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
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem" }}>
            <Button
              size="small"
              variant="contained"
              disabled={busy || question.trim() === ""}
              onClick={() => void ask(question)}
              sx={{ textTransform: "none" }}
            >
              Ask
            </Button>
            {busy && <CircularProgress size={18} />}
          </div>
          {error && (
            <p className={styles.previewMeta} style={{ color: "var(--danger)", marginTop: "0.5rem" }}>
              {error}
            </p>
          )}
        </div>

        <div className={styles.previewContent} style={{ overflow: "auto" }}>
          {answer ? (
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: "0.9rem" }}>
              {answer}
            </pre>
          ) : (
            <p className={styles.previewMeta}>
              Answers are grounded in this course&apos;s own recorded facts - its schedule, dates,
              textbook, and description.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
