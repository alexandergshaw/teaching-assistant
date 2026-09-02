"use client";

// docs/knowledge-recording-handoff-acceptance-criteria.md section 4b: "the
// option to select more ... from the recording page" - the owner's last
// remaining half. "Less" (removal) already shipped as CarriedKnowledgePages.tsx;
// this file is "more" - adding a Knowledge Base page to a run's context from
// the recording panel, without going back to the Knowledge tab.
//
// Rendered UNCONDITIONALLY by both DiscussionRepliesPanel.tsx and
// GradingRecordingPanel.tsx (the only two RecordingKnowledgeContext
// destinations - recording-launch.ts's own "exactly two destinations" note),
// same as CarriedKnowledgePages.tsx - but UNLIKE that component, this one has
// something to show even when `context` is null: an instructor who started a
// plain recording/grading run and only NOW wants Knowledge Base context is
// this feature's primary case, not an edge case of an already-launched run.
// It must never be gated behind "only show this if something is already
// carried".
//
// INSTITUTION (4b's own blocker): RecordingTab's `active` prop is a
// visibility boolean, unrelated to institution, and no institution value
// reaches either destination panel. readKbInstitution() (knowledge-
// helpers.ts) is the Knowledge tab's OWN stored institution choice
// (independent of the header's active institution - see that function's own
// module comment) and is read here as a SNAPSHOT the moment the picker is
// opened - matching the snapshot-at-click precedent KnowledgeTab.tsx's own
// launch sites (startRecordingWithSelection/startGradingWithSelection)
// already use. A missing/empty institution renders an explicit state below
// and fetches nothing, offers nothing - never an empty tree that reads as
// "you have no pages."
//
// TREE (4c): deliberately NOT useKbPageTree.ts - that hook's applySelection
// writes ta-kb-selected-page, the SAME per-institution key the Knowledge tab
// reads for "which page is open"; a recording-side mount that ever called it
// would silently overwrite where the instructor lands next time they open
// Knowledge. Its load effect also has no cache/dedupe/SWR layer, so a second
// mount would be a second full institution-WITH-BODIES fetch. This file
// fetches SUMMARIES only (listInstitutionPageSummariesAction - id/parentId/
// title/position, no body - the entire reason that action exists alongside
// listInstitutionPagesAction) and nests them with its own small
// buildSummaryTree below, rather than widening buildPageTree
// (src/lib/knowledge-base.ts) to accept a second shape - that file is
// outside this feature's file set. Bodies are fetched only for the pages
// actually being added (getInstitutionPagesByIdsAction, called with exactly
// the newly checked ids via idsPendingAdd below) - never a full-bodied list
// load.
//
// AC1 (docs/knowledge-recording-handoff-acceptance-criteria.md section 2):
// adding a page re-runs the whole character budget, and the budget loop uses
// `continue`, not `break` (src/lib/chat/knowledge-context.ts's own doc) - a
// large NEW page can be skipped while a smaller, LATER page still gets in,
// and merely growing the page COUNT can shrink the reserved worst-case-note
// budget enough to push a previously-fitting page out even though nothing
// about that page itself changed. computeContextAfterAddingPages below never
// assumes the pre-add inclusion still holds: it reuses
// CarriedKnowledgePages.tsx's own recomputeCarriedKnowledgeContext (the SAME
// fresh-recompute helper removal already uses - reused, not re-implemented)
// over the WHOLE merged set every time, and reports any previously-carried
// page the fresh recompute no longer includes. Never silently dropped - the
// caller (this component) surfaces it as a standing note until dismissed.

import { useCallback, useMemo, useState } from "react";
import { Button, Checkbox } from "@mui/material";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";
import { listInstitutionPageSummariesAction, getInstitutionPagesByIdsAction } from "@/app/actions/knowledge-base";
import { readKbInstitution, type SelectedContextPage } from "../knowledge/knowledge-helpers";
import type { InstitutionPageSummary } from "@/lib/knowledge-base";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";
import { recomputeCarriedKnowledgeContext } from "./CarriedKnowledgePages";

export interface SummaryTreeNode extends InstitutionPageSummary {
  children: SummaryTreeNode[];
}

/**
 * Nest a flat InstitutionPageSummary[] into a tree, siblings ordered by
 * position then title - the same sibling order buildPageTree
 * (src/lib/knowledge-base.ts) uses, without reusing that function (see this
 * file's own header for why: it is typed against the full InstitutionPage
 * shape, and widening it is outside this feature's file set).
 *
 * A page whose parentId is missing, unknown, or points at itself is treated
 * as a root - this can never hang or drop a page even on corrupt data,
 * because every node is grouped under its own resolved parent id exactly
 * once, and `build` below only ever walks parent ids reachable from the root
 * down. A genuine multi-node cycle among non-root pages (which
 * moveInstitutionPage's own wouldCreateCycle guard should already prevent
 * from existing) is therefore simply unreachable from the root and omitted
 * from the picker rather than looped on - an acceptable degrade for a
 * read-only picker, unlike buildPageTree's own computeEffectiveParents
 * repair, which this deliberately does not reproduce.
 */
export function buildSummaryTree(pages: InstitutionPageSummary[]): SummaryTreeNode[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const byParent = new Map<string | null, InstitutionPageSummary[]>();
  for (const page of pages) {
    const parentId =
      page.parentId && page.parentId !== page.id && byId.has(page.parentId) ? page.parentId : null;
    const list = byParent.get(parentId);
    if (list) list.push(page);
    else byParent.set(parentId, [page]);
  }
  const sortSiblings = (list: InstitutionPageSummary[]): InstitutionPageSummary[] =>
    [...list].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  function build(parentId: string | null): SummaryTreeNode[] {
    return sortSiblings(byParent.get(parentId) ?? []).map((page) => ({ ...page, children: build(page.id) }));
  }
  return build(null);
}

/**
 * The ids a checkbox selection would actually add - excluding anything
 * already carried. Adding an already-carried page is therefore a no-op at
 * THIS layer, before any fetch or budget recompute ever runs - the picker's
 * own checkboxes also disable an already-carried row so this can never be
 * reached through the UI with such an id in `checked` in the first place,
 * but this stays a pure, independently-testable guarantee rather than one
 * that only holds as a side effect of a disabled attribute.
 */
export function idsPendingAdd(checked: ReadonlySet<string>, existingIds: ReadonlySet<string>): string[] {
  return Array.from(checked).filter((id) => !existingIds.has(id));
}

export interface AddKnowledgePagesResult {
  /** The recomputed carried context - same "fresh recompute, never a stale
   *  included/omitted flag" contract as recomputeCarriedKnowledgeContext
   *  itself (reused here, not re-implemented). null when nothing survives. */
  context: RecordingKnowledgeContext | null;
  /** Titles of newly added pages that made it into the recomputed budget. */
  addedTitles: string[];
  /** AC1's highest-value case: titles of pages that were ALREADY carried
   *  before this add and are no longer in the recomputed budget - this
   *  addition pushed them out (the budget loop is `continue`, not `break`,
   *  so this is never a simple prefix truncation, and can happen even when
   *  the newly added page itself does not survive - see this file's own
   *  header). Empty when nothing was pushed out. Never silently dropped. */
  pushedOutTitles: string[];
}

/**
 * Merge newly-added pages into whatever is already carried and recompute the
 * budget fresh over the WHOLE set (never assume the pre-add inclusion still
 * holds - see recomputeCarriedKnowledgeContext's own doc). De-dupes
 * defensively by id so a caller can never end up carrying the same page
 * twice, independent of idsPendingAdd's own UI-layer guard above.
 */
export function computeContextAfterAddingPages(
  existingPages: SelectedContextPage[],
  newPages: SelectedContextPage[]
): AddKnowledgePagesResult {
  const existingIds = new Set(existingPages.map((p) => p.id));
  const genuinelyNew = newPages.filter((p) => !existingIds.has(p.id));
  const merged = [...existingPages, ...genuinelyNew];
  const context = recomputeCarriedKnowledgeContext(merged);
  const includedIds = new Set((context?.pages ?? []).map((p) => p.id));
  const pushedOutTitles = existingPages
    .filter((p) => !includedIds.has(p.id))
    .map((p) => p.title.trim() || "Untitled page");
  const addedTitles = genuinelyNew
    .filter((p) => includedIds.has(p.id))
    .map((p) => p.title.trim() || "Untitled page");
  return { context, addedTitles, pushedOutTitles };
}

export interface AddKnowledgePagesProps {
  /** The run's currently carried context, or null when nothing is carried -
   *  the same value CarriedKnowledgePages.tsx already reads. Unlike that
   *  component, this one renders something (the "Add pages" toggle) even
   *  when `context` is null. */
  context: RecordingKnowledgeContext | null;
  /** Replace the carried context wholesale - the same contract
   *  CarriedKnowledgePages.tsx's onChange already has. */
  onChange: (next: RecordingKnowledgeContext | null) => void;
}

interface TreeRowProps {
  node: SummaryTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  checked: Set<string>;
  existingIds: Set<string>;
  onToggleChecked: (id: string) => void;
}

/** Mirrors PageTreeView.tsx's own list/row split (K5): each recursive level
 *  gets its OWN `styles.kbTreeScroll` (the flex/gap layout every row needs),
 *  and every level past the root additionally gets `kbNestedTreeGroup`
 *  (resets ONLY the max-height/overflow that class also sets) so a nested
 *  branch flows inside the root's one scroll region instead of becoming its
 *  own second scroll container. The root's own max-height is overridden
 *  smaller than PageTreeView's 560px (this aesthetics pass's own "must not
 *  dominate" rule for a picker living inside a recording panel, not the
 *  Knowledge tab's own full-page tree). */
function SummaryTreeList({ nodes, depth, ...rowProps }: { nodes: SummaryTreeNode[] } & Omit<TreeRowProps, "node">) {
  return (
    <div
      className={depth === 0 ? styles.kbTreeScroll : `${styles.kbTreeScroll} ${kbStyles.kbNestedTreeGroup}`}
      style={depth === 0 ? { maxHeight: 260 } : undefined}
    >
      {nodes.map((node) => (
        <SummaryTreeRow key={node.id} node={node} depth={depth} {...rowProps} />
      ))}
    </div>
  );
}

function SummaryTreeRow({ node, depth, expanded, onToggleExpand, checked, existingIds, onToggleChecked }: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const alreadyCarried = existingIds.has(node.id);
  const isChecked = alreadyCarried || checked.has(node.id);
  const label = node.title.trim() || "Untitled page";

  return (
    <div>
      <div className={styles.kbNodeRow} style={{ paddingLeft: `calc(var(--space-4) * ${depth})` }}>
        {hasChildren ? (
          <button
            type="button"
            className={styles.kbNodeToggle}
            onClick={() => onToggleExpand(node.id)}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
            title={isOpen ? `Collapse ${label}` : `Expand ${label}`}
          >
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
        <Checkbox
          size="small"
          checked={isChecked}
          disabled={alreadyCarried}
          onChange={() => onToggleChecked(node.id)}
          aria-label={alreadyCarried ? `${label} - already added to this run` : `Add ${label} to this run`}
          sx={{ padding: "var(--space-1)", flexShrink: 0 }}
        />
        <span className={styles.kbNodeLabel}>
          {label}
          {alreadyCarried ? " (already added)" : ""}
        </span>
      </div>
      {hasChildren && isOpen && (
        <SummaryTreeList
          nodes={node.children}
          depth={depth + 1}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          checked={checked}
          existingIds={existingIds}
          onToggleChecked={onToggleChecked}
        />
      )}
    </div>
  );
}

export default function AddKnowledgePages({ context, onChange }: AddKnowledgePagesProps) {
  const [open, setOpen] = useState(false);
  const [institution, setInstitution] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<InstitutionPageSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<{ addedTitles: string[]; pushedOutTitles: string[] } | null>(null);

  const existingPages = useMemo(() => context?.pages ?? [], [context]);
  const existingIds = useMemo(() => new Set(existingPages.map((p) => p.id)), [existingPages]);
  // 4a's own degrade case: a launch CAN carry `text` with no per-page
  // identity at all (recording-launch.ts's sanitizer strips `pages` down to
  // undefined independently of `text`). Merging new pages on top of that
  // would have to throw away whatever the opaque `text` was carrying - the
  // exact silent-loss AC1 forbids, merely on the ADD side instead of the
  // remove side. Refuse rather than guess, mirroring CarriedKnowledgePages.tsx's
  // own "renders nothing when there is no per-page identity to build on".
  const hasOpaqueContext = !!context?.text && existingPages.length === 0;

  const handleOpen = useCallback(() => {
    const inst = readKbInstitution();
    setInstitution(inst);
    setOpen(true);
    setExpanded(new Set());
    setChecked(new Set());
    setAddError(null);
    setSummaries(null);
    setLoadError(null);
    if (!inst) return; // explicit "no institution" state below - no fetch, no picker.
    setLoading(true);
    void listInstitutionPageSummariesAction(inst).then((result) => {
      setLoading(false);
      if ("error" in result) setLoadError(result.error);
      else setSummaries(result.pages);
    });
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleChecked = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(async () => {
    const ids = idsPendingAdd(checked, existingIds);
    if (ids.length === 0) {
      // 4e: every checked page was already carried - a no-op, not a
      // duplicate. No fetch, no recompute, no onChange call.
      setChecked(new Set());
      return;
    }
    setAdding(true);
    setAddError(null);
    // Bodies fetched only for the pages actually being added - never the
    // whole summaries list.
    const result = await getInstitutionPagesByIdsAction(ids);
    setAdding(false);
    if ("error" in result) {
      setAddError(result.error);
      return;
    }
    const newPages: SelectedContextPage[] = result.pages.map((p) => ({ id: p.id, title: p.title, body: p.body }));
    const outcome = computeContextAfterAddingPages(existingPages, newPages);
    onChange(outcome.context);
    setLastOutcome({ addedTitles: outcome.addedTitles, pushedOutTitles: outcome.pushedOutTitles });
    setChecked(new Set());
    // Deliberately left OPEN (not auto-closed): the tree re-renders with the
    // just-added pages now shown as "(already added)" and disabled, so the
    // instructor can keep picking more without re-opening - minimizing click
    // cost for adding several pages in one sitting.
  }, [checked, existingIds, existingPages, onChange]);

  const pendingCount = idsPendingAdd(checked, existingIds).length;
  const tree = summaries ? buildSummaryTree(summaries) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      {hasOpaqueContext ? (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          This run&apos;s carried context has no per-page detail to add to - make a new selection from the Knowledge
          Base tab instead.
        </p>
      ) : (
        <div>
          <button type="button" className={styles.linkButton} onClick={open ? handleClose : handleOpen}>
            {open ? "Cancel" : "+ Add Knowledge Base pages"}
          </button>
        </div>
      )}

      {open && !hasOpaqueContext && (
        <div
          style={{
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-2)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
          }}
        >
          {!institution && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              No institution is selected in the Knowledge Base tab. Open Knowledge Base and choose an institution
              before adding pages here.
            </p>
          )}
          {institution && loading && <p className={styles.fieldHint} style={{ margin: 0 }}>Loading pages…</p>}
          {institution && loadError && (
            <p className={styles.error} style={{ margin: 0 }}>
              {loadError}
            </p>
          )}
          {institution && summaries && summaries.length === 0 && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              No pages yet in this institution&apos;s Knowledge Base.
            </p>
          )}
          {institution && summaries && summaries.length > 0 && (
            <>
              <SummaryTreeList
                nodes={tree}
                depth={0}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                checked={checked}
                existingIds={existingIds}
                onToggleChecked={toggleChecked}
              />
              {addError && (
                <p className={styles.error} style={{ margin: 0 }}>
                  {addError}
                </p>
              )}
              <div>
                <Button
                  size="small"
                  variant="contained"
                  disabled={pendingCount === 0 || adding}
                  onClick={() => void handleAdd()}
                >
                  {adding ? "Adding…" : pendingCount > 0 ? `Add ${pendingCount} page${pendingCount === 1 ? "" : "s"}` : "Add"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {lastOutcome && (lastOutcome.addedTitles.length > 0 || lastOutcome.pushedOutTitles.length > 0) && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          {lastOutcome.addedTitles.length > 0 && `Added ${lastOutcome.addedTitles.join(", ")}. `}
          {lastOutcome.pushedOutTitles.length > 0 &&
            `To stay within the context budget, ${lastOutcome.pushedOutTitles.join(", ")} ${
              lastOutcome.pushedOutTitles.length === 1 ? "was" : "were"
            } removed from this run. `}
          <button type="button" className={styles.linkButton} onClick={() => setLastOutcome(null)}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
