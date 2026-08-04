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
// PER-MODULE by construction: this step reads the course's FULL schedule
// (like generate-weekly-announcements/generate-knowledge-checks already do)
// but only ever produces a document for a week whose case study is actually
// present in the accumulated `files` this run - i.e. a week COURSE_BUILD's
// own module selector (select-course-modules) actually (re)generated this
// run. A week outside that selection never got a case study attached this
// run, so it is skipped here the same way an unselected week already skips
// generate-weekly-announcements/generate-knowledge-checks (gatherWeekMaterials
// finding nothing) - see steps.weekly-announcements.ts's own comment on that
// mechanism for the precedent this follows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
  generateWeekSignificanceAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";
import { type StepDefinition, isGeneratorSelected } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { resolveCourseKind } from "@/lib/course-kind";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";
import { isNonTransientQuotaRefusal } from "./steps.weekly-announcements";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
          summary: { kind: "text", text: "Skipped - Significance of the Material was not selected in this run's output selection." },
        };
      }

      const courseKind = resolveCourseKind(values.courseKind);
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

      onProgress("Composing weekly Significance of the Material documents...");

      let failedWeekCount = 0;
      let quotaStoppedAtWeek: number | null = null;

      for (let scheduleIndex = 0; scheduleIndex < schedule.length; scheduleIndex++) {
        const week = schedule[scheduleIndex];
        const weekNumber = week.week;
        const topic = (week.topic ?? "").trim();

        // AC3 (module selector): honesty requirement - this week's case
        // study is read off whatever this RUN already generated for it, not
        // re-derived or re-chosen here. A week outside COURSE_BUILD's module
        // selection, or one no whole-course case-study plan could confidently
        // match, is skipped - never given a different, invented example.
        const caseStudy = incoming.find((f) => f.weekNumber === weekNumber && f.caseStudy)?.caseStudy;
        if (!caseStudy) {
          reportLines.push(
            `Week ${weekNumber}: skipped - no assigned case study available for this week (either this module was not generated this run, or no case study could be confidently matched to it).`
          );
          continue;
        }

        try {
          onProgress(`Composing the Week ${weekNumber} Significance of the Material document...`);
          const generated = await generateWeekSignificanceAction(topic, week.summary ?? "", caseStudy, helpers.provider, courseKind);

          if ("error" in generated) {
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

          const pageText = generated.text;
          const docxBuffer = await buildDocxFromPlainText(pageText, [], helpers.author);
          const fileName = buildWorkflowFileName({
            course: tile ?? null,
            artifact: "Significance of the Material",
            qualifier: topic || `Week ${weekNumber}`,
            ext: "docx",
          });

          files.push({
            name: fileName,
            blob: new Blob([docxBuffer], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber,
            // Right after Introduction (0), before Objectives (0.5) - see
            // GeneratedCourseFile's own sortOrder doc comment (types.ts).
            sortOrder: 0.2,
            role: "supplement",
            pageText,
          });

          let postNote = "not posted - posting is turned off.";
          if (postToLms) {
            if (!courseUrl) {
              postNote = "not posted - no LMS course on the tile.";
            } else {
              try {
                const title = `Week ${weekNumber} Significance of the Material${topic ? `: ${topic}` : ""}`;
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
          }

          reportLines.push(`Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated - ${postNote}`);
        } catch (err) {
          failedWeekCount += 1;
          reportLines.push(`Week ${weekNumber}: error - ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      const report = reportLines.join("\n");

      const partialFailureDetail =
        failedWeekCount > 0
          ? quotaStoppedAtWeek !== null
            ? `The LLM quota was exhausted after week ${quotaStoppedAtWeek}; ${failedWeekCount} of ${schedule.length} week(s) did not get a Significance of the Material document.`
            : `${failedWeekCount} of ${schedule.length} week(s) failed to generate a Significance of the Material document - see this step's own report for detail.`
          : null;

      if (files.length === 0) {
        return {
          outputs: {
            files: incoming,
            count: 0,
            report,
            ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
          },
          summary: { kind: "text", text: report || "No Significance of the Material documents were generated." },
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
          label: `Generated ${files.length} Significance of the Material document(s)`,
          items: reportLines,
        },
      };
    },
  },
];
