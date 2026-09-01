"use client";

import type { CSSProperties, RefObject } from "react";
import type { RunSpan } from "@/lib/office-edit";
import styles from "../page.module.css";
import { ModalShell } from "./ui/ModalShell";

export interface SyllabusPreviewPara {
  id: string;
  text: string;
  runs: RunSpan[];
  style: string;
}

// Direct run formatting -> inline styles for the read-only preview.
function runStyle(r: RunSpan): CSSProperties {
  return {
    fontWeight: r.bold ? 700 : undefined,
    fontStyle: r.italic ? "italic" : undefined,
    textDecoration: r.underline ? "underline" : undefined,
  };
}

// docx paragraph style id -> a preview class that mimics its heading level.
function paraClass(style: string): string {
  switch (style) {
    case "Title":
      return styles.spTitle;
    case "Heading1":
      return styles.spH1;
    case "Heading2":
      return styles.spH2;
    case "Heading3":
      return styles.spH3;
    case "Heading4":
      return styles.spH4;
    default:
      return styles.spBody;
  }
}

export default function SyllabusPreviewModal({
  name,
  paragraphs,
  onEditDocument,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  name: string;
  paragraphs: SyllabusPreviewPara[];
  /** Opens the shared document window on this text (edit + ask-AI). */
  onEditDocument?: () => void;
  onClose: () => void;
  /** The opener to return focus to on close, forwarded to ModalShell. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}) {
  return (
    <ModalShell
      label={`Preview of ${name}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            <h3>{name}</h3>
            <p className={styles.previewMeta}>Syllabus preview</p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {onEditDocument && (
              <button type="button" className={styles.previewCloseButton} onClick={onEditDocument}>
                Edit with AI
              </button>
            )}
            <button type="button" className={styles.previewCloseButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className={styles.syllabusPreviewDoc}>
          {paragraphs.length === 0 ? (
            <p className={styles.previewMeta}>This syllabus has no readable text to preview.</p>
          ) : (
            paragraphs.map((p) => (
              <div key={p.id} className={paraClass(p.style)}>
                {p.runs.length > 0
                  ? p.runs.map((r, i) => (
                      <span key={i} style={runStyle(r)}>
                        {r.text}
                      </span>
                    ))
                  : p.text}
              </div>
            ))
          )}
        </div>
    </ModalShell>
  );
}
