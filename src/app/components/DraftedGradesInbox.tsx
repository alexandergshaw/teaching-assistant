"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { countPendingGradingDrafts, countPendingMessageDrafts } from "../actions";

type DraftedGradesInboxValue = {
  /** Pending grading drafts. */
  gradesCount: number;
  /** Pending message drafts. */
  messagesCount: number;
  /** Total pending drafts (gradesCount + messagesCount, shown as the Drafts nav badge). */
  count: number;
  /** Re-fetch the counts (call after a draft is added/deleted or the tab opens). */
  refresh: () => void;
};

const DraftedGradesInboxContext = createContext<DraftedGradesInboxValue | null>(null);

export function DraftedGradesInboxProvider({ children }: { children: React.ReactNode }) {
  const [gradesCount, setGradesCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      const [gradesResult, messagesResult] = await Promise.all([
        countPendingGradingDrafts(),
        countPendingMessageDrafts(),
      ]);
      if (!cancelled) {
        setGradesCount(gradesResult.count ?? 0);
        setMessagesCount(messagesResult.count ?? 0);
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

  const count = gradesCount + messagesCount;

  return (
    <DraftedGradesInboxContext.Provider value={{ gradesCount, messagesCount, count, refresh }}>
      {children}
    </DraftedGradesInboxContext.Provider>
  );
}

export function useDraftedGradesInbox(): DraftedGradesInboxValue {
  return useContext(DraftedGradesInboxContext) ?? { gradesCount: 0, messagesCount: 0, count: 0, refresh: () => {} };
}
