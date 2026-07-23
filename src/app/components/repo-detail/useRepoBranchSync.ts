"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { listGithubReposAction, listGithubBranchesAction } from "../../actions";
import type { GithubRepo } from "@/lib/github";

const VC_REPO_KEY = "ta-vc-repo";
const VC_BRANCH_KEY = "ta-vc-branch";

// Owns the repo list load, the repo/branch persistence effects, and the
// branch load (which also resets the Files tab's state via the callback
// passed in - repoRef/branch/branches/defaultBranch live in RepoDetail
// itself, this hook just wires their side effects).
export function useRepoBranchSync(
  repoRef: string,
  branch: string,
  setRepos: Dispatch<SetStateAction<GithubRepo[]>>,
  setReposState: Dispatch<SetStateAction<"loading" | "ready" | "error">>,
  setBranch: Dispatch<SetStateAction<string>>,
  setBranches: Dispatch<SetStateAction<string[]>>,
  setDefaultBranch: Dispatch<SetStateAction<string>>,
  refreshVcCounts: (repoRef?: string) => void,
  resetForRepoChange: () => void
) {
  // Load repos on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReposState("loading");
      const r = await listGithubReposAction();
      if (cancelled) return;
      if ("error" in r) {
        setReposState("error");
        return;
      }
      setRepos(r.repos);
      setReposState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [setRepos, setReposState]);

  // Persist the selected repo + branch so the Repos subtab reopens where it was,
  // and point the attention badges at the newly selected repo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (repoRef) localStorage.setItem(VC_REPO_KEY, repoRef);
    else localStorage.removeItem(VC_REPO_KEY);
    refreshVcCounts(repoRef);
    // refreshVcCounts is stable (memoized in the provider).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoRef]);

  useEffect(() => {
    if (typeof window !== "undefined" && branch) localStorage.setItem(VC_BRANCH_KEY, branch);
  }, [branch]);

  // Load branches when repo changes
  useEffect(() => {
    if (!repoRef) {
      setBranches([]);
      setDefaultBranch("");
      setBranch("");
      resetForRepoChange();
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await listGithubBranchesAction(repoRef);
      if (cancelled) return;
      if ("error" in r) {
        setBranches([]);
        setDefaultBranch("");
        setBranch("");
        return;
      }
      setBranches(r.branches);
      setDefaultBranch(r.defaultBranch);
      const storedBranch = typeof window !== "undefined" ? localStorage.getItem(VC_BRANCH_KEY) : null;
      setBranch(storedBranch && r.branches.includes(storedBranch) ? storedBranch : r.defaultBranch);
      resetForRepoChange();
    })();
    return () => {
      cancelled = true;
    };
  }, [repoRef, resetForRepoChange, setBranch, setBranches, setDefaultBranch]);

  const reloadBranches = async () => {
    if (!repoRef) return;
    const r = await listGithubBranchesAction(repoRef);
    if ("error" in r) return;
    setBranches(r.branches);
    setDefaultBranch(r.defaultBranch);
    if (!r.branches.includes(branch)) {
      setBranch(r.defaultBranch);
    }
  };

  return { reloadBranches };
}
