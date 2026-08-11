"use client";

import type React from "react";
import { Button, Checkbox, IconButton, MenuItem, TextField } from "@mui/material";
import type { CanvasModule, CanvasModuleItem, GradableKind } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import { DATED_TYPES, MAX_INDENT, POINTS_EDITABLE } from "../constants";
import { formatDueDate, itemKey, rowBlankClick, toLocalInput } from "../utils";
import { ItemA11yBadge } from "../ItemA11yBadge";
import { PublishToggle } from "../PublishToggle";
import {
  LIVE_CONTENT_SOURCE,
  describeDegradedItemRow,
  fieldAvailable,
  gateOperation,
  type ContentSourceContext,
} from "../contentSourceGating";
import { ArrowButton } from "./ArrowButton";

// Plain (non-component) helper so the impure `Date.now()` read stays out of
// the component's render body, satisfying react-hooks/purity.
function isOverdue(dueAt: string): boolean {
  return new Date(dueAt).getTime() < Date.now();
}

// Reason for a DATED item whose due-date/points controls render (source is
// "canvas" - see fieldAvailable) but whose own `contentId` is null, e.g. an
// orphaned item. Independent of content-source gating: this can happen on a
// live Canvas item today, which is exactly the pre-existing bug this file
// fixes (the due-date button used to stay disabled here while its title
// still read "... - click to edit", true only when the button ISN'T
// disabled). Shared by both the due-date and points controls since they are
// disabled by, and need to explain, the same underlying condition.
const NOT_GRADABLE_REASON = "This item isn't linked to a gradable Canvas object, so it has no due date or points here.";

export interface ModuleItemRowProps {
  m: CanvasModule;
  it: CanvasModuleItem;
  ii: number;
  itemsLength: number;
  busy: boolean;
  itemNodes: React.MutableRefObject<Map<number, HTMLElement | null>>;
  selected: Set<string>;
  toggleItemSelected: (moduleId: number, itemId: number) => void;
  drag: { moduleId: number; itemId: number } | null;
  setDrag: React.Dispatch<React.SetStateAction<{ moduleId: number; itemId: number } | null>>;
  dragOverItem: number | null;
  setDragOverItem: React.Dispatch<React.SetStateAction<number | null>>;
  setDragOverModule: React.Dispatch<React.SetStateAction<number | null>>;
  isDraggingItem: (moduleId: number, itemId: number) => boolean;
  performMove: (targetModuleId: number, beforeItemId: number | null) => void;
  typeEdit: number | null;
  setTypeEdit: React.Dispatch<React.SetStateAction<number | null>>;
  changeItemType: (m: CanvasModule, it: CanvasModuleItem, target: GradableKind) => void;
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveItemTitle: (m: CanvasModule, it: CanvasModuleItem) => Promise<void>;
  dueEdit: { id: number; value: string } | null;
  setDueEdit: React.Dispatch<React.SetStateAction<{ id: number; value: string } | null>>;
  saveDueEdit: (m: CanvasModule, it: CanvasModuleItem) => void;
  pointsEdit: { id: number; value: string } | null;
  setPointsEdit: React.Dispatch<React.SetStateAction<{ id: number; value: string } | null>>;
  savePointsEdit: (m: CanvasModule, it: CanvasModuleItem) => void;
  moveItem: (m: CanvasModule, index: number, dir: -1 | 1) => void;
  indentItem: (m: CanvasModule, it: CanvasModuleItem, delta: -1 | 1) => void;
  toggleItem: (m: CanvasModule, it: CanvasModuleItem) => void;
  onEditPage: (pageUrl: string) => void;
  setPreviewAssignment: (it: CanvasModuleItem) => void;
  setEditingItem: (it: CanvasModuleItem) => void;
  openFilePreview: (it: CanvasModuleItem) => Promise<void>;
  setEditingFile: (it: CanvasModuleItem) => void;
  confirmId: string | null;
  removeItem: (m: CanvasModule, it: CanvasModuleItem) => Promise<void>;
  /** Which Course Content source is active, and whether a live Canvas course
   * is linked to write to - see contentSourceGating.ts. Optional and
   * defaulted to LIVE_CONTENT_SOURCE so every existing call site (none of
   * which pass this yet - there is no source picker in the tab) renders and
   * behaves exactly as it did before this prop existed. */
  sourceContext?: ContentSourceContext;
}

// One module-item row: drag handle, selection checkbox, type chip, inline
// title/due-date/points editors, and the row's action buttons.
export function ModuleItemRow({
  m,
  it,
  ii,
  itemsLength,
  busy,
  itemNodes,
  selected,
  toggleItemSelected,
  drag,
  setDrag,
  dragOverItem,
  setDragOverItem,
  setDragOverModule,
  isDraggingItem,
  performMove,
  typeEdit,
  setTypeEdit,
  changeItemType,
  drafts,
  setDrafts,
  saveItemTitle,
  dueEdit,
  setDueEdit,
  saveDueEdit,
  pointsEdit,
  setPointsEdit,
  savePointsEdit,
  moveItem,
  indentItem,
  toggleItem,
  onEditPage,
  setPreviewAssignment,
  setEditingItem,
  openFilePreview,
  setEditingFile,
  confirmId,
  removeItem,
  sourceContext,
}: ModuleItemRowProps) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // Per-operation gate for this item's own write controls (rename, move,
  // remove, change type, preview/edit gradable or file, edit page) - see
  // contentSourceGating.ts's GatedSubject doc for why these all share one
  // subject ("item"). Fields that don't exist in the export format at all
  // (published/dueAt/pointsPossible/indent) are gated separately below via
  // fieldAvailable, since those are omitted rather than disabled-with-reason.
  const itemGate = gateOperation(ctx, "item");
  const dueAvailable = fieldAvailable(ctx.source, "dueAt");
  const pointsAvailable = fieldAvailable(ctx.source, "pointsPossible");
  const publishedAvailable = fieldAvailable(ctx.source, "published");
  const indentAvailable = fieldAvailable(ctx.source, "indent");
  const degradedNote = describeDegradedItemRow(ctx);
  const rowReasonId = `it${it.id}-gate-reason`;
  const gradableReasonId = `it${it.id}-gradable-reason`;
  const notGradable = DATED_TYPES.includes(it.type) && it.contentId == null;

  return (
    <>
    <div
      key={it.id}
      ref={(el) => {
        if (el) itemNodes.current.set(it.id, el);
        else itemNodes.current.delete(it.id);
      }}
      className={styles.ccItem}
      onClick={(e) => rowBlankClick(e, () => toggleItemSelected(m.id, it.id))}
      onDragOver={(e) => {
        if (drag) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverItem(it.id);
        }
      }}
      onDragLeave={() => setDragOverItem((cur) => (cur === it.id ? null : cur))}
      onDrop={(e) => {
        if (drag) {
          e.preventDefault();
          e.stopPropagation();
          performMove(m.id, it.id);
        }
      }}
      style={{
        cursor: "pointer",
        marginLeft: indentAvailable ? it.indent * 18 : 0,
        boxShadow:
          dragOverItem === it.id
            ? "inset 0 2px 0 var(--accent)"
            : isDraggingItem(m.id, it.id)
              ? "0 4px 12px rgba(15, 23, 42, 0.12)"
              : undefined,
        background:
          dragOverItem === it.id
            ? "var(--accent-soft-strong)"
            : isDraggingItem(m.id, it.id)
              ? "var(--accent-soft)"
              : undefined,
        opacity: isDraggingItem(m.id, it.id) ? 0.55 : 1,
      }}
    >
      <span
        draggable={itemGate.allowed}
        onDragStart={(e) => {
          if (!itemGate.allowed) return;
          setDrag({ moduleId: m.id, itemId: it.id });
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(it.id));
        }}
        onDragEnd={() => {
          setDrag(null);
          setDragOverItem(null);
          setDragOverModule(null);
        }}
        className={styles.ccGrip}
        title="Drag to reorder or move between modules"
        aria-label="Drag to reorder"
        style={isDraggingItem(m.id, it.id) ? { cursor: "grabbing", color: "var(--accent-ink)" } : undefined}
      >
        ⠿
      </span>
      <Checkbox
        checked={selected.has(itemKey(m.id, it.id))}
        onChange={() => toggleItemSelected(m.id, it.id)}
        aria-label={`Select ${it.title}`}
        size="small"
      />
      {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null && itemGate.allowed ? (
        typeEdit === it.id ? (
          <TextField
            select
            size="small"
            autoFocus
            className={styles.ccType}
            value={it.type}
            onChange={(e) => changeItemType(m, it, e.target.value as GradableKind)}
            onBlur={() => setTypeEdit(null)}
            aria-label="Change item type"
          >
            <MenuItem value="Assignment">ASSIGNMENT</MenuItem>
            <MenuItem value="Quiz">QUIZ</MenuItem>
            <MenuItem value="Discussion">DISCUSSION</MenuItem>
          </TextField>
        ) : (
          <Button
            variant="outlined"
            size="small"
            className={styles.ccType}
            onClick={() => setTypeEdit(it.id)}
            disabled={busy}
            title="Click to change type"
            sx={{ textTransform: "none", fontFamily: "inherit", cursor: "pointer", border: 0 }}
          >
            {it.type}
          </Button>
        )
      ) : (
        <span className={styles.ccType}>{it.type || "Item"}</span>
      )}
      <TextField
        size="small"
        className={styles.ccItemName}
        title={it.title}
        value={drafts[`i${it.id}`] ?? it.title}
        onChange={(e) => setDrafts((p) => ({ ...p, [`i${it.id}`]: e.target.value }))}
        onBlur={() => {
          if (itemGate.allowed) void saveItemTitle(m, it);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        // Read-only, not `disabled`, when this item has no Canvas identity to
        // rename - `disabled` would drop the field out of the tab order the
        // same way a native `disabled` button would (see the file header
        // comment on the "Remove" button below for the full reasoning); a
        // read-only text input stays focusable and reachable while blocking
        // the edit, and MUI wires `aria-describedby` for us via the reason
        // span's id.
        slotProps={{
          htmlInput: itemGate.allowed
            ? undefined
            : { readOnly: true, "aria-describedby": rowReasonId },
        }}
      />
      <span className={styles.ccDueSlot}>
        {DATED_TYPES.includes(it.type) && dueAvailable &&
          (dueEdit?.id === it.id ? (
            <TextField
              type="datetime-local"
              size="small"
              autoFocus
              className={styles.ccDueInput}
              value={dueEdit.value}
              onChange={(e) => setDueEdit({ id: it.id, value: e.target.value })}
              onBlur={() => saveDueEdit(m, it)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setDueEdit(null);
              }}
              aria-label="Due date"
              slotProps={{ htmlInput: { } }}
            />
          ) : it.dueAt ? (
            <Button
              variant="outlined"
              size="small"
              className={`${styles.ccDue} ${isOverdue(it.dueAt) ? styles.ccDueOverdue : ""}`}
              onClick={() => {
                // BUG FIX: this button used to stay `disabled` when
                // `it.contentId == null` while its `title` still read
                // "... - click to edit", true only in the NOT-disabled case.
                // Guarding the handler (rather than relying on `disabled`
                // alone) and switching to aria-disabled below keeps the
                // button reachable so the corrected reason is actually
                // discoverable on keyboard focus, not just visually.
                if (busy || it.contentId == null) return;
                setDueEdit({ id: it.id, value: toLocalInput(it.dueAt) });
              }}
              disabled={busy}
              aria-disabled={it.contentId == null ? "true" : undefined}
              aria-describedby={it.contentId == null ? gradableReasonId : undefined}
              title={it.contentId == null ? undefined : `Due ${new Date(it.dueAt).toLocaleString()} — click to edit`}
              // MUI's `disabled` prop drives both focusability AND the
              // `.Mui-disabled` visual style; using `aria-disabled` instead
              // (to keep the button focusable) means that visual cue is lost
              // unless it's restored explicitly - this dims the button so a
              // sighted user gets the same "this is off" signal a keyboard/
              // screen-reader user gets from aria-disabled + the reason text.
              sx={{ opacity: it.contentId == null ? 0.55 : 1 }}
            >
              Due {formatDueDate(it.dueAt)}
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              className={`${styles.ccDue} ${styles.ccDueEmpty}`}
              onClick={() => {
                if (busy || it.contentId == null) return;
                setDueEdit({ id: it.id, value: "" });
              }}
              disabled={busy}
              aria-disabled={it.contentId == null ? "true" : undefined}
              aria-describedby={it.contentId == null ? gradableReasonId : undefined}
              title={it.contentId == null ? undefined : "Click to set a due date"}
              sx={{ opacity: it.contentId == null ? 0.55 : 1 }}
            >
              No due date
            </Button>
          ))}
      </span>
      <span className={styles.ccPointsSlot}>
        {DATED_TYPES.includes(it.type) && pointsAvailable &&
          (pointsEdit?.id === it.id ? (
            <TextField
              type="number"
              size="small"
              autoFocus
              className={styles.ccDueInput}
              value={pointsEdit.value}
              onChange={(e) => setPointsEdit({ id: it.id, value: e.target.value })}
              onBlur={() => savePointsEdit(m, it)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setPointsEdit(null);
              }}
              aria-label="Points"
            />
          ) : (
            <Button
              variant="outlined"
              size="small"
              className={`${styles.ccDue} ${it.pointsPossible == null ? styles.ccDueEmpty : ""}`}
              onClick={() => {
                if (busy || it.contentId == null || !POINTS_EDITABLE.includes(it.type)) return;
                setPointsEdit({ id: it.id, value: it.pointsPossible != null ? String(it.pointsPossible) : "" });
              }}
              disabled={busy || (it.contentId != null && !POINTS_EDITABLE.includes(it.type))}
              aria-disabled={it.contentId == null ? "true" : undefined}
              aria-describedby={it.contentId == null ? gradableReasonId : undefined}
              sx={{ opacity: it.contentId == null ? 0.55 : 1 }}
              title={
                it.contentId == null
                  ? undefined
                  : POINTS_EDITABLE.includes(it.type)
                    ? "Click to edit points"
                    : "Points (edit on the assignment)"
              }
            >
              {it.pointsPossible != null ? `${it.pointsPossible} pts` : "No points"}
            </Button>
          ))}
      </span>
      {notGradable && dueAvailable && (
        // Visually hidden (not display:none, which would drop it from the
        // accessibility tree too) - always present in the DOM so the
        // due/points buttons' aria-describedby can reach it, without
        // widening this already fixed-width row on every affected row.
        // Distinct from a `title` tooltip: this text is available to
        // assistive tech regardless of hover or focus state.
        <span
          id={gradableReasonId}
          style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}
        >
          {NOT_GRADABLE_REASON}
        </span>
      )}
      <div className={styles.ccItemActions}>
        {itemGate.allowed && (
          <>
            <ArrowButton label="Move up" onClick={() => moveItem(m, ii, -1)} disabled={busy || ii === 0} />
            <ArrowButton label="Move down" onClick={() => moveItem(m, ii, 1)} disabled={busy || ii === itemsLength - 1} />
          </>
        )}
        {indentAvailable && (
          <>
            <IconButton
              size="small"
              onClick={() => indentItem(m, it, -1)}
              disabled={busy || it.indent === 0}
              title="Outdent"
              aria-label="Outdent"
            >
              &lt;
            </IconButton>
            <IconButton
              size="small"
              onClick={() => indentItem(m, it, 1)}
              disabled={busy || it.indent >= MAX_INDENT}
              title="Indent"
              aria-label="Indent"
            >
              &gt;
            </IconButton>
          </>
        )}
        <span className={styles.ccActionsSep} aria-hidden="true" />
        <ItemA11yBadge item={it} />
        {publishedAvailable && (
          <PublishToggle published={it.published} disabled={busy} onClick={() => toggleItem(m, it)} />
        )}
        {it.type === "Page" && it.pageUrl && itemGate.allowed && (
          <Button variant="outlined" size="small" onClick={() => onEditPage(it.pageUrl!)}>
            Edit page
          </Button>
        )}
        {it.type === "Assignment" && it.contentId != null && itemGate.allowed && (
          <Button variant="outlined" size="small" onClick={() => setPreviewAssignment(it)}>
            Preview
          </Button>
        )}
        {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null && itemGate.allowed && (
          <Button variant="outlined" size="small" onClick={() => setEditingItem(it)}>
            Edit
          </Button>
        )}
        {it.type === "File" && it.contentId != null && itemGate.allowed && (
          <Button variant="outlined" size="small" onClick={() => void openFilePreview(it)}>
            Preview
          </Button>
        )}
        {it.type === "File" && it.contentId != null && /\.(docx|pptx)$/i.test(it.title) && itemGate.allowed && (
          <Button variant="outlined" size="small" onClick={() => setEditingFile(it)}>
            Edit
          </Button>
        )}
        {(it.htmlUrl || it.externalUrl) && (
          <IconButton
            size="small"
            component="a"
            href={(it.htmlUrl || it.externalUrl) as string}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on Canvas"
            aria-label="Open on Canvas"
          >
            ↗
          </IconButton>
        )}
        <Button
          variant="outlined"
          size="small"
          color="error"
          onClick={() => {
            // Copies src/app/components/courses/CellMenu.tsx's precedent
            // (see that file's header comment, CORRECTION 7): a native
            // `disabled` Button drops out of the tab order entirely, so a
            // keyboard/screen-reader user would never land on it and never
            // hear why. `aria-disabled` instead keeps it focusable and
            // reachable; the click is a no-op below rather than through
            // `disabled`, and the reason is wired as `aria-describedby`
            // pointing at the always-rendered (not tooltip) reason line
            // rendered below this row.
            if (!itemGate.allowed) return;
            void removeItem(m, it);
          }}
          disabled={busy}
          aria-disabled={itemGate.allowed ? undefined : "true"}
          aria-describedby={itemGate.allowed ? undefined : rowReasonId}
          sx={{ opacity: itemGate.allowed ? 1 : 0.55 }}
        >
          {confirmId === `i${it.id}` ? "Confirm" : "Remove"}
        </Button>
      </div>
    </div>
    {!itemGate.allowed && (
      <div
        className={styles.ccHint}
        style={{ padding: "0 6px 6px", marginLeft: indentAvailable ? it.indent * 18 : 0 }}
      >
        <span id={rowReasonId}>{itemGate.reason}</span>
        {degradedNote && <> {degradedNote}</>}
      </div>
    )}
    </>
  );
}
