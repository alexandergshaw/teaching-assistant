// The ten per-kind content shapes and their GenerationKindConfig objects -
// split out of kinds.ts (a STRUCTURAL split, no behaviour change) once that
// file's own registry-plus-metadata content pushed past the project's
// 1000-line ceiling. Everything below is exactly what kinds.ts declared
// before the split, moved verbatim: kinds.ts still owns the REGISTRY (ids,
// the failure shape, the commit-mode/commit-meta/prompt-meta types, the
// GenerationKindConfig interface itself, the derived predicates, and
// GENERATION_KIND_CONFIGS), and re-exports every name below unchanged (`export
// * from "./kind-configs"`), so no consumer of kinds.ts changes its import
// path - see kinds.ts's own header comment for the full rationale on why that
// re-export is safe here (this file, unlike src/app/actions/lms-generation.ts,
// is NOT "use server" - a plain module re-exporting a type or const from
// another plain module is not the hazard that file's header comment warns
// about).
//
// DELIBERATELY FREE of any "@/app/actions" or Supabase import, matching
// kinds.ts's own leaf rule (see that file's header comment) - this file is
// leaf of a leaf. `GenerationKindConfig` (and the handful of sibling types
// each config's shape needs) is imported TYPE-ONLY from "./kinds" - erased
// entirely by the "use server"-adjacent `import type` form, so this is not a
// runtime import cycle: kinds.ts imports the VALUES below back from this
// file, this file imports only TYPES from kinds.ts, and a type-only import
// leaves nothing behind in the compiled output for a cycle to run through
// (see AGENTS.md's own caution on back-importing a constant into an
// extracted leaf - a type is not a constant, and `import type` guarantees
// that distinction holds even under this project's isolatedModules setting).
import type { GenerationKindConfig } from "./kinds";

/** Structural mirror of generateLectureQaAction's success shape
 * (src/app/actions/course-planning-lecture.ts) - see kinds.ts's header
 * comment for why this is a structural copy rather than an import. */
export interface QaGeneratedContent {
  questions: Array<{ question: string; answer: string }>;
  examples?: Array<{ title: string; language: string; code: string; explanation: string }>;
}

/** Structural mirror of researchCurrentEventsAction's ResearchCurrentEventsResult
 * (src/app/actions/current-events.ts) - see kinds.ts's header comment for
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
 * DROPS - see kinds.ts's header comment on why `renderStructured` exists to
 * carry them into `structured` instead. */
export interface DeckGeneratedSlide {
  title: string;
  bullets: string[];
  code?: string;
  codeLanguage?: string;
  notes?: string;
  graphic?: unknown;
}

/** Structural mirror of GeneratedDeck (src/lib/decks/generate.ts) - see
 * kinds.ts's header comment for why this is a structural copy rather than an
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
 * Supabase leaf property (see kinds.ts's header comment). Verified by
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
 * `Promise<{ text: string } | { error: string }>`) - see kinds.ts's header
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
 * `Promise<AssignmentData | { error: string }>`) - see kinds.ts's header
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
 * see kinds.ts's header comment for why this is a structural copy rather
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
 * fragile, the same argument kinds.ts's header comment already makes for
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
 * kinds.ts's header comment for why this is a structural copy rather than
 * an import. `title` is deliberately NOT rendered by this kind's `render`
 * (below) - that column is the artifact's own `title` field, set directly
 * by the runner from `generated.title`, mirroring how the runner already
 * extracts `presentationTitle` directly for decks rather than through a
 * config-level extractor (src/app/actions/lms-generation.ts). No
 * `renderStructured` either: unlike a deck's slides or a knowledge check's
 * questions, an announcement's only two fields already map 1:1 onto the
 * artifact row's `title` and `text` columns, so there is nothing left for a
 * `structured` payload to carry losslessly that those two columns do not
 * already carry. */
export interface AnnouncementGeneratedContent {
  title: string;
  message: string;
}

/** Structural mirror of generateModuleIntroScriptAction's success shape
 * (src/app/actions/media.ts, `Promise<({script: string} | {error: string}) &
 * {diag: ScriptGenerationLlmDiag}>` - the `& {diag: ...}` half is the Job 4
 * diagnostic-log addition, present on BOTH branches, and irrelevant to this
 * structural mirror, which exists only to describe the `{script}` success
 * shape) - the generator scriptsKindConfig grounds since the CHUNK 3g re-gear
 * (see kinds.ts's header comment). Also happens to match
 * generateLectureScriptAction's own return shape, since both share the same
 * `{script}` success/`{error}` failure contract - see kinds.ts's header
 * comment for why this is a structural copy rather than an import either
 * way. */
export interface ScriptGeneratedContent {
  script: string;
}

/** Structural mirror of generateLearningResourcesForSelection's success shape
 * (src/app/actions/learning-resources-generator.ts,
 * `Promise<{ text: string } | { error: string }>`) - see kinds.ts's header
 * comment for why this is a structural copy rather than an import. Same
 * `{ text }` shape as ObjectivesGeneratedContent/ScriptGeneratedContent above
 * (A4/D4): a resources page is prose an instructor will want to hand-edit in
 * the preview modal before posting, so it deliberately carries no structured
 * payload of its own. */
export interface ResourcesGeneratedContent {
  text: string;
}

/** Structural mirror of generateIntroDiscussionForSelection's success shape
 * (src/app/actions/intro-discussion-generator.ts, a sibling chunk of this
 * same feature) - see kinds.ts's header comment for why this is a
 * structural copy rather than an import. Deliberately carries NO
 * `pointsPossible` field - see kinds.ts's header comment (the
 * introDiscussion paragraph) and section 5b/W1 of
 * docs/intro-discussion-from-modules-acceptance-criteria.md for why: points
 * are the constant `INTRO_DISCUSSION_POINTS`, applied at post time, never a
 * model-supplied value that `saveGeneratedArtifactVersion` would silently
 * discard. */
export interface IntroDiscussionGeneratedContent {
  title: string;
  /** The discussion prompt as markdown. markdownLiteToHtml runs in
   * post-content.ts, never here - see kinds.ts's header comment on why this
   * module stays free of any Canvas-write concern. */
  message: string;
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
// artifactKind strings picked per kinds.ts's header comment.

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
  // The announcement's `title` column IS the "Subject" line the instructor
  // wrote, not a label derived from the module name at generate time - see
  // `titleIsContent`'s own doc comment (kinds.ts).
  titleIsContent: true,
};

// CHUNK 3d's one new kind, below - "save-version" like qa/currentEvents/
// decks above, not the four "save-and-post" kinds. See kinds.ts's header
// comment for why. Re-geared in place by CHUNK 3g (see that entry in
// kinds.ts's header comment) to produce a module intro video script rather
// than a full lecture script - `id`, `artifactKind`, `needsCourseRow`,
// `commitMode` and `deliveredAloud` are unchanged; only `label`,
// `buildPrompt`'s audit text and `emptyMessage` name the new purpose.

export const scriptsKindConfig: GenerationKindConfig<ScriptGeneratedContent> = {
  id: "scripts",
  artifactKind: "lecture-script",
  label: "Intro video script",
  needsCourseRow: true,
  commitMode: "save-version",
  // `buildPrompt` here is the RECONSTRUCTED audit-trail text saved to
  // generated_artifacts.prompt (see GenerationPromptMeta's own doc comment,
  // kinds.ts), not the literal prompt sent to the model - that is composed by
  // composeModuleIntroScriptPrompt (src/lib/lms-generation/intro-script-
  // prompt.ts), called from generateModuleIntroScriptAction (media.ts). It
  // names a module intro video script so the version history's own record
  // of what was asked for stays honest (M3).
  buildPrompt: (materialsText, meta) =>
    `Module intro video script for ${meta.courseName || "this course"} (${meta.moduleLabel})${
      meta.targetMinutes ? ` targeting ${meta.targetMinutes} minutes` : ""
    }, grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => generated.script,
  isEmpty: (generated) => !generated.script.trim(),
  emptyMessage: "The model returned no intro video script for this selection.",
  // The one kind meant to be read aloud on camera - see `deliveredAloud`'s
  // own doc comment (kinds.ts). Every other kind config in this file leaves
  // this field absent rather than setting it to `false`. Still correct after
  // the M1-M4 re-gear: an intro video script is read to camera exactly like a
  // lecture script was, so the teleprompter gate is unchanged (M4).
  deliveredAloud: true,
};

// The Learning Resources kind, below (docs/learning-resources-page-
// acceptance-criteria.md, A1-A5) - "save-and-post" like objectives/
// assignments/knowledgeChecks/announcements above, not "scripts"' own
// "save-version" (kinds.ts's header comment explains why "resources" still
// joins NON_FAMILY_KIND_IDS despite that difference: no OUTPUT_FAMILIES
// member exists for it either).

export const resourcesKindConfig: GenerationKindConfig<ResourcesGeneratedContent> = {
  id: "resources",
  // Permanent (A2/D5) - the sole version-history query key
  // (generated_artifacts is keyed on (courseId, kind)). Distinct from every
  // other artifactKind string above and kebab-case, matching the convention
  // kinds.ts's header comment records for all of them.
  artifactKind: "learning-resources",
  label: "Learning resources",
  needsCourseRow: true,
  commitMode: "save-and-post",
  // Byte-identical in shape to objectivesKindConfig's commitMeta (A3) - this
  // is deliberate, not a coincidence: it is what lets the entire post
  // pipeline (planModuleTarget/planPostSteps/executePostPlanSteps/
  // buildPostContentForKind's "page" branch) apply to this kind completely
  // unmodified, exactly as this feature's AC doc requires (A12).
  commitMeta: {
    canvasObjectKind: "page",
    publishedOnCreation: false,
    placement: "module-item",
  },
  // A5: this is the RECONSTRUCTED audit-trail text saved to
  // generated_artifacts.prompt (see GenerationPromptMeta's own doc comment,
  // kinds.ts), not the literal prompt sent to the model - that is composed by
  // generateLearningResourcesForSelection itself
  // (src/app/actions/learning-resources-generator.ts, A7).
  buildPrompt: (materialsText, meta) =>
    `Learning resources for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => generated.text,
  isEmpty: (generated) => !generated.text.trim(),
  // A4: names this kind specifically, so a blank model response here reads
  // distinctly from objectives'/scripts' own empty-response message.
  emptyMessage: "The model returned no learning resources for this selection.",
};

// The intro discussion kind, below (docs/intro-discussion-from-modules-
// acceptance-criteria.md, AC4-AC7 as amended by section 5b's W1) -
// "save-and-post" like objectives/assignments/knowledgeChecks/announcements/
// resources above, and the FIRST kind whose commitMeta.canvasObjectKind is
// "discussion" rather than page/assignment/quiz/announcement (see
// GenerationCommitMeta's own doc comment, kinds.ts). No `renderStructured` -
// this keeps `kindSupportsTextEdit` true for this kind, so the generated
// prompt stays hand-editable in the preview modal before posting, exactly
// like objectives/assignments/resources. No `deliveredAloud` either - a
// discussion prompt is posted for students to read, never read aloud on
// camera.

export const introDiscussionKindConfig: GenerationKindConfig<IntroDiscussionGeneratedContent> = {
  id: "introDiscussion",
  // Permanent (A2/D5 precedent) - the sole version-history query key
  // (generated_artifacts is keyed on (courseId, kind)). Distinct from every
  // other artifactKind string above and kebab-case, matching kinds.ts's
  // header-comment convention.
  artifactKind: "intro-discussion",
  label: "Intro discussion",
  needsCourseRow: true,
  commitMode: "save-and-post",
  commitMeta: {
    canvasObjectKind: "discussion",
    // Every non-announcement creation path in this tab creates unpublished;
    // an instructor publishes when ready - same reasoning as
    // objectives/assignments/knowledgeChecks/resources above.
    publishedOnCreation: false,
    placement: "module-item",
  },
  // This is the RECONSTRUCTED audit-trail text saved to
  // generated_artifacts.prompt (see GenerationPromptMeta's own doc comment,
  // kinds.ts), not the literal prompt sent to the model - that is composed by
  // the generator itself (src/app/actions/intro-discussion-generator.ts, a
  // sibling chunk of this same feature).
  buildPrompt: (materialsText, meta) =>
    `Introduce-yourself discussion for ${meta.courseName || "this course"} (${meta.moduleLabel}), grounded in the following selected material:\n\n${materialsText}`,
  render: (generated) => generated.message,
  isEmpty: (generated) => !generated.title.trim() || !generated.message.trim(),
  // Names this kind specifically, so a blank model response here reads
  // distinctly from objectives'/resources'/announcements' own empty-response
  // message - same convention as every other kind's emptyMessage above.
  emptyMessage: "The model returned no intro discussion for this selection.",
};
