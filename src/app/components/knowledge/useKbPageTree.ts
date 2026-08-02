"use client";

// Page list load, selection, and tree expansion for the Knowledge tab
// (src/app/components/KnowledgeTab.tsx) - split out during the 1000-line-cap
// refactor because this cluster (the institution-scoped page list, the
// selected page id, and which tree nodes are expanded) is the single
// largest concern in that file and only loosely coupled to the edit
// session, attachments, and tree-management controls that sit alongside it.
// See KnowledgeTab.tsx's module comment for the Back/Forward reconciliation
// contract this hook implements (page.tsx is the single history writer;
// this hook reconciles its own selection against page.tsx's requestedPageId
// prop rather than resolving purely from localStorage).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listInstitutionPagesAction } from "../../actions";
import { buildPageTree, pageBreadcrumb, type InstitutionPage, type InstitutionPageNode } from "@/lib/knowledge-base";
import {
  readSelectedPageId,
  writeSelectedPageId,
  readExpandedIds,
  writeExpandedIds,
  pickValidPageId,
} from "./knowledge-helpers";

type LoadState = "idle" | "loading" | "error";

export interface UseKbPageTreeArgs {
  active: string;
  /** page.tsx's URL-tracked selected page id for the active institution -
   *  the value this hook reconciles its actual selection against. */
  requestedPageId: string | null;
  /** Report this hook's actual resolved selection up, so page.tsx's URL
   *  stays in sync with it (AC1). */
  onSelectedPageIdChange: (id: string | null) => void;
  /** Reports a page-list refresh failure - actionError is owned by
   *  KnowledgeTab.tsx (shared with the tree-management mutations in
   *  useKbTreeActions), so it is threaded in rather than owned here. */
  setActionError: (message: string | null) => void;
  /** Resets the in-progress edit session (if any) the instant a genuinely
   *  new selection is resolved - see the reconciliation effect below. Owned
   *  by useKbEditSession (its closeEditSession); passed in so this hook
   *  never needs to know that hook's internal state shape. Must be a
   *  stable (useCallback) reference - it is a dependency of that effect. */
  closeEditSession: () => void;
}

export interface UseKbPageTreeReturn {
  pages: InstitutionPage[] | null;
  loadState: LoadState;
  loadError: string | null;
  selectedId: string | null;
  expanded: Set<string>;
  setExpanded: (next: Set<string>) => void;
  tree: InstitutionPageNode[];
  selectedPage: InstitutionPage | null;
  breadcrumb: InstitutionPage[];
  applySelection: (id: string | null) => void;
  refresh: (selectId?: string | null) => Promise<void>;
  toggleExpand: (id: string) => void;
  expandAncestorsOf: (id: string) => void;
}

export function useKbPageTree({
  active,
  requestedPageId,
  onSelectedPageIdChange,
  setActionError,
  closeEditSession,
}: UseKbPageTreeArgs): UseKbPageTreeReturn {
  // ── Page list + tree ──────────────────────────────────────────────────
  const [pages, setPages] = useState<InstitutionPage[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(() => (active ? "loading" : "idle"));
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Selection + tree expansion, persisted per institution ───────────────
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [expanded, setExpandedState] = useState<Set<string>>(new Set());

  // Reset this hook's per-institution state the instant the active
  // institution changes (adjust state during render, not an effect - see
  // AGENTS.md/set-state-in-effect idiom). KnowledgeTab.tsx's other hooks
  // (useKbEditSession, useKbTreeActions) each run this same idiom
  // independently for the state they own - see this file's sibling hooks -
  // rather than one hook coordinating a reset of state it does not own.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setPages(null);
    setLoadState(active ? "loading" : "idle");
    setLoadError(null);
    setSelectedIdState(null);
    setExpandedState(new Set());
  }

  // Load pages for the active institution. Await-first so the effect never
  // performs a synchronous setState (see set-state-in-effect idiom). Does
  // NOT resolve the selection itself - the reconciliation effect below owns
  // that (both for this initial load and for every later change), so there
  // is exactly one place implementing the "URL wins over localStorage,
  // invalid/foreign id falls back to none" contract rather than a second
  // copy of it here.
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
  // echoing back a value this hook itself just reported) and reports it to
  // page.tsx (AC1) so the URL stays in sync with what's actually selected.
  // `lastAppliedRequestRef` records the id every such change was resolved
  // to; the reconciliation effect below compares `requestedPageId` against
  // it (not against `selectedId`) to tell a genuinely new request (the URL
  // changed under us - a popstate restore) apart from the prop simply
  // catching up to a selection this hook made locally a render earlier.
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
    [active, selectedId, applySelection, setActionError]
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
  // is ever updated (see its popstate handler and KnowledgeTab.tsx's
  // onDirtyChange reporting) - by the time this effect sees a new value
  // here, that confirmation has already happened, so it applies the change
  // directly rather than calling confirmDiscard() a second time.
  useEffect(() => {
    if (!active || !pages) return;
    if (requestedPageId === lastAppliedRequestRef.current) return;
    const validIds = new Set(pages.map((p) => p.id));
    const fromUrl = pickValidPageId(requestedPageId, validIds);
    const resolved = fromUrl ?? readSelectedPageId(active, validIds);
    closeEditSession();
    applySelection(resolved);
  }, [requestedPageId, pages, active, applySelection, closeEditSession]);

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

  return {
    pages,
    loadState,
    loadError,
    selectedId,
    expanded,
    setExpanded: setExpandedState,
    tree,
    selectedPage,
    breadcrumb,
    applySelection,
    refresh,
    toggleExpand,
    expandAncestorsOf,
  };
}
