"use server";

// Course Build's visualizer-gap audit (backlog item B / HANDOFF.md Q2).
//
// THIS IS WIRING, NOT INVENTION - every primitive below is reused verbatim:
//   - Searching: loadVisualizerIndexAction (./live-class) fetches and parses
//     the visualizer's nav index; resolveVisualizerLinks
//     (src/lib/live-class/links.ts) matches a concept against it. Both are
//     the SAME code answerLiveQuestionAction already uses live, in front of a
//     class. Never a second index parser.
//   - Concepts: planWeekConcepts (src/lib/lecture-concepts.ts) is the
//     authoritative per-lecture CONCEPT PLAN - read here, never edited.
//   - Copilot: createCopilotAgentTask/listCopilotTasks (@/lib/github, backed
//     by src/lib/github.copilot.ts), the same primitives
//     createCopilotRepoAction (src/app/actions/github.ts) uses, including
//     its DEGRADATION POSTURE - Copilot being unavailable is a NOTE on the
//     result, never a thrown failure, since the coverage sweep itself still
//     succeeded.
//
// The actual gap-detection/cap/report/idempotence-check DECISION logic lives
// in the pure module src/lib/workflows/visualizer-gap-audit.ts, unit-tested
// directly there without mocking an LLM or GitHub - this file is only the
// "use server" orchestration: gather each week's concept plan (one LLM round
// trip per week via planWeekConcepts), load the index once, delegate to the
// pure module, and - only when the caller's own "dispatch" flag is on -
// idempotently open ONE batched Copilot task for the run.
//
// SCOPE (decision already made): sweeps EVERY week the caller passes in -
// COURSE_BUILD binds this to course-schedule-from-source's own FULL,
// unnarrowed schedule (step 1), not select-course-modules' narrowed one, so a
// run that narrowed generation to a few modules still audits the WHOLE
// course's visualizer coverage, matching how every other course-wide step in
// that preset (define-course-project, the course-refresh include) reads step
// 1 directly. See presets/course-build.ts's own binding for this step.
//
// DISPATCH IS A SUPERVISED SIDE EFFECT: opening a GitHub issue (assigned to
// the Copilot coding agent) on the visualizer repo is outward-facing, so it
// only happens when the caller explicitly passes dispatch=true - never
// implied by finding gaps alone. src/lib/workflows/headless.ts additionally
// makes the step type conditionally headless-safe (safe only when its
// "dispatch" input is not pinned to a literal "1"), so an unattended/
// scheduled run can never silently open an issue through this step even if a
// future preset tried to wire it that way.

import { requireOwner } from "@/lib/supabase/auth";
import type { LlmProvider } from "@/lib/llm";
import type { ScheduleWeekPlan } from "../actions-types";
import { planWeekConcepts } from "@/lib/lecture-concepts";
import { loadVisualizerIndexAction } from "./live-class";
import { listCourseHubAction } from "./course-hub-core";
import { VISUALIZER_REPO } from "@/lib/visualizer";
import { createCopilotAgentTask, listCopilotTasks } from "@/lib/github";
import {
  checkConceptsAgainstIndex,
  capGaps,
  buildCoverageReport,
  buildGapTaskTitle,
  buildGapTaskBody,
  findExistingGapTask,
  type WeekConceptInput,
} from "@/lib/workflows/visualizer-gap-audit";

const DEFAULT_MAX_GAPS = 20;
const DEFAULT_MINUTES = 50;

export interface AuditVisualizerCoverageResult {
  /** Full per-week, per-concept coverage report (found vs gap), plus any
   * per-week planning notes/errors and an index-load note when it failed. */
  report: string;
  /** One deduped gap per line, "<concept> (Week N: <topic>)". */
  gaps: string;
  /** Total distinct gap concepts found across the whole sweep. */
  gapCount: number;
  /** How many of those gaps were left out of the dispatched task by the cap. */
  droppedCount: number;
  /** How many gap concepts were actually named in the (created or already-
   * open) Copilot task; 0 when dispatch was off or no task exists. */
  dispatchedCount: number;
  /** The Copilot task's issue URL - newly created or a pre-existing one this
   * run recognized (idempotence); blank when nothing was dispatched. */
  taskUrl: string;
  /** Human-readable note on what happened with dispatch: off, no gaps,
   * idempotent skip, or a Copilot-unavailable degradation note. */
  copilotNote: string;
}

/**
 * Sweep every week in `schedule` for its planned concepts (planWeekConcepts),
 * check each against the visualizer's own page index, and - only when
 * `dispatch` is true and at least one gap was found - idempotently open ONE
 * batched Copilot coding-agent task naming the gaps (capped at `maxGaps`,
 * with the drop count stated when truncated).
 *
 * Never throws. A per-week concept-planning failure is caught and folded
 * into the report as a note for that week only - it never aborts the sweep
 * for the rest of the course, the same "one bad week does not sink the run"
 * shape generate-weekly-qa/generate-weekly-current-events already use. A
 * Copilot dispatch failure (the agent not being enabled for the repo, a
 * transient API error, ...) is likewise caught and surfaced as
 * `copilotNote` rather than an error - the coverage sweep itself already
 * succeeded regardless of whether the task could be opened, matching
 * createCopilotRepoAction's own degradation posture.
 */
export async function auditVisualizerCoverageAction(
  schedule: ScheduleWeekPlan[],
  minutes: number,
  maxGaps: number,
  dispatch: boolean,
  hubCourseId: string,
  provider: LlmProvider
): Promise<AuditVisualizerCoverageResult | { error: string }> {
  try {
    await requireOwner();

    const weeks = Array.isArray(schedule) ? schedule : [];
    if (weeks.length === 0) {
      return { error: "Provide a course schedule to audit." };
    }

    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES;

    let courseName = "";
    const trimmedHubCourse = (hubCourseId ?? "").trim();
    if (trimmedHubCourse) {
      const list = await listCourseHubAction();
      if (!("error" in list)) {
        const tile = list.courses.find((c) => c.id === trimmedHubCourse);
        if (tile) courseName = tile.name;
      }
    }

    const indexResult = await loadVisualizerIndexAction();
    const index = "entries" in indexResult ? indexResult.entries : [];
    const indexNote = "error" in indexResult ? `Visualizer index: ${indexResult.error}` : "";

    const weekConcepts: WeekConceptInput[] = [];
    const planNotes: string[] = [];

    for (const week of weeks) {
      const topic = (week.topic ?? "").trim();
      const summary = (week.summary ?? "").trim();
      if (!topic) {
        planNotes.push(`Week ${week.week}: skipped - no topic.`);
        continue;
      }
      try {
        const plan = await planWeekConcepts(topic, summary, safeMinutes, provider);
        if (plan.concepts.length === 0) {
          planNotes.push(`Week ${week.week} (${topic}): no concepts planned.`);
          continue;
        }
        weekConcepts.push({ week: week.week, topic, concepts: plan.concepts });
      } catch (err) {
        planNotes.push(
          `Week ${week.week} (${topic}): could not plan concepts - ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }

    const { results, gaps } = checkConceptsAgainstIndex(weekConcepts, index);
    const { included, droppedCount } = capGaps(
      gaps,
      Number.isFinite(maxGaps) && maxGaps > 0 ? maxGaps : DEFAULT_MAX_GAPS
    );

    const reportSections = [buildCoverageReport(results)];
    if (indexNote) reportSections.push(indexNote);
    if (planNotes.length > 0) reportSections.push(planNotes.join("\n"));
    const report = reportSections.join("\n\n");

    const gapsText = gaps.map((g) => `${g.concept} (Week ${g.week}${g.topic ? `: ${g.topic}` : ""})`).join("\n");

    let taskUrl = "";
    let copilotNote = "";
    let dispatchedCount = 0;

    if (gaps.length === 0) {
      copilotNote = "No gaps found - every planned concept resolved to a visualizer page.";
    } else if (!dispatch) {
      copilotNote = `Dispatch is off - ${gaps.length} gap concept(s) found but no Copilot task was created. Turn on "Dispatch Copilot task for gaps" to open one.`;
    } else {
      const [owner, repo] = VISUALIZER_REPO.split("/");
      const title = buildGapTaskTitle(courseName);
      try {
        const tasks = await listCopilotTasks(owner, repo);
        const existing = findExistingGapTask(tasks, title);
        if (existing) {
          taskUrl = existing.htmlUrl;
          dispatchedCount = included.length;
          copilotNote = `A Copilot task for this course's visualizer gaps is already open (#${existing.number}) - not opening a duplicate.`;
        } else {
          const body = buildGapTaskBody(courseName, included, droppedCount);
          const created = await createCopilotAgentTask(owner, repo, title, body);
          taskUrl = created.issueUrl;
          dispatchedCount = included.length;
        }
      } catch (copilotErr) {
        copilotNote =
          copilotErr instanceof Error
            ? copilotErr.message
            : "Could not create the Copilot task for the visualizer gaps.";
      }
    }

    return {
      report,
      gaps: gapsText,
      gapCount: gaps.length,
      droppedCount,
      dispatchedCount,
      taskUrl,
      copilotNote,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not audit visualizer coverage." };
  }
}
