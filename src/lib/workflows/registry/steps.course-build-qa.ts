// Client-side step catalog: the "Anticipated lecture Q&A" output family - a
// per-week set of questions students are likely to ask, with instructor-
// ready answers, grounded in THAT WEEK'S own already-generated materials.
//
// REUSE, NOT REBUILD: the actual question/answer generation is
// generateLectureQaAction (src/app/actions/course-planning.ts) UNCHANGED -
// the exact same action the standalone "Anticipate lecture Q&A" step
// (steps.content-insights.ts's "lecture-qa") already calls for a single
// module, including its example-program handling (parseQaExamples,
// buildExampleProgramsTextBlock/buildExampleProgramsDocLines - src/lib/
// lecture-qa.ts, also reused here unchanged). This file's only new code is
// the per-week ORCHESTRATION: loop the course's full schedule and ground
// each week's questions in that week's own already-generated materials
// (gatherWeekMaterials, reused from steps.weekly-announcements.ts) - the
// exact same shape steps.weekly-significance.ts and steps.instructor-
// notes.ts already established for their own per-week output families.
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
// schedule (like those two) but only ever produces a document for a week
// whose own generated materials (objectives, deck, opener, assignment) are
// present in the accumulated `files` this run - i.e. a week COURSE_BUILD's
// own module selector (select-course-modules) actually (re)generated this
// run. A week outside that selection has none this run, so it is skipped
// here exactly like generate-weekly-announcements/generate-knowledge-checks/
// generate-instructor-notes already skip it (gatherWeekMaterials finding
// nothing) - see steps.weekly-announcements.ts's own comment on that
// mechanism for the precedent this follows.
//
// NOT reused here: LMS page posting (postToLms/modules, which significance
// and instructor notes both offer). An anticipated Q&A document is purely a
// study/prep aid for the instructor - there is no analogous "publish this as
// a page" need the way a Significance-of-the-Material or announcement has,
// and the standalone lecture-qa step itself never posts to the LMS either.
// Keeping this step to "generate the document, add it to the files chain"
// matches that existing precedent rather than inventing a new one.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
  generateLectureQaAction,
} from "@/app/actions";
import { type StepDefinition, isGeneratorSelected } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { resolveCourseKind } from "@/lib/course-kind";
import { buildExampleProgramsDocLines, buildExampleProgramsTextBlock, type QaExample } from "@/lib/lecture-qa";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";
import { gatherWeekMaterials, isNonTransientQuotaRefusal } from "./steps.weekly-announcements";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const courseBuildQaSteps: StepDefinition[] = [
  {
    type: "generate-weekly-qa",
    name: "Generate weekly anticipated Q&A",
    description:
      "Build an anticipated Q&A document for every week that has one - questions students are likely to ask during that week's lecture, with instructor-ready answers, grounded in THAT WEEK'S own already-generated materials (objectives, deck, opener, assignment) rather than invented generically. Ships as a Word document in that week's zip folder.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Used to name the course in the generated document and its file name.",
      },
      { key: "schedule", label: "Course schedule", type: "schedule", required: true },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "This week's already-generated materials (objectives, deck, opener, assignment) ground the anticipated questions - a week with no generated materials is skipped, never given generic questions.",
      },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course: no example code is ever generated, matching the standalone Anticipate lecture Q&A step.",
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
      { key: "count", label: "Q&A documents generated", type: "number" },
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
          summary: { kind: "text", text: "Skipped - anticipated Q&A was not selected in this run's output selection." },
        };
      }

      const courseKind = resolveCourseKind(values.courseKind);

      const hubCourseId = String(values.hubCourse ?? "").trim();
      let tile: Course | undefined;
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) tile = list.courses.find((c) => c.id === hubCourseId);
      }
      const courseName = tile?.name ?? "";

      const files: GeneratedCourseFile[] = [];
      const reportLines: string[] = [];

      onProgress("Composing weekly anticipated Q&A documents...");

      let failedWeekCount = 0;
      let quotaStoppedAtWeek: number | null = null;

      for (let scheduleIndex = 0; scheduleIndex < schedule.length; scheduleIndex++) {
        const week = schedule[scheduleIndex];
        const weekNumber = week.week;
        const topic = (week.topic ?? "").trim();

        // AC3 (module selector): the same "no generated materials this run"
        // skip generate-weekly-announcements/generate-knowledge-checks/
        // generate-instructor-notes already use - a week outside this run's
        // module selection has none.
        const materials = gatherWeekMaterials(incoming, weekNumber);
        if (!materials.trim()) {
          reportLines.push(`Week ${weekNumber}: skipped - no generated module materials found for this week.`);
          continue;
        }

        try {
          onProgress(`Composing Week ${weekNumber} anticipated Q&A...`);
          const generated = await generateLectureQaAction(
            courseName,
            topic || `Week ${weekNumber}`,
            materials,
            [],
            helpers.provider,
            courseKind
          );

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

          if (generated.questions.length === 0) {
            reportLines.push(`Week ${weekNumber}: skipped - the model returned no questions.`);
            continue;
          }

          // Same gate the standalone lecture-qa step applies (steps.content-
          // insights.ts): a no-code course can never carry example code, even
          // if that guarantee ever regressed upstream.
          const usableExamples: QaExample[] = courseKind === "coding" ? (generated.examples ?? []) : [];

          const qaText =
            generated.questions.map((q, i) => `Q${i + 1}: ${q.question}\n\nA: ${q.answer}`).join("\n\n\n") +
            buildExampleProgramsTextBlock(usableExamples);

          const docText = [
            `# ${courseName ? `${courseName} - ` : ""}Week ${weekNumber}${topic ? `: ${topic}` : ""} - Anticipated student questions`,
            "",
            ...generated.questions.flatMap((q, i) => [`## Q${i + 1}: ${q.question}`, "", q.answer, ""]),
            ...buildExampleProgramsDocLines(usableExamples),
          ].join("\n");

          const docxBuffer = await buildDocxFromPlainText(docText, [], helpers.author);
          const fileName = buildWorkflowFileName({
            course: tile ?? null,
            artifact: "Anticipated Q&A",
            qualifier: topic || `Week ${weekNumber}`,
            ext: "docx",
          });

          files.push({
            name: fileName,
            blob: new Blob([docxBuffer], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber,
            // Right after Instructor Notes (6.5) - see GeneratedCourseFile's
            // own sortOrder doc comment (types.ts). Out of this change's
            // allowed-file scope to edit that comment itself; this value
            // extends the same numbering scheme it documents.
            sortOrder: 6.6,
            role: "supplement",
            pageText: qaText,
          });

          reportLines.push(
            `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated ${generated.questions.length} question(s)${
              usableExamples.length > 0 ? ` and ${usableExamples.length} example program(s)` : ""
            }.`
          );
        } catch (err) {
          failedWeekCount += 1;
          reportLines.push(`Week ${weekNumber}: error - ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }

      const report = reportLines.join("\n");

      const partialFailureDetail =
        failedWeekCount > 0
          ? quotaStoppedAtWeek !== null
            ? `The LLM quota was exhausted after week ${quotaStoppedAtWeek}; ${failedWeekCount} of ${schedule.length} week(s) did not get an anticipated Q&A document.`
            : `${failedWeekCount} of ${schedule.length} week(s) failed to generate an anticipated Q&A document - see this step's own report for detail.`
          : null;

      if (files.length === 0) {
        return {
          outputs: {
            files: incoming,
            count: 0,
            report,
            ...(partialFailureDetail ? { [PARTIAL_FAILURE_OUTPUT_KEY]: partialFailureDetail } : {}),
          },
          summary: { kind: "text", text: report || "No anticipated Q&A documents were generated." },
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
          label: `Generated ${files.length} anticipated Q&A document(s)`,
          items: reportLines,
        },
      };
    },
  },
];
