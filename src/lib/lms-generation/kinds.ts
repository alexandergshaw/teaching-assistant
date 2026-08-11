// The kind registry for LMS-selection-driven content generation (chunk 1 of
// "generate content from the instructor's LMS selection"): per-kind metadata
// plus the PURE transforms each kind needs. Copies the CONFIG SHAPE of
// WeeklyGeneratorConfig (src/lib/workflows/registry/weekly-generator.ts -
// already "generate kind K, ground it, render it, commit it per-kind", with
// six kinds running through it in production) rather than reusing its
// runner: that runner is welded to ScheduleWeekPlan[]/GeneratedCourseFile[]
// and lives in the client-reachable registry under a documented import ban
// (see that file's own header comment). This registry backs a single-shot,
// arbitrary-selection generation flow instead of a per-week loop, so it
// needs its own, much smaller runner - src/app/actions/lms-generation.ts.
//
// DELIBERATELY FREE of any "@/app/actions" or Supabase import, so this whole
// module is a leaf: every export here is a plain value or a pure function,
// directly testable with in-memory fixtures, no vi.mock. The actual
// generator calls (generateLectureQaAction / researchCurrentEventsAction)
// and the database write (saveGeneratedArtifactVersion) live in
// src/app/actions/lms-generation.ts, which imports this registry for its
// per-kind metadata/transforms and supplies the impure parts itself. Because
// of that split, QaGeneratedContent/CurrentEventsGeneratedContent below are
// STRUCTURAL copies of generateLectureQaAction's/researchCurrentEventsAction's
// own success shapes, not imports of them - the real return values are
// structurally assignable to these interfaces without this file ever
// referencing "@/app/actions".
//
// CHUNK 1 SHIPS TWO KINDS ONLY, both pure text, neither writing to Canvas:
// anticipated Q&A and current events. Both this registry's ids and each
// config's `artifactKind` (the generated_artifacts.kind column value) reuse
// already-established vocabulary rather than minting parallel ones:
//   - id: OUTPUT_FAMILIES already carries "qa" and "currentEvents"
//     (src/lib/output-selection.ts) - COURSE_BUILD's own two newest output
//     families, each already backed by these exact two generators (see that
//     file's own header comment). Verified: OUTPUT_FAMILIES has 13 members
//     and every kind this feature will eventually need EXCEPT "sample
//     answers" - there is no "sampleAnswers" family yet, so a future sample-
//     answers kind will need its own OUTPUT_FAMILIES entry; not needed for
//     this chunk's two kinds. GenerationKindId is derived from OutputFamily
//     via Extract below specifically so it cannot silently drift from that
//     list - if "qa"/"currentEvents" were ever renamed there, this file
//     would fail to compile instead of quietly keeping a stale id.
//   - artifactKind: "anticipated-qa" / "current-events", the exact example
//     strings generated_artifacts's own migration header comment and
//     src/lib/supabase/generated-artifacts.ts's GeneratedArtifact.kind doc
//     comment already use.
import type { OutputFamily } from "@/lib/output-selection";

/** Reused from OUTPUT_FAMILIES rather than a parallel id - see this file's
 * header comment. Resolves to `never` (a compile error at the array literal
 * below) if "qa"/"currentEvents" were ever removed from OutputFamily. */
export type GenerationKindId = Extract<OutputFamily, "qa" | "currentEvents">;

export const GENERATION_KIND_IDS: readonly GenerationKindId[] = ["qa", "currentEvents"];

/** How a kind's generated content is persisted once produced. Chunk 1's two
 * kinds both do the same thing ("save-version": one new generated_artifacts
 * row, nothing else - no Canvas write). A discriminant rather than a bare
 * boolean so a future kind that ALSO posts to the LMS (an announcement,
 * say) has somewhere to say so without every existing kind's config
 * changing shape. */
export type GenerationCommitMode = "save-version";

/** Context a kind's `buildPrompt` renders into the `prompt` field persisted
 * on the generated_artifacts row (see saveGeneratedArtifactVersion). This is
 * NOT the literal prompt sent to the model - generateLectureQaAction and
 * researchCurrentEventsAction build and own their internal prompts and do
 * not return them - it is a reconstructed description of what was asked,
 * serving the same "what produced this version" purpose for preview/diff
 * that entry 261 check 11 documents the column for. */
export interface GenerationPromptMeta {
  courseName: string;
  moduleLabel: string;
}

/** Structural mirror of generateLectureQaAction's success shape
 * (src/app/actions/course-planning-lecture.ts) - see this file's header
 * comment for why this is a structural copy rather than an import. */
export interface QaGeneratedContent {
  questions: Array<{ question: string; answer: string }>;
  examples?: Array<{ title: string; language: string; code: string; explanation: string }>;
}

/** Structural mirror of researchCurrentEventsAction's ResearchCurrentEventsResult
 * (src/app/actions/current-events.ts) - see this file's header comment for
 * why this is a structural copy rather than an import. */
export interface CurrentEventsGeneratedContent {
  report: string;
  reportMarkdown: string;
  sourceCount: number;
  topicsCovered: number;
}

export interface GenerationKindConfig<TGenerated> {
  id: GenerationKindId;
  /** generated_artifacts.kind - see this file's header comment for why
   * these exact strings. */
  artifactKind: string;
  label: string;
  /** Every kind in this registry needs a resolved course_hub row (the
   * generated_artifacts table's course_id is NOT NULL) - kept as an
   * explicit field, not assumed, so a future kind that somehow does not
   * (there is none yet) has somewhere to say so. */
  needsCourseRow: boolean;
  commitMode: GenerationCommitMode;
  /** Pure: the text saved into generated_artifacts.prompt - see
   * GenerationPromptMeta's own doc comment for what this is (and is not). */
  buildPrompt: (materialsText: string, meta: GenerationPromptMeta) => string;
  /** Pure: the generated_artifacts.text payload for a successful generation.
   * Chunk 1's two kinds are pure text - neither ever populates `structured`
   * (see the migration's own comment: "every other kind is expected to
   * leave it null"), so this returns a plain string rather than
   * {text, structured}. */
  render: (generated: TGenerated) => string;
  /** Pure: true when a successful generate call produced nothing usable
   * (e.g. zero questions, zero researched topics) - mirrors
   * WeeklyGeneratorConfig's own `validate` skip-not-fail case
   * (steps.course-build-qa.ts: "the model returned no questions" is a skip,
   * never a failure). The caller uses this to avoid saving an empty
   * version. */
  isEmpty: (generated: TGenerated) => boolean;
  /** Human sentence for the isEmpty case. */
  emptyMessage: string;
}

export const qaKindConfig: GenerationKindConfig<QaGeneratedContent> = {
  id: "qa",
  artifactKind: "anticipated-qa",
  label: "Anticipated lecture Q&A",
  needsCourseRow: true,
  commitMode: "save-version",
  buildPrompt: (materialsText, meta) =>
    `Anticipated lecture Q&A for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) =>
    generated.questions.map((q, i) => `Q${i + 1}: ${q.question}\n\nA: ${q.answer}`).join("\n\n\n"),
  isEmpty: (generated) => generated.questions.length === 0,
  emptyMessage: "The model returned no anticipated questions for this selection.",
};

export const currentEventsKindConfig: GenerationKindConfig<CurrentEventsGeneratedContent> = {
  id: "currentEvents",
  artifactKind: "current-events",
  label: "Current events",
  needsCourseRow: true,
  commitMode: "save-version",
  buildPrompt: (materialsText, meta) =>
    `Current events research for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => generated.reportMarkdown,
  isEmpty: (generated) => generated.topicsCovered === 0,
  emptyMessage: "No current-events topics could be researched for this selection.",
};

/** Keyed lookup so a caller with a `GenerationKindId` gets back a config
 * typed to that exact kind's generated-content shape, rather than a widened
 * union it would have to narrow again. */
export const GENERATION_KIND_CONFIGS = {
  qa: qaKindConfig,
  currentEvents: currentEventsKindConfig,
} satisfies Record<GenerationKindId, GenerationKindConfig<never>>;
