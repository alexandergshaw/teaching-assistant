"use client";

// Per-institution knowledge base (policies, rules, deadlines) - a small
// Confluence/Notion-style page tree. Data layer lives in src/lib/knowledge-base.ts
// and src/app/actions/knowledge-base.ts (wave 1); this file is the tab's UI.
//
// Institution selection: this tab owns its own institution picker (see
// useKbInstitutionSelection in ./knowledge/knowledge-helpers.ts) instead of
// following the header's global InstitutionSwitcher (src/app/components/
// InstitutionSwitcher.tsx / TopBar.tsx) that the Live Feed and Communications
// tabs share. Changing the header has no effect here, and changing this
// tab's picker has no effect on the header - the header's active institution
// is consulted only as a one-time seed the first time this tab is used.
//
// Scope note on the unsaved-edits guard (AC4/AC5): this component guards
// in-tab navigation (selecting a different page, creating/deleting a page,
// closing/reloading the browser tab via beforeunload) AND switching this
// tab's own institution picker, since that discards the current page's
// unsaved edits just as surely as picking a different page does. It does
// NOT guard the header's InstitutionSwitcher - that control is shared by
// every institution-scoped tab, so hijacking it from here would be out of
// scope even if this tab still listened to it, which it no longer does.
//
// Institution + selected page (Back/Forward, AC1-AC5): page.tsx is the
// single history writer for the whole app (see src/app/url-state.ts), so
// this component does not call useKbInstitutionSelection() itself anymore -
// `active`/`institutions`/`onActiveChange` are passed down from page.tsx's
// own call to that hook, and the selected page id is reconciled against the
// `requestedPageId` prop (page.tsx's URL-tracked value) rather than resolved
// purely from localStorage on mount. See the reconciliation effect below for
// how a popstate-driven restore is distinguished from this component's own
// local selections, and page.tsx's popstate handler for how a dirty restore
// gets confirmed before it ever reaches this component as a new prop value.
//
// Split (1000-line-cap refactor): the state/effects/handlers that used to
// live directly in this component now live in dedicated hooks under
// ./knowledge/ - useKbPageTree (page list, selection, tree expansion),
// useKbEditSession (the draft edit session and its unsaved-edits guard),
// useKbAttachments (the attachments panel), useKbTreeActions (create/
// rename/delete/reorder/reparent), and useKbInstitutionPicker (add/remove
// institution). Each hook's module comment explains why its concern is
// only loosely coupled to the others. What remains here is the state that
// is genuinely cross-cutting (pendingAction/actionError/search - shared by
// more than one hook, or needed for institution-change resets those hooks
// cannot see), the small compositions that coordinate between hooks
// (switchInstitution, selectPage, openSearchHit), and rendering.

import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { searchPages } from "@/lib/knowledge-base";
import { formatRelative } from "../utils/time";
import TabShell from "./TabShell";
import TabHeader from "./TabHeader";
import PageTreeView from "./knowledge/PageTreeView";
import ParentPicker from "./knowledge/ParentPicker";
import AttachmentsPanel from "./knowledge/AttachmentsPanel";
import PageBody from "./knowledge/PageBody";
import KnowledgeBulkBar from "./knowledge/KnowledgeBulkBar";
import KnowledgeOverviewPanel from "./knowledge/KnowledgeOverviewPanel";
import { scopeHasDescendants } from "@/lib/knowledge-overview-scope";
import { useKbPageTree } from "./knowledge/useKbPageTree";
import { useKbEditSession } from "./knowledge/useKbEditSession";
import { useKbAttachments } from "./knowledge/useKbAttachments";
import { useKbTreeActions } from "./knowledge/useKbTreeActions";
import { useKbInstitutionPicker } from "./knowledge/useKbInstitutionPicker";
import { useKbSelection } from "./knowledge/useKbSelection";
import { useKbBulkActions } from "./knowledge/useKbBulkActions";
import {
  visiblePageIds,
  describeSelectedPages,
  selectAllVisibleVisualState,
  describeKnowledgeContextLabel,
  includedContextPages,
  SHOW_ALL_SELECTED_PAGES,
} from "./knowledge/knowledge-helpers";
import { openChat } from "@/lib/chat/open-chat";
import { buildKnowledgeContextBlock } from "@/lib/chat/knowledge-context";
import { openRecordingTool } from "@/lib/recording-launch";
import { takeKnowledgeReturnPageId } from "@/lib/knowledge-return";
import styles from "../page.module.css";
import kbStyles from "./KnowledgeTab.module.css";

interface KnowledgeTabProps {
  /** Registered institution acronyms - from page.tsx's useKbInstitutionSelection() call. */
  institutions: string[];
  /** The resolved active institution - from page.tsx's useKbInstitutionSelection() call. */
  active: string;
  /** Switch institution - clears page.tsx's URL-tracked selected page too (a
   *  different institution's page list makes the old selection meaningless). */
  onActiveChange: (code: string) => void;
  /** page.tsx's URL-tracked selected page id for the active institution - the
   *  value this component should reconcile its actual selection against. */
  requestedPageId: string | null;
  /** Report this component's actual resolved selection up, so page.tsx's URL
   *  stays in sync with it (AC1). */
  onSelectedPageIdChange: (id: string | null) => void;
  /** Report whether the current page edit session has unsaved changes, so
   *  page.tsx's popstate handler can guard a Back/Forward restore (AC5). */
  onDirtyChange: (dirty: boolean) => void;
}

export default function KnowledgeTab({
  institutions,
  active,
  onActiveChange,
  requestedPageId,
  onSelectedPageIdChange,
  onDirtyChange,
}: KnowledgeTabProps) {

  // ── Cross-cutting state that stays here rather than in any one hook:
  //     pendingAction/actionError are shared by useKbEditSession's saveEdit,
  //     useKbPageTree's refresh, and every mutation in useKbTreeActions;
  //     search belongs to no other hook's concern. ─────────────────────────
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Reset the state above the instant the active institution changes
  // (adjust state during render, not an effect - see AGENTS.md's
  // set-state-in-effect idiom). Every OTHER piece of per-institution state
  // resets itself the same way inside the hook that owns it - see
  // useKbPageTree, useKbEditSession, and useKbTreeActions's own prevActive
  // blocks - rather than being coordinated from one place that would have
  // to reach into every hook's internals. Note pendingAction is
  // deliberately NOT reset here, matching the original monolith.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setActionError(null);
    setSearch("");
  }

  const editSession = useKbEditSession({ active, onDirtyChange, setPendingAction });
  const {
    isEditing,
    draftTitle,
    setDraftTitle,
    draftBody,
    setDraftBody,
    draftTags,
    setDraftTags,
    saveError,
    bodyTextareaRef,
    confirmDiscard,
    closeEditSession,
    beginEdit,
    saveEdit,
    cancelEdit,
    insertAttachmentEmbed,
  } = editSession;

  const pageTree = useKbPageTree({
    active,
    requestedPageId,
    onSelectedPageIdChange,
    setActionError,
    closeEditSession,
  });
  const {
    pages,
    loadState,
    loadError,
    selectedId,
    expanded,
    setExpanded,
    tree,
    selectedPage,
    breadcrumb,
    applySelection,
    refresh,
    toggleExpand,
    expandAncestorsOf,
  } = pageTree;

  // Bulk-selection checkboxes (S1-S6) - deliberately independent of
  // `selectedId`/`applySelection` above: see useKbSelection.ts's own module
  // comment for why ticking a checkbox never touches the single-page
  // selection or its unsaved-edits guard (S2). Self-prunes against `pages`
  // and resets on institution change internally (S4); persists per
  // institution internally too (S5).
  const kbSelection = useKbSelection(active, pages);
  // The ids PageTreeView is actually rendering right now, given the current
  // expand/collapse state (S3) - recomputed only when the tree shape or
  // expansion changes, not on every render.
  const visibleIds = useMemo(() => visiblePageIds(tree, expanded), [tree, expanded]);
  // K6: checked/indeterminate driven by the FULL selection vs the visible
  // set, not just "are the visible ones all ticked" - see
  // selectAllVisibleVisualState's own doc for why a plain boolean here used
  // to paint a false "fully checked" box while dozens of pages sat selected
  // inside a collapsed branch.
  const selectAllVisual = selectAllVisibleVisualState(kbSelection.selected, visibleIds);
  // K6: an expandable "Show all" for the bulk bar's selection description -
  // collapsed to describeSelectedPages' own default cap normally, expanded
  // to the full selection (never folded into "+N more") once toggled.
  const [showAllSelected, setShowAllSelected] = useState(false);
  // B5: names the selection by TITLE, including pages sitting inside a
  // collapsed branch - built off the full flat `pages` list, never
  // `visibleIds` above, so a page with no checkbox currently on screen is
  // still legible here instead of silently riding along unseen.
  const selectionDescription = useMemo(
    () => describeSelectedPages(pages ?? [], kbSelection.selected, showAllSelected ? SHOW_ALL_SELECTED_PAGES : undefined),
    [pages, kbSelection.selected, showAllSelected]
  );
  const bulkDelete = useKbBulkActions({
    active,
    pages,
    tree,
    selected: kbSelection.selected,
    refresh,
    setActionError,
  });

  // Switch this tab's own institution (AC5): guarded exactly like selectPage
  // below, since it discards the current page's unsaved edits just as surely.
  // The rest of the per-institution reset (pages, selection, expansion, edit
  // session) happens via each hook's own reset-on-active-change block once
  // `active` changes; onActiveChange also clears page.tsx's URL-tracked
  // selected page (AC2 - a page id is meaningless, and ambiguous, without
  // the institution it belongs to), so useKbPageTree's reconciliation
  // effect re-derives the new institution's own persisted selection instead
  // of carrying the old one over.
  const switchInstitution = (code: string) => {
    if (code === active) return;
    if (!confirmDiscard()) return;
    onActiveChange(code);
  };

  const institutionPicker = useKbInstitutionPicker({ institutions, active, switchInstitution, confirmDiscard });
  const {
    newAcronym,
    setNewAcronym,
    addInstitutionError,
    setAddInstitutionError,
    addInstitution,
    removingInstitution,
    removeInstitutionError,
    removeInstitution,
  } = institutionPicker;

  const kbAttachments = useKbAttachments(selectedId);
  const { attachments, setAttachments, attachmentsError, attachmentsOpen, toggleAttachmentsOpen } = kbAttachments;

  const treeActions = useKbTreeActions({
    active,
    selectedId,
    pages,
    tree,
    selectedPage,
    expanded,
    setExpanded,
    refresh,
    confirmDiscard,
    beginEdit,
    setIsEditing: editSession.setIsEditing,
    setEditSnapshot: editSession.setEditSnapshot,
    setPendingAction,
    setActionError,
  });
  const {
    renamingId,
    renameDraft,
    setRenameDraft,
    startRename,
    cancelRename,
    commitRename,
    setDeleteTarget,
    deleteTargetPage,
    deleteDescendantCount,
    confirmDeleteRequest,
    createTopLevel,
    createChild,
    reorder,
    reparent,
    canMoveUp,
    canMoveDown,
  } = treeActions;

  // K9: the delete confirmation banner (.kbWarnBanner, role="alertdialog")
  // is NOT converted to the shared ModalShell mechanism - modalAdoptionScan.ts
  // (src/app/components/ui/) already lists this exact banner in
  // PERMANENT_EXCLUSIONS with the recorded reason "not an overlay dialog - no
  // backdrop or portal, nothing to adopt", and modalAdoption.wiring.test.ts
  // pins the repo-wide dialog-site/adopting counts against that list -
  // importing ModalShell/useModalDismiss here would both violate that
  // recorded decision and redden a frozen canary this file set may not edit.
  // Instead this hand-rolls the two pieces the banner was actually missing
  // (focus moves INTO it on open, and back to the control that opened it on
  // close - matching AttachmentsPanel.tsx's own previewTriggerRef precedent)
  // without importing the shared hook, exactly the way the six existing
  // HOOK_DESTRUCTURE_SITES hand-wire pieces of it today.
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteBannerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (deleteTargetPage) {
      deleteBannerRef.current?.focus();
    } else if (deleteTriggerRef.current) {
      // Runs for BOTH the confirm path (confirmDeleteRequest unmounts the
      // banner internally) and the Cancel path (setDeleteTarget(null) below)
      // - either way `deleteTargetPage` goes back to null, which is the one
      // signal this effect needs; it does not need to know which button
      // caused it.
      deleteTriggerRef.current.focus();
      deleteTriggerRef.current = null;
    }
  }, [deleteTargetPage]);

  // Select a page. Returns whether the switch happened - callers that also
  // want to expand ancestors (search results) check this before doing so.
  const selectPage = (id: string): boolean => {
    if (id === selectedId) return true;
    if (!confirmDiscard()) return false;
    closeEditSession();
    applySelection(id);
    return true;
  };

  const openSearchHit = (id: string) => {
    if (!selectPage(id)) return;
    expandAncestorsOf(id);
  };

  // Back to Knowledge (AC4): drains the one-shot page id a recording
  // destination's "Back to Knowledge" control stashed via
  // returnToKnowledge() (src/lib/knowledge-return.ts) - read ONCE, on THIS
  // component's own mount, never via a live window listener the way
  // RECORDING_LAUNCH_EVENT works in RecordingTab.tsx/GradingRecordingPanel.tsx.
  // Those two stay mounted for the whole session, so a live listener is the
  // only shape that ever sees a second launch - but page.tsx renders THIS
  // component only as `{activeTab === "knowledge" && <KnowledgeTab .../>}`
  // (verified in page.tsx, not assumed): it fully unmounts the instant the
  // instructor leaves this tab, and the "Back to Knowledge" button lives on
  // the Recording tab - exactly when this component does not exist yet, so
  // a listener registered in its own mount effect could never see that
  // dispatch. The payload rides a one-shot slot instead, drained here the
  // moment this component (re)mounts - the same moment every such
  // navigation needs it applied.
  //
  // Reuses openSearchHit above (select + expand ancestors) rather than
  // reimplementing it. Guarded to run at most once per mount, and only once
  // `pages` has loaded enough to validate the id - a stale id (deleted, or
  // from a different institution) is silently skipped rather than handed to
  // openSearchHit unchecked, which would otherwise leave a dangling
  // selectedId.
  const pendingReturnPageIdRef = useRef<string | null>(takeKnowledgeReturnPageId());
  const appliedReturnPageIdRef = useRef(false);
  useEffect(() => {
    if (appliedReturnPageIdRef.current) return;
    const pageId = pendingReturnPageIdRef.current;
    if (!pageId || !pages) return;
    appliedReturnPageIdRef.current = true;
    if (pages.some((p) => p.id === pageId)) openSearchHit(pageId);
    // Guarded above to fire at most once - `pages` (when it is safe to run)
    // is the only real dependency; openSearchHit's fresh identity per render
    // needs no separate tracking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // Ask AI (A1/D3): ONE CLICK from the bulk bar opens the app-wide chat FAB
  // already carrying the current bulk selection as context - no
  // intermediate dialog, no "choose what to include" step. Dispatches
  // through openChat() (src/lib/chat/open-chat.ts) - the single place that
  // owns the "open-ai-chat" event name and its OpenChatDetail shape, shared
  // with ContextMenu.tsx's no-context dispatch and AiChatFab.tsx's listener
  // (a concurrent change - see docs/knowledge-bulk-actions-ask-ai-acceptance-criteria.md's
  // D2/A2), rather than re-typing the event name and payload shape here.
  const askAiAboutSelection = () => {
    const knowledgePageIds = Array.from(kbSelection.selected);
    if (knowledgePageIds.length === 0) return;
    openChat({
      knowledgePageIds,
      label: `${knowledgePageIds.length} Knowledge Base page${knowledgePageIds.length === 1 ? "" : "s"}`,
    });
  };

  // Start recording (from the Knowledge base's bulk bar, next to Ask AI):
  // hands the selected pages' TITLE+BODY - not just their ids - to the
  // Discussion-replies capture surface as drafting context, then navigates
  // there. Text over ids (unlike askAiAboutSelection above) because the
  // consuming pipeline has no equivalent of /api/ai-chat/route.ts's
  // server-side id-resolution glue to call - buildKnowledgeContextBlock is
  // the ONLY reusable renderer, and it takes already-fetched page text, not
  // ids; `pages` already holds every selected page's full body client-side
  // (useKbPageTree), so nothing more needs to be fetched to build it here.
  // Reuses buildKnowledgeContextBlock (src/lib/chat/knowledge-context.ts) -
  // the SAME renderer askAiAboutSelection's server-side path uses - rather
  // than inventing a second context format or a second anti-prompt-injection
  // framing header; attachments are omitted (only the /api/ai-chat route can
  // extract attachment text server-side, which is out of reach here, and the
  // owner's own ask names "the relevant instructor standards" - page bodies -
  // not attachments).
  const startRecordingWithSelection = () => {
    const selectedPages = (pages ?? []).filter((p) => kbSelection.selected.has(p.id));
    if (selectedPages.length === 0) return;
    const block = buildKnowledgeContextBlock({
      pages: selectedPages.map((p) => ({ title: p.title, body: p.body })),
      attachments: [],
    });
    // AC1 of docs/knowledge-recording-handoff-acceptance-criteria.md: `pages`
    // must never name a page the budget did not actually include -
    // includedContextPages zips `selectedPages` positionally against THIS
    // SAME call's own block.pageResults (both built from `selectedPages`, in
    // order, immediately above) and drops anything the budget omitted. Never
    // derived from selectedPages directly, and never from
    // block.includedPages/omittedPages alone - see that function's own doc
    // for why (inclusion is not a prefix).
    const contextPages = includedContextPages(
      selectedPages.map((p) => ({ id: p.id, title: p.title, body: p.body })),
      block.pageResults
    );
    openRecordingTool({
      view: "discussions",
      ...(block.text
        ? {
            knowledgeContext: {
              text: block.text,
              // K1: buildKnowledgeContextBlock's includedPages/omittedPages
              // were computed and then thrown away here - a selection that
              // did not fit the budget was truncated on a page boundary with
              // NOTHING telling the instructor a page went missing, right
              // beneath a disclosure that unconditionally claimed every
              // selected page was sent. describeKnowledgeContextLabel states
              // the real included-of-total count whenever anything was
              // dropped; this label is what GradingRecordingPanel.tsx/the
              // discussions equivalent actually render to the instructor
              // once they land, so this is where the omission has to reach.
              label: describeKnowledgeContextLabel(selectedPages.length, block.includedPages, block.omittedPages),
              ...(contextPages.length > 0 ? { pages: contextPages } : {}),
            },
          }
        : {}),
    });
  };

  // Grade via recording (docs/grading-via-recording-acceptance-criteria.md,
  // the owner's own words: "select the relevant grading/feedback knowledge
  // pages as context / a grading-via-screen-recording option appears / paste
  // a rubric into a modal ... "). A SECOND bulk-bar button beside "Start
  // recording", on the exact same selection condition - reuses
  // buildKnowledgeContextBlock and the openRecordingTool handoff exactly the
  // way startRecordingWithSelection above does (same page-text-not-ids
  // reasoning, same "omit the field entirely when there is no usable text"
  // rule for knowledgeContext), differing only in the destination view and
  // in also asking the landing panel to open the rubric modal
  // (`openRubric: true` - see recording-launch.ts's own doc comment on that
  // field for why this is carried on the event `detail` rather than a
  // one-shot slot like knowledgeContext).
  const startGradingWithSelection = () => {
    const selectedPages = (pages ?? []).filter((p) => kbSelection.selected.has(p.id));
    if (selectedPages.length === 0) return;
    const block = buildKnowledgeContextBlock({
      pages: selectedPages.map((p) => ({ title: p.title, body: p.body })),
      attachments: [],
    });
    // AC1: see startRecordingWithSelection's identical comment above - this
    // is the higher-stakes of the two paths (the pipeline this lands on
    // writes feedback a student reads), so naming a page the model never
    // actually read here is the worse of the two instances of the same risk.
    const contextPages = includedContextPages(
      selectedPages.map((p) => ({ id: p.id, title: p.title, body: p.body })),
      block.pageResults
    );
    openRecordingTool({
      view: "grading",
      openRubric: true,
      ...(block.text
        ? {
            // K1: same fix as startRecordingWithSelection above - see its
            // comment. This is the higher-stakes of the two paths (the
            // pipeline this lands on writes feedback a student reads), so a
            // silently-dropped rubric/policy page here is the worse of the
            // two instances of the same defect.
            knowledgeContext: {
              text: block.text,
              label: describeKnowledgeContextLabel(selectedPages.length, block.includedPages, block.omittedPages),
              ...(contextPages.length > 0 ? { pages: contextPages } : {}),
            },
          }
        : {}),
    });
  };

  const searchHits = useMemo(
    () => (pages && search.trim() ? searchPages(pages, search) : []),
    [pages, search]
  );

  // Shared between the empty state below and the populated picker further
  // down (AC1) - both render the same add-institution row and feedback
  // text, since a first-time visitor with zero institutions registered has
  // the identical need as one adding a second or third. Split into a row
  // (sits inline next to the picker's tab buttons) and a feedback block
  // (error + hint, rendered below the row rather than as another flex item
  // inside it).
  const addInstitutionRow = (
    <div className={styles.kbAddInstitution}>
      <TextField
        size="small"
        placeholder="Add institution (e.g. MCC)"
        value={newAcronym}
        onChange={(e) => {
          setNewAcronym(e.target.value);
          setAddInstitutionError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addInstitution();
          }
        }}
        sx={{ width: 190 }}
      />
      <Button variant="outlined" size="small" onClick={addInstitution} disabled={!newAcronym.trim()}>
        + Add
      </Button>
    </div>
  );
  const addInstitutionFeedback = (
    <>
      {addInstitutionError && <p className={styles.error}>{addInstitutionError}</p>}
      {/* AC4: adding an acronym only registers it in the browser - it grants
          no Canvas access on its own. */}
      <p className={styles.fieldHint}>
        Registering an acronym here does not grant Canvas access - that still needs the institution&rsquo;s
        server-side env vars, configured separately.
      </p>
    </>
  );

  // ── Empty states ─────────────────────────────────────────────────────
  if (institutions.length === 0 || !active) {
    return (
      <TabShell>
        <TabHeader
          eyebrow="Knowledge"
          title="Knowledge Base"
          subtitle="Policies, rules, and deadlines to track per institution."
        />
        <div className={styles.kbEmpty}>
          <p className={styles.fieldHint}>No institutions yet. Add one below to start a knowledge base for it.</p>
          {addInstitutionRow}
          {addInstitutionFeedback}
        </div>
      </TabShell>
    );
  }

  const controlsDisabled = !selectedId || isEditing || pendingAction !== null;

  return (
    <TabShell>
      <TabHeader
        eyebrow="Knowledge"
        title="Knowledge Base"
        subtitle="Policies, rules, and deadlines to track per institution."
      />

      {/* This tab's own institution picker (AC1) - independent of the header's
          InstitutionSwitcher; see the module comment at the top of this file. */}
      <div className={styles.kbInstitutionPicker}>
        <div className={styles.lessonInnerTabs} role="radiogroup" aria-label="Knowledge base institution">
          {institutions.map((code) => (
            <span key={code} className={kbStyles.institutionPill}>
              <button
                type="button"
                role="radio"
                aria-checked={code === active}
                className={`${styles.lessonInnerTab}${code === active ? ` ${styles.lessonInnerTabActive}` : ""}`}
                onClick={() => switchInstitution(code)}
              >
                {code}
              </button>
              <button
                type="button"
                className={kbStyles.removeInstitutionButton}
                aria-label={`Remove ${code}`}
                title="Remove"
                disabled={removingInstitution === code}
                onClick={() => void removeInstitution(code)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {addInstitutionRow}
      </div>
      {addInstitutionFeedback}
      {removeInstitutionError && <p className={styles.error}>{removeInstitutionError}</p>}

      {/* K8: this used to be a bare <p>, with no role at all, while the
          loading text a few lines below correctly carried role="status"
          aria-live="polite" - the asymmetry was backwards, since an ERROR is
          the more urgent of the two. role="alert" is an implicit assertive
          live region - no aria-live attribute needed alongside it. */}
      {actionError && (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      )}

      <div className={styles.kbLayout}>
        {/* Left pane: search, toolbar, tree */}
        <div className={styles.kbTreePane}>
          <TextField
            size="small"
            placeholder={`Search ${active} pages`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
          />

          {/* K2: wrapped in .kbOverlayAnchor (this file's own class - see its
              doc comment in KnowledgeTab.module.css) so mounting/unmounting
              this panel as the search box is typed into never pushes the
              tree below. */}
          <div className={kbStyles.kbOverlayAnchor}>
            {search.trim() && (
              <div className={`${styles.kbSearchPanel} ${kbStyles.kbOverlayCard}`}>
                {searchHits.length === 0 ? (
                  <p className={styles.kbTreeEmpty}>No pages match &ldquo;{search.trim()}&rdquo;.</p>
                ) : (
                  searchHits.map((hit) => (
                    <div key={hit.page.id} className={kbStyles.kbSearchHitRow}>
                      {/* K6: search used to render a hit panel with no
                          checkboxes at all, so "select the pages matching
                          X" was not expressible without opening each hit
                          from the tree. Wired to the SAME selection
                          toggle() every tree-row checkbox uses. */}
                      <Checkbox
                        size="small"
                        checked={kbSelection.selected.has(hit.page.id)}
                        onChange={() => kbSelection.toggle(hit.page.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${hit.page.title.trim() || "Untitled page"}`}
                        sx={{ padding: "var(--space-1)", flexShrink: 0 }}
                      />
                      <button
                        type="button"
                        className={`${styles.kbSearchHit} ${kbStyles.kbSearchHitButton}`}
                        onClick={() => openSearchHit(hit.page.id)}
                      >
                        <span className={styles.kbSearchHitTitle}>{hit.page.title.trim() || "Untitled page"}</span>
                        <span className={styles.kbSearchHitSnippet}>{hit.snippet || "No content."}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className={styles.kbTreeToolbar}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void createTopLevel()}
              disabled={pendingAction !== null}
            >
              + Page
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void createChild()}
              disabled={!selectedId || pendingAction !== null}
            >
              + Sub-page
            </Button>
          </div>

          {selectedPage && (
            <div className={styles.kbTreeToolbar}>
              <Button size="small" onClick={startRename} disabled={controlsDisabled}>
                Rename
              </Button>
              <Button size="small" onClick={() => void reorder("up")} disabled={controlsDisabled || !canMoveUp}>
                Move up
              </Button>
              <Button size="small" onClick={() => void reorder("down")} disabled={controlsDisabled || !canMoveDown}>
                Move down
              </Button>
              <Button
                size="small"
                color="error"
                onClick={(e) => {
                  // K9: captured at the moment of opening (event.currentTarget,
                  // never document.activeElement - AttachmentsPanel.tsx's
                  // previewTriggerRef is the exact precedent this mirrors),
                  // so focus can return here once the banner closes instead
                  // of falling to <body>.
                  deleteTriggerRef.current = e.currentTarget;
                  setDeleteTarget(selectedPage.id);
                }}
                disabled={controlsDisabled}
              >
                Delete
              </Button>
            </div>
          )}

          {selectedPage && pages && (
            <ParentPicker
              pages={pages}
              movingId={selectedPage.id}
              currentParentId={selectedPage.parentId}
              onChange={(parentId) => void reparent(parentId)}
              disabled={controlsDisabled}
            />
          )}

          {/* K2: same zero-height-anchor overlay treatment as the search
              panel above - this banner used to insert above the tree in
              normal flow, so opening it (or the bulk bar below also being
              open at the same time) could shift tree rows under the
              cursor. */}
          <div className={kbStyles.kbOverlayAnchor}>
            {deleteTargetPage && (
              <div
                ref={deleteBannerRef}
                className={`${styles.kbWarnBanner} ${kbStyles.kbOverlayCard}`}
                role="alertdialog"
                aria-modal="true"
                aria-label="Confirm delete page"
                tabIndex={-1}
              >
                <span>
                  Delete &ldquo;{deleteTargetPage.title.trim() || "Untitled page"}&rdquo;
                  {deleteDescendantCount > 0
                    ? ` and its ${deleteDescendantCount} sub-page${deleteDescendantCount === 1 ? "" : "s"}`
                    : ""}
                  ? This cannot be undone.
                </span>
                <div className={styles.kbWarnActions}>
                  <Button size="small" color="error" variant="contained" onClick={() => void confirmDeleteRequest()}>
                    Delete
                  </Button>
                  <Button size="small" onClick={() => setDeleteTarget(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Select-all over the currently visible pages (S3) - shown
              whenever there is at least one page, independent of whether
              anything is selected yet (matches FilesView.tsx's own
              "Select all" placement above its bulk bar). */}
          {pages && pages.length > 0 && (
            <div className={styles.kbTreeToolbar} style={{ flexDirection: "column", alignItems: "flex-start", gap: "var(--space-1)" }}>
              <FormControlLabel
                className={styles.fieldHint}
                style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center", margin: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={selectAllVisual.checked}
                    // K6: MUI's own indeterminate prop - previously never
                    // used anywhere in this repo, but the audit named this
                    // exact control as the case that needed it: with 40
                    // pages selected across a collapsed tree, this box used
                    // to paint fully CHECKED (every VISIBLE root happened to
                    // be selected), and a click then deselected just those 6
                    // roots while 34 pages stayed selected with nothing
                    // showing it. Indeterminate now covers every case where
                    // "checked" would overclaim.
                    indeterminate={selectAllVisual.indeterminate}
                    onChange={() => kbSelection.selectAllVisible(visibleIds)}
                    disabled={visibleIds.length === 0}
                  />
                }
                label="Select all visible"
              />
              {/* K6: renamed from "Select all" - the control only ever
                  merges/unmerges the pages currently ON SCREEN
                  (visiblePageIds), never a page sitting inside a collapsed
                  branch. Stated once, plainly, rather than left implicit. */}
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                Selects only the pages currently shown - a page inside a collapsed section is not affected.
              </span>
            </div>
          )}

          {/* Bulk action bar (S6) - aesthetics/UX pass redesign. UNLIKE the
              search panel and delete banner above, this is no longer
              wrapped in K2's kbOverlayAnchor/kbOverlayCard overlay, and it is
              no longer gated behind `selected.size > 0`: KnowledgeBulkBar
              now renders on EVERY render, into KnowledgeTab.module.css's
              `.kbBulkSlot` - a normal-flow row with a CONSTANT min-height
              (see that class's own comment) - so ticking the very first
              checkbox never inserts new flow height (never reintroducing
              K2's original jump-the-tree bug) and the bar never sits on top
              of a tree row while at rest (fixing the actual complaint - see
              KnowledgeBulkBar.tsx's own header comment for the full design,
              including the one place it still reuses K2's overlay trick). */}
          <KnowledgeBulkBar
            selectedCount={kbSelection.selected.size}
            selectionDescription={selectionDescription}
            showAllSelected={showAllSelected}
            onShowAllSelectedChange={setShowAllSelected}
            onClear={kbSelection.clear}
            onAskAi={askAiAboutSelection}
            onStartRecording={startRecordingWithSelection}
            onStartGrading={startGradingWithSelection}
            bulkDelete={bulkDelete}
          />

          {loadState === "loading" && <p className={styles.fieldHint} role="status" aria-live="polite">Loading {active} pages…</p>}
          {loadState === "error" && <p className={styles.error}>{loadError}</p>}

          {loadState === "idle" && (
            <PageTreeView
              nodes={tree}
              selectedId={selectedId}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onSelect={selectPage}
              selected={kbSelection.selected}
              onToggleSelect={kbSelection.toggle}
              renamingId={renamingId}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onRenameCommit={() => void commitRename()}
              onRenameCancel={cancelRename}
            />
          )}
        </div>

        {/* Right pane: selected page */}
        <div className={styles.kbDetailPane}>
          {!selectedPage ? (
            <>
              {/* X5: a SIBLING above the dashed empty-state box, never its
                  child - .kbDetailEmpty (page.module.css, not this file
                  set's to edit) centers its own content and sets its own
                  min-height, which would shrink-wrap and center this panel
                  too if it were nested inside instead. */}
              {loadState === "idle" && !isEditing && pages && pages.length > 0 && (
                <KnowledgeOverviewPanel
                  institution={active}
                  scopePageId={null}
                  pages={pages}
                  headingLevel={2}
                  onSelectPage={openSearchHit}
                />
              )}
              <div className={styles.kbDetailEmpty}>
                <p style={{ margin: 0 }}>
                  {tree.length === 0
                    ? "This institution has no pages yet. Add one to start recording policies and deadlines."
                    : "Select a page from the tree to view it."}
                </p>
              </div>
            </>
          ) : (
            <>
              {breadcrumb.length > 1 && (
                <div className={styles.kbBreadcrumb}>
                  {breadcrumb.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && <span aria-hidden="true"> / </span>}
                      {i === breadcrumb.length - 1 ? (
                        <span>{p.title.trim() || "Untitled page"}</span>
                      ) : (
                        <button type="button" onClick={() => selectPage(p.id)}>
                          {p.title.trim() || "Untitled page"}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.kbTitleRow}>
                <h2 className={styles.kbTitle}>
                  {isEditing ? draftTitle.trim() || "Untitled page" : selectedPage.title.trim() || "Untitled page"}
                </h2>
                <div className={styles.kbActions}>
                  {isEditing ? (
                    <>
                      <Button size="small" variant="contained" onClick={() => void saveEdit(selectedId, refresh)} disabled={pendingAction === "save"}>
                        {pendingAction === "save" ? "Saving…" : "Save"}
                      </Button>
                      <Button size="small" onClick={cancelEdit} disabled={pendingAction === "save"}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="small" variant="outlined" onClick={() => beginEdit(selectedPage)}>
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              <p className={styles.kbMeta}>Last edited {formatRelative(selectedPage.updatedAt)}</p>

              {isEditing ? (
                <div className={styles.field}>
                  <label>Title</label>
                  <TextField size="small" fullWidth value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                </div>
              ) : null}

              {isEditing ? (
                <div className={styles.field}>
                  <label>Tags (comma separated)</label>
                  <TextField
                    size="small"
                    fullWidth
                    value={draftTags}
                    onChange={(e) => setDraftTags(e.target.value)}
                    placeholder="e.g. grading, deadlines"
                  />
                </div>
              ) : selectedPage.tags.length > 0 ? (
                <div className={styles.kbTags}>
                  {selectedPage.tags.map((tag) => (
                    <span key={tag} className={styles.kbTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {saveError && <p className={styles.error}>{saveError}</p>}

              <AttachmentsPanel
                pageId={selectedPage.id}
                attachments={attachments}
                loadError={attachmentsError}
                onAttachmentsChange={setAttachments}
                open={attachmentsOpen}
                onToggleOpen={toggleAttachmentsOpen}
                editing={isEditing}
                onInsert={insertAttachmentEmbed}
              />

              {isEditing ? (
                <div className={styles.field}>
                  <label>Body (Markdown)</label>
                  <textarea
                    ref={bodyTextareaRef}
                    className={styles.kbEditTextarea}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Write this page's policy, rule, or deadline in Markdown…"
                  />
                </div>
              ) : selectedPage.body.trim() ? (
                <PageBody body={selectedPage.body} attachments={attachments} />
              ) : (
                <p className={styles.kbBodyEmpty}>This page has no content yet. Click Edit to add some.</p>
              )}

              {/* X5/AC1(d): LAST child of the detail pane, after the body -
                  the only placement that leaves every existing element above
                  at its current vertical position. AC1(b)/(c): only for a
                  page that actually has descendants (buildPageTree's own
                  nesting, C3/X10 - never the raw parentId walk), never a leaf. */}
              {loadState === "idle" && !isEditing && pages && scopeHasDescendants(pages, selectedPage.id) && (
                <KnowledgeOverviewPanel
                  institution={active}
                  scopePageId={selectedPage.id}
                  pages={pages}
                  headingLevel={3}
                  onSelectPage={openSearchHit}
                />
              )}
            </>
          )}
        </div>
      </div>
    </TabShell>
  );
}
