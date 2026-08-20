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
// CHUNK 1 SHIPPED TWO KINDS, both pure text, neither writing to Canvas:
// anticipated Q&A and current events. CHUNK 3a added a THIRD, "decks" -
// still generation-only (no Canvas write; the Canvas commit was deferred)
// but the first kind that is NOT pure text, which is why it also introduced
// `renderStructured` below. Every kind's id and its config's `artifactKind`
// (the generated_artifacts.kind column value) reuse already-established
// vocabulary rather than minting parallel ones:
//   - id: OUTPUT_FAMILIES already carries "qa", "currentEvents", "decks",
//     "objectives", "assignments", "knowledgeChecks" AND "announcements"
//     (src/lib/output-selection.ts) - COURSE_BUILD's own output families,
//     each already backed by an existing generator (see that file's own
//     header comment; "decks" is backed by generateDeckFromTemplate,
//     src/lib/decks/generate.ts, via generate-presentation-from-template's
//     own delegation - steps.media.ts). GenerationKindId is derived from
//     OutputFamily via Extract below specifically so it cannot silently
//     drift from that list - if any of these seven ids were ever renamed
//     there, this file would fail to compile instead of quietly keeping a
//     stale id. This is NOT true of every kind this feature will ever need:
//     CHUNK 3d (below) adds "scripts", which has NO OUTPUT_FAMILIES entry
//     and deliberately does not get one - see NON_FAMILY_KIND_IDS' own doc
//     comment for why, and finding 1 of
//     docs/lms-script-generation-acceptance-criteria.md for the full
//     reasoning. A future "sample answers" kind (there is no
//     "sampleAnswers" family yet either) will face the same choice.
//   - artifactKind: "anticipated-qa" / "current-events" / "deck" /
//     "module-objectives" / "assignment" / "knowledge-check" /
//     "announcement". The first three are the exact example strings
//     generated_artifacts's own migration header comment and
//     src/lib/supabase/generated-artifacts.ts's GeneratedArtifact.kind doc
//     comment already use; the four new ones follow the same kebab-case,
//     singular-instance convention ("deck" not "decks" - one artifact row is
//     one generated instance of the kind).
//
// CHUNK 3b (this revision, docs/lms-module-content-generation-acceptance-
// criteria.md) adds R1 - a second GenerationCommitMode value and its FIRST
// runtime consumer's declarative metadata - and R2 - the four new kinds
// above, all of which POST to Canvas rather than only saving a version. The
// three existing kinds are UNTOUCHED: same commitMode literal, same
// behaviour. See GenerationCommitMode and GenerationCommitMeta below for the
// metadata shape, and this file's header comment (this paragraph) for why
// the executor that reads that metadata is NOT here:
// src/lib/lms-generation/commit-plan.ts (a sibling chunk of this same
// feature) owns turning it into actual createPageAction /
// createCourseAssignmentAction / createQuizQuestionAction /
// createAnnouncementAction calls - none of which this file may import
// without breaking its own leaf rule.
//
// CHUNK 3d (docs/lms-script-generation-acceptance-criteria.md) adds an
// EIGHTH kind, "scripts" - a lecture script generated from the selected
// module materials, grounding generateLectureScriptAction
// (src/app/actions/media.ts:228) the same way the other seven kinds ground
// their own generators. Unlike every kind above, "scripts" has no
// OUTPUT_FAMILIES entry: see NON_FAMILY_KIND_IDS' own doc comment for why,
// and GenerationKindId's doc comment for what that costs (nothing, for the
// other seven) and what it does not cost (their per-id compile-time rename
// protection, unchanged). "scripts" is plain text, "save-version" only -
// same shape as qa/currentEvents/decks above, not the four "save-and-post"
// kinds - because a teleprompter script is instructor material, not
// something to publish to students (see scriptsKindConfig's own comment).
//
// CHUNK 3f (docs/teleprompter-mode-acceptance-criteria.md, T1) adds no new
// kind, only a new declarative field - `deliveredAloud` - so the teleprompter
// entry point can ask "does this kind's text get read aloud on camera" without
// hardcoding `kindId === "scripts"` anywhere it is consumed. Set true on
// scriptsKindConfig only; see `deliveredAloud`'s and `kindDeliveredAloud`'s
// own doc comments for the full reasoning, which mirrors commitMode/
// kindOffersPost's existing declarative-flag pattern.
import type { OutputFamily } from "@/lib/output-selection";

/**
 * Kind ids that are NOT members of OUTPUT_FAMILIES, carved out here
 * explicitly rather than smuggled into the Extract union below. Today this
 * is just "scripts" (chunk 3d).
 *
 * WHY "scripts" is not an OUTPUT_FAMILIES member: OUTPUT_FAMILIES
 * (src/lib/output-selection.ts:21-56) is COURSE_BUILD's run-form
 * multi-select - every member is surfaced as a pickable option via
 * OUTPUT_FAMILY_LABELS and is expected to become a `selected*` flag in
 * src/lib/workflows/registry/steps.course-build-scope.ts:177-189. No
 * COURSE_BUILD step generates scripts, and OUTPUT_FAMILIES' "blank means
 * ALL" default means adding a family here would make every existing saved
 * COURSE_BUILD run silently select a family that produces nothing - a dead
 * run-form option nobody asked for and nothing would ever populate.
 *
 * WHAT THIS CARVE-OUT DOES NOT COST: the seven family-backed ids below keep
 * their existing per-id compile-time rename protection unchanged - the
 * Extract still fails to compile if any of THOSE seven were ever renamed in
 * OutputFamily. Unioning a non-family id in alongside them does not weaken
 * that. What the Extract's protection never covered, even before this
 * carve-out, is completeness against some other list - see kinds.test.ts's
 * disjointness test for how that gap is covered instead.
 */
export const NON_FAMILY_KIND_IDS = ["scripts"] as const;

/** Reused from OUTPUT_FAMILIES rather than a parallel id - see this file's
 * header comment. Resolves to `never` (a compile error at the array literal
 * below) if any of these ids were ever removed from OutputFamily. Unioned
 * with NON_FAMILY_KIND_IDS above for the ids that have no family at all. */
export type GenerationKindId =
  | Extract<
      OutputFamily,
      "qa" | "currentEvents" | "decks" | "objectives" | "assignments" | "knowledgeChecks" | "announcements"
    >
  | (typeof NON_FAMILY_KIND_IDS)[number];

export const GENERATION_KIND_IDS: readonly GenerationKindId[] = [
  "qa",
  "currentEvents",
  "decks",
  "objectives",
  "assignments",
  "knowledgeChecks",
  "announcements",
  "scripts",
];

/**
 * The generic failure shape every action in this feature returns instead of
 * throwing (generateFromSelectionAction, postGeneratedArtifactAction,
 * refineGeneratedArtifactAction, listGeneratedArtifactVersionsAction - all in
 * src/app/actions/lms-generation.ts). Declared here rather than there so that
 * src/lib/lms-generation/post-content.ts (a leaf, split out of that file for
 * its own line-count reasons - see that file's own header comment) can use it
 * in buildPostContentForKind's return type without an import reaching into
 * "@/app/actions" - this file is already a leaf itself (see this file's
 * header comment), so it costs that split nothing. lms-generation.ts
 * re-exports this type as-is so its own callers (e.g. useLmsGeneration.ts)
 * see no change.
 */
export interface GenerationFailure {
  error: string;
  /** True specifically for resolveLmsCourseRowAction's own "not linked"
   * error (see lms-generation.ts's isCourseNotLinkedMessage) - lets the
   * caller offer "link this course" instead of a generic error banner,
   * rather than treating this the same as any other failure. */
  courseNotLinked?: true;
}

/** How a kind's generated content is persisted once produced.
 * "save-version": one new generated_artifacts row, nothing else - no Canvas
 * write. Every kind through chunk 3a used this exclusively (including
 * "decks" - its Canvas commit is still a separate, later chunk; it stays
 * generation-only here too). "save-and-post" (chunk 3b, R1): the artifact is
 * saved FIRST (so a failed post always leaves a recoverable version - see
 * the acceptance-criteria doc's P2), and a Canvas object is then also
 * created/updated from it, per that kind's GenerationCommitMeta. A
 * discriminant rather than a bare boolean so a future kind that posts
 * differently again has somewhere to add its own metadata without every
 * existing kind's config changing shape. */
export type GenerationCommitMode = "save-version" | "save-and-post";

/**
 * Declarative Canvas-commit metadata for a "save-and-post" kind - METADATA
 * ONLY, no executor. kinds.ts is a dependency-free leaf (see this file's
 * header comment): it may say WHAT a post should do, never perform it. The
 * module that reads this and actually calls the Canvas write actions is
 * src/lib/lms-generation/commit-plan.ts (a sibling chunk of this feature,
 * not this file) - naming it here so that split is not accidentally undone
 * by a future edit that "just adds one Canvas call" straight into this leaf.
 */
export interface GenerationCommitMeta {
  /** Which Canvas object this kind's post creates. */
  canvasObjectKind: "page" | "assignment" | "quiz" | "announcement";
  /** Whether the created Canvas object is published (visible to students)
   * immediately on creation. Every OTHER creation path in this tab defaults
   * to UNPUBLISHED: createPage sends `fields.published ?? false`
   * (src/lib/canvas-modules/pages.ts:74) and createGradableAction always
   * sends `published=false` for its Assignment/Quiz/Discussion cases
   * (src/lib/canvas-modules/gradables.ts:102,112,119) - a quiz needs a
   * separate, later `bulkUpdateAction(..., "Quiz", ..., {published:true})`
   * call to go live. "objectives"/"assignments"/"knowledgeChecks" match that
   * convention with `false`. "announcements" is the one deliberate
   * exception, not an oversight: createAnnouncement
   * (src/lib/canvas/announcements.ts:229-269) never sends a `published`
   * param at all - Canvas's discussion_topics endpoint makes an announcement
   * visible immediately on creation, with no unpublished-draft state to opt
   * out of (`delayed_post_at` is a wholly separate future-visibility
   * mechanism, orthogonal to this flag) - so `announcements` honestly
   * declares `true` here instead of copying every other kind's `false`. */
  publishedOnCreation: boolean;
  /** How the created object is placed in a module. "module-item": created
   * (or reused) then linked into a module via createModuleItemAction, same
   * as postGuidesToLms's model (steps.course-guides.ts:262-265).
   * "course-level": NOT a module item at all - Canvas announcements are
   * course-level discussion topics, posted via
   * POST .../discussion_topics (createAnnouncement,
   * src/lib/canvas/announcements.ts:253-254), never
   * createModuleItemAction. Modelled as a real discriminant rather than
   * pretending every kind links into a module. */
  placement: "module-item" | "course-level";
}

/** Context a kind's `buildPrompt` renders into the `prompt` field persisted
 * on the generated_artifacts row (see saveGeneratedArtifactVersion). This is
 * NOT the literal prompt sent to the model - generateLectureQaAction,
 * researchCurrentEventsAction and generateDeckFromTemplate build and own
 * their internal prompts and do not return them - it is a reconstructed
 * description of what was asked, serving the same "what produced this
 * version" purpose for preview/diff that entry 261 check 11 documents the
 * column for. */
export interface GenerationPromptMeta {
  courseName: string;
  moduleLabel: string;
  /** Decks only - the deck_templates row's name, folded into the saved
   * prompt text so the audit trail says which template produced this
   * version. Optional/ignored by every other kind. */
  templateName?: string;
  /** Scripts only - the requested lecture length in minutes, folded into
   * the saved prompt text so the audit trail says which length produced
   * this version (docs/lms-script-generation-acceptance-criteria.md, S7).
   * Optional/ignored by every other kind, exactly like templateName above. */
  targetMinutes?: number;
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

/** One slide as generateDeckFromTemplate (src/lib/decks/generate.ts)
 * produces it - structurally the same shape as PptxSlide (src/lib/pptx.ts)
 * and SlideData (src/app/actions-types.ts), copied rather than imported for
 * the same reason as QaGeneratedContent/CurrentEventsGeneratedContent above.
 * `bullets`/`title` are what deckTextFromSlides (below) reads; `code`/
 * `codeLanguage`/`notes`/`graphic` are exactly what that text projection
 * DROPS - see this file's header comment on why `renderStructured` exists to
 * carry them into `structured` instead. */
export interface DeckGeneratedSlide {
  title: string;
  bullets: string[];
  code?: string;
  codeLanguage?: string;
  notes?: string;
  graphic?: unknown;
}

/** Structural mirror of GeneratedDeck (src/lib/decks/generate.ts) - see this
 * file's header comment for why this is a structural copy rather than an
 * import. */
export interface DeckGeneratedContent {
  presentationTitle: string;
  slides: DeckGeneratedSlide[];
}

/**
 * The exact text projection src/app/components/content-tab/utils.ts's
 * `slidesToText` performs (title + "## slide title" + "- bullet" lines,
 * nothing else) - REPRODUCED rather than imported, because that file pulls
 * in "@/app/actions" (requestFileUploadAction/addFileToModuleAction), which
 * would break this module's own DELIBERATELY-free-of-"@/app/actions"-or-
 * Supabase leaf property (see this file's header comment). Verified by
 * reading slidesToText directly: it destructures only `s.title` and
 * `s.bullets` off each slide, so it silently DROPS `code`, `codeLanguage`,
 * `notes` and `graphic` - exactly the fields DeckGeneratedSlide carries that
 * this function's return value does not. That is precisely why
 * `generated_artifacts.structured` exists (entry 261 check 11): this
 * function is what generates the LOSSY `text` half of a saved deck version;
 * `renderStructured` below (JSON.stringify-safe, keeps every field) is the
 * lossless half.
 */
function deckTextFromSlides(presentationTitle: string, slides: DeckGeneratedSlide[]): string {
  const parts: string[] = [`# ${presentationTitle}`];
  for (const slide of slides) {
    parts.push("", `## ${slide.title}`, ...slide.bullets.map((b) => `- ${b}`));
  }
  return parts.join("\n");
}

/** Structural mirror of generateModuleObjectivesForAssignment's success
 * shape (src/app/actions/module-objectives-generator.ts:47,67 -
 * `Promise<{ text: string } | { error: string }>`) - see this file's header
 * comment for why this is a structural copy rather than an import. */
export interface ObjectivesGeneratedContent {
  text: string;
}

/** One step of a generated assignment - mirrors AssignmentStep
 * (src/app/actions-types.ts:30-33), copied rather than imported for the same
 * leaf reason as every other TGenerated interface in this file. */
export interface AssignmentGeneratedStep {
  stepTitle: string;
  description: string;
}

/** Structural mirror of generateAssignmentAction's success shape,
 * AssignmentData (src/app/actions-types.ts:35-41; the generator itself is
 * src/app/actions/llm-content.ts:245-259,
 * `Promise<AssignmentData | { error: string }>`) - see this file's header
 * comment for why this is a structural copy rather than an import. */
export interface AssignmentGeneratedContent {
  title: string;
  overview: string;
  steps: AssignmentGeneratedStep[];
  tools: string[];
  deliverables: string[];
}

/**
 * Plain-text projection of a generated assignment - structurally similar to,
 * but NOT sharing code with (for the same leaf reason deckTextFromSlides
 * above documents), assignment-brief.ts's renderAssignmentHandout: that
 * function needs an AssignmentSpec/AssignmentBriefContext this registry's
 * render(generated) signature does not carry, so this is a smaller,
 * self-contained projection instead. A title line, "## Overview", numbered
 * "## What you will do" steps, then "## Tools" and "## Deliverables" - the
 * last three sections omitted (never emitted empty) when their content is
 * empty, mirroring renderAssignmentHandout's own empty-section rule.
 */
function assignmentTextFromGenerated(generated: AssignmentGeneratedContent): string {
  const parts: string[] = [`# ${generated.title}`, "", "## Overview", generated.overview];
  if (generated.steps.length > 0) {
    parts.push("", "## What you will do");
    generated.steps.forEach((step, i) => {
      parts.push(`${i + 1}. ${step.stepTitle}`);
      parts.push(`   ${step.description}`);
    });
  }
  if (generated.tools.length > 0) {
    parts.push("", "## Tools", ...generated.tools.map((t) => `- ${t}`));
  }
  if (generated.deliverables.length > 0) {
    parts.push("", "## Deliverables", ...generated.deliverables.map((d) => `- ${d}`));
  }
  return parts.join("\n");
}

/** One choice of a generated knowledge-check question - mirrors
 * KnowledgeCheckChoice (src/lib/knowledge-check-shape.ts:19-26), copied
 * rather than imported for the same leaf reason as every other TGenerated
 * interface in this file. */
export interface KnowledgeCheckGeneratedChoice {
  text: string;
  correct: boolean;
  explanation: string;
}

/** One generated knowledge-check question - mirrors KnowledgeCheckQuestion
 * (src/lib/knowledge-check-shape.ts:28-32). */
export interface KnowledgeCheckGeneratedQuestion {
  prompt: string;
  choices: KnowledgeCheckGeneratedChoice[];
}

/** Structural mirror of generateKnowledgeCheckAction's success shape
 * (src/app/actions/knowledge-check.ts:90-96,
 * `Promise<{ questions: KnowledgeCheckQuestion[] } | { error: string }>`) -
 * see this file's header comment for why this is a structural copy rather
 * than an import. */
export interface KnowledgeCheckGeneratedContent {
  questions: KnowledgeCheckGeneratedQuestion[];
}

/**
 * Plain-text projection of a knowledge check's questions - the LOSSY half
 * saved to generated_artifacts.text (a human-readable preview), mirroring
 * deckTextFromSlides's own text/structured split above: one prompt per
 * question, its choices as a checklist ("[x]" marking the correct one), a
 * wrong choice's explanation trailing in parentheses.
 * knowledgeChecksKindConfig.renderStructured (below) carries the exact
 * question/choice objects losslessly instead - re-parsing this text back
 * into structured choices for a Canvas quiz-question POST would be both
 * lossy (a choice's own text could itself contain "[x]" or parentheses) and
 * fragile, the same argument this file's header comment already makes for
 * decks.
 */
function knowledgeCheckTextFromQuestions(questions: KnowledgeCheckGeneratedQuestion[]): string {
  return questions
    .map((q, i) => {
      const choiceLines = q.choices.map((c) => {
        const marker = c.correct ? "[x]" : "[ ]";
        const explanation = c.correct ? "" : ` (${c.explanation})`;
        return `${marker} ${c.text}${explanation}`;
      });
      return [`Q${i + 1}: ${q.prompt}`, ...choiceLines].join("\n");
    })
    .join("\n\n");
}

/** Structural mirror of draftAnnouncementAction's success shape
 * (src/app/actions/messaging.ts:405-408,
 * `Promise<{ title: string; message: string } | { error: string }>`) - see
 * this file's header comment for why this is a structural copy rather than
 * an import. `title` is deliberately NOT rendered by this kind's `render`
 * (below) - that column is the artifact's own `title` field, set directly
 * by the runner from `generated.title`, mirroring how the runner already
 * extracts `presentationTitle` directly for decks rather than through a
 * config-level extractor (src/app/actions/lms-generation.ts:361,374). No
 * `renderStructured` either: unlike a deck's slides or a knowledge check's
 * questions, an announcement's only two fields already map 1:1 onto the
 * artifact row's `title` and `text` columns, so there is nothing left for a
 * `structured` payload to carry losslessly that those two columns do not
 * already carry. */
export interface AnnouncementGeneratedContent {
  title: string;
  message: string;
}

/** Structural mirror of generateLectureScriptAction's success shape
 * (src/app/actions/media.ts:228, `Promise<{script: string} | {error:
 * string}>`) - see this file's header comment for why this is a structural
 * copy rather than an import. */
export interface ScriptGeneratedContent {
  script: string;
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
  /** Present only when commitMode is "save-and-post" - the declarative
   * Canvas-commit metadata this kind needs (see GenerationCommitMeta's own
   * doc comment). Undefined for every "save-version" kind - kept optional
   * rather than always-present so the three existing kinds' configs did not
   * need to grow a field they have no use for. */
  commitMeta?: GenerationCommitMeta;
  /** Pure: the text saved into generated_artifacts.prompt - see
   * GenerationPromptMeta's own doc comment for what this is (and is not). */
  buildPrompt: (materialsText: string, meta: GenerationPromptMeta) => string;
  /** Pure: the generated_artifacts.text payload for a successful generation.
   * "qa" and "currentEvents" are pure text - neither ever populates
   * `structured` (see the migration's own comment: "every other kind is
   * expected to leave it null") - so this returns a plain string rather than
   * {text, structured}; "decks" ALSO returns a string here (the lossy
   * projection - see deckTextFromSlides above), and additionally populates
   * `renderStructured` below. */
  render: (generated: TGenerated) => string;
  /** Pure: the generated_artifacts.structured payload - undefined for every
   * kind except "decks" (its column stays null, per the migration's own
   * comment quoted above). Returns a JSON-serializable value rather than the
   * real `Json` type from src/lib/supabase/types.ts so this file can stay
   * free of any Supabase import (see this file's header comment); the caller
   * (the deck Route Handler, or refineGeneratedArtifactAction's deck branch)
   * casts it when building SaveGeneratedArtifactVersionInput. */
  renderStructured?: (generated: TGenerated) => unknown;
  /** Pure: true when a successful generate call produced nothing usable
   * (e.g. zero questions, zero researched topics) - mirrors
   * WeeklyGeneratorConfig's own `validate` skip-not-fail case
   * (steps.course-build-qa.ts: "the model returned no questions" is a skip,
   * never a failure). The caller uses this to avoid saving an empty
   * version. */
  isEmpty: (generated: TGenerated) => boolean;
  /** Human sentence for the isEmpty case. */
  emptyMessage: string;
  /** True when this kind's generated text is written to be SPOKEN ALOUD by
   * the instructor - e.g. read on camera, as opposed to posted, displayed or
   * handed to students to read themselves. Read by `kindDeliveredAloud`
   * (below), the same way `commitMode` is read by `kindOffersPost`
   * (src/app/components/content-tab/modules/useLmsGeneration.ts) - a
   * declarative field on the config rather than a hardcoded id comparison at
   * the call site, so a future spoken kind opts in here and every reader of
   * `kindDeliveredAloud` picks it up with no edit of its own
   * (docs/teleprompter-mode-acceptance-criteria.md, T1). Optional and left
   * ABSENT (never explicitly `false`) on every kind that is not spoken -
   * only scriptsKindConfig sets it, mirroring how `commitMeta` above is left
   * absent rather than set to some empty value on the kinds that do not use
   * it. */
  deliveredAloud?: boolean;
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

export const decksKindConfig: GenerationKindConfig<DeckGeneratedContent> = {
  id: "decks",
  artifactKind: "deck",
  label: "Lecture deck",
  needsCourseRow: true,
  commitMode: "save-version",
  buildPrompt: (materialsText, meta) =>
    `Slide deck for ${meta.courseName || "this course"} (${meta.moduleLabel})${
      meta.templateName ? ` using the "${meta.templateName}" template` : ""
    }, grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => deckTextFromSlides(generated.presentationTitle, generated.slides),
  renderStructured: (generated) => generated.slides,
  isEmpty: (generated) => generated.slides.length === 0,
  emptyMessage: "The model returned no slides for this selection.",
};

// CHUNK 3b's four new kinds, below - each "save-and-post" (R1/R2). Ids and
// artifactKind strings picked per this file's header comment.

export const objectivesKindConfig: GenerationKindConfig<ObjectivesGeneratedContent> = {
  id: "objectives",
  artifactKind: "module-objectives",
  label: "Module objectives",
  needsCourseRow: true,
  commitMode: "save-and-post",
  commitMeta: {
    canvasObjectKind: "page",
    publishedOnCreation: false,
    placement: "module-item",
  },
  buildPrompt: (materialsText, meta) =>
    `Module objectives for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => generated.text,
  isEmpty: (generated) => !generated.text.trim(),
  emptyMessage: "The model returned no module objectives for this selection.",
};

export const assignmentsKindConfig: GenerationKindConfig<AssignmentGeneratedContent> = {
  id: "assignments",
  artifactKind: "assignment",
  label: "Assignment",
  needsCourseRow: true,
  commitMode: "save-and-post",
  commitMeta: {
    canvasObjectKind: "assignment",
    publishedOnCreation: false,
    placement: "module-item",
  },
  buildPrompt: (materialsText, meta) =>
    `Assignment for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => assignmentTextFromGenerated(generated),
  isEmpty: (generated) => generated.steps.length === 0,
  emptyMessage: "The model returned no assignment steps for this selection.",
};

export const knowledgeChecksKindConfig: GenerationKindConfig<KnowledgeCheckGeneratedContent> = {
  id: "knowledgeChecks",
  artifactKind: "knowledge-check",
  label: "Knowledge check",
  needsCourseRow: true,
  commitMode: "save-and-post",
  commitMeta: {
    canvasObjectKind: "quiz",
    publishedOnCreation: false,
    placement: "module-item",
  },
  buildPrompt: (materialsText, meta) =>
    `Knowledge check quiz for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => knowledgeCheckTextFromQuestions(generated.questions),
  renderStructured: (generated) => generated.questions,
  isEmpty: (generated) => generated.questions.length === 0,
  emptyMessage: "The model returned no knowledge check questions for this selection.",
};

export const announcementsKindConfig: GenerationKindConfig<AnnouncementGeneratedContent> = {
  id: "announcements",
  artifactKind: "announcement",
  label: "Announcement",
  needsCourseRow: true,
  commitMode: "save-and-post",
  commitMeta: {
    canvasObjectKind: "announcement",
    publishedOnCreation: true,
    placement: "course-level",
  },
  buildPrompt: (materialsText, meta) =>
    `Announcement for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => generated.message,
  isEmpty: (generated) => !generated.title.trim() || !generated.message.trim(),
  emptyMessage: "The model returned no usable announcement for this selection.",
};

// CHUNK 3d's one new kind, below - "save-version" like qa/currentEvents/
// decks above, not the four "save-and-post" kinds. See this file's header
// comment for why.

export const scriptsKindConfig: GenerationKindConfig<ScriptGeneratedContent> = {
  id: "scripts",
  artifactKind: "lecture-script",
  label: "Lecture script",
  needsCourseRow: true,
  commitMode: "save-version",
  buildPrompt: (materialsText, meta) =>
    `Lecture script for ${meta.courseName || "this course"} (${meta.moduleLabel})${
      meta.targetMinutes ? ` targeting ${meta.targetMinutes} minutes` : ""
    }, grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => generated.script,
  isEmpty: (generated) => !generated.script.trim(),
  emptyMessage: "The model returned no lecture script for this selection.",
  // The one kind meant to be read aloud on camera - see `deliveredAloud`'s
  // own doc comment above. Every other kind config in this file leaves this
  // field absent rather than setting it to `false`.
  deliveredAloud: true,
};

/**
 * Whether a kind's saved `text` IS the whole artifact, so hand-editing that
 * text produces a complete, self-consistent version (chunk 3e,
 * docs/generated-artifact-editing-acceptance-criteria.md, E1/E4).
 *
 * True for every kind with no `renderStructured`. False for "decks" and
 * "knowledgeChecks", whose `structured` payload is the AUTHORITATIVE half:
 * a deck's .pptx download reads `structured`, and a knowledge check's Canvas
 * post reads `structured` - neither reads `text`, which is only a lossy
 * projection (see deckTextFromSlides and knowledgeCheckTextFromQuestions
 * above). Saving hand-edited text for those kinds would produce a version
 * whose two halves disagree, where the download and the post silently ignore
 * the edit - precisely the loss the knowledgeChecks refine branch was added
 * to prevent (src/app/actions/lms-generation.ts).
 *
 * DERIVED, never a hardcoded id list, so a future kind that adds a
 * `renderStructured` is excluded from editing automatically rather than
 * needing someone to remember to exclude it.
 */
export function kindSupportsTextEdit(id: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[id].renderStructured === undefined;
}

/**
 * Whether a kind's generated text is meant to be spoken aloud by the
 * instructor - the gate the teleprompter's entry point reads to decide which
 * kinds may enter teleprompter mode (docs/teleprompter-mode-acceptance-
 * criteria.md, T1). True today only for "scripts".
 *
 * Reads `deliveredAloud` off the config rather than comparing `id === "scripts"`
 * at the call site, for the same reason `kindOffersPost`
 * (src/app/components/content-tab/modules/useLmsGeneration.ts) reads
 * `commitMode` instead of hardcoding an id list: a future spoken kind opts in
 * by declaring `deliveredAloud: true` on its own config, and this predicate -
 * and everything that calls it - needs no edit when that happens.
 */
export function kindDeliveredAloud(id: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[id].deliveredAloud === true;
}

/** Keyed lookup so a caller with a `GenerationKindId` gets back a config
 * typed to that exact kind's generated-content shape, rather than a widened
 * union it would have to narrow again. */
export const GENERATION_KIND_CONFIGS = {
  qa: qaKindConfig,
  currentEvents: currentEventsKindConfig,
  decks: decksKindConfig,
  objectives: objectivesKindConfig,
  assignments: assignmentsKindConfig,
  knowledgeChecks: knowledgeChecksKindConfig,
  announcements: announcementsKindConfig,
  scripts: scriptsKindConfig,
} satisfies Record<GenerationKindId, GenerationKindConfig<never>>;
