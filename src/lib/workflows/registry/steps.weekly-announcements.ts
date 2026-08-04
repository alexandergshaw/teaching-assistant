// Client-side step catalog: weekly announcements generated from each week's
// ACTUAL module materials (objectives, deck, opener, assignment), one per
// week in the schedule - added ONCE to COURSE_REFRESH (reaching COURSE_
// KICKOFF and NO_CODE_KICKOFF via include-workflow), placed AFTER every step
// that creates module content so there is real material to ground each
// announcement in (see the placement comment on the preset wiring).
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
//
// CHUNK C: the per-week orchestration (the isGeneratorSelected guard, the
// course-tile lookup, the per-week loop, the non-transient-quota short-
// circuit, partial-failure accounting, both terminal return shapes) now
// lives once in weekly-generator.ts's runWeeklyGenerator, shared with the
// other five weekly per-module generators (Q&A, current events, Significance
// of the Material, knowledge checks, instructor notes) - see that module's
// own header comment for the full accounting of what was duplicated. This
// file supplies only what is genuinely unique to announcements: the release-
// date scheduling math (weekStartDate) and its own kind of LMS side effect
// (it SCHEDULES a release; it never creates a page).
//
// weekStartDate/gatherWeekMaterials/isNonTransientQuotaRefusal are re-
// exported here (their real implementation now lives in weekly-generator.ts)
// so this file's own test sibling - which predates this consolidation and
// imports them directly from "./steps.weekly-announcements" - keeps working
// unmodified.
import {
  draftAnnouncementAction,
  createScheduledAnnouncementAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { stripModelUrls } from "@/lib/urls";
import type { OutputFamily } from "@/lib/output-selection";
import {
  runWeeklyGenerator,
  weekStartDate,
  gatherWeekMaterials,
  isNonTransientQuotaRefusal,
  type WeeklyGeneratorConfig,
} from "./weekly-generator";

export { weekStartDate, gatherWeekMaterials, isNonTransientQuotaRefusal };

type DraftSuccess = Exclude<Awaited<ReturnType<typeof draftAnnouncementAction>>, { error: string }>;

interface AnnouncementSetup {
  extraNotes: string;
  startRaw: string;
  startDateInvalid: boolean;
  startDate: Date | null;
}

const announcementsConfig: WeeklyGeneratorConfig<AnnouncementSetup, string, DraftSuccess> = {
  selectedKey: "selected",
  countOutputKey: "announcementCount",
  sortOrder: 6,
  itemLabel: "an announcement",
  itemLabelPlural: "weekly announcement",
  notSelectedSummaryText: "Skipped - announcements were not selected in this run's output selection.",
  noneGeneratedText: "No weekly announcements were generated.",
  startProgressText: "Composing weekly announcements from each week's module materials...",
  weekProgressText: (weekNumber) => `Composing the Week ${weekNumber} announcement...`,

  setup: (values, tile) => {
    const extraNotes = String(values.extraNotes ?? "").trim();
    const startRaw = String(values.startDate ?? "").trim() || (tile?.startDate ?? "").trim();
    const parsedStartDate = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
    // RCA19 (RCA round 4): an invalid start date used to throw, which - like
    // steps.course-guides.ts's bare throws - cascades to every dependent
    // step bound to this step's `files` output (server-runner.ts cascades a
    // thrown step failure via `failedSteps`). This is a recoverable
    // condition: degrade to exactly the same state as "no start date was
    // given" (LMS scheduling is skipped, noted below and per week), and
    // still compose every week's announcement - a malformed date should
    // never cost the instructor the whole run.
    const startDateInvalid = parsedStartDate !== null && Number.isNaN(parsedStartDate.getTime());
    const startDate = startDateInvalid ? null : parsedStartDate;
    return {
      value: { extraNotes, startRaw, startDateInvalid, startDate },
      preLoopReportLines: startDateInvalid
        ? [
            `Class start date ("${startRaw}") is not a valid date - LMS scheduling is skipped this run; announcements still generate.`,
          ]
        : undefined,
    };
  },

  ground: (incoming, weekNumber) => {
    const materials = gatherWeekMaterials(incoming, weekNumber);
    if (!materials.trim()) {
      return { ok: false, message: `Week ${weekNumber}: skipped - no generated module materials found for this week.` };
    }
    return { ok: true, value: materials };
  },

  generate: async (materials, week, ctx) => {
    const weekNumber = week.week;
    const topic = (week.topic ?? "").trim();
    const instruction = [
      `Write a warm, professional start-of-week course announcement for Week ${weekNumber}${topic ? `: ${topic}` : ""}.`,
      "Organize it into clear sections: what students will learn this week, what they will be doing this week, any upcoming deadlines, and anything else to be aware of.",
      `Base it on these actual module materials for this week - do not just restate the topic:\n${materials}`,
      ctx.setup.extraNotes ? `Also incorporate these notes (deadlines / things to be aware of):\n${ctx.setup.extraNotes}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return draftAnnouncementAction(instruction, ctx.helpers.provider);
  },

  render: ({ value, weekNumber, topic }) => {
    const title = stripModelUrls(value.title).trim() || `Week ${weekNumber}${topic ? `: ${topic}` : ""}`;
    const body = stripModelUrls(value.message).trim();
    const pageText = `# ${title}\n\n${body}`;
    const fileName = topic ? `Week ${weekNumber} Announcement - ${topic}.docx` : `Week ${weekNumber} Announcement.docx`;
    return { docxSourceText: pageText, pageText, fileName };
  },

  publish: async (_rendered, { value, weekNumber, topic, setup, courseUrl, acronym, postToLms }) => {
    const title = stripModelUrls(value.title).trim() || `Week ${weekNumber}${topic ? `: ${topic}` : ""}`;
    const body = stripModelUrls(value.message).trim();

    let postNote = "not posted - posting is turned off.";
    if (postToLms) {
      if (!courseUrl) {
        postNote = "not posted - no LMS course on the tile.";
      } else if (!setup.startDate) {
        postNote = setup.startDateInvalid
          ? `not posted - the class start date ("${setup.startRaw}") is not a valid date.`
          : "not posted - no class start date to schedule from.";
      } else {
        const releaseDate = weekStartDate(setup.startDate, weekNumber);
        if (releaseDate.getTime() <= Date.now()) {
          postNote = `not posted - week ${weekNumber}'s release date (${releaseDate.toLocaleDateString()}) is in the past.`;
        } else {
          try {
            const posted = await createScheduledAnnouncementAction(courseUrl, title, body, releaseDate.toISOString(), acronym);
            postNote = "error" in posted ? `LMS error - ${posted.error}` : `scheduled for ${releaseDate.toLocaleString()}`;
          } catch (err) {
            postNote = `LMS error - ${err instanceof Error ? err.message : "unknown error"}`;
          }
        }
      }
    }

    return `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated - ${postNote}`;
  },
};

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
        // Meaningless (and hidden) once "announcements" is deselected from
        // COURSE_BUILD's own "outputs" multi-select - see workflow-field-
        // visibility.ts's isFieldVisible for the shared predicate. A blank
        // "outputs" (today's default) still shows this - "blank means all".
        visibleWhen: { fieldKey: "outputs", contains: "announcements" satisfies OutputFamily },
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
    // Deliverable-resilience pass-through (registry-helpers.ts's
    // StepDefinition.passThroughOnFailure): this step sits mid-chain in
    // COURSE_BUILD/COURSE_REFRESH's "files" accumulator - a thrown failure
    // here would otherwise cascade to every later chain generator AND both
    // terminal deliverables (the Common Cartridge export and the course
    // zip). On a throw, the run loop republishes the incoming "files" it
    // received unchanged instead.
    passThroughOnFailure: { files: "files" },
    run: (values, helpers, onProgress) => runWeeklyGenerator(announcementsConfig, values, helpers, onProgress),
  },
];
