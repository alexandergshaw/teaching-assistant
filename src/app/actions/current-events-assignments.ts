"use server";

// The "use server" boundary for the current-events-assignment control
// (docs/current-events-assignment-from-modules-acceptance-criteria.md,
// section 3b - D3, D4). Two exported actions, both plain owner-scoped reads
// or a fan-out generation call - NO Canvas write lives in this file at all;
// the write (createGradableAction, per W1) is Wave 2's job, dispatched from
// the client hook once it has computed a deadline of its own.
//
// THE DEFINING CONSTRAINT THIS FILE EXISTS TO ENFORCE (D4): it must be
// STRUCTURALLY INCAPABLE of computing a deadline.
//   - readCourseDeadlineContextAction returns the two RAW course columns
//     (`startDate`, `assignmentDueRule`) and nothing derived from them - no
//     Date, no ISO instant, no formatting.
//   - This file has no DIRECT import of `@/lib/assignment-due-rule` or of
//     the wave-2 plan module (`current-events-assignment-plan.ts`), and the
//     D4 guard test (current-events-assignments.test.ts) scans this file's
//     own source text for exactly that. Note this is narrower than "neither
//     module ever appears in the dependency graph": this file DOES import
//     `@/lib/current-events-assignment` (for CURRENT_EVENTS_RECENCY_WINDOW
//     etc.), which itself imports `assignment-due-rule.ts` for its
//     `WEEKDAYS`/`WEEKDAY_LABELS` label arrays - so that module is reachable
//     transitively, and the guard test would not see a future direct import
//     of it landing in a file it does not scan. What actually makes this
//     file incapable of computing a deadline is that it never imports the
//     rule-PARSING functions (`parseAssignmentDueRule`, `dueDateForWeek`)
//     from anywhere, direct or transitive, and the next bullet below.
//   - CurrentEventsGenerationRequest carries no date field, so the
//     generation action is never even told which week a module is - it
//     cannot compute what it is never told.
//   - `.toISOString(` appears nowhere below.
// Why this matters and is not theatre: `dueDateForWeek` builds a local
// wall-clock Date, `.toISOString()` encodes the CALLING PROCESS's offset,
// Vercel runs UTC, and `createGradable` (gradables.ts, W1) appends
// `assignment[due_at]` VERBATIM with no server-side re-normalisation. A
// server-computed instant would reach Canvas as 23:59Z - hours early for
// every instructor in the Americas - and nothing in tsc, eslint, vitest, or
// `next build` can see that class of bug. It shipped once already
// (docs/REGRESSION.md entry 328). The computation lives in the browser
// instead, in a client-only pure module Wave 2 owns.

import { requireOwner } from "@/lib/supabase/auth";
import { resolveGenerationCourseRow } from "./lms-generation-course-row";
import { resolveCourseKind } from "@/lib/course-kind";
import type { LlmProvider } from "@/lib/llm";
import {
  generateCurrentEventsAssignmentForModule,
  type CurrentEventsAssignmentContext,
} from "./current-events-assignment-generator";
import {
  moduleTopicFromName,
  CURRENT_EVENTS_RECENCY_WINDOW,
  CURRENT_EVENTS_LENGTH_TARGET,
} from "@/lib/current-events-assignment";

/**
 * The two raw course columns a deadline computation needs, and nothing more.
 * See the file-level comment above - this is deliberately NOT a computed
 * deadline, just the two strings the browser-side plan module
 * (current-events-assignment-plan.ts, Wave 2) needs to do that computation
 * itself.
 */
export interface CourseDeadlineContext {
  startDate: string | null;
  assignmentDueRule: string | null;
}

/**
 * Resolve the calling course to its saved row (source-aware: an
 * export-sourced selection passes `exportCourseId` exactly as
 * resolveGenerationCourseRow's own doc comment describes; a live selection
 * passes none and resolves by Canvas URL) and hand back only the two raw
 * columns a deadline computation needs.
 *
 * D9 / W2: this can fail for THREE distinct reasons, and only the first one
 * is an `{ error }` from this action - the other two are legitimate, non-error
 * states the caller must be able to tell apart:
 *   1. `no-course-row` - the course itself cannot be resolved (not linked, or
 *      resolveGenerationCourseRow's Supabase read failed). Returned here as
 *      `{ error }`, DISTINCT in shape from the two cases below.
 *   2. `no-course-start-date` - the course resolved fine but `startDate` is
 *      null. Returned here as `{ startDate: null, assignmentDueRule }` - a
 *      normal success shape, not an error.
 *   3. `no-week-number` - the MODULE's name carries no week number. This
 *      action has no module in scope at all, so it cannot see this case;
 *      Wave 2's plan module distinguishes it entirely from the module data
 *      already in hand client-side.
 * Collapsing (1) and (2) into one shape would send an instructor whose course
 * merely lacks a start date to the "go relink this course" message instead of
 * the "set a start date" message - the exact collapsed-error defect this
 * loop's step 8 exists to catch (docs/DEV_LOOP.md).
 */
export async function readCourseDeadlineContextAction(
  courseUrl: string,
  exportCourseId?: string,
  acronym?: string
): Promise<CourseDeadlineContext | { error: string }> {
  try {
    await requireOwner();
    const resolved = await resolveGenerationCourseRow(courseUrl, exportCourseId, acronym);
    if ("error" in resolved) return { error: resolved.error };
    return {
      startDate: resolved.course.startDate,
      assignmentDueRule: resolved.course.assignmentDueRule,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the course's deadline settings." };
  }
}

/**
 * One checkmarked module's generation request. Deliberately carries no date,
 * week number, or anything derived from either (D4's guard 1) - the module's
 * own name and its already-displayed item titles (AC12: "already in hand
 * client-side from the displayed tree - no extra Canvas call"), nothing else.
 */
export interface CurrentEventsGenerationRequest {
  moduleId: number;
  moduleName: string;
  itemTitles: string[];
}

/**
 * Per-module outcome of the fan-out below. `status: "failed"` covers BOTH a
 * rejected model call and a model call that resolved to `{ error }` (AC15:
 * "The model returned nothing for Module 3" is a real, reportable reason
 * either way) - callers must not have to branch on which of those two
 * happened, only on whether generation for THIS module succeeded, with its
 * OWN reason attached when it did not.
 */
export type CurrentEventsGenerationOutcome =
  | { moduleId: number; status: "ok"; body: string }
  | { moduleId: number; status: "failed"; reason: string };

/**
 * D3: one LLM call PER MODULE, fanned out with Promise.allSettled - never one
 * call returning N prompts. `requireOwner()` and the course-row resolve each
 * run exactly ONCE regardless of how many requests are supplied; only the
 * per-module generation calls are fanned out. `courseKind` is resolved once
 * from the course row and passed identically to every call, exactly like
 * `courseUrl`/`provider` are the same input to every fan-out iteration in
 * researchCurrentEventsAction (current-events.ts:409-427), which this fan-out
 * shape is copied from.
 *
 * This action never throws. A whole-run failure (the course cannot be
 * resolved at all) is the top-level `{ error }` return, in a shape distinct
 * from `{ outcomes: [...] }` so a caller can tell "nothing ran" from "some
 * modules ran and some failed" without inspecting the outcomes array first.
 * A single module's generation failure - rejected promise or a returned
 * `{ error }` - never aborts its siblings (AC15) and is reported with its own
 * `reason`, never a shared or collapsed one.
 */
export async function generateCurrentEventsAssignmentsAction(
  courseUrl: string,
  requests: CurrentEventsGenerationRequest[],
  provider: LlmProvider = "gemini",
  exportCourseId?: string,
  acronym?: string
): Promise<{ outcomes: CurrentEventsGenerationOutcome[] } | { error: string }> {
  try {
    await requireOwner();

    if (requests.length === 0) return { outcomes: [] };

    const resolved = await resolveGenerationCourseRow(courseUrl, exportCourseId, acronym);
    if ("error" in resolved) return { error: resolved.error };

    const course = resolved.course;
    const courseKind = resolveCourseKind(course.courseKind);

    const settled = await Promise.allSettled(
      requests.map((request) => {
        const context: CurrentEventsAssignmentContext = {
          courseName: course.name,
          courseCode: course.courseCode,
          description: course.description,
          topicOutline: course.topicOutline,
          institution: course.institution,
          moduleName: request.moduleName,
          moduleTopic: moduleTopicFromName(request.moduleName),
          itemTitles: request.itemTitles,
          recencyWindow: CURRENT_EVENTS_RECENCY_WINDOW,
          lengthTarget: CURRENT_EVENTS_LENGTH_TARGET,
        };
        return generateCurrentEventsAssignmentForModule(context, provider, courseKind);
      })
    );

    const outcomes: CurrentEventsGenerationOutcome[] = settled.map((outcome, index) => {
      const moduleId = requests[index].moduleId;
      if (outcome.status === "rejected") {
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        return { moduleId, status: "failed", reason };
      }
      if ("error" in outcome.value) {
        return { moduleId, status: "failed", reason: outcome.value.error };
      }
      return { moduleId, status: "ok", body: outcome.value.body };
    });

    return { outcomes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the current events assignments." };
  }
}
