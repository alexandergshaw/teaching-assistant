import { useCallback, useEffect, useRef, useState } from "react";
import { listPullRequestsAction, mergePullRequestAction, markPullRequestReadyAction } from "@/app/actions";
import type { PullRequestInfo } from "@/lib/github";

type PrMatch = {
  repo: string;
  pr: PullRequestInfo;
  include: boolean;
  mergeOutcome?: "merged" | "failed";
  mergeError?: string;
};

export function useMergePullRequests() {
  const [prTitleFilter, setPrTitleFilter] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-pr-title") ?? "" : ""
  );
  const [prAuthorFilter, setPrAuthorFilter] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-pr-author") ?? "" : ""
  );
  const [prBranchFilter, setPrBranchFilter] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-pr-branch") ?? "" : ""
  );
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">(() => {
    if (typeof window === "undefined") return "merge";
    const stored = localStorage.getItem("ta-vc-bulk-merge-method");
    if (stored === "merge" || stored === "squash" || stored === "rebase") return stored;
    return "merge";
  });
  const [prMatches, setPrMatches] = useState<PrMatch[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("ta-vc-bulk-pr-matches");
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((match): match is PrMatch => {
        const m = match as Record<string, unknown>;
        const pr = m.pr as Record<string, unknown>;
        return (
          typeof match === "object" &&
          match !== null &&
          typeof m.repo === "string" &&
          typeof m.include === "boolean" &&
          (m.mergeOutcome === undefined || m.mergeOutcome === "merged" || m.mergeOutcome === "failed") &&
          (m.mergeError === undefined || typeof m.mergeError === "string") &&
          typeof m.pr === "object" &&
          m.pr !== null &&
          typeof pr.number === "number" &&
          typeof pr.state === "string" &&
          typeof pr.htmlUrl === "string"
        );
      });
    } catch {
      return [];
    }
  });
  const [prPreviewing, setPrPreviewing] = useState(false);
  const [prMerging, setPrMerging] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState(false);
  const [mergeSummary, setMergeSummary] = useState<string | null>(null);
  const prCancelRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-title", prTitleFilter);
  }, [prTitleFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-author", prAuthorFilter);
  }, [prAuthorFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-branch", prBranchFilter);
  }, [prBranchFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-merge-method", mergeMethod);
  }, [mergeMethod]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-matches", JSON.stringify(prMatches));
  }, [prMatches]);

  const handlePreviewPrs = useCallback(
    async (selectedRepos: Set<string>) => {
      const selected = [...selectedRepos];
      if (selected.length === 0) return;

      setPrPreviewing(true);
      prCancelRef.current = false;
      setPrMatches([]);

      const collected: PrMatch[] = [];
      for (let i = 0; i < selected.length; i++) {
        if (prCancelRef.current) break;

        const repo = selected[i];
        const result = await listPullRequestsAction(repo, "open");

        if (prCancelRef.current) break;

        if (!("error" in result)) {
          const filtered = result.pulls.filter((pr: PullRequestInfo) => {
            if (prTitleFilter.trim() && !pr.title.toLowerCase().includes(prTitleFilter.trim().toLowerCase())) return false;
            if (prAuthorFilter.trim() && !pr.user.toLowerCase().includes(prAuthorFilter.trim().toLowerCase())) return false;
            if (prBranchFilter.trim() && !pr.head.toLowerCase().includes(prBranchFilter.trim().toLowerCase())) return false;
            return true;
          });

          for (const pr of filtered) {
            collected.push({ repo, pr, include: true });
          }
        }

        setPrMatches([...collected]);
      }

      setPrPreviewing(false);
    },
    [prTitleFilter, prAuthorFilter, prBranchFilter]
  );

  const handleCancelPreview = useCallback(() => {
    prCancelRef.current = true;
  }, []);

  const includedCount = prMatches.filter((m) => m.include).length;

  const handleMergePrs = useCallback(async () => {
    if (!mergeConfirm) {
      setMergeConfirm(true);
      return;
    }

    const toMerge = prMatches.filter((m) => m.include);
    if (toMerge.length === 0) return;

    setPrMerging(true);
    prCancelRef.current = false;
    setMergeSummary(null);

    let mergedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toMerge.length; i++) {
      if (prCancelRef.current) break;

      const match = toMerge[i];

      if (match.pr.draft) {
        const readyResult = await markPullRequestReadyAction(match.repo, match.pr.number);
        if (prCancelRef.current) break;

        if ("error" in readyResult) {
          failedCount += 1;
          setPrMatches((prev) =>
            prev.map((m) =>
              m.repo === match.repo && m.pr.number === match.pr.number
                ? { ...m, mergeOutcome: "failed" as const, mergeError: readyResult.error }
                : m
            )
          );
          continue;
        }
      }

      const result = await mergePullRequestAction(match.repo, match.pr.number, mergeMethod);

      if (prCancelRef.current) break;

      if ("error" in result) {
        failedCount += 1;
        setPrMatches((prev) =>
          prev.map((m) =>
            m.repo === match.repo && m.pr.number === match.pr.number
              ? { ...m, mergeOutcome: "failed" as const, mergeError: result.error }
              : m
          )
        );
      } else {
        mergedCount += 1;
        setPrMatches((prev) =>
          prev.map((m) =>
            m.repo === match.repo && m.pr.number === match.pr.number
              ? { ...m, mergeOutcome: "merged" as const, mergeError: undefined }
              : m
          )
        );
      }
    }

    setMergeSummary(`Merged ${mergedCount} of ${toMerge.length}.${failedCount > 0 ? ` Failed: ${failedCount}.` : ""}`);
    setPrMerging(false);
    setMergeConfirm(false);
  }, [mergeConfirm, prMatches, mergeMethod]);

  const handleCancelMerge = useCallback(() => {
    prCancelRef.current = true;
  }, []);

  return {
    prTitleFilter,
    setPrTitleFilter,
    prAuthorFilter,
    setPrAuthorFilter,
    prBranchFilter,
    setPrBranchFilter,
    mergeMethod,
    setMergeMethod,
    prMatches,
    setPrMatches,
    prPreviewing,
    prMerging,
    mergeConfirm,
    setMergeConfirm,
    mergeSummary,
    includedCount,
    handlePreviewPrs,
    handleCancelPreview,
    handleMergePrs,
    handleCancelMerge,
  };
}

export type { PrMatch };
