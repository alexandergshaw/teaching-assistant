import { useEffect, useState } from "react";
import {
  addRepoGradeSavedPage, mergeIncompleteRepoGradeResults, type RepoGradeSavedResult, type RepoGradeSavedResults,
} from "./repoGradesDashboardModel";
import { loadRepoGradeHistoryPage } from "./useRepoGradeHistory";

const EMPTY_RESULTS: RepoGradeSavedResults = new Map();
const MAX_HISTORY_PAGES = 10;

export async function loadRepoGradeMatrixPages(
  courseId: string, accountId: string, before: number | undefined, isCurrent: () => boolean,
) {
  const results = new Map<string, RepoGradeSavedResult>();
  // Keep the latest status and latest usable score for each repository and folder.
  for (let pageIndex = 0; isCurrent() && pageIndex < MAX_HISTORY_PAGES; pageIndex++) {
    const page = await loadRepoGradeHistoryPage(courseId, accountId, before, isCurrent);
    if (!isCurrent()) return null;
    if (page.status === "course-unavailable") {
      return { results: EMPTY_RESULTS, complete: false, nextBefore: null, courseUnavailable: true };
    }
    if (page.status !== "loaded") break;
    addRepoGradeSavedPage(results, page.rows);
    if (page.nextBefore === null) return { results, complete: true, nextBefore: null, courseUnavailable: false };
    before = page.nextBefore;
  }
  return { results, complete: false, nextBefore: before ?? null, courseUnavailable: false };
}

type HistoryRequest = {
  id: number;
  courseId: string;
  accountId: string | null;
  historyRevision: number;
  before?: number;
};

export function useRepoGradeMatrixResults(courseId: string, accountId: string | null, historyRevision: number) {
  const [request, setRequest] = useState<HistoryRequest>({ id: 0, courseId, accountId, historyRevision });
  const [snapshot, setSnapshot] = useState<{
    accountId: string;
    courseId: string;
    historyRevision: number;
    requestId: number;
    results: RepoGradeSavedResults;
    complete: boolean;
    nextBefore: number | null;
  } | null>(null);
  const current = snapshot?.accountId === accountId && snapshot.courseId === courseId ? snapshot : null;
  const pending = accountId !== null && (current?.historyRevision !== historyRevision || current.requestId !== request.id);

  if (request.courseId !== courseId || request.accountId !== accountId || request.historyRevision !== historyRevision) {
    setRequest({ id: request.id + 1, courseId, accountId, historyRevision });
  }

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    const load = async () => {
      const { before } = request;
      const page = await loadRepoGradeMatrixPages(courseId, accountId, before, () => active);
      if (!active || !page) return;
      setSnapshot((previous) => ({
        accountId, courseId, historyRevision, requestId: request.id,
        complete: page.complete, nextBefore: page.nextBefore,
        results: !page.courseUnavailable && (before !== undefined || !page.complete)
          && previous?.accountId === accountId && previous.courseId === courseId
          ? mergeIncompleteRepoGradeResults(previous.results, page.results) : page.results,
      }));
    };
    void load();
    return () => { active = false; };
  }, [accountId, courseId, historyRevision, request]);

  return {
    results: current?.results ?? EMPTY_RESULTS,
    pending,
    incomplete: current?.complete === false,
    hasOlder: current?.nextBefore != null,
    olderComplete: !pending && current?.complete === true && request.before !== undefined,
    loadOlder: () => {
      if (pending || !current || current.nextBefore === null) return;
      const { nextBefore: before, requestId } = current;
      setRequest((previous) => previous.id === requestId ? {
        ...previous, id: previous.id + 1, before,
      } : previous);
    },
    refresh: () => setRequest((previous) => ({ ...previous, id: previous.id + 1, before: undefined })),
  };
}
