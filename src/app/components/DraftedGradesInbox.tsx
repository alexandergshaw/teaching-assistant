"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { countGradingDraftsSince } from "../actions";

// The last time the user opened the Grade Drafts tab.
const DRAFTS_LAST_SEEN_KEY = "ta-drafts-last-seen";

type DraftedGradesInboxValue = {
  /** Count of pending grading drafts saved since last Grade Drafts tab visit. */
  count: number;
  /** Mark drafts as seen (called when Grade Drafts tab is opened). */
  markSeen: () => void;
};

const DraftedGradesInboxContext = createContext<DraftedGradesInboxValue | null>(null);

/**
 * Tracks pending grading drafts created since the user last opened the
 * Grade Drafts tab. Shows a badge on the Grade Drafts nav tab.
 * Lives in the layout so the badge shows without visiting the tab.
 */
export function DraftedGradesInboxProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  // Load on mount: read lastSeen from localStorage, count new drafts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;

      const lastSeen = localStorage.getItem(DRAFTS_LAST_SEEN_KEY);

      if (!lastSeen) {
        // First time: set timestamp to now, no backlog shown.
        localStorage.setItem(DRAFTS_LAST_SEEN_KEY, new Date().toISOString());
        if (!cancelled) setCount(0);
        return;
      }

      // Query server for count of drafts since lastSeen.
      const result = await countGradingDraftsSince(lastSeen);
      if (!cancelled) {
        setCount(result.count ?? 0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback(() => {
    localStorage.setItem(DRAFTS_LAST_SEEN_KEY, new Date().toISOString());
    setCount(0);
  }, []);

  const value: DraftedGradesInboxValue = {
    count,
    markSeen,
  };

  return <DraftedGradesInboxContext.Provider value={value}>{children}</DraftedGradesInboxContext.Provider>;
}

/** Read the pending grading drafts inbox count. Zeros when no provider mounted. */
export function useDraftedGradesInbox(): DraftedGradesInboxValue {
  return (
    useContext(DraftedGradesInboxContext) ?? {
      count: 0,
      markSeen: () => {},
    }
  );
}
