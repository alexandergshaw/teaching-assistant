"use client";

// The live transcript pane (U4): appends final utterances, shows the
// in-progress interim text distinctly (dimmer + italic), auto-scrolls to the
// newest line but stops the moment the instructor scrolls up to read back -
// exactly the nextAutoScrollState rule from live-class-logic.ts, driven off
// the pane's own scroll events (both a real user scroll and this component's
// own programmatic scroll-to-bottom fire the same event, and both are
// handled identically by that rule).

import { useEffect, useRef, useState } from "react";
import styles from "../../page.module.css";
import { nextAutoScrollState } from "./live-class-logic";
import { formatOffset } from "@/lib/live-class/session";
import type { LiveTranscriptEntry } from "./types";

interface TranscriptPanelProps {
  entries: LiveTranscriptEntry[];
}

export default function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setAutoScroll(
      nextAutoScrollState({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
    );
  };

  useEffect(() => {
    if (!autoScroll) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll]);

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Live transcript</h2>
        {!autoScroll && <span className={styles.fieldHint}>Auto-scroll paused - scroll to the bottom to resume.</span>}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          maxHeight: 320,
          overflowY: "auto",
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--field-border)",
          background: "var(--card-background)",
        }}
      >
        {entries.length === 0 ? (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Waiting for speech...
          </p>
        ) : (
          entries.map((entry) => (
            <p
              key={entry.id}
              style={{
                margin: "0 0 var(--space-2)",
                lineHeight: 1.5,
                color: entry.final ? "var(--text-primary)" : "var(--text-secondary)",
                fontStyle: entry.final ? "normal" : "italic",
              }}
            >
              <span className={styles.ghMetaMono} style={{ marginRight: "var(--space-2)", fontSize: "var(--font-size-xs)" }}>
                {formatOffset(entry.atMs)}
              </span>
              {entry.text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
