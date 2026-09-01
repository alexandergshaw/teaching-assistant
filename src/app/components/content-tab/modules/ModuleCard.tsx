"use client";

import type React from "react";
import { useState } from "react";
import { Button, Checkbox, IconButton, TextField } from "@mui/material";
import type { CanvasModule } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import { exportModuleKey, liveModuleKey, rowBlankClick } from "../utils";
import type { DisplayModule, DisplayModuleItem } from "../display-module-tree";
import { PublishToggle } from "../PublishToggle";
// AC2a/AC7-correction (docs/bulk-bar-reorganization-acceptance-criteria.md
// section 3c): moduleCheckboxVisualState is deliberately NOT imported here.
// The module checkbox's checked state now comes straight from
// `selectedModules` - the same Set its own onChange writes - never from an
// item-selection predicate. moduleSelectionState/selectItemsButtonLabel/
// selectItemsButtonTooltip stay: that three-state treatment lives entirely
// on the `Select items` button now (AC2b).
import { containerItemKeys, eligibleItemRefs, moduleSelectionState, selectItemsButtonLabel, selectItemsButtonTooltip, toggleContainerItems } from "./moduleItemSelection";
import {
  LIVE_CONTENT_SOURCE,
  fieldAvailable,
  gateOperation,
  type ContentSourceContext,
} from "../contentSourceGating";
import { ArrowButton } from "./ArrowButton";
import { ModuleItemRow, type ModuleItemRowProps } from "./ModuleItemRow";
import { AddItemRow, type AddItemRowProps } from "./AddItemRow";
import { ExportAddItemRow, type ExportAddItemRowSharedProps } from "./ExportAddItemRow";

export type ModuleItemRowSharedProps = Omit<ModuleItemRowProps, "m" | "it" | "ii" | "itemsLength">;
export type AddItemRowSharedProps = Omit<AddItemRowProps, "m">;

export interface ModuleCardProps {
  /** The display view-model for this module (either source) - see
   * display-module-tree.ts. `m.raw` (the exact live CanvasModule) is present
   * only when `m.source` is "canvas"; every write control below needs it and
   * is skipped entirely (via the early return) when it is absent. */
  m: DisplayModule;
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
  /** Discriminated module-key Set (liveModuleKey/exportModuleKey,
   * ../utils). */
  selectedModules: Set<string>;
  toggleModuleSelected: (id: number) => void;
  toggleModuleItems: (m: CanvasModule) => void;
  selected: Set<string>;
  /** Live-only rebuild of the selection Sets for an export-sourced module's
   * own checkbox and "select items" bulk toggle - see this component's
   * export branch below. `toggleModuleSelected`/`toggleModuleItems` above
   * stay Canvas-only (useModuleSelection.ts, unchanged by this file). */
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedModules: React.Dispatch<React.SetStateAction<Set<string>>>;
  itemVisible: (m: DisplayModule, it: DisplayModuleItem) => boolean;
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
  /** Add items to modules on an export-only course
   * (docs/export-module-additions-acceptance-criteria.md AC10) - ONE
   * threaded prop object, mirroring `addItemRowProps` above, rendered via
   * `ExportAddItemRow` in the export branch below rather than widening
   * `AddItemRow`. */
  exportAdditionsProps: ExportAddItemRowSharedProps;
  /** Which Course Content source is active, and whether a live Canvas course
   * is linked to write to - see contentSourceGating.ts. Optional and
   * defaulted to LIVE_CONTENT_SOURCE so every existing call site (none of
   * which pass this yet) renders and behaves exactly as it did before this
   * prop existed. */
  sourceContext?: ContentSourceContext;
}

// One module card: the head row (drag handle, selection, name, publish,
// reorder, delete), its expanded item list, and the "Add item" row.
//
// A LIVE module (m.raw present) renders the full read/write card, unchanged
// from before this file was retyped against the display model
// (docs/REGRESSION.md entry 264 check 9) - every field this branch reads
// comes from `mc` (`m.raw`), the exact CanvasModule this card was built
// from. An EXPORT module (no `raw`, no Canvas identity for any of rename/
// publish/reorder/delete/drag to act on) renders a much smaller, honest
// head row via the early return below - name, item count, and a selection
// checkbox/bulk-select-items toggle built from the export's own
// `identifier`s so "Generate from selection" can still reach it - and then
// the SAME item list and Add-item row as the live branch, since
// ModuleItemRow/AddItemRow each already gate themselves per item/module.
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
  setSelected,
  setSelectedModules,
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
  exportAdditionsProps,
  sourceContext,
}: ModuleCardProps) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // "modules": "any other write that targets the specific modules currently
  // on screen" (contentSourceGating.ts's own GatedSubject doc) - covers this
  // card's own rename/publish/reorder/delete controls, not only
  // BulkModulesSection's selection-wide writes.
  const moduleGate = gateOperation(ctx, "modules");
  const publishedAvailable = fieldAvailable(ctx.source, "published");
  // Export-only expand/collapse: purely local UI state, not lifted to
  // ContentTab's `expanded` Set (that Set is keyed by numeric Canvas module
  // id, which an export module never has - see display-module-tree.ts's own
  // header comment on why that id is never fabricated). Nothing outside
  // this card needs to know an export module's expand state.
  const [exportOpen, setExportOpen] = useState(false);

  if (!m.raw) {
    const moduleSelKey = m.identifier ? exportModuleKey(m.identifier) : null;
    // AC9 - instructor-added items are EXCLUDED from every selection set
    // this slice, and that is explicit rather than accidental: an added
    // item (display-module-tree.ts's `added: true`) never carries an
    // `identifier` (it has none - see that file's own comment), so this
    // `it.identifier` filter already excludes it from `itemSelKeys` without
    // any separate check. Wiring selection to resolve against the overlay
    // is a follow-up (the AC doc's own AC9) - the server-side selection
    // read re-parses the STORED export and would report an added item "no
    // longer present", which is exactly entry 274 check 6a's failure shape
    // if this exclusion were ever accidental instead of explicit.
    const itemSelKeys = m.identifier
      ? containerItemKeys({
          source: "export",
          moduleRef: m.identifier,
          itemRefs: eligibleItemRefs(m.items, (it) => it.identifier),
        })
      : [];
    // AC2b: this three-state predicate now feeds ONLY the Select-items
    // button (label + tooltip below) - the checkbox reads `selectedModules`
    // directly, a few lines down, per AC2a.
    const itemSelectionState = moduleSelectionState(selected, itemSelKeys);
    const toggleModuleSelectionKey = () => {
      if (!moduleSelKey) return;
      setSelectedModules((prev) => {
        const next = new Set(prev);
        if (next.has(moduleSelKey)) next.delete(moduleSelKey);
        else next.add(moduleSelKey);
        return next;
      });
    };
    const toggleItemsInModule = () => {
      if (itemSelKeys.length === 0) return;
      setSelected((prev) => toggleContainerItems(prev, itemSelKeys));
    };

    return (
      <div className={styles.ccModule}>
        <div className={styles.ccHead} onClick={(e) => rowBlankClick(e, toggleModuleSelectionKey)}>
          <IconButton
            size="small"
            onClick={() => setExportOpen((v) => !v)}
            aria-expanded={exportOpen}
            aria-label={exportOpen ? "Collapse module" : "Expand module"}
          >
            {exportOpen ? "▾" : "▸"}
          </IconButton>
          {/* JOB 3 / AC1: the checkbox and "Select items" grouped as one
              selection cluster (styles.ccSelectGroup - new class, reported to
              1C/Wave 2 to add; see this file's own wiring test for what it
              pins). AC2a/AC7-correction (bulk-bar-reorganization-acceptance-
              criteria.md section 3c): checked reflects `selectedModules`
              membership - the SAME Set onChange writes below - with no
              indeterminate state, because module selection is binary. The
              three-state ITEM signal lives entirely on the button (AC2b). */}
          <span className={styles.ccSelectGroup}>
            <Checkbox
              checked={moduleSelKey ? selectedModules.has(moduleSelKey) : false}
              onChange={toggleModuleSelectionKey}
              disabled={!moduleSelKey}
              aria-label={`Select module ${m.name}`}
              title="Select this module"
              size="small"
            />
            <Button
              variant="outlined"
              size="small"
              onClick={toggleItemsInModule}
              disabled={itemSelKeys.length === 0}
              title={selectItemsButtonTooltip(itemSelectionState, "module", "item", true)}
            >
              {selectItemsButtonLabel(itemSelectionState)}
            </Button>
          </span>
          <span className={styles.ccName} title={m.name} style={{ display: "inline-flex", alignItems: "center" }}>
            {m.name}
          </span>
          <span className={styles.ccCount}>
            {m.items.length} item{m.items.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className={styles.ccHint} style={{ padding: "var(--space-1) var(--space-2)" }}>
          {moduleGate.reason}
        </div>

        {exportOpen && (
          <div className={styles.ccItems}>
            {m.items.length === 0 && (
              <p className={styles.ccHint} style={{ padding: "var(--space-1) var(--space-2)" }}>
                No items in this module.
              </p>
            )}
            {m.items.map((it, ii) =>
              !itemVisible(m, it) ? null : (
                <ModuleItemRow
                  key={it.id ?? it.identifier ?? ii}
                  m={m}
                  it={it}
                  ii={ii}
                  itemsLength={m.items.length}
                  {...itemRowProps}
                />
              )
            )}
            <AddItemRow m={m} {...addItemRowProps} />
            <ExportAddItemRow m={m} {...exportAdditionsProps} />
          </div>
        )}
      </div>
    );
  }

  // From here on, `mc` is the EXACT live CanvasModule this card was built
  // from (display-module-tree.ts's `raw`, never a clone) - every write
  // handler below, unchanged by this file, is called exactly as it was
  // before the retype.
  const mc = m.raw;
  const liveItemKeys = containerItemKeys({
    source: "live",
    moduleRef: String(mc.id),
    itemRefs: mc.items.map((it) => String(it.id)),
  });
  // AC2b: this three-state predicate now feeds ONLY the Select-items button
  // (label + tooltip below) - the checkbox reads `selectedModules` directly
  // via `liveModuleKey(mc.id)`, per AC2a.
  const liveItemSelectionState = moduleSelectionState(selected, liveItemKeys);

  return (
    <div
      key={mc.id}
      ref={(el) => {
        if (el) moduleNodes.current.set(mc.id, el);
        else moduleNodes.current.delete(mc.id);
      }}
      className={styles.ccModule}
      onDragOver={(e) => {
        if (moduleDrag !== null) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverModuleRow(mc.id);
        }
      }}
      onDragLeave={() => setDragOverModuleRow((cur) => (cur === mc.id ? null : cur))}
      onDrop={(e) => {
        if (moduleDrag !== null) {
          e.preventDefault();
          performModuleMove(mc.id);
        }
      }}
      style={{
        opacity: moduleDrag === mc.id ? 0.55 : 1,
        boxShadow: moduleDrag === mc.id ? "var(--shadow-md)" : undefined,
        outline:
          dragOverModuleRow === mc.id && moduleDrag !== null && moduleDrag !== mc.id
            ? "2px solid var(--accent)"
            : undefined,
        outlineOffset: -1,
      }}
    >
      <div
        className={styles.ccHead}
        style={{ cursor: "pointer" }}
        onClick={(e) => rowBlankClick(e, () => toggleModuleSelected(mc.id))}
        onDragOver={(e) => {
          if (drag) e.preventDefault();
        }}
        onDrop={(e) => {
          if (drag) {
            e.preventDefault();
            performMove(mc.id, null);
          }
        }}
      >
        <span
          draggable={moduleGate.allowed}
          onDragStart={(e) => {
            if (!moduleGate.allowed) return;
            setModuleDrag(mc.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", `module-${mc.id}`);
          }}
          onDragEnd={() => {
            setModuleDrag(null);
            setDragOverModuleRow(null);
          }}
          className={styles.ccGrip}
          title="Drag to reorder modules"
          aria-label="Drag to reorder module"
          style={moduleDrag === mc.id ? { cursor: "grabbing", color: "var(--accent-ink)" } : undefined}
        >
          ⠿
        </span>
        <IconButton
          size="small"
          onClick={() => onToggleExpand(mc.id)}
          aria-expanded={open}
          aria-label={open ? "Collapse module" : "Expand module"}
        >
          {open ? "▾" : "▸"}
        </IconButton>
        {/* JOB 3 / AC1: the checkbox and "Select items" grouped as one
            selection cluster (styles.ccSelectGroup - new class, reported to
            1C/Wave 2 to add), visually separated from the navigational
            controls before it and the destructive `Delete` well after it.
            AC2a/AC7-correction (bulk-bar-reorganization-acceptance-
            criteria.md section 3c): checked reflects `selectedModules`
            membership via `liveModuleKey(mc.id)` - the SAME thing onChange
            writes - with no indeterminate state, because module selection is
            binary. A control's visual state must match what it writes; the
            three-state ITEM signal lives entirely on the button (AC2b). */}
        <span className={styles.ccSelectGroup}>
          <Checkbox
            checked={selectedModules.has(liveModuleKey(mc.id))}
            onChange={() => toggleModuleSelected(mc.id)}
            aria-label={`Select module ${mc.name}`}
            title="Select this module"
            size="small"
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => toggleModuleItems(mc)}
            disabled={mc.items.length === 0}
            title={selectItemsButtonTooltip(liveItemSelectionState, "module", "item", true)}
          >
            {selectItemsButtonLabel(liveItemSelectionState)}
          </Button>
        </span>
        <TextField
          size="small"
          className={styles.ccName}
          title={mc.name}
          value={drafts[`m${mc.id}`] ?? mc.name}
          onChange={(e) => setDrafts((p) => ({ ...p, [`m${mc.id}`]: e.target.value }))}
          onBlur={() => void saveModuleName(mc)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className={styles.ccCount}>
          {mc.items.length} item{mc.items.length === 1 ? "" : "s"}
        </span>
        <ArrowButton label="Move up" onClick={() => moveModule(mi, -1)} disabled={busy || isFirst} />
        <ArrowButton label="Move down" onClick={() => moveModule(mi, 1)} disabled={busy || isLast} />
        {publishedAvailable && <PublishToggle published={mc.published} disabled={busy} onClick={() => toggleModule(mc)} />}
        <IconButton
          size="small"
          component="a"
          href={`${courseBase}/modules#context_module_${mc.id}`}
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
          onClick={() => void removeModule(mc)}
          disabled={busy}
        >
          {confirmId === `m${mc.id}` ? "Confirm delete" : "Delete"}
        </Button>
      </div>

      {open && (
        <div className={styles.ccItems}>
          {mc.items.length === 0 && (
            <p className={styles.ccHint} style={{ padding: "var(--space-1) var(--space-2)" }}>
              No items in this module.
            </p>
          )}
          {m.items.map((it, ii) =>
            !itemVisible(m, it) ? null : (
              <ModuleItemRow key={it.id ?? ii} m={m} it={it} ii={ii} itemsLength={m.items.length} {...itemRowProps} />
            )
          )}

          {drag && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverModule(mc.id);
              }}
              onDragLeave={() => setDragOverModule((cur) => (cur === mc.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                performMove(mc.id, null);
              }}
              className={`${styles.ccDropEnd} ${dragOverModule === mc.id ? styles.ccDropEndActive : ""}`}
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
