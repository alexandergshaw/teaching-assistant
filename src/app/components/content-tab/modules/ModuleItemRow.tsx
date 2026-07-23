"use client";

import type React from "react";
import { Button, Checkbox, IconButton, MenuItem, TextField } from "@mui/material";
import type { CanvasModule, CanvasModuleItem, GradableKind } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import { DATED_TYPES, MAX_INDENT, POINTS_EDITABLE } from "../constants";
import { formatDueDate, itemKey, rowBlankClick, toLocalInput } from "../utils";
import { ItemA11yBadge } from "../ItemA11yBadge";
import { PublishToggle } from "../PublishToggle";
import { ArrowButton } from "./ArrowButton";

// Plain (non-component) helper so the impure `Date.now()` read stays out of
// the component's render body, satisfying react-hooks/purity.
function isOverdue(dueAt: string): boolean {
  return new Date(dueAt).getTime() < Date.now();
}

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
}: ModuleItemRowProps) {
  return (
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
        marginLeft: it.indent * 18,
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
        draggable
        onDragStart={(e) => {
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
      {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null ? (
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
        onBlur={() => void saveItemTitle(m, it)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span className={styles.ccDueSlot}>
        {DATED_TYPES.includes(it.type) &&
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
              onClick={() => setDueEdit({ id: it.id, value: toLocalInput(it.dueAt) })}
              disabled={busy || it.contentId == null}
              title={`Due ${new Date(it.dueAt).toLocaleString()} — click to edit`}
            >
              Due {formatDueDate(it.dueAt)}
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              className={`${styles.ccDue} ${styles.ccDueEmpty}`}
              onClick={() => setDueEdit({ id: it.id, value: "" })}
              disabled={busy || it.contentId == null}
              title="Click to set a due date"
            >
              No due date
            </Button>
          ))}
      </span>
      <span className={styles.ccPointsSlot}>
        {DATED_TYPES.includes(it.type) &&
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
              onClick={() =>
                setPointsEdit({ id: it.id, value: it.pointsPossible != null ? String(it.pointsPossible) : "" })
              }
              disabled={busy || it.contentId == null || !POINTS_EDITABLE.includes(it.type)}
              title={
                POINTS_EDITABLE.includes(it.type)
                  ? "Click to edit points"
                  : "Points (edit on the assignment)"
              }
            >
              {it.pointsPossible != null ? `${it.pointsPossible} pts` : "No points"}
            </Button>
          ))}
      </span>
      <div className={styles.ccItemActions}>
        <ArrowButton label="Move up" onClick={() => moveItem(m, ii, -1)} disabled={busy || ii === 0} />
        <ArrowButton label="Move down" onClick={() => moveItem(m, ii, 1)} disabled={busy || ii === itemsLength - 1} />
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
        <span className={styles.ccActionsSep} aria-hidden="true" />
        <ItemA11yBadge item={it} />
        <PublishToggle published={it.published} disabled={busy} onClick={() => toggleItem(m, it)} />
        {it.type === "Page" && it.pageUrl && (
          <Button variant="outlined" size="small" onClick={() => onEditPage(it.pageUrl!)}>
            Edit page
          </Button>
        )}
        {it.type === "Assignment" && it.contentId != null && (
          <Button variant="outlined" size="small" onClick={() => setPreviewAssignment(it)}>
            Preview
          </Button>
        )}
        {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null && (
          <Button variant="outlined" size="small" onClick={() => setEditingItem(it)}>
            Edit
          </Button>
        )}
        {it.type === "File" && it.contentId != null && (
          <Button variant="outlined" size="small" onClick={() => void openFilePreview(it)}>
            Preview
          </Button>
        )}
        {it.type === "File" && it.contentId != null && /\.(docx|pptx)$/i.test(it.title) && (
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
          onClick={() => void removeItem(m, it)}
          disabled={busy}
        >
          {confirmId === `i${it.id}` ? "Confirm" : "Remove"}
        </Button>
      </div>
    </div>
  );
}
