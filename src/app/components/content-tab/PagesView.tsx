"use client";

import type { CanvasPageSummary } from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import { formatWhen } from "./utils";
import Button from "@mui/material/Button";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "./contentSourceGating";

// ── Pages list ─────────────────────────────────────────────────────────────---

export function PagesView({
  pages,
  onNewPage,
  onEditPage,
  sourceContext,
}: {
  pages: CanvasPageSummary[];
  onNewPage: () => void;
  onEditPage: (pageUrl: string) => void;
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so the existing call site
   * (which doesn't pass this yet) is unaffected. */
  sourceContext?: ContentSourceContext;
}) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // A stored export has no standalone page list at all - src/lib/lms-export-
  // source's ContentSource docs (entry 263 check 4): `pages` is always `[]`
  // when reading from an export, which is honest at the data layer but reads
  // as "this course genuinely has zero pages" once rendered, unless this
  // view says otherwise. Distinguished from a real empty course below.
  const newPageGate = gateOperation(ctx, "courseWrite");
  return (
    <div className={styles.form}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          {ctx.source === "export" ? "Pages aren't available from a stored export" : `${pages.length} page${pages.length === 1 ? "" : "s"}`}
        </p>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            if (!newPageGate.allowed) return;
            onNewPage();
          }}
          aria-disabled={newPageGate.allowed ? undefined : "true"}
          aria-describedby={newPageGate.allowed ? undefined : "pages-new-page-reason"}
          sx={{ opacity: newPageGate.allowed ? 1 : 0.55 }}
        >
          New page
        </Button>
      </div>

      {ctx.source === "export" ? (
        // Honest per entry 263 check 4: a cartridge's manifest lists items
        // INSIDE modules, not a standalone page list the way the live Canvas
        // API does - `pages` is always `[]` for this source (see
        // src/lib/lms-export-source/types.ts), so this is never "zero pages
        // were found," it is "this source cannot answer that question."
        <p className={styles.emptyState} id="pages-new-page-reason">
          Pages aren&apos;t available from a stored export - a cartridge has no standalone page list, only items
          inside modules (some of which may themselves be pages - see the Modules tab). {newPageGate.reason}
        </p>
      ) : (
        pages.length === 0 && (
          <p className={styles.emptyState} id={!newPageGate.allowed ? "pages-new-page-reason" : undefined}>
            This course has no pages yet.
            {!newPageGate.allowed ? ` ${newPageGate.reason}` : ""}
          </p>
        )
      )}

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
