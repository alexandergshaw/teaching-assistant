"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getInstitutionCountsAction, getUnreadCountsAction } from "../actions";
import { useInstitutions } from "@/lib/institutions";

type Counts = Record<string, { needsGrading: number; unread: number }>;

type CountsContextValue = {
  counts: Counts;
  totalNeedsGrading: number;
  totalUnread: number;
  /** Refetch both needs-grading and unread (the full, heavier scan). */
  refresh: () => void;
  /** Refetch only unread inbox counts (cheap; for read/archive/reply). */
  refreshUnread: () => void;
};

const InstitutionCountsContext = createContext<CountsContextValue | null>(null);

/**
 * Fetches per-institution notification counts (needs-grading + unread inbox) once
 * for the registered schools and exposes them to the tab + switcher badges. Lives
 * high in the tree (layout) so it persists across client navigations and only
 * refetches when the institution list changes or something calls refresh().
 */
export function InstitutionCountsProvider({ children }: { children: React.ReactNode }) {
  const institutions = useInstitutions();
  const [counts, setCounts] = useState<Counts>({});

  const fetchCounts = useCallback(async (codes: string[]) => {
    const result = await getInstitutionCountsAction(codes);
    if ("error" in result) return;
    const next: Counts = {};
    for (const c of result.counts) {
      next[c.acronym] = { needsGrading: c.needsGrading, unread: c.unread };
    }
    setCounts(next);
  }, []);

  // Cheap: refresh only the unread tallies, preserving needs-grading counts.
  const fetchUnread = useCallback(async (codes: string[]) => {
    const result = await getUnreadCountsAction(codes);
    if ("error" in result) return;
    setCounts((prev) => {
      const next = { ...prev };
      for (const c of result.counts) {
        next[c.acronym] = { needsGrading: prev[c.acronym]?.needsGrading ?? 0, unread: c.unread };
      }
      return next;
    });
  }, []);

  // Load on mount and whenever the registry changes. Await-first (the guard skips
  // the empty case) so the effect body performs no synchronous setState.
  useEffect(() => {
    if (institutions.length === 0) return;
    let cancelled = false;
    (async () => {
      const result = await getInstitutionCountsAction(institutions);
      if (cancelled || "error" in result) return;
      const next: Counts = {};
      for (const c of result.counts) {
        next[c.acronym] = { needsGrading: c.needsGrading, unread: c.unread };
      }
      setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [institutions]);

  const value = useMemo<CountsContextValue>(() => {
    let totalNeedsGrading = 0;
    let totalUnread = 0;
    for (const code of institutions) {
      totalNeedsGrading += counts[code]?.needsGrading ?? 0;
      totalUnread += counts[code]?.unread ?? 0;
    }
    return {
      counts,
      totalNeedsGrading,
      totalUnread,
      refresh: () => {
        if (institutions.length > 0) void fetchCounts(institutions);
        else setCounts({});
      },
      refreshUnread: () => {
        if (institutions.length > 0) void fetchUnread(institutions);
      },
    };
  }, [counts, institutions, fetchCounts, fetchUnread]);

  return (
    <InstitutionCountsContext.Provider value={value}>{children}</InstitutionCountsContext.Provider>
  );
}

/** Read the notification counts. Returns zeros when no provider is mounted. */
export function useInstitutionCounts(): CountsContextValue {
  return (
    useContext(InstitutionCountsContext) ?? {
      counts: {},
      totalNeedsGrading: 0,
      totalUnread: 0,
      refresh: () => {},
      refreshUnread: () => {},
    }
  );
}
