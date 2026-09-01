"use client";

import Checkbox from "@mui/material/Checkbox";
import type { InstitutionPageNode } from "@/lib/knowledge-base";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

interface PageTreeViewProps {
  nodes: InstitutionPageNode[];
  selectedId: string | null;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  /** Guarded by the caller - may refuse to switch (unsaved-edits warning). */
  onSelect: (id: string) => void;
  /** The bulk-selection checkbox set (S1) - entirely independent of
   *  `selectedId`/`onSelect` above. Ticking a row's checkbox never routes
   *  through the caller's unsaved-edits guard (S2), since it changes no
   *  editor state. */
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  renamingId: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  depth?: number;
}

/** One level of the page tree, recursing into children when expanded. Pure
 *  presentation - all state (selection, expansion, rename draft) is owned by
 *  KnowledgeTab so the unsaved-edits guard can veto a selection change. */
export default function PageTreeView({
  nodes,
  selectedId,
  expanded,
  onToggleExpand,
  onSelect,
  selected,
  onToggleSelect,
  renamingId,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  depth = 0,
}: PageTreeViewProps) {
  if (nodes.length === 0 && depth === 0) {
    return <p className={styles.kbTreeEmpty}>No pages yet. Add the first one above.</p>;
  }

  return (
    <div className={styles.kbTreeScroll} role={depth === 0 ? "tree" : undefined}>
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          selected={selected}
          onToggleSelect={onToggleSelect}
          renamingId={renamingId}
          renameDraft={renameDraft}
          onRenameDraftChange={onRenameDraftChange}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          depth={depth}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  selectedId,
  expanded,
  onToggleExpand,
  onSelect,
  selected,
  onToggleSelect,
  renamingId,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  depth,
}: Omit<PageTreeViewProps, "nodes"> & { node: InstitutionPageNode; depth: number }) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isChecked = selected.has(node.id);
  const isRenaming = renamingId === node.id;
  const nodeLabel = node.title.trim() || "Untitled page";

  return (
    <div>
      <div className={styles.kbNodeRow} style={{ paddingLeft: `calc(var(--space-4) * ${depth})` }}>
        {hasChildren ? (
          <button
            type="button"
            className={styles.kbNodeToggle}
            onClick={() => onToggleExpand(node.id)}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${node.title || "Untitled"}` : `Expand ${node.title || "Untitled"}`}
            title={isOpen ? `Collapse ${node.title || "Untitled"}` : `Expand ${node.title || "Untitled"}`}
          >
            {/* A single glyph that rotates on expand/collapse (see
                .treeChevron's doc comment in KnowledgeTab.module.css) rather
                than swapping between two different characters. */}
            <span
              className={isOpen ? `${kbStyles.treeChevron} ${kbStyles.treeChevronOpen}` : kbStyles.treeChevron}
              aria-hidden="true"
            >
              ▸
            </span>
          </button>
        ) : (
          <span className={styles.kbNodeToggleSpacer} aria-hidden="true" />
        )}

        {/* Bulk-selection checkbox (S1) - a control independent of the
            title button below: ticking it never calls onSelect (so it never
            navigates or reaches the caller's unsaved-edits guard - S2), and
            clicking the title never touches this checkbox. The two share a
            row only visually. stopPropagation on click is defensive - there
            is no ancestor click handler on this row today, but it keeps
            that guarantee even if one is added later. */}
        <Checkbox
          size="small"
          checked={isChecked}
          onChange={() => onToggleSelect(node.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${nodeLabel}`}
          sx={{ padding: "var(--space-1)", flexShrink: 0 }}
        />

        {isRenaming ? (
          <input
            className={styles.kbRenameInput}
            value={renameDraft}
            autoFocus
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRenameCommit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onRenameCancel();
              }
            }}
            onBlur={onRenameCommit}
            aria-label="Rename page"
          />
        ) : (
          <button
            type="button"
            className={`${styles.kbNodeButton}${isSelected ? ` ${styles.kbNodeButtonSelected}` : ""}`}
            onClick={() => onSelect(node.id)}
          >
            <span className={styles.kbNodeLabel}>{node.title.trim() || "Untitled page"}</span>
          </button>
        )}
      </div>

      {hasChildren && isOpen && (
        <PageTreeView
          nodes={node.children}
          selectedId={selectedId}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          selected={selected}
          onToggleSelect={onToggleSelect}
          renamingId={renamingId}
          renameDraft={renameDraft}
          onRenameDraftChange={onRenameDraftChange}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          depth={depth + 1}
        />
      )}
    </div>
  );
}
