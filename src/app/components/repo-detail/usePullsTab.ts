"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  listPullRequestsAction,
  createPullRequestAction,
  mergePullRequestAction,
  listPullRequestReviewsAction,
  listPullRequestFilesAction,
  reviewPullRequestAction,
} from "../../actions";
import type { PullRequestInfo, PullRequestReviewInfo, PullRequestFileInfo } from "@/lib/github";

// Owns the Pull requests tab: listing, opening, merging, reviewing, and
// viewing changed files, plus the cross-tab "open this PR" handoff used by
// the Copilot tab.
export function usePullsTab(
  repoRef: string,
  branch: string,
  defaultBranch: string,
  tab: string,
  setTab: Dispatch<SetStateAction<"files" | "branches" | "copy" | "pulls" | "actions" | "copilot" | "settings">>,
  refreshVcCounts: (repoRef?: string) => void
) {
  // Pull requests tab state
  const [prState, setPrState] = useState<"open" | "closed" | "all">("open");
  const [pulls, setPulls] = useState<PullRequestInfo[]>([]);
  const [pullsState, setPullsState] = useState<"idle" | "loading" | "error">("idle");
  const [pullsError, setPullsError] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState("");
  const [prHead, setPrHead] = useState("");
  const [prBase, setPrBase] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prBusy, setPrBusy] = useState(false);
  const [prMsg, setPrMsg] = useState<string | null>(null);
  const [mergeMethod, setMergeMethod] = useState<Record<number, "merge" | "squash" | "rebase">>({});
  const [mergingPr, setMergingPr] = useState<number | null>(null);
  const [reviewsByPr, setReviewsByPr] = useState<Record<number, PullRequestReviewInfo[]>>({});
  const [filesByPr, setFilesByPr] = useState<Record<number, PullRequestFileInfo[]>>({});
  const [expandedPr, setExpandedPr] = useState<number | null>(null);
  const [filesLoadingPr, setFilesLoadingPr] = useState<number | null>(null);
  const [reviewingPr, setReviewingPr] = useState<number | null>(null);
  const [approveMergingPr, setApproveMergingPr] = useState<number | null>(null);
  // A PR to jump to (from the Copilot tab): switch to Pull requests, expand it,
  // and scroll it into view once the list has loaded.
  const [focusPr, setFocusPr] = useState<number | null>(null);

  // Load PRs when the pulls tab is active
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef || tab !== "pulls") {
      if (!repoRef) {
        setPulls([]);
      }
      return;
    }
    let cancelled = false;
    setPullsState("loading");
    (async () => {
      const r = await listPullRequestsAction(repoRef, prState);
      if (cancelled) return;
      if ("error" in r) {
        setPullsState("error");
        setPullsError(r.error);
        return;
      }
      setPulls(r.pulls);
      setPullsState("idle");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef, tab, prState]);

  // Load each listed PR's reviews so approval status shows inline.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (tab !== "pulls" || pulls.length === 0) {
      setReviewsByPr({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        pulls.map(async (p) => [p.number, await listPullRequestReviewsAction(repoRef, p.number)] as const)
      );
      if (cancelled) return;
      const map: Record<number, PullRequestReviewInfo[]> = {};
      for (const [num, r] of entries) if (!("error" in r)) map[num] = r.reviews;
      setReviewsByPr(map);
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pulls, tab, repoRef]);

  // Once the Pull requests list is loaded, jump to the PR a Copilot task linked
  // to: expand its diff and scroll it into view.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (focusPr == null || tab !== "pulls" || pullsState !== "idle") return;
    if (!pulls.some((p) => p.number === focusPr)) return;
    const n = focusPr;
    setFocusPr(null);
    setExpandedPr(n);
    let cancelled = false;
    (async () => {
      if (!filesByPr[n]) {
        setFilesLoadingPr(n);
        const r = await listPullRequestFilesAction(repoRef, n);
        if (cancelled) return;
        setFilesLoadingPr(null);
        if (!("error" in r)) setFilesByPr((m) => ({ ...m, [n]: r.files }));
      }
    })();
    const timer = setTimeout(() => {
      document.getElementById(`pr-row-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [focusPr, tab, pullsState, pulls, repoRef, filesByPr]);

  // Open a specific PR in the Pull requests tab (used from the Copilot tab).
  const openPrInPullsTab = (n: number) => {
    setPrState("all");
    setFocusPr(n);
    setTab("pulls");
  };

  const reloadPulls = async () => {
    setPullsState("loading");
    const r = await listPullRequestsAction(repoRef, prState);
    if ("error" in r) {
      setPullsState("error");
      setPullsError(r.error);
      return;
    }
    setPulls(r.pulls);
    setPullsState("idle");
  };

  const handleCreatePr = async () => {
    const title = prTitle.trim();
    const head = prHead || branch;
    const base = prBase || defaultBranch;
    if (!title || !head || !base) return;
    setPrBusy(true);
    setPrMsg(null);
    const r = await createPullRequestAction(repoRef, title, head, base, prBody);
    setPrBusy(false);
    if ("error" in r) {
      setPrMsg(`Error: ${r.error}`);
      return;
    }
    setPrMsg(`Opened PR #${r.number}.`);
    setPrTitle("");
    setPrBody("");
    await reloadPulls();
    refreshVcCounts();
  };

  const handleMerge = async (n: number) => {
    setMergingPr(n);
    setPrMsg(null);
    const r = await mergePullRequestAction(repoRef, n, mergeMethod[n] ?? "merge");
    setMergingPr(null);
    if ("error" in r) {
      setPrMsg(`Error merging #${n}: ${r.error}`);
      return;
    }
    setPrMsg(`Merged #${n}.`);
    await reloadPulls();
    refreshVcCounts();
  };

  // Approve and merge a PR in one action. GitHub 422s on self-approval, so we skip approval
  // silently for PRs authored by the current user and proceed to merge.
  const handleApproveAndMerge = async (n: number) => {
    setApproveMergingPr(n);
    setPrMsg(null);
    let approvalNote = "";
    const rev = await reviewPullRequestAction(repoRef, n, "APPROVE");
    if ("error" in rev) {
      if (/own pull request/i.test(rev.error)) {
        approvalNote = " (approval skipped: you authored this PR)";
      } else {
        setPrMsg(`Error approving #${n}: ${rev.error}`);
        setApproveMergingPr(null);
        return;
      }
    }
    const r = await mergePullRequestAction(repoRef, n, mergeMethod[n] ?? "merge");
    setApproveMergingPr(null);
    if ("error" in r) {
      setPrMsg(`Error merging #${n}: ${r.error}`);
      return;
    }
    setPrMsg(approvalNote ? `Merged #${n}.${approvalNote}` : `Approved and merged #${n}.`);
    await reloadPulls();
    refreshVcCounts();
  };

  const reloadPrReviews = async (n: number) => {
    const r = await listPullRequestReviewsAction(repoRef, n);
    if (!("error" in r)) setReviewsByPr((m) => ({ ...m, [n]: r.reviews }));
  };

  // Submit an approve / request-changes review on a PR.
  const handleReviewPr = async (n: number, event: "APPROVE" | "REQUEST_CHANGES") => {
    let body: string | undefined;
    if (event === "REQUEST_CHANGES") {
      const input = typeof window !== "undefined" ? window.prompt("What changes are needed?") : null;
      if (input === null) return; // cancelled
      if (!input.trim()) {
        setPrMsg("Error: add a comment explaining the requested changes.");
        return;
      }
      body = input;
    }
    setReviewingPr(n);
    setPrMsg(null);
    const r = await reviewPullRequestAction(repoRef, n, event, body);
    setReviewingPr(null);
    if ("error" in r) {
      setPrMsg(`Error reviewing #${n}: ${r.error}`);
      return;
    }
    setPrMsg(event === "APPROVE" ? `Approved #${n}.` : `Requested changes on #${n}.`);
    await reloadPrReviews(n);
  };

  // Expand/collapse a PR's changed files (loaded once, on first expand).
  const togglePrFiles = async (n: number) => {
    if (expandedPr === n) {
      setExpandedPr(null);
      return;
    }
    setExpandedPr(n);
    if (!filesByPr[n]) {
      setFilesLoadingPr(n);
      const r = await listPullRequestFilesAction(repoRef, n);
      setFilesLoadingPr(null);
      if (!("error" in r)) setFilesByPr((m) => ({ ...m, [n]: r.files }));
    }
  };

  return {
    prState,
    setPrState,
    pulls,
    pullsState,
    pullsError,
    prTitle,
    setPrTitle,
    prHead,
    setPrHead,
    prBase,
    setPrBase,
    prBody,
    setPrBody,
    prBusy,
    prMsg,
    mergeMethod,
    setMergeMethod,
    mergingPr,
    reviewsByPr,
    expandedPr,
    filesByPr,
    filesLoadingPr,
    reviewingPr,
    approveMergingPr,
    openPrInPullsTab,
    handleCreatePr,
    handleMerge,
    handleApproveAndMerge,
    handleReviewPr,
    togglePrFiles,
  };
}
