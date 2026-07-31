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
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText } from "@/lib/docx";
import { stripModelUrls } from "@/lib/urls";

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

      for (const week of schedule) {
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
          reportLines.push(`Week ${weekNumber}: error - ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      const report = reportLines.join("\n");

      if (files.length === 0) {
        return {
          outputs: { files: incoming, announcementCount: 0, report },
          summary: { kind: "text", text: report || "No weekly announcements were generated." },
        };
      }

      return {
        outputs: { files: [...incoming, ...files], announcementCount: files.length, report },
        summary: {
          kind: "list",
          label: `Generated ${files.length} weekly announcement(s)`,
          items: reportLines,
        },
      };
    },
  },
];
