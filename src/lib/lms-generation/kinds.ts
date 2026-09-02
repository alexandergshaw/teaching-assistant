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
// EIGHTH kind, "scripts" - originally a lecture script generated from the
// selected module materials, grounding generateLectureScriptAction
// (src/app/actions/media.ts:228) the same way the other seven kinds ground
// their own generators. Unlike every kind above, "scripts" has no
// OUTPUT_FAMILIES entry: see NON_FAMILY_KIND_IDS' own doc comment for why,
// and GenerationKindId's doc comment for what that costs (nothing, for the
// other seven) and what it does not cost (their per-id compile-time rename
// protection, unchanged). "scripts" is plain text, "save-version" only -
// same shape as qa/currentEvents/decks above, not the four "save-and-post"
// kinds - because a script is instructor material, not something to publish
// to students (see scriptsKindConfig's own comment).
//
// CHUNK 3g (docs/module-intro-video-script-acceptance-criteria.md, M1-M4)
// RE-GEARS "scripts" IN PLACE rather than replacing it: it now produces the
// script for a short MODULE INTRO VIDEO - the piece an instructor records to
// camera and posts at the top of a course module, previewing what the
// module covers, instead of a full 5-30 minute lecture. The id ("scripts"),
// `artifactKind` ("lecture-script") and `needsCourseRow`/`commitMode`/
// `deliveredAloud` are all UNCHANGED - see finding 2 of that doc for why
// `artifactKind` in particular must never change (it is the sole
// version-history query key; renaming it would orphan every already-saved
// version with no migration path). Only `label`, `buildPrompt`'s audit text
// and `emptyMessage` change, plus the generator wired to this kind in
// src/app/actions/lms-generation.ts's `case "scripts"` (now
// generateModuleIntroScriptAction, media.ts - generateLectureScriptAction
// itself is untouched and keeps its other callers, per that doc's reuse
// survey).
//
// CHUNK 3f (docs/teleprompter-mode-acceptance-criteria.md, T1) adds no new
// kind, only a new declarative field - `deliveredAloud` - so the teleprompter
// entry point can ask "does this kind's text get read aloud on camera" without
// hardcoding `kindId === "scripts"` anywhere it is consumed. Set true on
// scriptsKindConfig only; see `deliveredAloud`'s and `kindDeliveredAloud`'s
// own doc comments for the full reasoning, which mirrors commitMode/
// kindOffersPost's existing declarative-flag pattern.
//
// docs/learning-resources-page-acceptance-criteria.md (A1-A5) adds a NINTH
// kind: "resources", a student-facing Learning Resources page posted into
// the selected module as a Canvas Page, generated from the same selection
// materials every other kind grounds on. Like "scripts" (chunk 3d), it has NO
// OUTPUT_FAMILIES entry - there is no "resources" output family, and inventing
// one would cost COURSE_BUILD's run form a dead multi-select option nobody
// asked for, exactly as NON_FAMILY_KIND_IDS' own doc comment already argues
// for "scripts" - so it joins that carve-out (A1) rather than the
// Extract-derived union. Unlike "scripts", it IS "save-and-post" (A3): its
// commitMeta is byte-identical in shape to objectivesKindConfig's
// (`canvasObjectKind: "page"`, `placement: "module-item"`,
// `publishedOnCreation: false`), which is what makes the entire post pipeline
// (commit-plan.ts / commit-execute.ts / post-content.ts) apply to it
// unmodified - see resourcesKindConfig's own comment below and this feature's
// AC doc, finding A12.
//
// docs/intro-discussion-from-modules-acceptance-criteria.md (chunk A of the
// "two module-anchored graded items" backlog group, AC4-AC7 as amended by
// section 5b's W1) adds a TENTH kind: "introDiscussion", an "introduce
// yourself and talk about your career as it relates to this course" graded
// discussion posted into the checkmarked module. It joins "scripts" and
// "resources" in NON_FAMILY_KIND_IDS for the identical reason (no
// OUTPUT_FAMILIES member exists for it). It is "save-and-post" like
// objectives/assignments/knowledgeChecks/announcements/resources, but is the
// FIRST kind whose commitMeta.canvasObjectKind is "discussion" rather than
// page/assignment/quiz/announcement - see GenerationCommitMeta's own doc
// comment below for that addition. Per W1, IntroDiscussionGeneratedContent
// carries NO `pointsPossible` field: saveGeneratedArtifactVersion persists
// only title/text/structured, so a model-supplied points value would be
// discarded at save time and could never reach Canvas. Points are the
// constant INTRO_DISCUSSION_POINTS owned by
// src/lib/lms-generation/intro-discussion-deadlines.ts (a sibling chunk of
// this same feature), applied at post time, not here.
import type { OutputFamily } from "@/lib/output-selection";
// Type-only, from another dependency-free leaf (generation-diag.ts's own
// header comment) - see GenerationFailure's own `diag` field doc comment for
// why this one exception exists on an otherwise "@/app/actions"/Supabase-free
// file.
import type { ScriptGenerationServerDiag } from "./generation-diag";
// The ten per-kind content shapes and config objects moved to
// ./kind-configs.ts (a STRUCTURAL split, no behaviour change) once this file
// pushed past the project's 1000-line ceiling. Imported here (not merely
// re-exported) because GENERATION_KIND_CONFIGS below needs the actual config
// values to build its lookup map; `export * from "./kind-configs"` further
// down re-exports every name from that file (values and types alike) so no
// consumer's import path changes - see that new file's own header comment.
import {
  qaKindConfig,
  currentEventsKindConfig,
  decksKindConfig,
  objectivesKindConfig,
  assignmentsKindConfig,
  knowledgeChecksKindConfig,
  announcementsKindConfig,
  scriptsKindConfig,
  resourcesKindConfig,
  introDiscussionKindConfig,
} from "./kind-configs";

/**
 * Kind ids that are NOT members of OUTPUT_FAMILIES, carved out here
 * explicitly rather than smuggled into the Extract union below. This is
 * "scripts" (chunk 3d) and "resources" (the Learning Resources page,
 * docs/learning-resources-page-acceptance-criteria.md, A1).
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
 * "resources" joins this same carve-out for the identical reason: it is a
 * single-shot, LMS-selection-driven generation kind with no COURSE_BUILD
 * step behind it and no "resources" output family to speak of. "introDiscussion"
 * (docs/intro-discussion-from-modules-acceptance-criteria.md) joins for the
 * same reason again - see this file's header comment.
 *
 * WHAT THIS CARVE-OUT DOES NOT COST: the seven family-backed ids below keep
 * their existing per-id compile-time rename protection unchanged - the
 * Extract still fails to compile if any of THOSE seven were ever renamed in
 * OutputFamily. Unioning a non-family id in alongside them does not weaken
 * that. What the Extract's protection never covered, even before this
 * carve-out, is completeness against some other list - see kinds.test.ts's
 * disjointness test for how that gap is covered instead.
 */
export const NON_FAMILY_KIND_IDS = ["scripts", "resources", "introDiscussion"] as const;

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
  "resources",
  "introDiscussion",
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
   * error (see course-not-linked.ts's isCourseNotLinkedMessage) - lets the
   * caller offer "link this course" instead of a generic error banner,
   * rather than treating this the same as any other failure. */
  courseNotLinked?: true;
  /** Job 4 of the "intro video script never comes up as a modal" bug report
   * fix: the server-side half of a downloadable diagnostic record
   * (ScriptGenerationServerDiag, src/lib/lms-generation/generation-diag.ts),
   * populated ONLY by generateFromSelectionAction's "scripts" case
   * (src/app/actions/lms-generation.ts) - every other kind, and every other
   * action returning this shape (postGeneratedArtifactAction,
   * refineGeneratedArtifactAction, listGeneratedArtifactVersionsAction),
   * leaves this undefined. Declared here (mirroring GenerateFromSelectionSuccess's
   * own `diag` field, lms-generation.ts) so a failure ANYWHERE in that one
   * kind's path - including a course-resolution failure, before generation
   * itself even starts - can still carry whatever diagnostic facts had
   * already been gathered, not only a successful generation. Left as `unknown`
   * import-free here (this file is a leaf - see its own header comment) is
   * not an option for a typed field, so this one exception imports the type
   * from generation-diag.ts, itself ALSO a dependency-free leaf (no
   * "@/app/actions", no Supabase) - see that file's own header comment. */
  diag?: ScriptGenerationServerDiag;
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
  /** Which Canvas object this kind's post creates. "discussion" (added by
   * docs/intro-discussion-from-modules-acceptance-criteria.md, introDiscussion)
   * is a hand-copied DUPLICATE of CanvasPostKind (src/lib/lms-generation/
   * commit-plan.ts) - kept as a literal here, deliberately, per this file's
   * own leaf rule (see the header comment): this file may not import from
   * commit-plan.ts without breaking that rule. kinds.test.ts carries a
   * type-level assertion that every value of this field is assignable to
   * CanvasPostKind, so the two unions cannot silently drift apart. */
  canvasObjectKind: "page" | "assignment" | "quiz" | "announcement" | "discussion";
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

// QaGeneratedContent, CurrentEventsGeneratedContent, DeckGeneratedSlide,
// DeckGeneratedContent, ObjectivesGeneratedContent, AssignmentGeneratedStep,
// AssignmentGeneratedContent, KnowledgeCheckGeneratedChoice,
// KnowledgeCheckGeneratedQuestion, KnowledgeCheckGeneratedContent,
// AnnouncementGeneratedContent, ScriptGeneratedContent,
// ResourcesGeneratedContent, IntroDiscussionGeneratedContent (the ten
// structural per-kind content shapes) and the three pure text-projection
// helpers (deckTextFromSlides, assignmentTextFromGenerated,
// knowledgeCheckTextFromQuestions) moved to ./kind-configs.ts (a STRUCTURAL
// split, no behaviour change) once this file pushed past the project's
// 1000-line ceiling - re-exported below (`export * from "./kind-configs"`) so
// no consumer's import path changes. See that new file's own header comment
// for the full rationale.

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
  /** True when this kind's `title` column is a real content field the
   * instructor authored and can edit, NOT a label derived at generate time
   * from a module name. Named for that fact, not for what any UI does with
   * it - "Subject" is the announcement's own UI label for its `title`, not
   * the fact this field records, which is why this is `titleIsContent` and
   * not `subjectIsEditable`. Only `announcementsKindConfig` sets it today;
   * `introDiscussionKindConfig` shares the exact same `{title, message}`
   * shape (see IntroDiscussionGeneratedContent above) and is the obvious next
   * kind to opt in, requiring no code change anywhere else - it simply is not
   * part of this chunk. Optional and left ABSENT (never explicitly `false`)
   * on every kind that does not opt in, mirroring `deliveredAloud` immediately
   * above. */
  titleIsContent?: boolean;
}

export * from "./kind-configs";

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

/**
 * Whether a kind's `title` column is real, instructor-authored content
 * rather than a label derived at generate time from a module name - reads
 * `titleIsContent` off the config rather than hardcoding `id === "announcements"`
 * at the call site, for the same reason `kindDeliveredAloud` above reads
 * `deliveredAloud` instead of hardcoding `id === "scripts"`: a future kind
 * (e.g. `introDiscussion`, which shares announcements' `{title, message}`
 * shape) opts in by declaring `titleIsContent: true` on its own config, and
 * this predicate - and everything that calls it - needs no edit when that
 * happens.
 */
export function kindTitleIsContent(id: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[id].titleIsContent === true;
}

/**
 * Whether posting this kind makes it visible to students the instant it is
 * created, with no unpublished-draft state in between. Reads
 * `commitMeta?.publishedOnCreation` - the honest source of this fact, already
 * carrying its full rationale at GenerationCommitMeta's own `publishedOnCreation`
 * doc comment above - rather than hardcoding `id === "announcements"` at the
 * call site, so a caller can ask "does this kind's post go live immediately"
 * without knowing which kind that is today. Today only "announcements"
 * declares `publishedOnCreation: true`; every other "save-and-post" kind
 * (objectives/assignments/knowledgeChecks/resources/introDiscussion) creates
 * an UNPUBLISHED Canvas object, and every "save-version" kind has no
 * `commitMeta` at all, so this is `false` for all of them.
 */
export function kindPostsImmediately(id: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[id].commitMeta?.publishedOnCreation === true;
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
  resources: resourcesKindConfig,
  introDiscussion: introDiscussionKindConfig,
} satisfies Record<GenerationKindId, GenerationKindConfig<never>>;
