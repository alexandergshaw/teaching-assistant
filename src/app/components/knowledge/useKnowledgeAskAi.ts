"use client";

// State + data flow for the Knowledge-tab Ask AI and its Q&A history. Keyed on
// the INSTITUTION only - never on a page - so selecting a different page does
// not reset it; switching institution reloads the answer/history for the new
// institution while the panel stays mounted. Always scoped to the whole active
// institution (scopePageId null). The summary half lives in
// useKnowledgeOverview.ts (keyed on scopeKey) and keeps hardCappedPages /
// skippedAttachments; this hook deliberately does not touch them.
//
// Persistence: the composer draft + open flags are single-value ta- keys
// (knowledge-askai-storage.ts), hydrated by ONE mount effect (never a useState
// initializer) and written back only after hydration.

import { useEffect, useMemo, useState } from "react";
import type { InstitutionPage } from "@/lib/knowledge-base";
import { useLlmProvider } from "@/lib/llm-provider";
import { collectScopePages } from "@/lib/knowledge-overview-scope";
import { MAX_SCOPE_QA_ENTRIES, type ScopeQuestion } from "@/lib/knowledge-overview";
import {
  getKnowledgeOverviewAction,
  askKnowledgeOverviewAction,
  deleteKnowledgeOverviewQaAction,
  clearKnowledgeOverviewQaAction,
} from "../../actions/knowledge-overview";
import { readAskAiUiState, writeAskAiOpen, writeAskAiHistoryOpen, writeAskAiQuestion } from "./knowledge-askai-storage";

export interface UseKnowledgeAskAiArgs {
  institution: string;
  /** The FULL flat page list of the active institution. */
  allPages: InstitutionPage[];
}

export function useKnowledgeAskAi({ institution, allPages }: UseKnowledgeAskAiArgs) {
  const [provider] = useLlmProvider();

  const hasContent = useMemo(() => collectScopePages(allPages, null).some((p) => p.body.trim().length > 0), [allPages]);

  const [open, setOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const state = readAskAiUiState();
      setOpen(state.open);
      setHistoryOpen(state.historyOpen);
      setQuestion(state.question);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated) writeAskAiOpen(open);
  }, [open, hydrated]);
  useEffect(() => {
    if (hydrated) writeAskAiHistoryOpen(historyOpen);
  }, [historyOpen, hydrated]);
  useEffect(() => {
    if (hydrated) writeAskAiQuestion(question);
  }, [question, hydrated]);

  const [questions, setQuestions] = useState<ScopeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [citationsUnavailableFor, setCitationsUnavailableFor] = useState<string | null>(null);

  // Reset on INSTITUTION change only (render-time, not an effect).
  const [prevInstitution, setPrevInstitution] = useState(institution);
  if (institution !== prevInstitution) {
    setPrevInstitution(institution);
    setQuestions([]);
    setLoading(true);
    setLoadError(null);
    setCitationsUnavailableFor(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const result = await getKnowledgeOverviewAction(institution, null);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setQuestions(result.questions);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [institution]);

  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const ask = () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAskError(null);
    setAsking(true);
    void (async () => {
      const result = await askKnowledgeOverviewAction(institution, null, trimmed, provider);
      setAsking(false);
      if ("error" in result) {
        setAskError(result.error);
        return;
      }
      setQuestions((prev) => [result.question, ...prev].slice(0, MAX_SCOPE_QA_ENTRIES));
      setCitationsUnavailableFor(result.citationsUnavailable ? result.question.id : null);
      // Clearing the draft keeps the field ready for a zero-click follow-up.
      setQuestion("");
    })();
  };

  const lastAnswer = questions.length > 0 ? questions[0] : null;

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
      const result = await clearKnowledgeOverviewQaAction(institution, null);
      setClearing(false);
      if ("error" in result) {
        setHistoryError(result.error);
        return;
      }
      setQuestions([]);
    })();
  };

  return {
    hasContent,
    loading,
    loadError,
    question,
    setQuestion,
    asking,
    askError,
    citationsUnavailableFor,
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
