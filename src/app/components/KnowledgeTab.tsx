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

import { useMemo, useState } from "react";
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
import { useKbPageTree } from "./knowledge/useKbPageTree";
import { useKbEditSession } from "./knowledge/useKbEditSession";
import { useKbAttachments } from "./knowledge/useKbAttachments";
import { useKbTreeActions } from "./knowledge/useKbTreeActions";
import { useKbInstitutionPicker } from "./knowledge/useKbInstitutionPicker";
import { useKbSelection } from "./knowledge/useKbSelection";
import { allVisibleSelected, visiblePageIds } from "./knowledge/knowledge-helpers";
import { openChat } from "@/lib/chat/open-chat";
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
  const allVisSelected = allVisibleSelected(kbSelection.selected, visibleIds);

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

      {actionError && <p className={styles.error}>{actionError}</p>}

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

          {search.trim() && (
            <div className={styles.kbSearchPanel}>
              {searchHits.length === 0 ? (
                <p className={styles.kbTreeEmpty}>No pages match &ldquo;{search.trim()}&rdquo;.</p>
              ) : (
                searchHits.map((hit) => (
                  <button
                    key={hit.page.id}
                    type="button"
                    className={styles.kbSearchHit}
                    onClick={() => openSearchHit(hit.page.id)}
                  >
                    <span className={styles.kbSearchHitTitle}>{hit.page.title.trim() || "Untitled page"}</span>
                    <span className={styles.kbSearchHitSnippet}>{hit.snippet || "No content."}</span>
                  </button>
                ))
              )}
            </div>
          )}

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
              <Button size="small" color="error" onClick={() => setDeleteTarget(selectedPage.id)} disabled={controlsDisabled}>
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

          {deleteTargetPage && (
            <div className={styles.kbWarnBanner} role="alertdialog">
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

          {/* Select-all over the currently visible pages (S3) - shown
              whenever there is at least one page, independent of whether
              anything is selected yet (matches FilesView.tsx's own
              "Select all" placement above its bulk bar). */}
          {pages && pages.length > 0 && (
            <div className={styles.kbTreeToolbar}>
              <FormControlLabel
                className={styles.fieldHint}
                style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={allVisSelected}
                    onChange={() => kbSelection.selectAllVisible(visibleIds)}
                    disabled={visibleIds.length === 0}
                  />
                }
                label="Select all"
              />
            </div>
          )}

          {/* Bulk action bar (S6) - appears only once a selection exists,
              reusing the .bulkBar/.bulkBarHead/.bulkCount shell FilesView.tsx
              already uses (no new CSS). "Ask AI" (A1) is the one bulk action
              today - it opens the chat carrying the selection as context in
              a single click (D3), with no options to configure first. */}
          {kbSelection.selected.size > 0 && (
            <div className={styles.bulkBar}>
              <div className={styles.bulkBarHead}>
                <span className={styles.bulkCount}>
                  {kbSelection.selected.size} page{kbSelection.selected.size === 1 ? "" : "s"} selected
                </span>
                <Button variant="outlined" size="small" onClick={kbSelection.clear}>
                  Clear
                </Button>
              </div>
              <div className={styles.bulkRow}>
                <span className={styles.bulkLabel}>Actions</span>
                <Button variant="contained" size="small" onClick={askAiAboutSelection}>
                  Ask AI
                </Button>
              </div>
            </div>
          )}

          {loadState === "loading" && <p className={styles.fieldHint}>Loading {active} pages…</p>}
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
            <div className={styles.kbDetailEmpty}>
              <p style={{ margin: 0 }}>
                {tree.length === 0
                  ? "This institution has no pages yet. Add one to start recording policies and deadlines."
                  : "Select a page from the tree to view it."}
              </p>
            </div>
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
                    placeholder="Write this page's policy, rule, or deadline in Markdown..."
                  />
                </div>
              ) : selectedPage.body.trim() ? (
                <PageBody body={selectedPage.body} attachments={attachments} />
              ) : (
                <p className={styles.kbBodyEmpty}>This page has no content yet. Click Edit to add some.</p>
              )}
            </>
          )}
        </div>
      </div>
    </TabShell>
  );
}
