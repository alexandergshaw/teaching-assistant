"use client";

// Assignments and Quizzes tabs (Contract 2,
// docs/assignments-quizzes-tabs-acceptance-criteria.md). ONE parameterized
// view over BulkItem[], differing only in `kind`, which bulk operations are
// offered, and New Quiz handling (D2) - not two copies of FilesView, and not
// one view branching everywhere on `kind` in its render.
//
// Built to FilesView.tsx's own template exactly (flat rows, checkboxes,
// select-all, search, a bulk bar, its own load/error/empty state, its own
// reload, its own whole-view source gate) - explicitly NOT reusing
// ModulesView's plumbing, which is keyed to a module tree this view has no
// use for.

import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { BulkItem, CanvasRubric, DueDateUpdate } from "@/lib/canvas-modules";
import {
  bulkAssociateRubricAction,
  bulkDeleteAction,
  bulkUpdateAction,
  listBulkItemsAction,
  listRubricsAction,
  setModuleDueDatesAction,
  updateGradableAction,
} from "../../actions";
import styles from "../../page.module.css";
import { formatDueDate } from "./utils";
import { gateOperation, type ContentSourceContext } from "./contentSourceGating";
import { useFlatItemSelection } from "./useFlatItemSelection";
import { isConfirmArmed, selectionSignature } from "./modules/confirmArming";
import { effectiveKindOf, groupSelectedByEffectiveKind } from "./courseItems-routing";

export interface CourseItemsViewProps {
  courseUrl: string;
  acronym?: string;
  /** Which kind this instance lists. */
  kind: "Assignment" | "Quiz";
  sourceContext: ContentSourceContext;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
}

const SUBMISSION_TYPE_OPTIONS = [
  { value: "online_text_entry", label: "Text entry" },
  { value: "online_upload", label: "File upload" },
  { value: "online_url", label: "Website URL" },
  { value: "on_paper", label: "On paper" },
  { value: "none", label: "No submission" },
];

export function CourseItemsView({ courseUrl, acronym, kind, sourceContext, setNote }: CourseItemsViewProps) {
  // D4: gated as ONE unit, exactly like FilesView's `filesGate` - a stored
  // export carries a module tree and announcements, never an assignments or
  // quizzes list, so there is no honest partial view to show. Subject is
  // DERIVED from `kind`, never the shared "items" subject: contentSourceGating.ts
  // deliberately added distinct "assignments"/"quizzes" subjects for this
  // exact whole-view gate (it fires before any list exists, unlike "items",
  // which is worded for a bulk write over an already-rendered selection) -
  // reusing "items" here would misname what is actually missing.
  const gate = gateOperation(sourceContext, kind === "Assignment" ? "assignments" : "quizzes");

  const [items, setItems] = useState<BulkItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);

  const kindLower = kind.toLowerCase();
  const kindLabelPlural = kind === "Assignment" ? "assignments" : "quizzes";
  const kindLabelSingular = kind === "Assignment" ? "assignment" : "quiz";
  // Persisted per kind (two independent tabs share this one component), NOT
  // per course - a plain substring filter carries no risk of showing a wrong
  // course's data the way a stale selection or a stale bulk-field value
  // would (see the bulk-field comments below for the controls that are
  // deliberately NOT persisted for that reason).
  const searchKey = `ta-course-items-search-${kindLower}`;
  const [search, setSearch] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(searchKey) ?? "" : ""));
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(searchKey, search);
  }, [search, searchKey]);

  // Bulk-operation input fields. Deliberately NOT persisted, matching
  // BulkItemsSection/useBulkItemActions.ts's own precedent for the identical
  // controls on the Modules view: these are one-shot inputs for whatever is
  // CURRENTLY selected, not standing preferences - a persisted due date or
  // description from a past selection would silently pre-fill the wrong
  // value for a brand new selection the next time this view is opened,
  // which is exactly the "persisted value would be actively wrong" carve-out.
  const [bulkDue, setBulkDue] = useState("");
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkSubType, setBulkSubType] = useState("");
  const [bulkRubricId, setBulkRubricId] = useState<number | "">("");
  const [bulkDescription, setBulkDescription] = useState("");
  // Two-click "Confirm delete" arming (confirmArming.ts), signed by the
  // current selection so changing the selection after arming invalidates a
  // stale confirmation instead of leaving "Confirm delete" pointed at a
  // different set of rows (see confirmArming.ts's own header comment).
  const [deleteArmedFor, setDeleteArmedFor] = useState<string | null>(null);

  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it] as const)), [items]);
  // Referentially stable across renders where `items` hasn't changed (see
  // useFlatItemSelection.ts's own comment on why this matters for its
  // compare-and-adjust prune).
  const currentIds = useMemo(() => items.map((it) => it.id), [items]);
  const selection = useFlatItemSelection(currentIds);

  const reload = async () => {
    // Never hits the live Canvas API while viewing a stored export - see the
    // whole-view gate above.
    if (sourceContext.source === "export") {
      setItems([]);
      setStatus("ready");
      return;
    }
    const result = await listBulkItemsAction(courseUrl, kind, acronym);
    if ("error" in result) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setItems(result.items);
    setStatus("ready");
  };

  useEffect(() => {
    // Every setState call below lives inside this async IIFE, including the
    // early-exit branch that fires with no preceding `await` at all - this
    // repo's react-hooks/set-state-in-effect rule flags a setState call made
    // directly in an effect's own top-level body, but not one reached
    // through a nested async function expression (see
    // useCartridgeToCanvas.ts's own AC16 comment for the same idiom, and
    // AGENTS.md's set-state-in-effect-idiom memory).
    let cancelled = false;
    (async () => {
      if (!courseUrl || sourceContext.source === "export") {
        if (!cancelled) {
          setItems([]);
          setStatus("ready");
        }
        return;
      }
      setStatus("loading");
      const result = await listBulkItemsAction(courseUrl, kind, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      setItems(result.items);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym, kind, sourceContext.source]);

  // Rubrics (Assignment tab only - B1/B3): loaded independently of the main
  // list so a rubric-load failure never blocks the item list itself, only
  // disables the rubric select.
  useEffect(() => {
    // Same nested-IIFE placement as the main load effect above, and for the
    // same reason.
    let cancelled = false;
    (async () => {
      if (kind !== "Assignment" || !courseUrl || sourceContext.source === "export") {
        if (!cancelled) setRubrics([]);
        return;
      }
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled) return;
      if (!("error" in result)) setRubrics(result.rubrics);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, courseUrl, acronym, sourceContext.source]);

  // Run a bulk write over every effective-kind group, merging the
  // {updated, failures} summaries (B5: per-item failure is isolated and
  // reported, one failing row never aborts the rest), then reload (B6).
  const runGroupedBulkSummary = async (
    fn: (effKind: "Assignment" | "Quiz", ids: string[]) => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    const groups = groupSelectedByEffectiveKind(selection.selected, itemsById, kind);
    const activeGroups = (Object.entries(groups) as Array<["Assignment" | "Quiz", string[]]>).filter(
      ([, ids]) => ids.length > 0
    );
    if (activeGroups.length === 0) return;
    setBusy(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const [effKind, ids] of activeGroups) {
      const result = await fn(effKind, ids);
      if ("error" in result) failed += ids.length;
      else {
        updated += result.updated;
        failed += result.failures.length;
      }
    }
    setBusy(false);
    setNote({ kind: failed ? "error" : "success", text: `${label}: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
    void reload();
  };

  // B2: publish/unpublish goes through bulkUpdateAction's existing
  // assignment[published] / quiz[published] support (bulk.ts:107-135) - NOT
  // through the module-item API (updateModuleItemAction), which this file
  // never imports. That path exists and has simply never been exercised by
  // any UI before this view; bulk.test.ts already pins its request shape
  // (B2/E4).
  const bulkPublish = (published: boolean) => {
    if (selection.selected.size === 0) return;
    void runGroupedBulkSummary(
      (effKind, ids) => bulkUpdateAction(courseUrl, effKind, ids, { published }, acronym),
      published ? "Published" : "Unpublished"
    );
  };

  const bulkSetDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a valid due date first." });
      return;
    }
    if (selection.selected.size === 0) return;
    const iso = new Date(bulkDue).toISOString();
    const updates: DueDateUpdate[] = [...selection.selected]
      .map((id): DueDateUpdate | null => {
        const item = itemsById.get(id);
        return item ? { type: effectiveKindOf(item, kind), contentId: Number(id), dueAt: iso } : null;
      })
      .filter((u): u is DueDateUpdate => u !== null);
    if (updates.length === 0) return;
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await setModuleDueDatesAction(courseUrl, updates, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote({
        kind: result.failures.length ? "error" : "success",
        text: `Due date set: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
      });
      void reload();
    })();
  };

  const bulkSetPoints = () => {
    const p = Number(bulkPoints);
    if (bulkPoints.trim() === "" || !Number.isFinite(p)) {
      setNote({ kind: "error", text: "Enter a points value." });
      return;
    }
    if (selection.selected.size === 0) return;
    void runGroupedBulkSummary(
      (effKind, ids) => bulkUpdateAction(courseUrl, effKind, ids, { pointsPossible: p }, acronym),
      "Points set"
    );
  };

  // Rubrics (assignments only, B1/B3) - the Quizzes tab never renders the
  // control that calls this, so `ids` here are always plain Assignment ids.
  const bulkRubric = () => {
    if (bulkRubricId === "") {
      setNote({ kind: "error", text: "Pick a rubric first." });
      return;
    }
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await bulkAssociateRubricAction(courseUrl, Number(bulkRubricId), ids, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote({
        kind: result.failures.length ? "error" : "success",
        text: `Rubric associated: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
      });
      void reload();
    })();
  };

  // Submission type (assignments only, B1/B3) - same reasoning as rubrics.
  const bulkUpdateSubmissionType = () => {
    if (bulkSubType === "") {
      setNote({ kind: "error", text: "Pick a submission type first." });
      return;
    }
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    void (async () => {
      setBusy(true);
      setNote(null);
      const result = await bulkUpdateAction(courseUrl, "Assignment", ids, { submissionType: bulkSubType }, acronym);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote({
        kind: result.failures.length ? "error" : "success",
        text: `Submission type updated on ${result.updated} assignment${result.updated === 1 ? "" : "s"}${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
      });
      void reload();
    })();
  };

  const bulkSetDescription = () => {
    if (bulkDescription.trim() === "") {
      setNote({ kind: "error", text: "Type a description to set (this replaces the existing one)." });
      return;
    }
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    void (async () => {
      setBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of ids) {
        const item = itemsById.get(id);
        if (!item) {
          failed += 1;
          continue;
        }
        const result = await updateGradableAction(
          courseUrl,
          effectiveKindOf(item, kind),
          Number(id),
          { description: bulkDescription },
          acronym
        );
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Description set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      void reload();
    })();
  };

  const selectionSig = selectionSignature(selection.selected);
  const confirmDelete = isConfirmArmed(deleteArmedFor, selectionSig);

  // B4: two-click arming, with the BUTTON ITSELF changing to show the armed
  // state (its label, directly - see the render below), not only a note
  // rendered alongside it.
  const bulkDeleteContent = () => {
    if (selection.selected.size === 0) return;
    if (!confirmDelete) {
      setDeleteArmedFor(selectionSig);
      return;
    }
    setDeleteArmedFor(null);
    void runGroupedBulkSummary(
      (effKind, ids) => bulkDeleteAction(courseUrl, effKind, ids, acronym),
      "Deleted from Canvas"
    );
    // No explicit selection.clear() here: reload() above replaces `items`,
    // which shrinks `currentIds`, and useFlatItemSelection prunes any
    // deleted id out of the selection on its own (A5) - the bulk bar
    // disappears once nothing selected remains valid.
  };

  if (!gate.allowed) {
    return (
      <div className={styles.form}>
        <p className={styles.emptyState}>{gate.reason}</p>
      </div>
    );
  }

  const shown = items.filter((it) => it.title.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleIds = shown.map((it) => it.id);
  const allShownSelected = selection.allVisibleSelected(visibleIds);

  return (
    <div className={styles.form}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="outlined" size="small" onClick={() => void reload()} disabled={busy}>
          Refresh
        </Button>
        <TextField
          size="small"
          type="search"
          placeholder={`Search ${kindLabelPlural} by title…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 200px", maxWidth: 300 }}
        />
        <span className={styles.fieldHint} style={{ margin: 0 }}>
          {search.trim() ? `${shown.length} of ${items.length}` : items.length} {items.length === 1 ? kindLabelSingular : kindLabelPlural}
        </span>
      </div>

      {selection.selected.size > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarHead}>
            <span className={styles.bulkCount}>
              {selection.selected.size} {selection.selected.size === 1 ? kindLabelSingular : kindLabelPlural} selected
            </span>
            <Button variant="outlined" size="small" onClick={selection.clear}>
              Clear
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Publish</span>
            <Button variant="outlined" size="small" disabled={busy} onClick={() => bulkPublish(true)}>
              Publish
            </Button>
            <Button variant="outlined" size="small" disabled={busy} onClick={() => bulkPublish(false)}>
              Unpublish
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Due date</span>
            <TextField
              type="datetime-local"
              size="small"
              sx={{ width: 188 }}
              value={bulkDue}
              onChange={(e) => setBulkDue(e.target.value)}
              aria-label="Due date"
            />
            <Button variant="contained" size="small" disabled={busy} onClick={bulkSetDue}>
              Set
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Points</span>
            <TextField
              type="number"
              size="small"
              sx={{ width: 74 }}
              placeholder="points"
              value={bulkPoints}
              onChange={(e) => setBulkPoints(e.target.value)}
              aria-label="Points"
            />
            <Button variant="outlined" size="small" disabled={busy} onClick={bulkSetPoints}>
              Set points
            </Button>
          </div>

          {kind === "Assignment" && (
            <div className={styles.bulkRow}>
              <span className={styles.bulkLabel}>Rubric</span>
              <TextField
                select
                size="small"
                sx={{ maxWidth: 190 }}
                value={bulkRubricId}
                disabled={rubrics.length === 0}
                onChange={(e) => setBulkRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Rubric"
              >
                <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
                {rubrics.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.title}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" size="small" disabled={busy || bulkRubricId === ""} onClick={bulkRubric}>
                Associate
              </Button>
            </div>
          )}

          {kind === "Assignment" && (
            <div className={styles.bulkRow}>
              <span className={styles.bulkLabel}>Submission type</span>
              <TextField
                select
                size="small"
                sx={{ minWidth: 180 }}
                value={bulkSubType}
                onChange={(e) => setBulkSubType(e.target.value)}
                aria-label="Submission type"
              >
                <MenuItem value="">Change submission type…</MenuItem>
                {SUBMISSION_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" size="small" disabled={busy || bulkSubType === ""} onClick={bulkUpdateSubmissionType}>
                Apply
              </Button>
            </div>
          )}

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Description</span>
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={bulkDescription}
              onChange={(e) => setBulkDescription(e.target.value)}
              placeholder="Description (HTML allowed) — replaces the description on selected items"
              aria-label="Description to set on the selected items"
              size="small"
            />
            <Button variant="contained" size="small" disabled={busy} onClick={bulkSetDescription}>
              Set description
            </Button>
          </div>

          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Delete</span>
            <Button variant="outlined" size="small" color="error" disabled={busy} onClick={bulkDeleteContent}>
              {confirmDelete ? "Confirm delete" : "Delete from Canvas"}
            </Button>
          </div>
        </div>
      )}

      {status === "loading" ? (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading {kindLabelPlural}…</p>
          </div>
        </div>
      ) : status === "error" ? (
        <p className={styles.error}>{error}</p>
      ) : items.length === 0 ? (
        <p className={styles.emptyState}>This course has no {kindLabelPlural} yet.</p>
      ) : (
        <div className={styles.ccModule}>
          <FormControlLabel
            className={styles.fieldHint}
            style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0, padding: "8px 12px" }}
            control={
              <Checkbox
                size="small"
                checked={allShownSelected}
                onChange={() => selection.selectAllVisible(visibleIds)}
                disabled={shown.length === 0}
              />
            }
            label="Select all"
          />
          <div className={styles.ccItems} style={{ borderTop: "1px solid var(--card-border)" }}>
            {shown.length === 0 && (
              <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
                No {kindLabelPlural} match your search.
              </p>
            )}
            {shown.map((it) => (
              <div key={it.id} className={styles.ccItem}>
                <Checkbox
                  size="small"
                  className={styles.ccCheckbox}
                  checked={selection.selected.has(it.id)}
                  onChange={() => selection.toggle(it.id)}
                  aria-label={`Select ${it.title}`}
                />
                <span className={styles.ccType} title={it.published ? "Published" : "Unpublished"}>
                  {it.published ? "PUBLISHED" : "UNPUBLISHED"}
                </span>
                {kind === "Quiz" && it.isNewQuiz && (
                  <span
                    className={styles.ccType}
                    title="LTI-backed New Quiz (Quizzes 2) - rubric and submission-type changes do not apply"
                  >
                    NEW QUIZ
                  </span>
                )}
                <span className={styles.ccItemName} title={it.title} style={{ display: "flex", alignItems: "center" }}>
                  {it.title}
                </span>
                <span className={styles.ccCount} style={{ width: 150, textAlign: "right", flexShrink: 0 }}>
                  {it.dueAt ? formatDueDate(it.dueAt) : "No due date"}
                </span>
                <span className={styles.ccCount} style={{ width: 70, textAlign: "right", flexShrink: 0 }}>
                  {it.pointsPossible != null ? `${it.pointsPossible} pts` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
