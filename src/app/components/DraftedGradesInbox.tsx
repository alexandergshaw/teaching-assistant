"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { countPendingGradingDrafts, countPendingMessageDrafts, countPendingPresentationDrafts } from "../actions";

type DraftedGradesInboxValue = {
  /** Pending grading drafts. */
  gradesCount: number;
  /** Pending message drafts. */
  messagesCount: number;
  /** Pending presentation drafts. */
  presentationsCount: number;
  /** Total pending drafts (gradesCount + messagesCount + presentationsCount, shown as the Drafts nav badge). */
  count: number;
  /** Re-fetch the counts (call after a draft is added/deleted or the tab opens). */
  refresh: () => void;
};

const DraftedGradesInboxContext = createContext<DraftedGradesInboxValue | null>(null);

export function DraftedGradesInboxProvider({ children }: { children: React.ReactNode }) {
  const [gradesCount, setGradesCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [presentationsCount, setPresentationsCount] = useState(0);

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      const [gradesResult, messagesResult, presentationsResult] = await Promise.all([
        countPendingGradingDrafts(),
        countPendingMessageDrafts(),
        countPendingPresentationDrafts(),
      ]);
      if (!cancelled) {
        setGradesCount(gradesResult.count ?? 0);
        setMessagesCount(messagesResult.count ?? 0);
        setPresentationsCount(presentationsResult.count ?? 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = refresh();
    return cleanup;
  }, [refresh]);

  const count = gradesCount + messagesCount + presentationsCount;

  return (
    <DraftedGradesInboxContext.Provider value={{ gradesCount, messagesCount, presentationsCount, count, refresh }}>
      {children}
    </DraftedGradesInboxContext.Provider>
  );
}

export function useDraftedGradesInbox(): DraftedGradesInboxValue {
  return useContext(DraftedGradesInboxContext) ?? { gradesCount: 0, messagesCount: 0, presentationsCount: 0, count: 0, refresh: () => {} };
}
