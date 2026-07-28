"use client";

// The Q&A panel (U5): answers appear newest first, each showing the
// question, the answer, and a clear marker when the answer was NOT grounded
// in the course material. The instructor can dismiss an answer or ask a
// follow-up question typed by hand.

import { useState } from "react";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { formatOffset } from "@/lib/live-class/session";
import type { LiveAnswerEntry } from "./types";

interface AnswersPanelProps {
  answers: LiveAnswerEntry[];
  pendingCount: number;
  onDismiss: (id: string) => void;
  onAskFollowUp: (question: string) => void;
}

export default function AnswersPanel({ answers, pendingCount, onDismiss, onAskFollowUp }: AnswersPanelProps) {
  const [followUp, setFollowUp] = useState("");

  const submitFollowUp = () => {
    const text = followUp.trim();
    if (!text) return;
    onAskFollowUp(text);
    setFollowUp("");
  };

  return (
    <div className={styles.ghPanel}>
      <h3 className={styles.adaptPanelTitle}>
        Questions &amp; answers
        {pendingCount > 0 && (
          <span className={styles.ghMeta} style={{ marginLeft: 8, fontWeight: 400 }}>
            answering {pendingCount}...
          </span>
        )}
      </h3>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Ask a follow-up question..."
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitFollowUp();
            }
          }}
        />
        <Button variant="outlined" size="small" onClick={submitFollowUp} disabled={!followUp.trim()}>
          Ask
        </Button>
      </div>

      {answers.length === 0 ? (
        <p className={styles.fieldHint}>No questions answered yet - detected student questions will appear here.</p>
      ) : (
        answers.map((entry) => (
          <div key={entry.id} className={styles.ghRow}>
            <div className={styles.ghRowTop}>
              <div className={styles.ghRowTitle}>{entry.question}</div>
              <div className={styles.ghActions}>
                {!entry.grounded && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Not from course material</span>}
                <Button size="small" variant="text" onClick={() => onDismiss(entry.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
            <p style={{ margin: "6px 0", lineHeight: 1.55, color: "var(--text-primary)" }}>{entry.answer}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className={styles.ghMeta}>
                Asked {formatOffset(entry.askedAtMs)} - answered {formatOffset(entry.answeredAtMs)}
              </span>
              {entry.sources.length > 0 && <span className={styles.ghMeta}>Sources: {entry.sources.join(", ")}</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
