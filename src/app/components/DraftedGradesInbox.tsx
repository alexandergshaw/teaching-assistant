"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { countPendingGradingDrafts } from "../actions";

type DraftedGradesInboxValue = {
  /** Total pending grading drafts (shown as the Drafts nav badge). */
  count: number;
  /** Re-fetch the count (call after a draft is added/deleted or the tab opens). */
  refresh: () => void;
};

const DraftedGradesInboxContext = createContext<DraftedGradesInboxValue | null>(null);

export function DraftedGradesInboxProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      const result = await countPendingGradingDrafts();
      if (!cancelled) setCount(result.count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = refresh();
    return cleanup;
  }, [refresh]);

  return (
    <DraftedGradesInboxContext.Provider value={{ count, refresh }}>
      {children}
    </DraftedGradesInboxContext.Provider>
  );
}

export function useDraftedGradesInbox(): DraftedGradesInboxValue {
  return useContext(DraftedGradesInboxContext) ?? { count: 0, refresh: () => {} };
}
