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
//
// D5/D8 - unread-answer alerting: this panel owns its OWN scroll region
// (mirroring TranscriptPanel's dedicated scroll box, but newest-first - see
// isAtTop's own comment in live-class-logic.ts for why the "at rest" edge is
// the TOP here, not the bottom). Every answer whose id is in
// `unreadAnswerIds` (useLiveClassSession's single source of truth) renders a
// small "New" marker; when the instructor has scrolled away from the top, a
// "jump to newest" affordance appears rather than yanking them back to it -
// the SAME suppression rule TranscriptPanel already applies to its own
// auto-scroll, just measured from the opposite edge. Every visibility
// change (a real scroll, the initial mount, or the explicit "jump" click)
// reports through the SAME onVisibilityChange callback into
// useLiveClassSession's single unread-tracking state - this panel never
// tracks "seen" on its own.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { formatOffset } from "@/lib/live-class/session";
import { isAtTop } from "./live-class-logic";
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
      <ul key={`ul-${blocks.length}`} style={{ margin: "var(--space-1) 0", paddingLeft: "var(--space-5)", lineHeight: 1.55, color: "var(--text-primary)" }}>
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
      <p key={`p-${blocks.length}`} style={{ margin: "var(--space-1) 0", lineHeight: 1.55, color: "var(--text-primary)" }}>
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
      <p key="p-empty" style={{ margin: "var(--space-1) 0", lineHeight: 1.55, color: "var(--text-primary)" }}>
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
    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", margin: "var(--space-1) 0 var(--space-1)" }}>
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-sm)", color: "var(--accent-ink)", textDecoration: "none" }}
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
  /** ids of answers the instructor has not yet seen - useLiveClassSession's
   * single unread source of truth. Drives each row's "New" marker and the
   * "jump to newest" affordance's count; never re-derived here. */
  unreadAnswerIds: string[];
  onDismiss: (id: string) => void;
  onAskFollowUp: (question: string) => void;
  /** Reported on every change to whether the newest answer (this panel's own
   * top edge, since answers render newest-first) is currently visible - on
   * mount, on every scroll, and on the "jump to newest" click. Feeds
   * useLiveClassSession's single unread-tracking state; this panel never
   * tracks "seen" on its own. */
  onVisibilityChange: (newestVisible: boolean) => void;
}

export default function AnswersPanel({
  answers,
  pendingCount,
  unreadAnswerIds,
  onDismiss,
  onAskFollowUp,
  onVisibilityChange,
}: AnswersPanelProps) {
  const [followUp, setFollowUp] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  // Whether the panel's own scroll is currently at the top (i.e. showing the
  // newest answer) - defaults true, matching a freshly mounted container's
  // actual scrollTop of 0. Purely local UI state (whether to show the "jump
  // to newest" affordance); the actual unread bookkeeping lives entirely in
  // useLiveClassSession, reached only through onVisibilityChange below.
  const [newestVisible, setNewestVisible] = useState(true);

  const reportVisibility = useCallback(
    (visible: boolean) => {
      setNewestVisible(visible);
      onVisibilityChange(visible);
    },
    [onVisibilityChange]
  );

  // A STABLE callback ref (via useCallback), not an inline arrow function -
  // an inline one is recreated (and therefore re-invoked by React) on every
  // render, which would re-report "visible" on every unrelated re-render
  // rather than only on an actual mount. This fires exactly once when the
  // container actually mounts, re-reporting the panel's real (at-rest, top)
  // starting position - the hook's own default (answersNewestVisibleRef
  // defaults true) is otherwise stale after the window was closed while
  // scrolled away and then reopened.
  const setContainerNode = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (el) reportVisibility(true);
    },
    [reportVisibility]
  );

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    reportVisibility(
      isAtTop({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
    );
  };

  // Auto-follow the top only while already there - never yank the
  // instructor away from an older answer they are reading. The same
  // suppression rule TranscriptPanel's own auto-scroll effect enforces,
  // just anchored to the opposite edge (isAtTop vs isAtBottom). This effect
  // never calls setState - it only ever mutates the DOM node's scrollTop.
  useEffect(() => {
    if (!newestVisible) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [answers, newestVisible]);

  const submitFollowUp = () => {
    const text = followUp.trim();
    if (!text) return;
    onAskFollowUp(text);
    setFollowUp("");
  };

  const jumpToNewest = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    reportVisibility(true);
  };

  return (
    <div className={styles.ghPanel}>
      <h3 className={styles.adaptPanelTitle}>
        Questions &amp; answers
        {pendingCount > 0 && (
          <span className={styles.ghMeta} style={{ marginLeft: "var(--space-2)", fontWeight: 400 }}>
            answering {pendingCount}…
          </span>
        )}
      </h3>

      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Ask a follow-up question…"
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

      {/* D5/D8 - shown only once the instructor has actually scrolled away
          from the newest answer AND at least one unseen answer is waiting;
          clicking jumps back to the top and reports that visibility change
          through the same single path every other visibility change uses. */}
      {!newestVisible && unreadAnswerIds.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outlined" size="small" onClick={jumpToNewest}>
            {unreadAnswerIds.length} new answer{unreadAnswerIds.length === 1 ? "" : "s"} - jump to newest
          </Button>
        </div>
      )}

      <div ref={setContainerNode} onScroll={handleScroll} style={{ maxHeight: 360, overflowY: "auto" }}>
        {answers.length === 0 ? (
          <p className={styles.fieldHint}>No questions answered yet - detected student questions will appear here.</p>
        ) : (
          answers.map((entry) => (
            <div key={entry.id} className={styles.ghRow}>
              <div className={styles.ghRowTop}>
                <div className={styles.ghRowTitle}>{entry.question}</div>
                <div className={styles.ghActions}>
                  {unreadAnswerIds.includes(entry.id) && (
                    <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>New</span>
                  )}
                  {!entry.grounded && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Not from course material</span>}
                  <Button size="small" variant="text" onClick={() => onDismiss(entry.id)}>
                    Dismiss
                  </Button>
                </div>
              </div>
              {renderAnswerBody(entry.answer)}
              <AnswerLinksRow links={entry.links} />
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
                <span className={styles.ghMeta}>
                  Asked {formatOffset(entry.askedAtMs)} - answered {formatOffset(entry.answeredAtMs)}
                </span>
                {entry.sources.length > 0 && <span className={styles.ghMeta}>Sources: {entry.sources.join(", ")}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
