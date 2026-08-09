"use client";

import { useEffect, useState } from "react";
import { createModuleAction } from "../../actions";
import type { CanvasModule } from "@/lib/canvas-modules";
import { planBulkModuleCreation, type BulkModulePlan } from "@/lib/bulk-module-plan";
import { submitOnEnter } from "../ui/submitOnEnter";
import styles from "../../page.module.css";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";

// ── Bulk-create modules ────────────────────────────────────────────────────
//
// Modeled directly on RenameModulesModal.tsx (self-contained modal, live
// per-row preview, counted apply button, standing "Writes ... to Canvas."
// hint) - the closest existing template for a modal that previews a batch
// Canvas write before committing it. All naming/padding/idempotency decisions
// live in planBulkModuleCreation (src/lib/bulk-module-plan.ts); this
// component only renders that plan and fires one createModuleAction call per
// "create" entry.

const COUNT_KEY = "ta-modules-bulkcreate-count";
const TEMPLATE_KEY = "ta-modules-bulkcreate-template";
const STARTAT_KEY = "ta-modules-bulkcreate-startat";
export const DEFAULT_BULK_MODULE_TEMPLATE = "Module {x}";

function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function BulkCreateModulesModal({
  courseUrl,
  acronym,
  modules,
  onClose,
  onApplied,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  // Text state (not number state) for the two numeric fields: an in-progress
  // edit like "" or "1." must render as typed rather than being coerced back
  // to a number on every keystroke. planBulkModuleCreation itself rejects a
  // non-integer via Number(...), so an invalid in-progress value simply shows
  // plan.error rather than silently snapping to something else.
  const [countText, setCountText] = useState(() => readStored(COUNT_KEY, "1"));
  const [template, setTemplate] = useState(() => readStored(TEMPLATE_KEY, DEFAULT_BULK_MODULE_TEMPLATE));
  const [startAtText, setStartAtText] = useState(() => readStored(STARTAT_KEY, "1"));
  const [applying, setApplying] = useState(false);

  // Persist every control across reload (standing project rule - see
  // useBulkModuleActions.ts:96-104's ta-modules-bulkadd-stype for the exact
  // same read-on-init / write-on-change idiom this mirrors).
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COUNT_KEY, countText);
  }, [countText]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TEMPLATE_KEY, template);
  }, [template]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STARTAT_KEY, startAtText);
  }, [startAtText]);

  const plan: BulkModulePlan = planBulkModuleCreation(modules, Number(countText), template, Number(startAtText));

  const handleApply = async () => {
    if (plan.error || plan.createCount === 0) return;
    setApplying(true);
    let created = 0;
    let failed = 0;
    for (const entry of plan.entries) {
      if (entry.action !== "create") continue;
      // Sequential, one write at a time - matching steps.lms-modules.ts:90's
      // own for-loop shape, and deliberately NOT Promise.all'd. NOTE (per the
      // wave brief, not fixed here): module creation has no throttle retry.
      // fetchWithThrottleRetry exists but is private to
      // src/lib/canvas/announcements.ts:299, and writeJson
      // (canvas-modules/fetch-helpers.ts), which createModule ultimately
      // calls, wraps every write with none. Creating MAX_BULK_MODULE_COUNT
      // modules is that many unprotected sequential Canvas writes; extracting
      // a shared throttle helper is out of scope for this feature.
      const result = await createModuleAction(courseUrl, entry.name, entry.n, acronym);
      if ("error" in result) failed += 1;
      else created += 1;
    }
    setApplying(false);
    // A per-entry failure is tallied, never aborts the remaining entries (the
    // loop above has no early return), and is always reported through
    // onApplied - deliberately UNLIKE RenameModulesModal's handleApply, which
    // early-returns into a local error note on any failure and skips
    // onApplied (and therefore skips reload()) entirely. That's fine for a
    // rename: a failed rename leaves the module's name unchanged, so nothing
    // new exists to show. A failed CREATE is different - other entries in the
    // same run may have genuinely succeeded and now exist in Canvas, so the
    // parent's reload() (wired the same way as every sibling modal - see
    // ModulesView.tsx) must still run so those new modules become visible.
    const parts = [`Created ${created} module${created === 1 ? "" : "s"}`];
    if (plan.skipCount > 0) parts.push(`${plan.skipCount} already present`);
    if (failed > 0) parts.push(`${failed} failed`);
    onApplied(`${parts.join(", ")}.`);
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(640px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Create modules</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <p className={styles.fieldHint} style={{ marginTop: 0 }}>
          Bulk-create blank modules from a name template. {"{x}"} expands to the module number,
          zero-padded to at least two digits (01, 02, … 10 … 100) so Canvas sorts them in order.
          A module already present under that exact name (ignoring case and whitespace) is
          skipped, so running this again is always safe.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div className={styles.field} style={{ flex: "1 1 140px" }}>
            <TextField
              id="bulk-create-count"
              label="How many"
              type="number"
              size="small"
              value={countText}
              onChange={(e) => setCountText(e.target.value)}
              onKeyDown={submitOnEnter(handleApply)}
              slotProps={{ htmlInput: { min: 1 } }}
              fullWidth
            />
          </div>
          <div className={styles.field} style={{ flex: "2 1 220px" }}>
            <TextField
              id="bulk-create-template"
              label="Name template"
              type="text"
              size="small"
              placeholder={DEFAULT_BULK_MODULE_TEMPLATE}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              onKeyDown={submitOnEnter(handleApply)}
              fullWidth
            />
          </div>
          <div className={styles.field} style={{ flex: "1 1 140px" }}>
            <TextField
              id="bulk-create-startat"
              label="Start at"
              type="number"
              size="small"
              value={startAtText}
              onChange={(e) => setStartAtText(e.target.value)}
              onKeyDown={submitOnEnter(handleApply)}
              slotProps={{ htmlInput: { min: 1 } }}
              fullWidth
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>
            Preview
            {plan.entries.length > 0 ? ` (${plan.createCount} to create, ${plan.skipCount} already present)` : ""}
          </label>
          <div
            style={{
              border: "1px solid var(--field-border)",
              borderRadius: 10,
              overflow: "hidden",
              maxHeight: "40vh",
              overflowY: "auto",
            }}
          >
            {plan.entries.map((entry, i) => (
              <div
                key={entry.n}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 12px",
                  borderTop: i === 0 ? "none" : "1px solid var(--field-border)",
                  opacity: entry.action === "create" ? 1 : 0.5,
                }}
              >
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
                <span className={styles.fieldHint} style={{ margin: 0, whiteSpace: "nowrap" }}>
                  {entry.action === "create" ? "will create" : "already present"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="contained"
            size="small"
            onClick={handleApply}
            disabled={applying || !!plan.error || plan.createCount === 0}
          >
            {applying ? "Creating…" : `Create ${plan.createCount} module${plan.createCount === 1 ? "" : "s"}`}
          </Button>
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            Writes new modules to Canvas.
          </span>
        </div>

        {plan.error && <p className={styles.error}>{plan.error}</p>}
      </div>
    </div>
  );
}
