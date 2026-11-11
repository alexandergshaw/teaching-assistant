"use client";

import { useEffect, useRef, useState } from "react";
import { enqueueChangedRepoGradeAction } from "@/app/actions/repo-grade-automatic";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { AutomaticRepoGradeBlock } from "@/lib/repo-grades-dashboard/automatic-blocks";
import type { RepoGradeSavedResults } from "./repoGradesDashboardModel";

type Target = { repo: string; folder: string; ref: string; sha: string };

export function changedEmptyTargets(scan: OrgRepoTreesResult | null, targetBranch: string,
  saved: RepoGradeSavedResults, blocks: readonly AutomaticRepoGradeBlock[]): Target[] {
  if (!scan || scan.truncated) return [];
  const sources = new Map(scan.repos.filter((repo) => repo.folders && !repo.partial && repo.sourceCommit
    && (!targetBranch.trim() || targetBranch.trim() === repo.defaultBranch))
    .map((repo) => [repo.repo.toLowerCase(), repo]));
  const result = new Map<string, Target>();
  function add(repo: string, folder: string, ref: string, oldSha: string | undefined) {
    const source = sources.get(repo.toLowerCase());
    if (!source?.sourceCommit || !oldSha || source.defaultBranch !== ref || source.sourceCommit === oldSha
      || !source.folders?.includes(folder)) return;
    const target = { repo: source.repo, folder, ref, sha: source.sourceCommit };
    result.set(JSON.stringify([repo.toLowerCase(), folder, ref, source.sourceCommit]), target);
  }
  for (const { latest } of saved.values()) if (latest.status === "no-submission") add(latest.repo, latest.folder, latest.sourceRef, latest.commit);
  for (const block of blocks) if (block.noSubmission) add(block.repo, block.folder, block.sourceRef, block.sourceSha);
  return [...result.values()];
}

export function useRepoChangedSubmissions(accountId: string | null, courseId: string | null, scan: OrgRepoTreesResult | null,
  targetBranch: string, saved: RepoGradeSavedResults, blocks: readonly AutomaticRepoGradeBlock[] | undefined, ready: boolean) {
  const attempted = useRef(new Set<string>());
  const [notice, setNotice] = useState("");
  const targets = ready ? changedEmptyTargets(scan, targetBranch, saved, blocks ?? []) : [];
  const signature = JSON.stringify(targets);
  useEffect(() => {
    if (!accountId || !courseId || !ready) return;
    let active = true;
    async function enqueue() {
      let queued = 0, failed = 0;
      for (const target of JSON.parse(signature) as Target[]) {
        const key = JSON.stringify([accountId, courseId, target]);
        if (attempted.current.has(key)) continue;
        attempted.current.add(key);
        const response = await enqueueChangedRepoGradeAction(accountId!, courseId!, target);
        if (response.status === "started") queued++;
        else if (response.status === "unavailable") { attempted.current.delete(key); failed++; }
      }
      if (active && (queued || failed)) setNotice(`${queued} changed submission${queued === 1 ? "" : "s"} queued for grading.${failed ? ` ${failed} could not be queued.` : ""}`);
    }
    void enqueue();
    return () => { active = false; };
  }, [accountId, courseId, ready, signature]);
  return notice;
}
