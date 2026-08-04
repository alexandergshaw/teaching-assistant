// Client-side step catalog: the "Current events" output family - a per-week
// research report of current events and recent developments related to THAT
// WEEK'S own already-generated material, within an instructor-chosen
// recency window.
//
// REUSE, NOT REBUILD: the entire research pipeline is researchCurrentEventsAction
// (src/app/actions/current-events.ts) UNCHANGED, together with every pure
// helper it calls (src/lib/workflows/current-events-report.ts's clamps,
// parsers, dedupe/verification, and the two report renderers) - the exact
// same pipeline the standalone "Current events for a slide deck" step
// (steps.knowledge.ts's "current-events-report") already exposes for a
// single uploaded/bound deck.
//
// CHUNK C: the per-week orchestration (the isGeneratorSelected guard, the
// course-tile lookup, the per-week loop, the non-transient-quota short-
// circuit, partial-failure accounting, both terminal return shapes) now
// lives once in weekly-generator.ts's runWeeklyGenerator, shared with the
// other five weekly per-module generators - see that module's own header
// comment. THIS is the step whose non-transient-quota short-circuit used to
// be MISSING entirely (it imported only gatherWeekMaterials from steps.
// weekly-announcements.ts, never isNonTransientQuotaRefusal, and declared
// its own `failedWeekCount` with no `quotaStoppedAtWeek`) - a hard spend-cap
// 429 on week 1 kept burning every remaining week on doomed calls. It now
// inherits the shared short-circuit from the runner, fixing that by
// construction rather than by a sixth hand-written copy.
//
// SCOPE KEPT DELIBERATELY MINIMAL relative to the standalone step: only
// "recency window" is exposed as a run-form field here. maxTopics/
// itemsPerTopic/extraFocus are left at researchCurrentEventsAction's own
// defaults (6 topics, 5 items each, no extra focus) rather than adding three
// more optional fields to COURSE_BUILD's already-large run form - per-topic
// research already fans out in parallel (see current-events.ts's own "wall-
// clock budget" comment), so per-week cost does not grow with topic count,
// and an instructor who wants those knobs still has the standalone step
// available for a single deck.
import {
  researchCurrentEventsAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { buildCurrentEventsPageText } from "@/lib/workflows/current-events-page-text";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import type { OutputFamily } from "@/lib/output-selection";
import { groundInWeekMaterials, runWeeklyGenerator, type WeeklyGeneratorConfig } from "./weekly-generator";

type ResearchSuccess = Exclude<Awaited<ReturnType<typeof researchCurrentEventsAction>>, { error: string }>;

interface CurrentEventsSetup {
  window: string;
}

const currentEventsConfig: WeeklyGeneratorConfig<CurrentEventsSetup, string, ResearchSuccess> = {
  selectedKey: "selected",
  countOutputKey: "count",
  sortOrder: 6.7,
  itemLabel: "a current events document",
  itemLabelPlural: "current events document",
  notSelectedSummaryText: "Skipped - current events was not selected in this run's output selection.",
  noneGeneratedText: "No current events documents were generated.",
  startProgressText: "Researching weekly current events...",
  weekProgressText: (weekNumber) => `Researching current events for Week ${weekNumber}...`,

  setup: (values) => {
    const recentWindow = String(values.recentWindow ?? "").trim();
    return { value: { window: recentWindow || "the past 30 days" } };
  },

  ground: (incoming, weekNumber) => groundInWeekMaterials(incoming, weekNumber),

  generate: async (materials, _week, ctx) => researchCurrentEventsAction(materials, ctx.setup.window, ctx.helpers.provider),

  render: ({ value, weekNumber, topic, tile }) => {
    const fileName = buildWorkflowFileName({
      course: tile ?? null,
      artifact: "Current Events",
      qualifier: topic || `Week ${weekNumber}`,
      ext: "docx",
    });
    // pageText is NOT generated.report - the flat, ALL-CAPS, "1. Title: url"
    // text meant for this step's own machine-readable `report` output, never
    // for posting anywhere. buildCurrentEventsPageText (current-events-
    // report.ts) reflows the SAME docx-oriented markdown (generated.
    // reportMarkdown - real headings, bullets, and [title](url) citation
    // links) into flat, single-level bullets markdownLiteToHtml can render
    // without losing the "Why it matters"/"Source" context nested under each
    // headline. DO NOT TOUCH the docx path: it stays grounded in
    // generated.reportMarkdown directly, unchanged.
    const pageText = buildCurrentEventsPageText(value.reportMarkdown);
    return { docxSourceText: value.reportMarkdown, pageText, fileName };
  },

  // AC2/AC3/AC5: mirrors generate-weekly-significance's own postToLms block
  // closely (createPageAction, then a per-week module placement lookup via
  // createModuleItemAction - never the course-wide "Course Information"
  // placement steps.course-guides.ts uses). A post failure is caught here
  // and only ever noted, never thrown.
  publish: async (rendered, { value, weekNumber, topic, courseUrl, acronym, postToLms, modules }) => {
    let reportLine = `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated - ${value.sourceCount} source(s) across ${value.topicsCovered} topic(s).`;

    if (postToLms) {
      let postNote: string;
      if (!courseUrl) {
        postNote = "not posted - no LMS course on the tile.";
      } else {
        try {
          const title = `Week ${weekNumber} Current Events${topic ? `: ${topic}` : ""}`;
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
      reportLine = `${reportLine} ${postNote}`;
    }

    return reportLine;
  },
};

export const courseBuildCurrentEventsSteps: StepDefinition[] = [
  {
    type: "generate-weekly-current-events",
    name: "Generate weekly current events",
    description:
      "Build a current-events research report for every week that has one - recent developments related to THAT WEEK'S own already-generated material (objectives, deck, opener, assignment), within a chosen recency window. Ships as a Word document in that week's zip folder, and optionally as an LMS page.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Used to name the course in the generated document and its file name. The tile's LMS course is also where the page posts when turned on.",
      },
      { key: "schedule", label: "Course schedule", type: "schedule", required: true },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "This week's already-generated materials (objectives, deck, opener, assignment) ground the research - a week with no generated materials is skipped.",
      },
      {
        key: "recentWindow",
        label: "What counts as recent",
        type: "text",
        required: false,
        help: 'e.g. "the past 2 weeks" or "the last 3 months". Blank = the past 30 days.',
      },
      {
        key: "modules",
        label: "LMS modules",
        type: "modules",
        required: false,
        help: "When bound, the LMS page is placed in that week's own module. No built-in preset binds this (matching generate-weekly-significance's own precedent) - so when postToLms is on, the page is still created but reports \"not placed in a module\".",
      },
      {
        key: "postToLms",
        label: "Post current events pages to the LMS",
        type: "boolean",
        required: false,
        help: "Off by default - posting a whole term's pages to a live course is outward-facing. When off, the document still ships as a Word document in the zip.",
        // Meaningless (and hidden) once "currentEvents" is deselected from
        // COURSE_BUILD's own "outputs" multi-select - see workflow-field-
        // visibility.ts's isFieldVisible for the shared predicate. A blank
        // "outputs" (today's default) still shows this - "blank means all".
        visibleWhen: { fieldKey: "outputs", contains: "currentEvents" satisfies OutputFamily },
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
      { key: "count", label: "Current events documents generated", type: "number" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    // Deliverable-resilience pass-through (registry-helpers.ts's
    // StepDefinition.passThroughOnFailure): this step sits mid-chain in
    // COURSE_BUILD's "files" accumulator - a thrown failure here would
    // otherwise cascade to every later chain generator AND both terminal
    // deliverables (the Common Cartridge export and the course zip). On a
    // throw, the run loop republishes the incoming "files" it received
    // unchanged instead.
    passThroughOnFailure: { files: "files" },
    run: (values, helpers, onProgress) => runWeeklyGenerator(currentEventsConfig, values, helpers, onProgress),
  },
];
