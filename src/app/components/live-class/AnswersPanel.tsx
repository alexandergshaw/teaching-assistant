"use client";

// The Q&A panel (U5): answers appear newest first, each showing the
// question, the answer, and a clear marker when the answer was NOT grounded
// in the course material. The instructor can dismiss an answer or ask a
// follow-up question typed by hand.
//
// The answer body is now a bulleted list (see buildAnswerPrompt in
// src/app/actions/live-class.ts), not one prose paragraph - renderAnswerBody
// below is a SMALL, dependency-free renderer: it groups consecutive "- "
// lines into a real <ul>, groups any other lines into a <p> (a model that
// ignores the bullet format still renders readably, never disappears), and
// never touches a markdown library or dangerouslySetInnerHTML. Resolved
// links (AnswerLink, from src/lib/live-class/links.ts - code-resolved from
// the model's named concepts, never emitted by the model itself) render
// underneath as small labeled anchors, visually distinguishing a visualizer
// link from a documentation link.

import { useState, type ReactNode } from "react";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { formatOffset } from "@/lib/live-class/session";
import type { LiveAnswerEntry, AnswerLink } from "./types";

const BULLET_LINE_RE = /^-\s+(.*)$/;

/** Split an answer's text into readable blocks: consecutive "- " lines
 * become one <ul>, consecutive non-bullet lines become one <p>. Blank lines
 * are dropped (they are only ever separators). Falls back to a single <p>
 * holding the raw text when there is nothing to render otherwise (an empty
 * answer, or one that is only blank lines). */
function renderAnswerBody(answer: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    const items = bulletBuffer;
    blocks.push(
      <ul key={`ul-${blocks.length}`} style={{ margin: "6px 0", paddingLeft: 20, lineHeight: 1.55, color: "var(--text-primary)" }}>
        {items.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ");
    blocks.push(
      <p key={`p-${blocks.length}`} style={{ margin: "6px 0", lineHeight: 1.55, color: "var(--text-primary)" }}>
        {text}
      </p>
    );
    paragraphBuffer = [];
  };

  for (const rawLine of (answer ?? "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const bulletMatch = line.match(BULLET_LINE_RE);
    if (bulletMatch) {
      flushParagraph();
      bulletBuffer.push(bulletMatch[1]);
    } else {
      flushBullets();
      paragraphBuffer.push(line);
    }
  }
  flushBullets();
  flushParagraph();

  if (blocks.length === 0) {
    blocks.push(
      <p key="p-empty" style={{ margin: "6px 0", lineHeight: 1.55, color: "var(--text-primary)" }}>
        {answer}
      </p>
    );
  }

  return blocks;
}

/** Resolved links, rendered as small labeled anchors below the bullets. Each
 * carries a "Visualizer"/"Docs" tag (reusing the existing ghBadge variants,
 * matching this panel's own visual language rather than introducing new
 * styling) so the two kinds are distinguishable at a glance. */
function AnswerLinksRow({ links }: { links: AnswerLink[] }) {
  if (!links || links.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "2px 0 6px" }}>
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--accent-ink)", textDecoration: "none" }}
        >
          <span className={`${styles.ghBadge} ${link.kind === "visualizer" ? styles.ghBadgeAccent : styles.ghBadgeNeutral}`}>
            {link.kind === "visualizer" ? "Visualizer" : "Docs"}
          </span>
          {link.label}
        </a>
      ))}
    </div>
  );
}

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
            {renderAnswerBody(entry.answer)}
            <AnswerLinksRow links={entry.links} />
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
