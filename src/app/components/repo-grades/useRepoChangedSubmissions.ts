"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { enqueueChangedRepoGradeAction } from "@/app/actions/repo-grade-automatic";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import type { AutomaticRepoGradeBlock } from "@/lib/repo-grades-dashboard/automatic-blocks";
import type { RepoGradeSavedResults } from "./repoGradesDashboardModel";

type Target = { repo: string; folder: string; ref: string; sha: string };

export async function queueWhileCurrent<T>(items: readonly T[], current: () => boolean, submit: (item: T) => Promise<void>) {
  for (const item of items) {
    if (!current()) break;
    await submit(item);
    if (!current()) break;
  }
}

export function changedEmptyTargets(scan: OrgRepoTreesResult | null, targetBranch: string,
  saved: RepoGradeSavedResults, blocks: readonly AutomaticRepoGradeBlock[] = []): Target[] {
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
  const savedCells = new Set([...saved.values()].map(({ latest }) => JSON.stringify([latest.repo.toLowerCase(), latest.folder])));
  for (const block of blocks) if (block.noSubmission && !block.noSubmissionStale
    && !savedCells.has(JSON.stringify([block.repo.toLowerCase(), block.folder]))) {
    add(block.repo, block.folder, block.sourceRef, block.sourceSha);
  }
  return [...result.values()];
}

export function useRepoChangedSubmissions(accountId: string | null, courseId: string | null, scan: OrgRepoTreesResult | null,
  targetBranch: string, saved: RepoGradeSavedResults, blocks: readonly AutomaticRepoGradeBlock[] | undefined, ready: boolean, automaticEnabled: boolean) {
  const attempted = useRef(new Set<string>());
  const scope = useRef({ accountId, courseId });
  useLayoutEffect(() => { scope.current = { accountId, courseId }; }, [accountId, courseId]);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const targets = ready ? changedEmptyTargets(scan, targetBranch, saved, blocks) : [];
  const signature = JSON.stringify(targets);
  async function enqueue(explicit: boolean, shouldUpdate = () => true) {
    if (!accountId || !courseId || !ready) return;
    const current = () => shouldUpdate() && scope.current.accountId === accountId && scope.current.courseId === courseId;
    await Promise.resolve();
    if (!current()) return;
    let queued = 0, failed = 0;
      await queueWhileCurrent(JSON.parse(signature) as Target[], current, async (target) => {
        const key = JSON.stringify([accountId, courseId, target]);
        if (attempted.current.has(key)) return;
        attempted.current.add(key);
        const response = await enqueueChangedRepoGradeAction(accountId, courseId, target, explicit)
          .catch(() => ({ status: "unavailable" } as const));
        attempted.current.delete(key);
        if (response.status === "started") queued++;
        else if (response.status === "unavailable") failed++;
      });
      if (current()) setNotice(`${queued} changed submission${queued === 1 ? "" : "s"} queued for grading.${failed ? ` ${failed} could not be queued.` : ""}`);
  }
  useEffect(() => {
    if (!accountId || !courseId || !ready || !automaticEnabled) return;
    let active = true;
    // enqueue updates notice only after the asynchronous server requests finish.
    void enqueue(false, () => active);
    return () => { active = false; };
  // Signature is the stable serialized target list; the callback only captures these dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, courseId, ready, automaticEnabled, signature]);
  return { notice, pending, count: targets.length, enqueue: async () => {
    setPending(true);
    try { await enqueue(true); } finally { setPending(false); }
  } };
}
