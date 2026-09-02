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

  // K4: `role="tree"` used to sit here at depth 0 with no `role="treeitem"`
  // anywhere in this file and no `role="group"` on a child list - a tree
  // that announces as containing nothing, which a screen reader user
  // experiences as WORSE than no role at all (it promises structure, then
  // delivers none). DECISION: removed rather than implemented properly. A
  // correct ARIA tree here would need aria-expanded on every parent,
  // aria-selected wired to ONE of two independent selection concepts this
  // component already has (the single "current page" via onSelect, and the
  // bulk-checkbox multi-select via onToggleSelect) - the ARIA tree pattern
  // assumes exactly one selection model, and reconciling that with two is a
  // real design question, not a mechanical fix - plus a full roving-tabindex
  // keyboard model (Up/Down/Left/Right/Home/End). That is a properly scoped
  // a11y project of its own, not a safe addition alongside K1-K10's already
  // large surface. Removing the role is a strict improvement today (no
  // longer promises structure it does not deliver) and does not foreclose
  // implementing the real thing later - nothing about this markup would
  // need to change shape to add it back correctly.
  //
  // K5: `.kbTreeScroll`'s max-height/overflow-y used to apply at EVERY
  // depth, since the recursive call always passed the same class - every
  // expanded branch became its OWN nested 560px scroll container. Still
  // applying `.kbTreeScroll` at every depth (it also carries the flex/gap
  // layout every row needs - page.module.css, read-only here), but a nested
  // level ADDITIONALLY gets `.kbNestedTreeGroup` (KnowledgeTab.module.css,
  // this feature's own file, since page.module.css cannot be edited here),
  // which resets ONLY max-height/overflow so a nested branch is plain flow
  // inside the root's single scroll region instead of a second, redundant
  // scroller.
  return (
    <div className={depth === 0 ? styles.kbTreeScroll : `${styles.kbTreeScroll} ${kbStyles.kbNestedTreeGroup}`}>
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
