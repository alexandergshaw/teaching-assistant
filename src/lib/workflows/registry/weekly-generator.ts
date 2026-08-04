// Shared orchestration for the six PER-WEEK generator steps (announcements,
// anticipated Q&A, current events, Significance of the Material, knowledge
// checks, instructor notes) - CHUNK C of the Course Build cleanup.
//
// Before this module existed, each of those six steps re-implemented the
// SAME skeleton: the isGeneratorSelected guard and its skip return,
// schedule/`incoming` coercion, the empty-schedule return, the course-tile
// lookup (listCourseHubAction + find), the per-week loop, the non-transient-
// quota short-circuit, `reportLines` accumulation, the partial-failure
// ternary, and both terminal return shapes. Of the six files' combined 1,188
// `run`-body lines, ~600 were duplicates of each other; 46 distinct lines
// appeared in ALL SIX. runWeeklyGenerator owns exactly that shared skeleton;
// each step supplies only what genuinely differs via a WeeklyGeneratorConfig
// - grounding, the generate call, optional post-generation validation,
// rendering, optional LMS publish, plus a handful of per-step labels/keys
// (selectedKey, countOutputKey, sortOrder, itemLabel(Plural), the various
// report-text templates).
//
// THE LIVE BUG THIS FIXES BY CONSTRUCTION: generate-weekly-current-events
// used to import only gatherWeekMaterials from this module's predecessor
// (steps.weekly-announcements.ts), never isNonTransientQuotaRefusal, and
// declared its own `failedWeekCount` with no `quotaStoppedAtWeek` - so a hard
// spend-cap 429 on week 1 still burned every remaining week on doomed calls
// identical to the first. The short-circuit now lives here, once, so all six
// steps inherit it - there is no longer a sixth copy to have missed the fix.
//
// CLIENT-REACHABLE: attended workflow steps run in the browser (see
// registry-helpers.ts's own header comment). This module must not import,
// even transitively, @/lib/supabase/server, @/app/actions/shared, or
// next/headers - only `next build` catches a violation (tsc/eslint/vitest
// all stay green), so this constraint is easy to break silently. Importing
// @/app/actions (the "use server" barrel) is fine.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
} from "@/app/actions";
import {
  isGeneratorSelected,
  type StepRunHelpers,
  type StepRunResult,
} from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText } from "@/lib/docx";
import { resolveCourseKind, type CourseKind } from "@/lib/course-kind";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

// Declared once for the whole directory's six weekly generators (it used to
// be declared ten separate times across this directory - four of those live
// in OTHER step files outside this consolidation's scope and are unaffected;
// this is the one declaration the six weekly generators now share).
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The Monday-of-week-N-style release moment: the tile's start date plus
 * (week-1) weeks, at a fixed 8am local so a whole term schedules in one
 * consistent daypart rather than inheriting the start date's own time of day
 * (which is often midnight from a date-only field). Only generate-weekly-
 * announcements uses this today (the one step whose LMS side effect is a
 * scheduled release rather than an immediate page/quiz), but it is pure and
 * lives here alongside its sibling grounding/quota helpers. */
export function weekStartDate(start: Date, week: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + (week - 1) * 7);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Whether an LLM action's `error` message is a NON-transient quota/billing
 * refusal (a hard spend-cap, never a plain rate-limit) - the vendor's own
 * wording tells the two apart: a spend-cap/quota refusal names the cap or
 * billing explicitly, never the generic "too many requests"/"resource
 * exhausted, check quota" phrasing a transient 429 uses (which callLlm/
 * callGemini, src/lib/llm.ts, already backs off and retries internally). A
 * non-transient refusal cannot recover inside a run - every remaining week is
 * doomed to fail identically - so the per-week loop below stops issuing
 * further calls instead of working through the rest of the schedule one
 * doomed call at a time. A transient 429 is NOT this; the loop is right to
 * just move on to the next week for one of those. */
export function isNonTransientQuotaRefusal(errorMessage: string): boolean {
  if (typeof errorMessage !== "string" || !/HTTP 429/i.test(errorMessage)) return false;
  return /spending cap|billing (?:quota|limit|cap)|exceeded (?:its|your) (?:monthly|daily) (?:quota|budget|limit|spending)/i.test(
    errorMessage
  );
}

/** This week's real module materials from the run's own files chain - the
 * objectives, opener, and assignment instructions already carry their source
 * text as `pageText` (see GeneratedCourseFile); slides do not (they are
 * binary decks), so the deck is represented by its title only. Returns ""
 * when nothing was found for this week, which every caller treats as "cannot
 * ground this week - skip it" rather than falling back to the bare topic. */
export function gatherWeekMaterials(files: GeneratedCourseFile[], week: number): string {
  const objectives = files.find((f) => f.weekNumber === week && f.role === "objectives");
  const slides = files.find((f) => f.weekNumber === week && f.role === "slides");
  const instructions = files.find((f) => f.weekNumber === week && f.role === "instructions");
  const opener = files.find((f) => f.weekNumber === week && f.role === "opener");

  const parts: string[] = [];
  if (objectives?.pageText?.trim()) parts.push(`This week's module objectives:\n${objectives.pageText.trim()}`);
  if (slides) parts.push(`This week's lecture deck: "${slides.name}".`);
  if (instructions?.pageText?.trim()) parts.push(`This week's assignment:\n${instructions.pageText.trim()}`);
  if (opener?.pageText?.trim()) parts.push(`This week's class opener / warm-up:\n${opener.pageText.trim()}`);
  return parts.join("\n\n");
}

export type GroundOutcome<TGrounding> = { ok: true; value: TGrounding } | { ok: false; message: string };

/** The shared "skip this week - no generated module materials" gate used by
 * four of the six weekly generators (announcements, Q&A, current events,
 * knowledge checks) as their WHOLE grounding check, and by instructor notes
 * as the FIRST of its two gates (see steps.instructor-notes.ts's own `ground`
 * for the second). generate-weekly-significance grounds in the week's
 * already-assigned case study instead and does not use this. */
export function groundInWeekMaterials(incoming: GeneratedCourseFile[], weekNumber: number): GroundOutcome<string> {
  const materials = gatherWeekMaterials(incoming, weekNumber);
  if (!materials.trim()) {
    return { ok: false, message: `Week ${weekNumber}: skipped - no generated module materials found for this week.` };
  }
  return { ok: true, value: materials };
}

export type ValidateOutcome<TValidated> =
  | { ok: true; value: TValidated }
  | { ok: false; asFailure: boolean; message: string };

export interface WeeklyGeneratorSetupResult<TSetup> {
  value: TSetup;
  /** Report lines to push BEFORE the per-week loop starts (today, only
   * generate-weekly-announcements uses this - an invalid start date is noted
   * once up front, not per week). */
  preLoopReportLines?: string[];
}

export interface WeeklyGeneratorRenderResult {
  /** The text the docx is actually built from. USUALLY identical to
   * `pageText` below, but generate-weekly-qa and generate-weekly-current-
   * events each store a DIFFERENT, reflowed text as `pageText` than what
   * their docx renders from (verified against both steps' own pre-
   * consolidation code - not a bug introduced by this consolidation). */
  docxSourceText: string;
  pageText: string;
  fileName: string;
}

export interface WeeklyGeneratorWeekArgs<TSetup, TGrounding, TValidated> {
  value: TValidated;
  grounding: TGrounding;
  week: ScheduleWeekPlan;
  weekNumber: number;
  topic: string;
  tile: Course | undefined;
  setup: TSetup;
  courseUrl: string;
  acronym: string | undefined;
  postToLms: boolean;
  modules: EnsuredModule[];
  courseKind: CourseKind;
}

export interface WeeklyGeneratorConfig<TSetup, TGrounding, TGenerated extends object, TValidated = TGenerated> {
  /** The `values` key isGeneratorSelected reads - "selected" for all six
   * built-in generators today; configurable per C1's own AC. */
  selectedKey: string;
  /** The step's own outputs-bag key for its generated count - NOT uniform
   * across the six (announcementCount/checkCount/count) and presets bind
   * these exact names; never unify them. */
  countOutputKey: string;
  sortOrder: number;
  /** Used in both partial-failure sentence templates, e.g. "an announcement"
   * / "instructor notes" (no article for that one - see each config). */
  itemLabel: string;
  /** Used in "Generated N <itemLabelPlural>(s)", e.g. "weekly announcement". */
  itemLabelPlural: string;
  notSelectedSummaryText: string;
  noneGeneratedText: string;
  startProgressText: string;
  weekProgressText: (weekNumber: number) => string;
  /** Per-step values derived once, before the loop, from `values`/`tile` -
   * e.g. announcements' extraNotes/startDate parsing, current-events'
   * recency window, qa's courseName, instructor-notes' committed toolset.
   * Omit when a step needs nothing beyond what the runner already computes
   * (courseUrl/acronym/postToLms/modules/courseKind). */
  setup?: (values: Record<string, unknown>, tile: Course | undefined) => WeeklyGeneratorSetupResult<TSetup>;
  /** Decide this week's grounding value, or a skip reason - runs BEFORE any
   * LLM call, outside the per-week try/catch (matching every pre-
   * consolidation step, where the same "no materials"/"no case study" check
   * sat before its own try block). */
  ground: (
    incoming: GeneratedCourseFile[],
    weekNumber: number,
    ctx: { tile: Course | undefined; setup: TSetup }
  ) => GroundOutcome<TGrounding>;
  /** The actual generate call. Returns the raw action result - the runner
   * applies the shared non-transient-quota short-circuit to its `error`
   * branch so every step inherits it identically. */
  generate: (
    grounding: TGrounding,
    week: ScheduleWeekPlan,
    ctx: { tile: Course | undefined; setup: TSetup; helpers: StepRunHelpers; courseKind: CourseKind }
  ) => Promise<{ error: string } | TGenerated>;
  /** Optional post-generation validation/cleanup - e.g. qa's "the model
   * returned no questions" skip (not counted as a failure), knowledge-
   * checks' stripModelUrls re-validation against MIN_USABLE_QUESTIONS_PER_
   * WEEK (counted as a failure). Omitted steps pass `generated` through
   * unchanged. */
  validate?: (generated: TGenerated, weekNumber: number) => ValidateOutcome<TValidated>;
  /** Pure: builds this week's document text and file name. No I/O - the LMS
   * side effect (if any) is `publish`'s job below, and the runner builds the
   * docx buffer and pushes this week's file BETWEEN `render` and `publish`,
   * matching every pre-consolidation step's own ordering (build the
   * document, THEN attempt to post it) exactly, so a docx-build failure
   * never leaves a stray LMS side effect behind for a week the step still
   * reports as failed. */
  render: (args: WeeklyGeneratorWeekArgs<TSetup, TGrounding, TValidated>) => WeeklyGeneratorRenderResult;
  /** Builds this week's final report line, performing the LMS side effect
   * (if any) first. The differing KIND of side effect - announcements
   * SCHEDULES a release, knowledge-checks creates a gradable quiz plus
   * per-question items plus a bulk publish, current-events/significance
   * create PUBLISHED pages, instructor-notes creates a page ALWAYS
   * unpublished, qa makes no LMS call at all - lives entirely here. */
  publish: (
    rendered: WeeklyGeneratorRenderResult,
    args: WeeklyGeneratorWeekArgs<TSetup, TGrounding, TValidated>
  ) => Promise<string>;
}

/**
 * Runs one of the six weekly per-module generator steps against this run's
 * `values`/`helpers`, per `config`. See this module's own header comment for
 * exactly what is shared here versus what each step's config supplies.
 */
export async function runWeeklyGenerator<TSetup, TGrounding, TGenerated extends object, TValidated = TGenerated>(
  config: WeeklyGeneratorConfig<TSetup, TGrounding, TGenerated, TValidated>,
  values: Record<string, unknown>,
  helpers: StepRunHelpers,
  onProgress: (text: string) => void
): Promise<StepRunResult> {
  const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
  const incoming = (values.files as GeneratedCourseFile[] | undefined) ?? [];

  if (schedule.length === 0) {
    return {
      outputs: { files: incoming, [config.countOutputKey]: 0, report: "No schedule provided." },
      summary: { kind: "text", text: "Skipped - no schedule was provided." },
    };
  }

  // Deselected means "do no work, pass files through unchanged" - never a
  // runIf gate (these steps stay in the chain either way, so downstream
  // chain consumers never skip). isGeneratorSelected treats an unbound value
  // as "generate", matching every built-in preset that never binds
  // `selected` at all.
  if (!isGeneratorSelected(values[config.selectedKey])) {
    return {
      outputs: { files: incoming, [config.countOutputKey]: 0, report: "Skipped - not selected in this run's output selection." },
      summary: { kind: "text", text: config.notSelectedSummaryText },
    };
  }

  const hubCourseId = String(values.hubCourse ?? "").trim();
  let tile: Course | undefined;
  if (hubCourseId) {
    const list = await listCourseHubAction();
    if (!("error" in list)) tile = list.courses.find((c) => c.id === hubCourseId);
  }

  const courseUrl = (tile?.canvasUrl ?? "").trim();
  const acronym = tile?.institution || helpers.activeInstitution || undefined;
  // Read the same "" != "1" way by every step that has a postToLms input;
  // harmless to compute for the one step (qa) that has no LMS call at all.
  const postToLms = String(values.postToLms ?? "") === "1";
  const modules = Array.isArray(values.modules) ? (values.modules as EnsuredModule[]) : [];
  const courseKind = resolveCourseKind(values.courseKind);

  const setupResult: WeeklyGeneratorSetupResult<TSetup> = config.setup
    ? config.setup(values, tile)
    : { value: undefined as TSetup };
  const setup = setupResult.value;

  const files: GeneratedCourseFile[] = [];
  const reportLines: string[] = [...(setupResult.preLoopReportLines ?? [])];

  onProgress(config.startProgressText);

  // Incremented only for a week that did NOT get a document because
  // something actually went wrong (an LLM error, a quota refusal, a failed
  // post-generation validation, or a thrown exception) - never for a week
  // skipped because it had no grounding to work from (an expected data-
  // availability gap, not a failure).
  let failedWeekCount = 0;
  let quotaStoppedAtWeek: number | null = null;

  for (let scheduleIndex = 0; scheduleIndex < schedule.length; scheduleIndex++) {
    const week = schedule[scheduleIndex];
    const weekNumber = week.week;
    const topic = (week.topic ?? "").trim();

    const grounded = config.ground(incoming, weekNumber, { tile, setup });
    if (!grounded.ok) {
      reportLines.push(grounded.message);
      continue;
    }

    try {
      onProgress(config.weekProgressText(weekNumber));
      const generated = await config.generate(grounded.value, week, { tile, setup, helpers, courseKind });

      if ("error" in generated) {
        // THE non-transient-quota short-circuit: every step inherits it
        // identically now, including generate-weekly-current-events (the
        // step that used to omit it - see this module's own header comment).
        if (isNonTransientQuotaRefusal(generated.error)) {
          const notAttempted = schedule.length - scheduleIndex - 1;
          quotaStoppedAtWeek = weekNumber;
          failedWeekCount += 1 + notAttempted;
          reportLines.push(
            `Stopped after week ${weekNumber} - the LLM quota was exhausted; ${notAttempted} week(s) not attempted.`
          );
          break;
        }
        failedWeekCount += 1;
        reportLines.push(`Week ${weekNumber}: error - ${generated.error}`);
        continue;
      }

      const validated: ValidateOutcome<TValidated> = config.validate
        ? config.validate(generated, weekNumber)
        : { ok: true, value: generated as unknown as TValidated };
      if (!validated.ok) {
        if (validated.asFailure) failedWeekCount += 1;
        reportLines.push(validated.message);
        continue;
      }

      const weekArgs: WeeklyGeneratorWeekArgs<TSetup, TGrounding, TValidated> = {
        value: validated.value,
        grounding: grounded.value,
        week,
        weekNumber,
        topic,
        tile,
        setup,
        courseUrl,
        acronym,
        postToLms,
        modules,
        courseKind,
      };

      const rendered = config.render(weekArgs);
      const docxBuffer = await buildDocxFromPlainText(rendered.docxSourceText, [], helpers.author);
      files.push({
        name: rendered.fileName,
        blob: new Blob([docxBuffer], { type: DOCX_MIME }),
        mimeType: DOCX_MIME,
        weekNumber,
        sortOrder: config.sortOrder,
        role: "supplement",
        pageText: rendered.pageText,
      });

      const reportLine = await config.publish(rendered, weekArgs);
      reportLines.push(reportLine);
    } catch (err) {
      failedWeekCount += 1;
      reportLines.push(`Week ${weekNumber}: error - ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  const report = reportLines.join("\n");

  const partialFailureDetail =
    failedWeekCount > 0
      ? quotaStoppedAtWeek !== null
        ? `The LLM quota was exhausted after week ${quotaStoppedAtWeek}; ${failedWeekCount} of ${schedule.length} week(s) did not get ${config.itemLabel}.`
        : `${failedWeekCount} of ${schedule.length} week(s) failed to generate ${config.itemLabel} - see this step's own report for detail.`
      : null;

  if (files.length === 0) {
    return {
      outputs: {
        files: incoming,
        [config.countOutputKey]: 0,
        report,
        ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
      },
      summary: { kind: "text", text: report || config.noneGeneratedText },
    };
  }

  return {
    outputs: {
      files: [...incoming, ...files],
      [config.countOutputKey]: files.length,
      report,
      ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
    },
    summary: {
      kind: "list",
      label: `Generated ${files.length} ${config.itemLabelPlural}(s)`,
      items: reportLines,
    },
  };
}
