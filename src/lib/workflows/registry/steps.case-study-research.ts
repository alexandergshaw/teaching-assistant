// Client-side step catalog: research and corroborate a whole course's case
// studies in ONE pass, before any per-week material is generated.
//
// ONE-SHOT, NOT PER-WEEK: unlike the "Current events"/"Anticipated lecture
// Q&A" output families in this same directory (steps.course-build-current-
// events.ts, steps.course-build-qa.ts), which loop week by week through
// weekly-generator.ts's runWeeklyGenerator and emit a document per week
// through the "files" accumulator, this step calls the research action
// exactly once for the WHOLE schedule and stores its findings server-side as
// durable rows. It declares no "files" input/output and therefore never sits
// in that mid-chain accumulator - nothing downstream depends on this step's
// outputs, so a failure here fails only this step, never a cascade.
//
// PLACEMENT (course-build.ts): runs right after define-course-project and
// before lecture-materials-from-schedule, bound to course-schedule-from-
// source's FULL schedule output - never the select-course-modules-narrowed
// one, matching every other course-wide step in that preset (the syllabus,
// the Castletop workbook, the course guides). Research runs for the whole
// term regardless of which modules this particular run is (re)generating.
//
// NEVER runIf-GATED: a gated-off step's skip cascades transitively to every
// step bound to its output (evaluateStepGate, run-step-core.ts), which would
// take the terminal Common Cartridge export and zip down with it - see this
// file's siblings (steps.course-build-scope.ts, steps.course-build-codebase.ts)
// for the same rule stated in full. This step has no "selected"-style input
// either, since it is not part of COURSE_BUILD's output-family selection; it
// simply always runs when wired into a preset.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import { researchCourseCaseStudiesAction, type ScheduleWeekPlan } from "@/app/actions";
import { type StepDefinition, type StepRunResult } from "@/lib/workflows/registry-helpers";

export const caseStudyResearchSteps: StepDefinition[] = [
  {
    type: "research-course-case-studies",
    name: "Research course case studies",
    description:
      "Research and corroborate a real-world case study for every week of the course in one pass, before any week's materials are generated - so later steps (openers, decks, assignments) can ground themselves in a case already checked against outside sources instead of one invented on the spot. Stores its findings server-side; a week that could not be corroborated, or was skipped, is reported, never silently dropped.",
    inputs: [
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
        help: "The FULL course schedule (every week, not a narrowed module selection) - case studies are researched for the whole term regardless of which modules this run is (re)generating.",
      },
      {
        key: "courseDescription",
        label: "Course description",
        type: "longtext",
        required: false,
        help: "Grounds the research in what the course actually teaches.",
      },
    ],
    outputs: [
      { key: "stored", label: "Case studies stored", type: "number" },
      { key: "corroborated", label: "Corroborated", type: "number" },
      { key: "uncorroborated", label: "Uncorroborated", type: "number" },
      { key: "skipped", label: "Skipped", type: "number" },
      { key: "organizations", label: "Organizations researched", type: "longtext" },
    ],
    run: async (values, helpers, onProgress): Promise<StepRunResult> => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      if (schedule.length === 0) {
        return {
          outputs: { stored: 0, corroborated: 0, uncorroborated: 0, skipped: 0, organizations: "" },
          summary: { kind: "text", text: "No schedule to research case studies for." },
        };
      }

      // The action's own contract (case-study-research.ts) only needs
      // week/topic/summary - not the assignment/test fields ScheduleWeekPlan
      // also carries.
      const weeks = schedule.map((w) => ({ week: w.week, topic: w.topic, summary: w.summary }));
      const courseDescription = String(values.courseDescription ?? "").trim();

      onProgress("Researching case studies for the course...");
      const result = await researchCourseCaseStudiesAction(weeks, courseDescription, helpers.provider);
      if ("error" in result) {
        throw new Error(result.error);
      }

      // Nothing is silently dropped: every bucket the action reports
      // (corroborated, uncorroborated, skipped) and every note it returned
      // is surfaced in the step summary, not just the headline "stored" count.
      const items = [
        `${result.corroborated} corroborated, ${result.uncorroborated} uncorroborated, ${result.skipped} skipped.`,
        ...(result.organizations.length > 0 ? [`Organizations: ${result.organizations.join(", ")}`] : []),
        ...result.notes,
      ];

      return {
        outputs: {
          stored: result.stored,
          corroborated: result.corroborated,
          uncorroborated: result.uncorroborated,
          skipped: result.skipped,
          organizations: result.organizations.join("\n"),
        },
        summary: {
          kind: "list",
          label: `${result.stored} case stud${result.stored === 1 ? "y" : "ies"} stored`,
          items,
        },
      };
    },
  },
];
