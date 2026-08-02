// Client-side step catalog: weekly announcements generated from each week's
// ACTUAL module materials (objectives, deck, opener, assignment), one per
// week in the schedule - added ONCE to COURSE_REFRESH (reaching COURSE_
// KICKOFF and NO_CODE_KICKOFF via include-workflow), placed AFTER every step
// that creates module content so there is real material to ground each
// announcement in (see the placement comment on the preset wiring).
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
  draftAnnouncementAction,
  createScheduledAnnouncementAction,
} from "@/app/actions";
import { type StepDefinition, isGeneratorSelected } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText } from "@/lib/docx";
import { stripModelUrls } from "@/lib/urls";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Exported (along with gatherWeekMaterials below) so steps.weekly-
// announcements.test.ts can verify the release-date math and the
// materials-gathering logic directly, without mocking the whole step.
/** The Monday-of-week-N-style release moment: the tile's start date plus
 * (week-1) weeks, at a fixed 8am local so a whole term schedules in one
 * consistent daypart rather than inheriting the start date's own time of
 * day (which is often midnight from a date-only field). */
export function weekStartDate(start: Date, week: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + (week - 1) * 7);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** This week's real module materials from the run's own files chain - the
 * objectives, opener, and assignment instructions already carry their source
 * text as `pageText` (see GeneratedCourseFile); slides do not (they are
 * binary decks), so the deck is represented by its title only. Returns ""
 * when nothing was found for this week, which the caller treats as "cannot
 * ground this week - skip it" rather than falling back to the bare topic
 * (Q3-AC1: grounding in real content is the whole point of this step). */
// U7-AC1 (run 2f4aea3c): the FIRST 429 the run hit was a hard spend-cap
// refusal ("Your project has exceeded its monthly spending cap.") - that
// cannot recover inside a run, no matter how long it waits, yet the step
// went on to attempt all 15 remaining weeks anyway (each one doomed to fail
// identically), burning 2m44s on calls that could never succeed. A plain
// rate-limit 429 ("too many requests right now") is different: it IS
// transient, callLlm/callGemini (src/lib/llm.ts) already backs off and
// retries it internally, and the step is right to just move on to the next
// week if that retry still comes back failed. The two are told apart by the
// vendor's own wording: a spend-cap/quota refusal names the cap or billing
// explicitly, never the generic "too many requests"/"resource exhausted,
// check quota" phrasing a transient 429 uses. Exported for
// steps.weekly-announcements.test.ts (U7-AC1/AC3).
export function isNonTransientQuotaRefusal(errorMessage: string): boolean {
  if (typeof errorMessage !== "string" || !/HTTP 429/i.test(errorMessage)) return false;
  return /spending cap|billing (?:quota|limit|cap)|exceeded (?:its|your) (?:monthly|daily) (?:quota|budget|limit|spending)/i.test(
    errorMessage
  );
}

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

export const weeklyAnnouncementSteps: StepDefinition[] = [
  {
    type: "generate-weekly-announcements",
    name: "Generate weekly announcements",
    description:
      "Compose a start-of-week announcement for every week in the schedule, grounded in that week's ACTUAL generated module materials (objectives, deck, opener, assignment) rather than just the schedule topic. Each ships as a Word document in that week's zip folder, and optionally as an LMS announcement scheduled for that week's start.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "The tile's start date drives each week's scheduled release; its LMS course is where announcements post.",
      },
      { key: "schedule", label: "Course schedule", type: "schedule", required: true },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "The run's per-week materials (objectives, deck, opener, assignment) - each week's announcement is grounded in these, not just the topic.",
      },
      {
        key: "startDate",
        label: "Class start date",
        type: "date",
        required: false,
        help: "Overrides the course tile's start date for scheduling.",
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Folded into every week's announcement (e.g. campus events, policy reminders).",
      },
      {
        key: "postToLms",
        label: "Post announcements to the LMS",
        type: "boolean",
        required: false,
        help: "Off by default - posting a whole term's announcements to a live course is outward-facing. When on, each is scheduled for its week's start via a future release date; a week whose release date has already passed is never posted.",
      },
      {
        key: "selected",
        label: "Generate this run",
        type: "boolean",
        required: false,
        help: "From COURSE_BUILD's output selection (steps.course-build-scope.ts). Blank/unbound = generate (unchanged default) - every OTHER preset that uses this step leaves it unbound.",
      },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "announcementCount", label: "Announcements generated", type: "number" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const incoming = (values.files as GeneratedCourseFile[] | undefined) ?? [];

      if (schedule.length === 0) {
        return {
          outputs: { files: incoming, announcementCount: 0, report: "No schedule provided." },
          summary: { kind: "text", text: "Skipped - no schedule was provided." },
        };
      }

      // AC1 (COURSE_BUILD's output selector): deselected means "do no work,
      // pass files through unchanged" - never a runIf gate (this step stays
      // in the chain either way, so blackboard-export/save-zip-to-course
      // downstream never skip). isGeneratorSelected treats an unbound value
      // as "generate" (registry-helpers.ts), matching every OTHER preset
      // that uses this step and never binds "selected" at all.
      if (!isGeneratorSelected(values.selected)) {
        return {
          outputs: { files: incoming, announcementCount: 0, report: "Skipped - not selected in this run's output selection." },
          summary: { kind: "text", text: "Skipped - announcements were not selected in this run's output selection." },
        };
      }

      const extraNotes = String(values.extraNotes ?? "").trim();
      const postToLms = String(values.postToLms ?? "") === "1";

      const hubCourseId = String(values.hubCourse ?? "").trim();
      let tile: Course | undefined;
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) tile = list.courses.find((c) => c.id === hubCourseId);
      }

      const startRaw = String(values.startDate ?? "").trim() || (tile?.startDate ?? "").trim();
      const parsedStartDate = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
      // RCA19 (RCA round 4): an invalid start date used to throw, which -
      // like steps.course-guides.ts's bare throws - cascades to every
      // dependent step bound to this step's `files` output (server-runner.ts
      // cascades a thrown step failure via `failedSteps`). This is a
      // recoverable condition: degrade to exactly the same state as "no
      // start date was given" (LMS scheduling is skipped, noted below and per
      // week), and still compose every week's announcement - a malformed
      // date should never cost the instructor the whole run.
      const startDateInvalid = parsedStartDate !== null && Number.isNaN(parsedStartDate.getTime());
      const startDate = startDateInvalid ? null : parsedStartDate;

      const courseUrl = (tile?.canvasUrl ?? "").trim();
      const acronym = tile?.institution || helpers.activeInstitution || undefined;

      const files: GeneratedCourseFile[] = [];
      const reportLines: string[] = [];
      if (startDateInvalid) {
        reportLines.push(
          `Class start date ("${startRaw}") is not a valid date - LMS scheduling is skipped this run; announcements still generate.`
        );
      }

      onProgress("Composing weekly announcements from each week's module materials...");

      // U7-AC1/AC2: incremented for every week that did NOT get an
      // announcement because something actually went wrong (an LLM error, a
      // quota refusal, or a thrown exception) - never for a week skipped
      // because it had no generated materials to ground in (that is an
      // expected data-availability gap, not a failure). Feeds the
      // partial-failure signal below so a step that degrades gracefully
      // (RCA19 - it still returns normally, dependents still get its `files`
      // output) is not indistinguishable, at the run log level, from a step
      // where every week actually succeeded.
      let failedWeekCount = 0;
      let quotaStoppedAtWeek: number | null = null;

      for (let scheduleIndex = 0; scheduleIndex < schedule.length; scheduleIndex++) {
        const week = schedule[scheduleIndex];
        const weekNumber = week.week;
        const topic = (week.topic ?? "").trim();

        const materials = gatherWeekMaterials(incoming, weekNumber);
        if (!materials.trim()) {
          reportLines.push(`Week ${weekNumber}: skipped - no generated module materials found for this week.`);
          continue;
        }

        try {
          const instruction = [
            `Write a warm, professional start-of-week course announcement for Week ${weekNumber}${topic ? `: ${topic}` : ""}.`,
            "Organize it into clear sections: what students will learn this week, what they will be doing this week, any upcoming deadlines, and anything else to be aware of.",
            `Base it on these actual module materials for this week - do not just restate the topic:\n${materials}`,
            extraNotes ? `Also incorporate these notes (deadlines / things to be aware of):\n${extraNotes}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");

          onProgress(`Composing the Week ${weekNumber} announcement...`);
          const drafted = await draftAnnouncementAction(instruction, helpers.provider);
          if ("error" in drafted) {
            // U7-AC1: a spend-cap/quota refusal cannot recover inside this
            // run - every remaining week is doomed to fail identically, so
            // stop issuing further calls instead of working through the rest
            // of the schedule one doomed call at a time (the reported
            // defect: 15 further calls over 2m44s after the first refusal).
            // A transient rate-limit 429 is NOT this - it already got its
            // own backoff/retry inside callLlm (src/lib/llm.ts), and the
            // step is right to just move on to the next week below.
            if (isNonTransientQuotaRefusal(drafted.error)) {
              const notAttempted = schedule.length - scheduleIndex - 1;
              quotaStoppedAtWeek = weekNumber;
              failedWeekCount += 1 + notAttempted;
              reportLines.push(
                `Stopped after week ${weekNumber} - the LLM quota was exhausted; ${notAttempted} week(s) not attempted.`
              );
              break;
            }
            failedWeekCount += 1;
            reportLines.push(`Week ${weekNumber}: error - ${drafted.error}`);
            continue;
          }

          const title = stripModelUrls(drafted.title).trim() || `Week ${weekNumber}${topic ? `: ${topic}` : ""}`;
          const body = stripModelUrls(drafted.message).trim();
          const pageText = `# ${title}\n\n${body}`;

          const docxBuffer = await buildDocxFromPlainText(pageText, [], helpers.author);
          const fileName = topic ? `Week ${weekNumber} Announcement - ${topic}.docx` : `Week ${weekNumber} Announcement.docx`;

          files.push({
            name: fileName,
            blob: new Blob([docxBuffer], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber,
            sortOrder: 6,
            role: "supplement",
            pageText,
          });

          let postNote = "not posted - posting is turned off.";
          if (postToLms) {
            if (!courseUrl) {
              postNote = "not posted - no LMS course on the tile.";
            } else if (!startDate) {
              postNote = startDateInvalid
                ? `not posted - the class start date ("${startRaw}") is not a valid date.`
                : "not posted - no class start date to schedule from.";
            } else {
              const releaseDate = weekStartDate(startDate, weekNumber);
              if (releaseDate.getTime() <= Date.now()) {
                postNote = `not posted - week ${weekNumber}'s release date (${releaseDate.toLocaleDateString()}) is in the past.`;
              } else {
                try {
                  const posted = await createScheduledAnnouncementAction(
                    courseUrl,
                    title,
                    body,
                    releaseDate.toISOString(),
                    acronym
                  );
                  postNote = "error" in posted
                    ? `LMS error - ${posted.error}`
                    : `scheduled for ${releaseDate.toLocaleString()}`;
                } catch (err) {
                  postNote = `LMS error - ${err instanceof Error ? err.message : "unknown error"}`;
                }
              }
            }
          }

          reportLines.push(`Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated - ${postNote}`);
        } catch (err) {
          failedWeekCount += 1;
          reportLines.push(`Week ${weekNumber}: error - ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      const report = reportLines.join("\n");

      // U7-AC2: set only when at least one week did NOT get an announcement
      // because of a genuine failure (never for a "no materials" skip) - see
      // PARTIAL_FAILURE_OUTPUT_KEY's own doc comment (run-logging.ts) for why
      // this is a plain outputs-bag key rather than a new field on a shared
      // type, and buildRunLogText's isPartialFailureStep for how it renders.
      const partialFailureDetail =
        failedWeekCount > 0
          ? quotaStoppedAtWeek !== null
            ? `The LLM quota was exhausted after week ${quotaStoppedAtWeek}; ${failedWeekCount} of ${schedule.length} week(s) did not get an announcement.`
            : `${failedWeekCount} of ${schedule.length} week(s) failed to generate an announcement - see this step's own report for detail.`
          : null;

      if (files.length === 0) {
        return {
          outputs: {
            files: incoming,
            announcementCount: 0,
            report,
            ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
          },
          summary: { kind: "text", text: report || "No weekly announcements were generated." },
        };
      }

      return {
        outputs: {
          files: [...incoming, ...files],
          announcementCount: files.length,
          report,
          ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
        },
        summary: {
          kind: "list",
          label: `Generated ${files.length} weekly announcement(s)`,
          items: reportLines,
        },
      };
    },
  },
];
