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
// lecture-qa.ts, also reused here unchanged).
//
// CHUNK C: the per-week orchestration (the isGeneratorSelected guard, the
// course-tile lookup, the per-week loop, the non-transient-quota short-
// circuit, partial-failure accounting, both terminal return shapes) now
// lives once in weekly-generator.ts's runWeeklyGenerator, shared with the
// other five weekly per-module generators - see that module's own header
// comment. This file supplies only what is genuinely unique to Q&A: the
// generate call itself, the applied/no-code example-program gate, and its
// own document rendering (this step has no LMS side effect at all).
//
// NOT reused here: LMS page posting (postToLms/modules, which significance
// and instructor notes both offer). An anticipated Q&A document is purely a
// study/prep aid for the instructor - there is no analogous "publish this as
// a page" need the way a Significance-of-the-Material or announcement has,
// and the standalone lecture-qa step itself never posts to the LMS either.
import { generateLectureQaAction } from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { buildExampleProgramsDocLines, buildExampleProgramsTextBlock, type QaExample } from "@/lib/lecture-qa";
import { groundInWeekMaterials, runWeeklyGenerator, type WeeklyGeneratorConfig } from "./weekly-generator";

type QaSuccess = Exclude<Awaited<ReturnType<typeof generateLectureQaAction>>, { error: string }>;

interface QaSetup {
  courseName: string;
}

const qaConfig: WeeklyGeneratorConfig<QaSetup, string, QaSuccess> = {
  selectedKey: "selected",
  countOutputKey: "count",
  sortOrder: 6.6,
  itemLabel: "an anticipated Q&A document",
  itemLabelPlural: "anticipated Q&A document",
  notSelectedSummaryText: "Skipped - anticipated Q&A was not selected in this run's output selection.",
  noneGeneratedText: "No anticipated Q&A documents were generated.",
  startProgressText: "Composing weekly anticipated Q&A documents...",
  weekProgressText: (weekNumber) => `Composing Week ${weekNumber} anticipated Q&A...`,

  setup: (_values, tile) => ({ value: { courseName: tile?.name ?? "" } }),

  ground: (incoming, weekNumber) => groundInWeekMaterials(incoming, weekNumber),

  generate: async (materials, week, ctx) => {
    const weekNumber = week.week;
    const topic = (week.topic ?? "").trim();
    return generateLectureQaAction(ctx.setup.courseName, topic || `Week ${weekNumber}`, materials, [], ctx.helpers.provider, ctx.courseKind);
  },

  // AC3 (module selector honesty): a week whose model call succeeded but
  // returned no questions is skipped, not shipped as an empty document -
  // never counted as a failure (the call itself worked; there is simply
  // nothing to render).
  validate: (generated, weekNumber) => {
    if (generated.questions.length === 0) {
      return { ok: false, asFailure: false, message: `Week ${weekNumber}: skipped - the model returned no questions.` };
    }
    return { ok: true, value: generated };
  },

  render: ({ value, weekNumber, topic, tile, setup, courseKind }) => {
    // Same gate the standalone lecture-qa step applies (steps.content-
    // insights.ts): a no-code course can never carry example code, even if
    // that guarantee ever regressed upstream.
    const usableExamples: QaExample[] = courseKind === "coding" ? (value.examples ?? []) : [];

    const qaText =
      value.questions.map((q, i) => `Q${i + 1}: ${q.question}\n\nA: ${q.answer}`).join("\n\n\n") +
      buildExampleProgramsTextBlock(usableExamples);

    const docText = [
      `# ${setup.courseName ? `${setup.courseName} - ` : ""}Week ${weekNumber}${topic ? `: ${topic}` : ""} - Anticipated student questions`,
      "",
      ...value.questions.flatMap((q, i) => [`## Q${i + 1}: ${q.question}`, "", q.answer, ""]),
      ...buildExampleProgramsDocLines(usableExamples),
    ].join("\n");

    const fileName = buildWorkflowFileName({
      course: tile ?? null,
      artifact: "Anticipated Q&A",
      qualifier: topic || `Week ${weekNumber}`,
      ext: "docx",
    });

    return { docxSourceText: docText, pageText: qaText, fileName };
  },

  publish: async (_rendered, { value, weekNumber, topic, courseKind }) => {
    const usableExamples: QaExample[] = courseKind === "coding" ? (value.examples ?? []) : [];
    return `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated ${value.questions.length} question(s)${
      usableExamples.length > 0 ? ` and ${usableExamples.length} example program(s)` : ""
    }.`;
  },
};

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
    run: (values, helpers, onProgress) => runWeeklyGenerator(qaConfig, values, helpers, onProgress),
  },
];
