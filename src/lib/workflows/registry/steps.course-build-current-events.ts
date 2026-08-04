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
// single uploaded/bound deck. That standalone step's own contract (a single
// deck's text, no `files` accumulator input/output) does not fit COURSE_
// BUILD's per-week "files" chain (trap 2: a deselected/failed generator must
// still pass `files` through, which only makes sense for a step that
// declares a `files` input/output in the first place) - so this file's only
// new code is the per-week ORCHESTRATION that DOES fit that chain: loop the
// course's full schedule, ground each week's research in that week's own
// already-generated materials (gatherWeekMaterials, reused from steps.
// weekly-announcements.ts) instead of an uploaded deck, and add the
// resulting report to the accumulated `files`. This is the exact same shape
// steps.weekly-significance.ts and steps.instructor-notes.ts already
// established for their own per-week output families.
//
// New file (matching how steps.weekly-significance.ts and steps.
// instructor-notes.ts each got their own file for their own output family -
// see steps.course-build-codebase.ts's own header comment for the same
// reasoning restated). Registered into STEP_REGISTRY via steps.course-
// build-scope.ts's own exported array rather than registry.ts's own
// top-level import list - see that file's own comment for why.
//
// PER-MODULE by construction, the same way generate-weekly-significance and
// generate-instructor-notes already are: this step reads the course's FULL
// schedule (like those two) but only ever produces a report for a week whose
// own generated materials (objectives, deck, opener, assignment) are present
// in the accumulated `files` this run - i.e. a week COURSE_BUILD's own
// module selector (select-course-modules) actually (re)generated this run. A
// week outside that selection has none this run, so it is skipped here
// exactly like generate-weekly-announcements/generate-knowledge-checks/
// generate-instructor-notes/generate-weekly-qa already skip it.
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
  type ScheduleWeekPlan,
  listCourseHubAction,
  researchCurrentEventsAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";
import { type StepDefinition, isGeneratorSelected } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";
import { buildCurrentEventsPageText } from "@/lib/workflows/current-events-page-text";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import { gatherWeekMaterials } from "./steps.weekly-announcements";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
    run: async (values, helpers, onProgress) => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const incoming = (values.files as GeneratedCourseFile[] | undefined) ?? [];

      if (schedule.length === 0) {
        return {
          outputs: { files: incoming, count: 0, report: "No schedule provided." },
          summary: { kind: "text", text: "Skipped - no schedule was provided." },
        };
      }

      // AC1/AC2 (COURSE_BUILD's output selector): deselected means "do no
      // work, pass files through unchanged" - never a runIf gate (this step
      // stays in the chain either way, so blackboard-export/save-zip-to-
      // course downstream never skip). isGeneratorSelected treats an unbound
      // value as "generate" (registry-helpers.ts), matching every OTHER
      // preset that uses this step and never binds "selected" at all.
      if (!isGeneratorSelected(values.selected)) {
        return {
          outputs: { files: incoming, count: 0, report: "Skipped - not selected in this run's output selection." },
          summary: { kind: "text", text: "Skipped - current events was not selected in this run's output selection." },
        };
      }

      const recentWindow = String(values.recentWindow ?? "").trim();
      const window = recentWindow || "the past 30 days";

      // AC1: unbound/absent postToLms must be byte-identical to today's
      // behaviour - so this is read the same "" != "1" way as significance/
      // instructor-notes/announcements (String(values.postToLms ?? "") ===
      // "1"), and every reportLines entry below stays byte-for-byte
      // unchanged from today whenever it is false. Only when it is true does
      // a post note get appended at all.
      const postToLms = String(values.postToLms ?? "") === "1";
      const modules = Array.isArray(values.modules) ? (values.modules as EnsuredModule[]) : [];

      const hubCourseId = String(values.hubCourse ?? "").trim();
      let tile: Course | undefined;
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) tile = list.courses.find((c) => c.id === hubCourseId);
      }

      const courseUrl = (tile?.canvasUrl ?? "").trim();
      const acronym = tile?.institution || helpers.activeInstitution || undefined;

      const files: GeneratedCourseFile[] = [];
      const reportLines: string[] = [];

      onProgress("Researching weekly current events...");

      let failedWeekCount = 0;

      for (let scheduleIndex = 0; scheduleIndex < schedule.length; scheduleIndex++) {
        const week = schedule[scheduleIndex];
        const weekNumber = week.week;
        const topic = (week.topic ?? "").trim();

        // AC3 (module selector): the same "no generated materials this run"
        // skip generate-weekly-announcements/generate-knowledge-checks/
        // generate-instructor-notes/generate-weekly-qa already use - a week
        // outside this run's module selection has none.
        const materials = gatherWeekMaterials(incoming, weekNumber);
        if (!materials.trim()) {
          reportLines.push(`Week ${weekNumber}: skipped - no generated module materials found for this week.`);
          continue;
        }

        try {
          onProgress(`Researching current events for Week ${weekNumber}...`);
          const generated = await researchCurrentEventsAction(materials, window, helpers.provider);

          if ("error" in generated) {
            failedWeekCount += 1;
            reportLines.push(`Week ${weekNumber}: error - ${generated.error}`);
            continue;
          }

          // DO NOT TOUCH: the docx path stays grounded in generated.reportMarkdown,
          // unchanged, via buildCurrentEventsDocMarkdown (current-events-report.ts) -
          // that function and its output are never touched by this change.
          const docxBuffer = await buildDocxFromPlainText(generated.reportMarkdown, [], helpers.author);
          const fileName = buildWorkflowFileName({
            course: tile ?? null,
            artifact: "Current Events",
            qualifier: topic || `Week ${weekNumber}`,
            ext: "docx",
          });

          // pageText used to be generated.report - the flat, ALL-CAPS, "1.
          // Title: url" text meant for the step's own machine-readable
          // `report` output, not for posting anywhere. buildCurrentEventsPageText
          // (current-events-report.ts) reflows the SAME docx-oriented markdown
          // already built above (generated.reportMarkdown - real headings,
          // bullets, and [title](url) citation links) into flat, single-level
          // bullets markdownLiteToHtml (below) can render without losing the
          // "Why it matters"/"Source" context nested under each headline.
          const pageText = buildCurrentEventsPageText(generated.reportMarkdown);

          files.push({
            name: fileName,
            blob: new Blob([docxBuffer], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber,
            // Right after the anticipated Q&A document (6.6), which itself
            // sits right after Instructor Notes (6.5) - see
            // GeneratedCourseFile's own sortOrder doc comment (types.ts).
            // Out of this change's allowed-file scope to edit that comment
            // itself; this value extends the same numbering scheme it
            // documents.
            sortOrder: 6.7,
            role: "supplement",
            pageText,
          });

          let reportLine = `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated - ${generated.sourceCount} source(s) across ${generated.topicsCovered} topic(s).`;

          // AC2/AC3/AC5: wired to mirror steps.weekly-significance.ts's own
          // postToLms block closely (createPageAction, then a per-week module
          // placement lookup via createModuleItemAction - never the course-
          // wide "Course Information" placement steps.course-guides.ts uses).
          // A post failure is caught here and only ever noted, never thrown -
          // this step already declares passThroughOnFailure, but a per-week
          // LMS hiccup should not cost the rest of the run either.
          if (postToLms) {
            let postNote: string;
            if (!courseUrl) {
              postNote = "not posted - no LMS course on the tile.";
            } else {
              try {
                const title = `Week ${weekNumber} Current Events${topic ? `: ${topic}` : ""}`;
                const body = markdownLiteToHtml(pageText);
                const created = await createPageAction(courseUrl, { title, body, published: true }, acronym);
                if ("error" in created) {
                  postNote = `LMS error - ${created.error}`;
                } else {
                  let placementNote = "; not placed in a module (no module for this week)";
                  const targetModule = modules.find((m) => m.week === weekNumber);
                  if (targetModule) {
                    const linked = await createModuleItemAction(
                      courseUrl,
                      targetModule.id,
                      { type: "Page", pageUrl: created.page.url },
                      acronym
                    );
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

          reportLines.push(reportLine);
        } catch (err) {
          failedWeekCount += 1;
          reportLines.push(`Week ${weekNumber}: error - ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      const report = reportLines.join("\n");

      const partialFailureDetail =
        failedWeekCount > 0
          ? `${failedWeekCount} of ${schedule.length} week(s) failed to generate a current events document - see this step's own report for detail.`
          : null;

      if (files.length === 0) {
        return {
          outputs: {
            files: incoming,
            count: 0,
            report,
            ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
          },
          summary: { kind: "text", text: report || "No current events documents were generated." },
        };
      }

      return {
        outputs: {
          files: [...incoming, ...files],
          count: files.length,
          report,
          ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
        },
        summary: {
          kind: "list",
          label: `Generated ${files.length} current events document(s)`,
          items: reportLines,
        },
      };
    },
  },
];
