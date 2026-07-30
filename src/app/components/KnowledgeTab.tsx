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

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import {
  listInstitutionPagesAction,
  createInstitutionPageAction,
  updateInstitutionPageAction,
  moveInstitutionPageAction,
  deleteInstitutionPageAction,
} from "../actions";
import { buildPageTree, searchPages, pageBreadcrumb, type InstitutionPage, type InstitutionPageNode } from "@/lib/knowledge-base";
import { writeInstitutions, validateNewInstitutionAcronym } from "@/lib/institutions";
import { confirmAndRemoveInstitution } from "@/lib/institution-removal";
import { getInstitutionDeletionImpactAction } from "../actions";
import { markdownToHtml } from "@/lib/markdown";
import { formatRelative } from "../utils/time";
import TabShell from "./TabShell";
import TabHeader from "./TabHeader";
import PageTreeView from "./knowledge/PageTreeView";
import ParentPicker from "./knowledge/ParentPicker";
import {
  findNode,
  countDescendants,
  computeReorder,
  readSelectedPageId,
  writeSelectedPageId,
  readExpandedIds,
  writeExpandedIds,
  pickValidPageId,
  KB_DISCARD_MESSAGE,
  type PositionedItem,
} from "./knowledge/knowledge-helpers";
import styles from "../page.module.css";
import kbStyles from "./KnowledgeTab.module.css";

type LoadState = "idle" | "loading" | "error";

interface EditSnapshot {
  title: string;
  body: string;
  tags: string;
}

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

  // ── Page list + tree ──────────────────────────────────────────────────
  const [pages, setPages] = useState<InstitutionPage[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(() => (active ? "loading" : "idle"));
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Selection + tree expansion, persisted per institution ───────────────
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [expanded, setExpandedState] = useState<Set<string>>(new Set());

  // ── Edit session ──────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<EditSnapshot | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Tree-management controls (rename, delete, reorder, reparent) ───────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Search overlay (AC6: filters/overlays, never replaces the tree) ────
  const [search, setSearch] = useState("");

  // ── Add institution, inline next to this tab's own picker ──────────────
  const [newAcronym, setNewAcronym] = useState("");
  const [addInstitutionError, setAddInstitutionError] = useState<string | null>(null);

  // ── Remove institution, from this same picker (AC4-AC6) ─────────────────
  const [removingInstitution, setRemovingInstitution] = useState<string | null>(null);
  const [removeInstitutionError, setRemoveInstitutionError] = useState<string | null>(null);

  // Reset every piece of per-institution state the instant the active
  // institution changes (adjust state during render, not an effect - see
  // AGENTS.md/set-state-in-effect idiom and LiveFeedPanel's identical pattern).
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setPages(null);
    setLoadState(active ? "loading" : "idle");
    setLoadError(null);
    setSelectedIdState(null);
    setExpandedState(new Set());
    setIsEditing(false);
    setEditSnapshot(null);
    setSaveError(null);
    setActionError(null);
    setDeleteTarget(null);
    setRenamingId(null);
    setSearch("");
  }

  // Load pages for the active institution. Await-first so the effect never
  // performs a synchronous setState (see set-state-in-effect idiom). Does
  // NOT resolve the selection itself anymore - the reconciliation effect
  // below owns that (both for this initial load and for every later change),
  // so there is exactly one place implementing the "URL wins over
  // localStorage, invalid/foreign id falls back to none" contract rather
  // than a second copy of it here.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const result = await listInstitutionPagesAction(active);
      if (cancelled) return;
      if ("error" in result) {
        setLoadState("error");
        setLoadError(result.error);
        return;
      }
      setPages(result.pages);
      setLoadState("idle");
      setExpandedState(readExpandedIds(active));
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const tree = useMemo(() => (pages ? buildPageTree(pages) : []), [pages]);
  const selectedPage = useMemo(() => pages?.find((p) => p.id === selectedId) ?? null, [pages, selectedId]);
  const breadcrumb = useMemo(
    () => (pages && selectedId ? pageBreadcrumb(pages, selectedId) : []),
    [pages, selectedId]
  );

  // Applies a real selection change (as opposed to `requestedPageId` merely
  // echoing back a value this component itself just reported) and reports it
  // to page.tsx (AC1) so the URL stays in sync with what's actually
  // selected. `lastAppliedRequestRef` records the id every such change was
  // resolved to; the reconciliation effect below compares `requestedPageId`
  // against it (not against `selectedId`) to tell a genuinely new request
  // (the URL changed under us - a popstate restore) apart from the prop
  // simply catching up to a selection this component made locally a render
  // earlier.
  const lastAppliedRequestRef = useRef<string | null | undefined>(undefined);
  const applySelection = useCallback(
    (id: string | null) => {
      setSelectedIdState(id);
      if (active) writeSelectedPageId(active, id);
      lastAppliedRequestRef.current = id;
      onSelectedPageIdChange(id);
    },
    [active, onSelectedPageIdChange]
  );

  // Re-fetch the page list from the server (used after every mutation, since
  // it is the simplest way to stay correct - positions, cascaded deletes, and
  // server-side validation all live in one place). Keeps `selectId` selected
  // when given and still valid, else falls back to whatever is persisted for
  // this institution, else no selection - the same fallback parseSelectedPageId
  // uses on initial load, so a deleted or moved-away page never leaves a
  // dangling selection.
  const refresh = useCallback(
    async (selectId?: string | null) => {
      if (!active) return;
      const result = await listInstitutionPagesAction(active);
      if ("error" in result) {
        setActionError(result.error);
        return;
      }
      setPages(result.pages);
      const validIds = new Set(result.pages.map((p) => p.id));
      const desired = selectId !== undefined ? selectId : selectedId;
      applySelection(pickValidPageId(desired ?? null, validIds));
    },
    [active, selectedId, applySelection]
  );

  // Resolves the actual selection whenever the pages loaded for `active`, or
  // the requested page id (page.tsx's URL-tracked value - AC1/AC2), change.
  // Owns every selection resolution, including the very first one after an
  // institution's pages finish loading (AC3: URL wins, else localStorage) and
  // a URL-provided id that turns out to be stale or belongs to a different
  // institution (AC4: falls back to no selection via the same pickValidPageId
  // check parseSelectedPageId uses for the localStorage path).
  //
  // A popstate-driven restore that would change the selection while the
  // current page is dirty is confirmed by page.tsx BEFORE `requestedPageId`
  // is ever updated (see its popstate handler and this component's
  // onDirtyChange reporting below) - by the time this effect sees a new
  // value here, that confirmation has already happened, so it applies the
  // change directly rather than calling confirmDiscard() a second time.
  useEffect(() => {
    if (!active || !pages) return;
    if (requestedPageId === lastAppliedRequestRef.current) return;
    const validIds = new Set(pages.map((p) => p.id));
    const fromUrl = pickValidPageId(requestedPageId, validIds);
    const resolved = fromUrl ?? readSelectedPageId(active, validIds);
    setIsEditing(false);
    setEditSnapshot(null);
    setSaveError(null);
    applySelection(resolved);
  }, [requestedPageId, pages, active, applySelection]);

  // Warn on an actual tab close/reload while a page edit is unsaved.
  const dirty =
    isEditing &&
    !!editSnapshot &&
    (draftTitle !== editSnapshot.title || draftBody !== editSnapshot.body || draftTags !== editSnapshot.tags);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Report dirty state up to page.tsx (AC5) - a popstate restore bypasses
  // every in-tab confirmDiscard() call below, so page.tsx needs its own
  // up-to-date read of this to decide whether to prompt before applying one.
  // Forced to false on unmount so the flag never outlives this component
  // (e.g. switching away from the Knowledge tab entirely, which unmounts it).
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  const confirmDiscard = (): boolean => {
    if (!dirty) return true;
    return window.confirm(KB_DISCARD_MESSAGE);
  };

  // Switch this tab's own institution (AC5): guarded exactly like selectPage
  // below, since it discards the current page's unsaved edits just as surely.
  // The rest of the per-institution reset (pages, selection, expansion, edit
  // session) happens via the prevActive-diff block above once `active`
  // changes; onActiveChange also clears page.tsx's URL-tracked selected page
  // (AC2 - a page id is meaningless, and ambiguous, without the institution
  // it belongs to), so the reconciliation effect above re-derives the new
  // institution's own persisted selection instead of carrying the old one over.
  const switchInstitution = (code: string) => {
    if (code === active) return;
    if (!confirmDiscard()) return;
    onActiveChange(code);
  };

  // Add an institution from this tab (AC1-AC5). The registry write is global
  // and non-destructive, so it always happens on a valid, non-duplicate
  // acronym; only the follow-up SELECTION switch goes through switchInstitution's
  // confirmDiscard() guard (AC3), since that part - unlike the write - can
  // discard an open page's unsaved edits. Switching to the newly added
  // institution (rather than leaving the current one selected) is deliberate:
  // the reason to add one here is almost always to start writing its pages,
  // so landing on it immediately saves the extra click, and the guard means
  // it never costs an unsaved edit to do so.
  const addInstitution = () => {
    const result = validateNewInstitutionAcronym(newAcronym, institutions);
    if (!result.ok) {
      if (result.reason === "duplicate") {
        setAddInstitutionError(`${result.code} is already registered.`);
      }
      return;
    }
    setAddInstitutionError(null);
    writeInstitutions([...institutions, result.code]);
    setNewAcronym("");
    switchInstitution(result.code);
  };

  // Remove an institution from this tab's own picker (AC4-AC6). Shares
  // confirmAndRemoveInstitution with TopBar.tsx's Settings dropdown (AC4) -
  // it states the real page/tile counts before anything happens (AC1/AC2)
  // and never deletes a database row (AC3). Guarded by this tab's own
  // confirmDiscard() exactly when `code` is the institution currently open
  // here: removing it falls `active` out of the registry, which
  // resolveActiveKbInstitution (via useKbInstitutionSelection in page.tsx)
  // then resolves away from automatically - the same kind of selection
  // change switchInstitution above already guards, so this must guard it
  // too rather than let it happen as a side effect with no prompt. Removing
  // a DIFFERENT institution than the one open here needs no such guard - it
  // cannot affect this tab's current selection or edit session.
  const removeInstitution = async (code: string) => {
    setRemoveInstitutionError(null);
    setRemovingInstitution(code);
    const result = await confirmAndRemoveInstitution(code, institutions, {
      fetchImpact: getInstitutionDeletionImpactAction,
      guardUnsavedEdits: () => code !== active || confirmDiscard(),
    });
    setRemovingInstitution(null);
    if (!result.removed && result.reason === "error") {
      setRemoveInstitutionError(result.message);
    }
  };

  const beginEdit = (page: InstitutionPage) => {
    setDraftTitle(page.title);
    setDraftBody(page.body);
    setDraftTags(page.tags.join(", "));
    setEditSnapshot({ title: page.title, body: page.body, tags: page.tags.join(", ") });
    setIsEditing(true);
    setSaveError(null);
  };

  // Select a page. Returns whether the switch happened - callers that also
  // want to expand ancestors (search results) check this before doing so.
  const selectPage = (id: string): boolean => {
    if (id === selectedId) return true;
    if (!confirmDiscard()) return false;
    setIsEditing(false);
    setEditSnapshot(null);
    setSaveError(null);
    applySelection(id);
    return true;
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedState(next);
    if (active) writeExpandedIds(active, next);
  };

  const expandAncestorsOf = (id: string) => {
    if (!pages) return;
    const chain = pageBreadcrumb(pages, id);
    if (chain.length <= 1) return;
    const next = new Set(expanded);
    for (const ancestor of chain.slice(0, -1)) next.add(ancestor.id);
    setExpandedState(next);
    if (active) writeExpandedIds(active, next);
  };

  const openSearchHit = (id: string) => {
    if (!selectPage(id)) return;
    expandAncestorsOf(id);
  };

  // ── Create ───────────────────────────────────────────────────────────
  const createTopLevel = async () => {
    if (!active || !confirmDiscard()) return;
    setPendingAction("create-top");
    const result = await createInstitutionPageAction({ institution: active, title: "Untitled page" });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    await refresh(result.page.id);
    beginEdit(result.page);
  };

  const createChild = async () => {
    if (!active || !selectedId || !confirmDiscard()) return;
    const parentId = selectedId;
    setPendingAction("create-child");
    const result = await createInstitutionPageAction({ institution: active, parentId, title: "Untitled page" });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    const next = new Set(expanded);
    next.add(parentId);
    setExpandedState(next);
    writeExpandedIds(active, next);
    await refresh(result.page.id);
    beginEdit(result.page);
  };

  // ── Rename (title-only, saved immediately - independent of the full
  //     body/tags edit session, disabled while that session is open) ─────
  const startRename = () => {
    if (!selectedPage) return;
    setRenamingId(selectedPage.id);
    setRenameDraft(selectedPage.title);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const id = renamingId;
    const title = renameDraft.trim() || "Untitled page";
    const target = pages?.find((p) => p.id === id);
    setRenamingId(null);
    if (!target || target.title === title) return;
    setPendingAction("rename");
    const result = await updateInstitutionPageAction(id, { title });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    await refresh();
  };

  // ── Delete (AC5: the confirmation states the real descendant count) ────
  const deleteTargetPage = deleteTarget ? pages?.find((p) => p.id === deleteTarget) ?? null : null;
  const deleteDescendantCount = deleteTarget ? countDescendants(tree, deleteTarget) : 0;

  const confirmDeleteRequest = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    setPendingAction("delete");
    const result = await deleteInstitutionPageAction(id);
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    setIsEditing(false);
    setEditSnapshot(null);
    await refresh(null);
  };

  // ── Reorder (move up/down among siblings) and re-parent ────────────────
  const selectedNode: InstitutionPageNode | null = selectedId ? findNode(tree, selectedId) : null;
  const siblingNodes: InstitutionPageNode[] = selectedNode
    ? selectedNode.parentId
      ? findNode(tree, selectedNode.parentId)?.children ?? []
      : tree
    : [];
  const siblingPositions: PositionedItem[] = siblingNodes.map((n) => ({ id: n.id, position: n.position }));

  const reorder = async (direction: "up" | "down") => {
    if (!selectedId) return;
    const pair = computeReorder(siblingPositions, selectedId, direction);
    if (!pair) return;
    setPendingAction(direction === "up" ? "move-up" : "move-down");
    const [a, b] = pair;
    const resA = await moveInstitutionPageAction(a.id, { position: a.position });
    if ("error" in resA) {
      setPendingAction(null);
      setActionError(resA.error);
      return;
    }
    const resB = await moveInstitutionPageAction(b.id, { position: b.position });
    setPendingAction(null);
    if ("error" in resB) {
      setActionError(resB.error);
      return;
    }
    await refresh();
  };

  const reparent = async (parentId: string | null) => {
    if (!active || !selectedId) return;
    setPendingAction("reparent");
    const result = await moveInstitutionPageAction(selectedId, { parentId });
    setPendingAction(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    if (parentId) {
      const next = new Set(expanded);
      next.add(parentId);
      setExpandedState(next);
      writeExpandedIds(active, next);
    }
    await refresh();
  };

  // ── Edit session save/cancel ────────────────────────────────────────────
  const saveEdit = async () => {
    if (!selectedId) return;
    setPendingAction("save");
    setSaveError(null);
    const tags = Array.from(new Set(draftTags.split(",").map((t) => t.trim()).filter(Boolean)));
    const result = await updateInstitutionPageAction(selectedId, {
      title: draftTitle.trim() || "Untitled page",
      body: draftBody,
      tags,
    });
    setPendingAction(null);
    if ("error" in result) {
      setSaveError(result.error);
      return;
    }
    setIsEditing(false);
    setEditSnapshot(null);
    await refresh();
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this page?")) return;
    setIsEditing(false);
    setEditSnapshot(null);
    setSaveError(null);
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

  const canMoveUp = selectedId ? computeReorder(siblingPositions, selectedId, "up") !== null : false;
  const canMoveDown = selectedId ? computeReorder(siblingPositions, selectedId, "down") !== null : false;
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

          {loadState === "loading" && <p className={styles.fieldHint}>Loading {active} pages…</p>}
          {loadState === "error" && <p className={styles.error}>{loadError}</p>}

          {loadState === "idle" && (
            <PageTreeView
              nodes={tree}
              selectedId={selectedId}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onSelect={selectPage}
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
                      <Button size="small" variant="contained" onClick={() => void saveEdit()} disabled={pendingAction === "save"}>
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

              {isEditing ? (
                <div className={styles.field}>
                  <label>Body (Markdown)</label>
                  <textarea
                    className={styles.kbEditTextarea}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Write this page's policy, rule, or deadline in Markdown..."
                  />
                </div>
              ) : selectedPage.body.trim() ? (
                <div className={styles.kbBody} dangerouslySetInnerHTML={{ __html: markdownToHtml(selectedPage.body) }} />
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
