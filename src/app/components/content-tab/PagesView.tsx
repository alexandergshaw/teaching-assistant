"use client";

import type { CanvasPageSummary } from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import { formatWhen } from "./utils";
import Button from "@mui/material/Button";

// ── Pages list ─────────────────────────────────────────────────────────────---

export function PagesView({
  pages,
  onNewPage,
  onEditPage,
}: {
  pages: CanvasPageSummary[];
  onNewPage: () => void;
  onEditPage: (pageUrl: string) => void;
}) {
  return (
    <div className={styles.form}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          {pages.length} page{pages.length === 1 ? "" : "s"}
        </p>
        <Button variant="outlined" size="small" onClick={onNewPage}>
          New page
        </Button>
      </div>

      {pages.length === 0 && <p className={styles.emptyState}>This course has no pages yet.</p>}

      {pages.map((p) => (
        <div key={p.url} className={styles.syllabusSectionCard}>
          <div className={styles.syllabusSectionTopRow}>
            <h3 className={styles.lessonSlideTitle}>{p.title}</h3>
            <Button variant="outlined" size="small" onClick={() => onEditPage(p.url)}>
              Edit
            </Button>
          </div>
          <p className={styles.fieldHint}>
            {[p.published ? "Published" : "Unpublished", p.updatedAt ? `Updated ${formatWhen(p.updatedAt)}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}
