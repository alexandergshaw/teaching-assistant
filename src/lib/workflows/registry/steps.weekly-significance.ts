// Client-side step catalog: the per-week "Significance of the Material"
// document - why THAT WEEK'S subject matters in the real world, built on the
// SAME anchor case study already assigned to that week (AssignmentPlan.
// caseStudy, actions-types.ts - carried onto every file assembleLectureFiles
// produces for a plan, registry-helpers.ts) rather than a newly invented
// example. Added ONCE to COURSE_REFRESH (reaching COURSE_KICKOFF and
// NO_CODE_KICKOFF via include-workflow), placed right after generate-
// knowledge-checks so it extends the SAME accumulated "files" chain (see the
// placement comment on the preset wiring, presets/course-setup.ts).
//
// CHUNK C: the per-week orchestration (the isGeneratorSelected guard, the
// course-tile lookup, the per-week loop, the non-transient-quota short-
// circuit, partial-failure accounting, both terminal return shapes) now
// lives once in weekly-generator.ts's runWeeklyGenerator, shared with the
// other five weekly per-module generators - see that module's own header
// comment. This file supplies only what is genuinely unique to
// significance: grounding in the week's already-assigned case study (never
// gatherWeekMaterials) and its own published-page LMS side effect.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  generateWeekSignificanceAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";
import type { OutputFamily } from "@/lib/output-selection";
import { runWeeklyGenerator, type WeeklyGeneratorConfig } from "./weekly-generator";

type SignificanceSuccess = Exclude<Awaited<ReturnType<typeof generateWeekSignificanceAction>>, { error: string }>;

const significanceConfig: WeeklyGeneratorConfig<undefined, CaseStudyAssignment, SignificanceSuccess> = {
  selectedKey: "selected",
  countOutputKey: "count",
  sortOrder: 0.2,
  itemLabel: "a Significance of the Material document",
  itemLabelPlural: "Significance of the Material document",
  notSelectedSummaryText: "Skipped - Significance of the Material was not selected in this run's output selection.",
  noneGeneratedText: "No Significance of the Material documents were generated.",
  startProgressText: "Composing weekly Significance of the Material documents...",
  weekProgressText: (weekNumber) => `Composing the Week ${weekNumber} Significance of the Material document...`,

  // AC3 (module selector): honesty requirement - this week's case study is
  // read off whatever this RUN already generated for it, not re-derived or
  // re-chosen here. A week outside COURSE_BUILD's module selection, or one
  // no whole-course case-study plan could confidently match, is skipped -
  // never given a different, invented example.
  ground: (incoming, weekNumber) => {
    const caseStudy = incoming.find((f) => f.weekNumber === weekNumber && f.caseStudy)?.caseStudy;
    if (!caseStudy) {
      return {
        ok: false,
        message: `Week ${weekNumber}: skipped - no assigned case study available for this week (either this module was not generated this run, or no case study could be confidently matched to it).`,
      };
    }
    return { ok: true, value: caseStudy };
  },

  generate: async (caseStudy, week, ctx) => {
    const topic = (week.topic ?? "").trim();
    return generateWeekSignificanceAction(topic, week.summary ?? "", caseStudy, ctx.helpers.provider, ctx.courseKind);
  },

  render: ({ value, weekNumber, topic, tile }) => {
    const pageText = value.text;
    const fileName = buildWorkflowFileName({
      course: tile ?? null,
      artifact: "Significance of the Material",
      qualifier: topic || `Week ${weekNumber}`,
      ext: "docx",
    });
    return { docxSourceText: pageText, pageText, fileName };
  },

  publish: async (rendered, { weekNumber, topic, courseUrl, acronym, postToLms, modules }) => {
    let postNote = "not posted - posting is turned off.";
    if (postToLms) {
      if (!courseUrl) {
        postNote = "not posted - no LMS course on the tile.";
      } else {
        try {
          const title = `Week ${weekNumber} Significance of the Material${topic ? `: ${topic}` : ""}`;
          const body = markdownLiteToHtml(rendered.pageText);
          const created = await createPageAction(courseUrl, { title, body, published: true }, acronym);
          if ("error" in created) {
            postNote = `LMS error - ${created.error}`;
          } else {
            let placementNote = "; not placed in a module (no module for this week)";
            const targetModule = modules.find((m) => m.week === weekNumber);
            if (targetModule) {
              const linked = await createModuleItemAction(courseUrl, targetModule.id, { type: "Page", pageUrl: created.page.url }, acronym);
              placementNote = "error" in linked ? `; module placement failed - ${linked.error}` : "";
            }
            postNote = `page created${placementNote}`;
          }
        } catch (err) {
          postNote = `LMS error - ${err instanceof Error ? err.message : "unknown error"}`;
        }
      }
    }
    return `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated - ${postNote}`;
  },
};

export const weeklySignificanceSteps: StepDefinition[] = [
  {
    type: "generate-weekly-significance",
    name: "Generate weekly Significance of the Material",
    description:
      "Build a 'Significance of the Material' document for every week that has one - why that week's subject matters in the real world, built on THAT WEEK'S OWN already-assigned case study (the same case its class opener and lecture deck already used), never a newly invented example. Ships as a Word document in that week's zip folder, and optionally as an LMS page. This step depends only on the course schedule, not on the LMS modules step, so an LMS outage no longer skips it - the cost is that in every built-in preset the page is no longer placed into that week's Canvas module (see the \"modules\" input below).",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "The tile's LMS course is where the page posts when turned on.",
      },
      { key: "schedule", label: "Course schedule", type: "schedule", required: true },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "This week's already-assigned case study is read off these files (the SAME case its opener/deck already used) - a week with no case study available here is skipped, never given an invented one.",
      },
      {
        key: "modules",
        label: "LMS modules",
        type: "modules",
        required: false,
        help: "When bound, the LMS page is placed in that week's own module. None of the built-in presets bind this any more (this step now depends only on the course schedule, not on the LMS modules step, so an LMS-side failure no longer skips this step's local deliverables) - so when postToLms is on, the page is still created but reports \"not placed in a module\", even on a fully successful LMS modules run.",
      },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course: nothing generated may involve reading, writing, or running code.",
      },
      {
        key: "postToLms",
        label: "Post significance pages to the LMS",
        type: "boolean",
        required: false,
        help: "Off by default - posting a whole term's pages to a live course is outward-facing. When off, the document still ships as a Word document in the zip.",
        // Meaningless (and hidden) once "significance" is deselected from
        // COURSE_BUILD's own "outputs" multi-select - see workflow-field-
        // visibility.ts's isFieldVisible for the shared predicate. A blank
        // "outputs" (today's default) still shows this - "blank means all".
        visibleWhen: { fieldKey: "outputs", contains: "significance" satisfies OutputFamily },
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
      { key: "count", label: "Significance documents generated", type: "number" },
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
    run: (values, helpers, onProgress) => runWeeklyGenerator(significanceConfig, values, helpers, onProgress),
  },
];
