import { useEffect, useState } from "react";
import {
  addRepoGradeSavedPage, mergeIncompleteRepoGradeResults, type RepoGradeSavedResult, type RepoGradeSavedResults,
} from "./repoGradesDashboardModel";
import { loadRepoGradeHistoryPage } from "./useRepoGradeHistory";

const EMPTY_RESULTS: RepoGradeSavedResults = new Map();
const MAX_HISTORY_PAGES = 10;

export function useRepoGradeMatrixResults(courseId: string, accountId: string | null, historyRevision: number) {
  const [refreshCount, setRefreshCount] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    accountId: string;
    courseId: string;
    historyRevision: number;
    refreshCount: number;
    results: RepoGradeSavedResults;
    complete: boolean;
  } | null>(null);
  const current = snapshot?.accountId === accountId && snapshot.courseId === courseId ? snapshot : null;

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    const load = async () => {
      const results = new Map<string, RepoGradeSavedResult>();
      let before: number | undefined;
      let complete = false;
      let courseUnavailable = false;
      // The validated cursor moves backwards. Keep only the latest status
      // and latest usable score for each repository and assignment folder.
      for (let pageIndex = 0; active && pageIndex < MAX_HISTORY_PAGES; pageIndex++) {
        const page = await loadRepoGradeHistoryPage(courseId, accountId, before, () => active);
        if (!active) return;
        if (page.status !== "loaded") {
          courseUnavailable = page.status === "course-unavailable";
          break;
        }
        addRepoGradeSavedPage(results, page.rows);
        if (page.nextBefore === null) {
          complete = true;
          break;
        }
        before = page.nextBefore;
      }
      setSnapshot((previous) => ({
        accountId, courseId, historyRevision, refreshCount, complete,
        results: courseUnavailable ? EMPTY_RESULTS
          : !complete && previous?.accountId === accountId && previous.courseId === courseId
            ? mergeIncompleteRepoGradeResults(previous.results, results) : results,
      }));
    };
    void load();
    return () => { active = false; };
  }, [accountId, courseId, historyRevision, refreshCount]);

  return {
    results: current?.results ?? EMPTY_RESULTS,
    pending: accountId !== null && (current?.historyRevision !== historyRevision || current.refreshCount !== refreshCount),
    incomplete: current?.complete === false,
    refresh: () => setRefreshCount((count) => count + 1),
  };
}
