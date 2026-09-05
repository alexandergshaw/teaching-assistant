"use client";

// State + data flow for the Knowledge overview panel (AI summary + Ask AI on
// an institution root or a page with descendants - AC.md AC1-AC11). The only
// caller of src/app/actions/knowledge-overview.ts (Group C's server actions -
// see the WIRING OWNERSHIP note in the build spec: a hook that never gets
// called from KnowledgeTab.tsx would ship this whole feature dead).
//
// Imports the action module DIRECTLY (`../../actions/knowledge-overview`),
// not through the src/app/actions.ts barrel: that barrel is not in any
// build-group's file list, so nothing in this feature updates it to
// re-export the five new actions - importing the concrete module sidesteps
// that gap entirely rather than depending on a wiring step nobody owns.
//
// X8/X14 NOTICES, and why there are THREE of them rather than one. A page can
// fail to reach the model for three different reasons, and collapsing them
// into one sentence would mislead:
//
//  - HARD-CAPPED: the scope holds more pages than a single request can check
//    at all (the 400-page-id cap in knowledge-scope-context.ts). These pages
//    never reached buildKnowledgeContextBlock, so they carry NO sourcePages
//    entry - they would otherwise vanish in silence while the summary claimed
//    to have covered the whole scope. This is the one that most needs saying.
//  - BUDGET-OMITTED: the page WAS fetched and considered, but did not fit the
//    character budget. It is recorded in sourcePages with included === false.
//  - SKIPPED ATTACHMENTS: buildKnowledgeContextBlock places every in-scope
//    PAGE before any attachment, so on overflow an attachment is always the
//    first thing dropped. Stated plainly rather than left for the instructor
//    to wonder why attachment text never shows up in an answer.
//
// The first and third arrive on the ACTION RESULT (hardCappedPages,
// skippedAttachments on both GenerateKnowledgeOverviewSummaryResult and
// AskKnowledgeOverviewResult) rather than on the persisted row, because they
// describe THIS request's resolution rather than a property of the saved
// summary. They are therefore held in state here and cleared on a scope
// change, exactly like citationsUnavailableFor.
//
// AC8 PERSISTENCE - THE BUG TO AVOID (see knowledge-overview-storage.ts's own
// header comment for the full "why"): `open`/`historyOpen`/`question` seed
// from PLAIN DEFAULTS (never a localStorage read) in their useState calls
// below. Exactly ONE mount effect, keyed on `scopeKey`, reads all three
// persisted values and records `hydratedScopeKey`; every write-back effect is
// gated on `hydratedScopeKey === scopeKey`, so a scope switch's first
// post-mount render (which still shows the OLD scope's values for one tick)
// can never write the default/stale value over the NEW scope's stored one.

import { useEffect, useMemo, useState } from "react";
import type { InstitutionPage } from "@/lib/knowledge-base";
import { useLlmProvider } from "@/lib/llm-provider";
import { collectScopePages, describeScope, scopeStorageKey } from "@/lib/knowledge-overview-scope";
import { summaryStaleness, fingerprintScopePages, type SummaryStaleness } from "@/lib/knowledge-overview-stale";
import { MAX_SCOPE_QA_ENTRIES, type ScopeSummary, type ScopeQuestion } from "@/lib/knowledge-overview";
import {
  getKnowledgeOverviewAction,
  generateKnowledgeOverviewSummaryAction,
  askKnowledgeOverviewAction,
  deleteKnowledgeOverviewQaAction,
  clearKnowledgeOverviewQaAction,
  type KnowledgeOverviewPageRef,
} from "../../actions/knowledge-overview";
import { readOverviewUiState, writeOverviewOpen, writeOverviewHistoryOpen, writeOverviewQuestion } from "./knowledge-overview-storage";

export interface UseKnowledgeOverviewArgs {
  institution: string;
  /** null = the whole institution is the scope; an id = that page + its
   *  descendants (AC1). */
  scopePageId: string | null;
  /** The FULL flat page list (not pre-filtered to scope) - this hook derives
   *  scopePages from it via collectScopePages (buildPageTree DFS order, C3/
   *  X10), and keeps the full list around so citation resolution can find a
   *  page that has since moved OUT of scope (spec item 10). */
  allPages: InstitutionPage[];
}

export interface UseKnowledgeOverviewReturn {
  scopeKey: string;
  scopeLabel: string;
  scopePages: InstitutionPage[];
  /** AC9/spec item 11: whether ANY in-scope page has non-blank body text -
   *  the empty-body guard is scopePages.some(p => p.body.trim()), never "is
   *  the context block non-empty" (a page with an empty body still emits a
   *  "Selected page: {title}" chunk). Gates Generate/Ask so neither control
   *  invites a call that can only ever come back grounded in nothing. */
  hasContent: boolean;

  loading: boolean;
  loadError: string | null;

  summary: ScopeSummary | null;
  staleness: SummaryStaleness | null;
  generating: boolean;
  generateError: string | null;
  generateSummary: () => void;

  question: string;
  setQuestion: (value: string) => void;
  asking: boolean;
  askError: string | null;
  /** The id of the question whose citations are unavailable (the JSON-parse-
   *  failure fallback on askKnowledgeOverviewAction's own
   *  AskKnowledgeOverviewResult field), or null. Compared against
   *  `lastAnswer.id` by the caller rather than a bare boolean, so deleting
   *  the entry this described (or a later scope switch) can never leave a
   *  stale "unavailable" caption pinned to a DIFFERENT answer that happens
   *  to become questions[0] next - ephemeral either way, never persisted on
   *  ScopeQuestion, so a reload always reads null. */
  citationsUnavailableFor: string | null;
  /** X8: in-scope pages the most recent request could not look at AT ALL,
   *  because the scope holds more pages than one request can check. Distinct
   *  from a budget-omitted page (which WAS considered and is recorded in
   *  summary.sourcePages with included === false) - see this file's header. */
  hardCappedPages: KnowledgeOverviewPageRef[];
  /** X14: how many attachment files the most recent request could not include. */
  skippedAttachments: number;
  /** The most recently asked (or most recently loaded) question/answer for
   *  this scope - always questions[0], since listScopeQuestions/appendScopeQuestion
   *  keep the list newest-first (AC6). Rendered immediately under the Ask box
   *  (AC4) as well as at the top of the history list below it - the same
   *  persisted row, not a separate copy, so there is exactly one place this
   *  can drift from what history shows. */
  lastAnswer: ScopeQuestion | null;
  ask: () => void;

  questions: ScopeQuestion[];
  historyError: string | null;
  deletingId: string | null;
  deleteQuestion: (id: string) => void;
  clearing: boolean;
  clearAll: () => void;

  open: boolean;
  toggleOpen: () => void;
  historyOpen: boolean;
  toggleHistoryOpen: () => void;
}

/** How long the page list must sit still before the summary refreshes
 *  itself. Long enough that deleting several pages, or dragging a subtree,
 *  is ONE regeneration rather than one per intermediate state; short enough
 *  that a single edit refreshes while the owner is still looking at it. */
const AUTO_REFRESH_DEBOUNCE_MS = 2000;

export function useKnowledgeOverview({ institution, scopePageId, allPages }: UseKnowledgeOverviewArgs): UseKnowledgeOverviewReturn {
  const [provider] = useLlmProvider();

  const scopeKey = useMemo(() => scopeStorageKey(institution, scopePageId), [institution, scopePageId]);
  const scopePages = useMemo(() => collectScopePages(allPages, scopePageId), [allPages, scopePageId]);
  const scopeLabel = useMemo(() => describeScope(allPages, scopePageId, institution), [allPages, scopePageId, institution]);
  const hasContent = useMemo(() => scopePages.some((p) => p.body.trim().length > 0), [scopePages]);

  // ── Persisted UI control state (AC8) - see this file's header comment. ──
  const [open, setOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Satisfies this repo's set-state-in-effect lint rule (no setState
      // before an await) even though the actual read is synchronous -
      // matches useAutomationInventory.ts's own `await Promise.resolve()`
      // idiom for the same reason.
      await Promise.resolve();
      if (cancelled) return;
      const state = readOverviewUiState(scopeKey);
      if (cancelled) return;
      setOpen(state.open);
      setHistoryOpen(state.historyOpen);
      setQuestion(state.question);
      setHydratedScopeKey(scopeKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeKey]);

  useEffect(() => {
    if (hydratedScopeKey !== scopeKey) return;
    writeOverviewOpen(scopeKey, open);
  }, [open, scopeKey, hydratedScopeKey]);

  useEffect(() => {
    if (hydratedScopeKey !== scopeKey) return;
    writeOverviewHistoryOpen(scopeKey, historyOpen);
  }, [historyOpen, scopeKey, hydratedScopeKey]);

  useEffect(() => {
    if (hydratedScopeKey !== scopeKey) return;
    writeOverviewQuestion(scopeKey, question);
  }, [question, scopeKey, hydratedScopeKey]);

  // ── Summary + history data (reset on scope change during render, not an
  //     effect - mirrors useKbAttachments.ts's identical reset-on-id-change
  //     block; the load effect below never performs a synchronous setState). ──
  const [summary, setSummary] = useState<ScopeSummary | null>(null);
  const [questions, setQuestions] = useState<ScopeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [citationsUnavailableFor, setCitationsUnavailableFor] = useState<string | null>(null);
  // See the X8/X14 block in this file's header. Both describe the most recent
  // generate-or-ask request, not the persisted row, so both reset on a scope
  // change alongside the summary and question list below.
  const [hardCappedPages, setHardCappedPages] = useState<KnowledgeOverviewPageRef[]>([]);
  const [skippedAttachments, setSkippedAttachments] = useState(0);
  /** The scope fingerprint the auto-refresh below has already acted on - see
   *  that effect's anti-loop guard. */
  const [autoRefreshedFor, setAutoRefreshedFor] = useState<string | null>(null);

  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
  if (scopeKey !== prevScopeKey) {
    setPrevScopeKey(scopeKey);
    setSummary(null);
    setQuestions([]);
    setLoading(true);
    setLoadError(null);
    setCitationsUnavailableFor(null);
    setHardCappedPages([]);
    setSkippedAttachments(0);
    setAutoRefreshedFor(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const result = await getKnowledgeOverviewAction(institution, scopePageId);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setSummary(result.summary);
      setQuestions(result.questions);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // scopeKey is derived from institution+scopePageId, but is listed too so
    // this effect is legible on its own without cross-referencing the memo.
  }, [institution, scopePageId, scopeKey]);

  const staleness = useMemo(
    () => (summary ? summaryStaleness(summary.sourcePages, scopePages) : null),
    [summary, scopePages]
  );

  // ── Generate summary (AC2/AC3) ──────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const generateSummary = () => {
    if (generating) return;
    setGenerateError(null);
    setGenerating(true);
    void (async () => {
      const result = await generateKnowledgeOverviewSummaryAction(institution, scopePageId, provider);
      setGenerating(false);
      if ("error" in result) {
        setGenerateError(result.error);
        return;
      }
      setSummary(result.summary);
      setHardCappedPages(result.hardCappedPages);
      setSkippedAttachments(result.skippedAttachments);
    })();
  };

  // ── Auto-refresh the summary when the scope changes underneath it ───────
  //
  // Requested behaviour: the summary updates itself whenever a page in scope
  // is added, changed, or deleted, so it is something to READ rather than a
  // button to remember to press. All three cases are already detected by
  // summaryStaleness's pure set diff, so this effect only has to act on it.
  //
  // Three guards, each load-bearing:
  //
  //  - ONLY WHEN A SUMMARY ALREADY EXISTS. A scope that has never been
  //    summarized stays on the explicit Generate button. Auto-generating on
  //    first sight would fire a model call for every institution and every
  //    parent page merely BROWSED, which is a real bill for something the
  //    owner never asked to see.
  //  - DEBOUNCED. Deleting four pages, or dragging a subtree, lands as a
  //    burst of separate page-list updates; without the delay each one would
  //    start its own generation and the last would win after paying for all
  //    of them.
  //  - KEYED ON THE EXACT FINGERPRINT SET, not on `stale`. This is the
  //    anti-loop guard: if generation FAILS (offline, model error, quota),
  //    `stale` stays true forever, and a bare "regenerate while stale" effect
  //    would retry without end, every render, silently spending money. Having
  //    already attempted THIS page-set means it is not attempted again until
  //    the pages actually change once more - and the manual Regenerate button
  //    is always there to retry deliberately.
  const scopeSignature = useMemo(
    () => fingerprintScopePages(scopePages).map((f) => `${f.id}:${f.updatedAt}`).join("|"),
    [scopePages]
  );

  useEffect(() => {
    if (!summary || !staleness?.stale || generating || !hasContent) return;
    if (autoRefreshedFor === scopeSignature) return;
    const timer = setTimeout(() => {
      setAutoRefreshedFor(scopeSignature);
      generateSummary();
    }, AUTO_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // generateSummary is redefined every render and would make this effect
    // re-run (and re-arm its timer) on every render if listed; the values it
    // actually closes over - institution, scopePageId, provider, generating -
    // are either in this dep list or constant for the life of a scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, staleness, generating, hasContent, autoRefreshedFor, scopeSignature]);

  // ── Ask AI (AC4/AC5/AC6) ─────────────────────────────────────────────────
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const ask = () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAskError(null);
    setAsking(true);
    void (async () => {
      const result = await askKnowledgeOverviewAction(institution, scopePageId, trimmed, provider);
      setAsking(false);
      if ("error" in result) {
        setAskError(result.error);
        return;
      }
      setQuestions((prev) => [result.question, ...prev].slice(0, MAX_SCOPE_QA_ENTRIES));
      setCitationsUnavailableFor(result.citationsUnavailable ? result.question.id : null);
      setHardCappedPages(result.hardCappedPages);
      setSkippedAttachments(result.skippedAttachments);
      // Spec item: "Focus does NOT move when an answer arrives - it stays in
      // the cleared, re-enabled field so a follow-up is zero-click." Clearing
      // the draft here (rather than leaving the asked text in the box) is
      // what makes that field ready for a follow-up with no extra click;
      // this component never calls .focus()/.blur() itself, so the TextField
      // keeps whatever focus state it already had.
      setQuestion("");
    })();
  };

  const lastAnswer = questions.length > 0 ? questions[0] : null;

  // ── History delete / clear (AC6) ─────────────────────────────────────────
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const deleteQuestion = (id: string) => {
    if (deletingId) return;
    setHistoryError(null);
    setDeletingId(id);
    void (async () => {
      const result = await deleteKnowledgeOverviewQaAction(id);
      setDeletingId(null);
      if ("error" in result) {
        setHistoryError(result.error);
        return;
      }
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    })();
  };

  const clearAll = () => {
    if (clearing || questions.length === 0) return;
    setHistoryError(null);
    setClearing(true);
    void (async () => {
      const result = await clearKnowledgeOverviewQaAction(institution, scopePageId);
      setClearing(false);
      if ("error" in result) {
        setHistoryError(result.error);
        return;
      }
      setQuestions([]);
    })();
  };

  return {
    scopeKey,
    scopeLabel,
    scopePages,
    hasContent,

    loading,
    loadError,

    summary,
    staleness,
    generating,
    generateError,
    generateSummary,

    question,
    setQuestion,
    asking,
    askError,
    citationsUnavailableFor,
    hardCappedPages,
    skippedAttachments,
    lastAnswer,
    ask,

    questions,
    historyError,
    deletingId,
    deleteQuestion,
    clearing,
    clearAll,

    open,
    toggleOpen: () => setOpen((prev) => !prev),
    historyOpen,
    toggleHistoryOpen: () => setHistoryOpen((prev) => !prev),
  };
}
