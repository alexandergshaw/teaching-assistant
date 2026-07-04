"use client";

import { useEffect, useState } from "react";
import { getGradableAction } from "../../actions";
import type { CanvasModuleItem } from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import { formatDueDate } from "./utils";

// ── Assignment preview (read-only) ────────────────────────────────────────────

export function AssignmentPreviewModal({
  courseUrl,
  acronym,
  item,
  onClose,
}: {
  courseUrl: string;
  acronym?: string;
  item: CanvasModuleItem;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    if (item.contentId == null) return;
    let cancelled = false;
    (async () => {
      const result = await getGradableAction(courseUrl, "Assignment", item.contentId as number, acronym);
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setDetail(result.detail);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, item.contentId, acronym]);

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.previewModal} style={{ width: "min(720px, 94vw)", maxWidth: "none" }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <h3>{detail?.title || item.title}</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {item.htmlUrl && (
              <a className={styles.ccBtn} href={item.htmlUrl} target="_blank" rel="noreferrer">
                Open in Canvas
              </a>
            )}
            <button type="button" className={styles.previewCloseButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          {item.pointsPossible != null && <span className={styles.ccDue}>{item.pointsPossible} pts</span>}
          {item.dueAt && <span className={styles.ccDue}>Due {formatDueDate(item.dueAt)}</span>}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {loading ? (
            <div className={styles.loadingState} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <p className={styles.loadingTitle}>Loading…</p>
              </div>
            </div>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : detail && detail.description.trim() ? (
            <div
              style={{ lineHeight: 1.55, wordBreak: "break-word" }}
              // Instructor's own course content, fetched server-side for preview.
              dangerouslySetInnerHTML={{ __html: detail.description }}
            />
          ) : (
            <p className={styles.fieldHint}>This assignment has no description.</p>
          )}
        </div>
      </div>
    </div>
  );
}
