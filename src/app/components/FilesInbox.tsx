"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { countWorkflowDeliverablesSince } from "../actions";

// The last time the user opened the Files tab.
const FILES_LAST_SEEN_KEY = "ta-files-last-seen";

type FilesInboxValue = {
  /** Count of workflow deliverable files saved since last Files tab visit. */
  count: number;
  /** Mark deliverables as seen (called when Files tab is opened). */
  markSeen: () => void;
};

const FilesInboxContext = createContext<FilesInboxValue | null>(null);

/**
 * Tracks unattended workflow deliverables saved to recording_files since the
 * user last opened the Files tab. Shows a badge on the Files nav tab.
 * Lives in the layout so the badge shows without visiting the tab.
 */
export function FilesInboxProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  // Load on mount: read lastSeen from localStorage, count new deliverables.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;

      const lastSeen = localStorage.getItem(FILES_LAST_SEEN_KEY);

      if (!lastSeen) {
        // First time: set timestamp to now, no backlog shown.
        localStorage.setItem(FILES_LAST_SEEN_KEY, new Date().toISOString());
        if (!cancelled) setCount(0);
        return;
      }

      // Query server for count of deliverables since lastSeen.
      const result = await countWorkflowDeliverablesSince(lastSeen);
      if (!cancelled) {
        setCount(result.count ?? 0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback(() => {
    localStorage.setItem(FILES_LAST_SEEN_KEY, new Date().toISOString());
    setCount(0);
  }, []);

  const value: FilesInboxValue = {
    count,
    markSeen,
  };

  return <FilesInboxContext.Provider value={value}>{children}</FilesInboxContext.Provider>;
}

/** Read the workflow deliverables inbox count. Zeros when no provider mounted. */
export function useFilesInbox(): FilesInboxValue {
  return (
    useContext(FilesInboxContext) ?? {
      count: 0,
      markSeen: () => {},
    }
  );
}
