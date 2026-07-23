"use client";

import type React from "react";
import { Button, Checkbox, IconButton, TextField } from "@mui/material";
import type { CanvasModule } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import { itemKey, rowBlankClick } from "../utils";
import { PublishToggle } from "../PublishToggle";
import { ArrowButton } from "./ArrowButton";
import { ModuleItemRow, type ModuleItemRowProps } from "./ModuleItemRow";
import { AddItemRow, type AddItemRowProps } from "./AddItemRow";

export type ModuleItemRowSharedProps = Omit<ModuleItemRowProps, "m" | "it" | "ii" | "itemsLength">;
export type AddItemRowSharedProps = Omit<AddItemRowProps, "m">;

export interface ModuleCardProps {
  m: CanvasModule;
  mi: number;
  isFirst: boolean;
  isLast: boolean;
  open: boolean;
  onToggleExpand: (id: number) => void;
  busy: boolean;
  courseBase: string;
  confirmId: string | null;
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveModuleName: (m: CanvasModule) => Promise<void>;
  moveModule: (index: number, dir: -1 | 1) => void;
  toggleModule: (m: CanvasModule) => void;
  removeModule: (m: CanvasModule) => Promise<void>;
  selectedModules: Set<number>;
  toggleModuleSelected: (id: number) => void;
  toggleModuleItems: (m: CanvasModule) => void;
  selected: Set<string>;
  itemVisible: (m: CanvasModule, it: CanvasModule["items"][number]) => boolean;
  moduleNodes: React.MutableRefObject<Map<number, HTMLElement | null>>;
  moduleDrag: number | null;
  setModuleDrag: React.Dispatch<React.SetStateAction<number | null>>;
  dragOverModuleRow: number | null;
  setDragOverModuleRow: React.Dispatch<React.SetStateAction<number | null>>;
  performModuleMove: (targetId: number) => void;
  drag: { moduleId: number; itemId: number } | null;
  dragOverModule: number | null;
  setDragOverModule: React.Dispatch<React.SetStateAction<number | null>>;
  performMove: (targetModuleId: number, beforeItemId: number | null) => void;
  itemRowProps: ModuleItemRowSharedProps;
  addItemRowProps: AddItemRowSharedProps;
}

// One module card: the head row (drag handle, selection, name, publish,
// reorder, delete), its expanded item list, and the "Add item" row.
export function ModuleCard({
  m,
  mi,
  isFirst,
  isLast,
  open,
  onToggleExpand,
  busy,
  courseBase,
  confirmId,
  drafts,
  setDrafts,
  saveModuleName,
  moveModule,
  toggleModule,
  removeModule,
  selectedModules,
  toggleModuleSelected,
  toggleModuleItems,
  selected,
  itemVisible,
  moduleNodes,
  moduleDrag,
  setModuleDrag,
  dragOverModuleRow,
  setDragOverModuleRow,
  performModuleMove,
  drag,
  dragOverModule,
  setDragOverModule,
  performMove,
  itemRowProps,
  addItemRowProps,
}: ModuleCardProps) {
  const moduleItemsSelected = m.items.length > 0 && m.items.every((it) => selected.has(itemKey(m.id, it.id)));

  return (
    <div
      key={m.id}
      ref={(el) => {
        if (el) moduleNodes.current.set(m.id, el);
        else moduleNodes.current.delete(m.id);
      }}
      className={styles.ccModule}
      onDragOver={(e) => {
        if (moduleDrag !== null) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverModuleRow(m.id);
        }
      }}
      onDragLeave={() => setDragOverModuleRow((cur) => (cur === m.id ? null : cur))}
      onDrop={(e) => {
        if (moduleDrag !== null) {
          e.preventDefault();
          performModuleMove(m.id);
        }
      }}
      style={{
        opacity: moduleDrag === m.id ? 0.55 : 1,
        boxShadow: moduleDrag === m.id ? "0 8px 20px rgba(15, 23, 42, 0.16)" : undefined,
        outline:
          dragOverModuleRow === m.id && moduleDrag !== null && moduleDrag !== m.id
            ? "2px solid var(--accent)"
            : undefined,
        outlineOffset: -1,
      }}
    >
      <div
        className={styles.ccHead}
        style={{ cursor: "pointer" }}
        onClick={(e) => rowBlankClick(e, () => toggleModuleSelected(m.id))}
        onDragOver={(e) => {
          if (drag) e.preventDefault();
        }}
        onDrop={(e) => {
          if (drag) {
            e.preventDefault();
            performMove(m.id, null);
          }
        }}
      >
        <span
          draggable
          onDragStart={(e) => {
            setModuleDrag(m.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", `module-${m.id}`);
          }}
          onDragEnd={() => {
            setModuleDrag(null);
            setDragOverModuleRow(null);
          }}
          className={styles.ccGrip}
          title="Drag to reorder modules"
          aria-label="Drag to reorder module"
          style={moduleDrag === m.id ? { cursor: "grabbing", color: "var(--accent-ink)" } : undefined}
        >
          ⠿
        </span>
        <Checkbox
          checked={selectedModules.has(m.id)}
          onChange={() => toggleModuleSelected(m.id)}
          aria-label={`Select module ${m.name}`}
          title="Select this module"
          size="small"
        />
        <IconButton
          size="small"
          onClick={() => onToggleExpand(m.id)}
          aria-expanded={open}
          aria-label={open ? "Collapse module" : "Expand module"}
        >
          {open ? "▾" : "▸"}
        </IconButton>
        <Button
          variant="outlined"
          size="small"
          onClick={() => toggleModuleItems(m)}
          disabled={m.items.length === 0}
          title={moduleItemsSelected ? "Deselect every item in this module" : "Select every item in this module"}
        >
          {moduleItemsSelected ? "Deselect items" : "Select items"}
        </Button>
        <TextField
          size="small"
          className={styles.ccName}
          title={m.name}
          value={drafts[`m${m.id}`] ?? m.name}
          onChange={(e) => setDrafts((p) => ({ ...p, [`m${m.id}`]: e.target.value }))}
          onBlur={() => void saveModuleName(m)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className={styles.ccCount}>
          {m.items.length} item{m.items.length === 1 ? "" : "s"}
        </span>
        <ArrowButton label="Move up" onClick={() => moveModule(mi, -1)} disabled={busy || isFirst} />
        <ArrowButton label="Move down" onClick={() => moveModule(mi, 1)} disabled={busy || isLast} />
        <PublishToggle published={m.published} disabled={busy} onClick={() => toggleModule(m)} />
        <IconButton
          size="small"
          component="a"
          href={`${courseBase}/modules#context_module_${m.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on Canvas"
          aria-label="Open module on Canvas"
        >
          ↗
        </IconButton>
        <Button
          variant="outlined"
          size="small"
          color="error"
          onClick={() => void removeModule(m)}
          disabled={busy}
        >
          {confirmId === `m${m.id}` ? "Confirm delete" : "Delete"}
        </Button>
      </div>

      {open && (
        <div className={styles.ccItems}>
          {m.items.length === 0 && (
            <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
              No items in this module.
            </p>
          )}
          {m.items.map((it, ii) =>
            !itemVisible(m, it) ? null : (
              <ModuleItemRow key={it.id} m={m} it={it} ii={ii} itemsLength={m.items.length} {...itemRowProps} />
            )
          )}

          {drag && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverModule(m.id);
              }}
              onDragLeave={() => setDragOverModule((cur) => (cur === m.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                performMove(m.id, null);
              }}
              className={`${styles.ccDropEnd} ${dragOverModule === m.id ? styles.ccDropEndActive : ""}`}
            >
              Drop here to move to the end of this module
            </div>
          )}

          <AddItemRow m={m} {...addItemRowProps} />
        </div>
      )}
    </div>
  );
}
