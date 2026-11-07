"use client";

import { useEffect, useState } from "react";
import { readRepoGradeAutomaticBlocksAction } from "@/app/actions/repo-grade-automatic-blocks";
import { AUTOMATIC_GRADE_DETAIL_STATES, type AutomaticRepoGradeBlocks } from "@/lib/repo-grades-dashboard/automatic-blocks";
import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";
import { useRepoGradesAutomaticRun } from "./RepoGradesStartup";
import { recordRepoGradesStartup } from "./startup-diagnostics";

export function useRepoGradesAutomaticBlocks(accountId: string | null, courseId: string | null) {
  const run = useRepoGradesAutomaticRun(accountId);
  const course = run?.courses.find((entry) => entry.courseId === courseId);
  const runId = run?.id;
  const detailCount = course?.counts.reduce((total, { state, count }) =>
    AUTOMATIC_GRADE_DETAIL_STATES.includes(state) ? total + count : total, 0) ?? 0;
  // Older cells can have a no-submission result even when a newer targeted
  // run for this class only touched other cells.
  const scope = accountId && courseId && runId
    ? JSON.stringify([accountId, courseId, runId]) : null;
  const [reload, setReload] = useState<{ scope: string; revision: number }>();
  const revision = scope && reload?.scope === scope ? reload.revision : 0;
  const [read, setRead] = useState<{ scope: string; revision: number; result: AutomaticRepoGradeBlocks }>();

  useEffect(() => {
    if (!scope || !accountId || !courseId) return;
    let current = true;
    const load = async () => {
      const started = performance.now();
      const result = await readRepoGradeAutomaticBlocksAction(accountId, courseId)
        .catch(() => ({ status: "unavailable" } as const));
      if (!current) return;
      setRead({ scope, revision, result });
      try {
        recordRepoGradesStartup("background_block_details", result.status === "loaded" ? "success" : "unavailable",
          started, result.status === "loaded" ? result.targets.length : undefined);
      } catch {
        // The gradebook can show the result even if local diagnostics are unavailable.
      }
    };
    void load();
    return () => { current = false; };
  // A newly discovered target can move to a different pin while aggregate
  // counts stay unchanged. Refresh with the polled run object, not counts alone.
  }, [accountId, courseId, detailCount, scope, revision, run]);

  const scopedRead = scope && read?.scope === scope ? read : undefined;
  const result = scopedRead?.result;
  const pastRun = !course && result?.status === "loaded" ? result.run : null;
  const unavailable = result?.status === "unavailable";
  const reloading = revision > 0 && scopedRead?.revision !== revision;
  return {
    targets: result?.status === "loaded" ? result.targets : undefined,
    unavailable,
    reloading,
    discoveryExplanation: course?.state === "partial" ? automaticReasonLabel(course.reason) : pastRun?.discoveryExplanation ?? null,
    pastRunStartedAt: pastRun?.startedAt,
    reloadReasons: scope && (unavailable || revision > 0) ? () => {
      if (!reloading) setReload({ scope, revision: revision + 1 });
    } : undefined,
  };
}
