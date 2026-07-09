"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getRepoAttentionAction } from "../actions";

// The repo the Repos view last worked with; its counts drive the badges.
const VC_REPO_KEY = "ta-vc-repo";

type VcCountsValue = {
  /** Open, non-draft pull requests (agent or human) awaiting review/merge. */
  openPrs: number;
  /** Ready (non-draft) PRs opened by the Copilot coding agent. */
  agentPrs: number;
  /** Workflow runs blocked on an approval (waiting / action_required). */
  runsNeedingApproval: number;
  total: number;
  /** Refetch counts, optionally for a different repo (e.g. after switching). */
  refresh: (repoRef?: string) => void;
};

const VcCountsContext = createContext<VcCountsValue | null>(null);

/**
 * Fetches attention counts (open PRs + runs needing approval) for the repo the
 * Version Control view is working with, and exposes them to the nav tab, the
 * Repos subtab, and RepoDetail's inner tabs. Lives in the layout so the badge
 * shows without visiting the tab; RepoDetail refreshes it on repo switches and
 * after merges/reviews/run approvals.
 */
export function VcCountsProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState({ openPrs: 0, agentPrs: 0, runsNeedingApproval: 0 });
  // Remember the last repo fetched so refresh() without an argument re-uses it.
  const repoRefRef = useRef<string>("");

  const fetchCounts = useCallback(async (repoRef: string) => {
    if (!repoRef.trim()) {
      setCounts({ openPrs: 0, agentPrs: 0, runsNeedingApproval: 0 });
      return;
    }
    repoRefRef.current = repoRef;
    const r = await getRepoAttentionAction(repoRef);
    // Ignore stale responses after a quick repo switch.
    if (repoRefRef.current !== repoRef || "error" in r) return;
    setCounts({ openPrs: r.openPrs, agentPrs: r.agentPrs, runsNeedingApproval: r.runsNeedingApproval });
  }, []);

  // Load on mount for the remembered repo (await-first so no sync setState).
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(VC_REPO_KEY) ?? "" : "";
    if (!saved) return;
    let cancelled = false;
    (async () => {
      repoRefRef.current = saved;
      const r = await getRepoAttentionAction(saved);
      if (cancelled || repoRefRef.current !== saved || "error" in r) return;
      setCounts({ openPrs: r.openPrs, agentPrs: r.agentPrs, runsNeedingApproval: r.runsNeedingApproval });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<VcCountsValue>(
    () => ({
      ...counts,
      total: counts.openPrs + counts.runsNeedingApproval,
      refresh: (repoRef?: string) => {
        void fetchCounts(repoRef ?? repoRefRef.current ?? "");
      },
    }),
    [counts, fetchCounts]
  );

  return <VcCountsContext.Provider value={value}>{children}</VcCountsContext.Provider>;
}

/** Read the Version Control attention counts. Zeros when no provider mounted. */
export function useVcCounts(): VcCountsValue {
  return (
    useContext(VcCountsContext) ?? {
      openPrs: 0,
      agentPrs: 0,
      runsNeedingApproval: 0,
      total: 0,
      refresh: () => {},
    }
  );
}
