// Input/output shapes for src/app/actions/lms-generation.ts's three actions -
// split into this plain leaf (STRUCTURAL split, no behaviour change) once
// that file pushed past the project's 1000-line ceiling. These types are
// used ONLY inside lms-generation.ts itself as parameter/return types - no
// other file imports them by name (every consumer of the three actions
// imports the ASYNC FUNCTIONS and lets TypeScript infer their return shape
// structurally, per lms-generation.ts's own header comment on why a "use
// server" module may not re-export a type it did not itself declare). That is
// exactly what makes this split safe: moving these interfaces out costs no
// consumer an import path change, unlike GenerationFailure (kinds.ts), which
// genuinely is imported elsewhere and therefore stays put.
//
// This file is free of any "@/app/actions" or Supabase import, matching
// kinds.ts's own leaf rule (see that file's header comment) - every type
// referenced below is imported from another already-leaf module.
import type { SelectedMaterialItem } from "./materials";
import type { GenerationKindId } from "./kinds";
import type { ModuleTarget, PostSummary } from "./commit-plan";
import type { ScriptGenerationServerDiag } from "./generation-diag";
import type { LlmProvider } from "@/lib/llm";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";

export interface GenerateFromSelectionInput {
  courseUrl: string;
  /** An export-sourced selection's course_hub row id - the generation
   * counterpart of useSelectionDownload.ts's own `courseId` param, threaded
   * through from ContentTab/ModulesView (`exportCourseId`) the same way.
   * Undefined for a live selection, which still resolves by `courseUrl`
   * alone - see resolveGenerationCourseRow's own doc comment above. */
  courseId?: string;
  /** M12: the LMS tab's active institution acronym (ContentTab's
   * `activeInstitution` / ModulesView's `acronym` prop) - threaded through to
   * resolveGenerationCourseRow so a host-less `courseUrl` (the shape
   * CoursePicker.tsx/LmsCell.tsx actually emit) still resolves to the right
   * row. Ignored when `courseId` is present. Optional and safe to omit -
   * resolveGenerationCourseRow's own doc comment covers the fallback. */
  acronym?: string;
  kind: GenerationKindId;
  /** Already-resolved selection entries - see SelectedMaterialItem's own doc
   * comment (materials.ts). Resolving a raw selection key against a loaded
   * module tree / course export is the caller's job. */
  items: SelectedMaterialItem[];
  /** Whole-module selections - Canvas module ids ONLY, expanded server-side
   * into their live items via expandModuleSelection - see this file's header
   * comment. Deliberately NOT the discriminated "live:<id>"/"export:<ref>"
   * module-key scheme useModuleSelection.ts's `selectedModules` now uses:
   * an export-sourced module selection has no server-side fetch path at all,
   * so the CALLER (useLmsGeneration.ts) already expands it into concrete
   * `items` entries before this action is ever called, and only the live
   * remainder is sent here as a plain numeric id. Optional/defaults to none,
   * so every existing caller sending only `items` is unaffected. A mixed
   * selection (some modules AND some loose items) is deduped, never
   * double-counted. */
  moduleIds?: number[];
  /** Human label for what was selected (e.g. a module name, or "3 items
   * across 2 modules") - folded into the saved prompt text and, for "qa",
   * into generateLectureQaAction's moduleName argument. Defaults to "the
   * selected material". */
  moduleLabel?: string;
  provider?: LlmProvider;
  /** "currentEvents" only - ignored for "qa". Blank/omitted defaults to
   * researchCurrentEventsAction's own default ("the past 30 days"). */
  recentWindow?: string;
  /** "scripts" only - ignored by every other kind. The requested intro video
   * script length in minutes (re-geared from a lecture length by
   * docs/module-intro-video-script-acceptance-criteria.md, M15). Absent or
   * unrecognised resolves to DEFAULT_SCRIPT_MINUTES via resolveScriptMinutes
   * (script-length.ts), so a stale or hand-edited value produces the
   * documented default rather than a failed generation
   * (docs/lms-script-generation-acceptance-criteria.md, S7/finding 7).
   * generateModuleIntroScriptAction itself REFUSES an out-of-range length
   * outright (src/lib/lecture-script-bounds.ts), so this resolution is what
   * keeps this UI's own values inside the range it accepts. */
  targetMinutes?: number;
}

export interface GenerateFromSelectionSuccess {
  artifact: GeneratedArtifact;
  /** Materials-gathering notes (omitted descriptions, truncation, export-item
   * limitations, per-item fetch failures) - surfaced so the instructor can
   * see what the generation was actually grounded on. */
  notes: string[];
  /** D3/AC14i: the course's own `startDate`, so the CLIENT can compute a
   * discussion's deadlines in ITS OWN timezone (see useLmsGeneration.ts's
   * `post()`). Populated only by "introDiscussion"; every other kind omits it. */
  startDate?: string | null;
  /** Job 4 diag log - see GenerationFailure's own `diag` field doc comment
   * (kinds.ts) for the full rationale. Populated only by the "scripts" case
   * below. */
  diag?: ScriptGenerationServerDiag;
}

export interface PostGeneratedArtifactInput {
  courseUrl: string;
  /** See GenerateFromSelectionInput's own doc comment - same identifier,
   * same source-aware resolution. In practice this is never sent for an
   * export selection: useLmsGeneration.ts's own `post()` refuses client-side
   * first (contentSourceGating.ts's gateOperation "courseWrite" - posting
   * writes to Canvas, which an export selection has no connection to) before
   * this action is ever called. Accepted here anyway so this action's own
   * course resolution stays consistent with every other generation action's
   * (AC2), rather than being the one exception. */
  courseId?: string;
  /** M12: see GenerateFromSelectionInput's own doc comment - same identifier,
   * same threading into resolveGenerationCourseRow. */
  acronym?: string;
  kind: GenerationKindId;
  /** The saved version to post - generated_artifacts.id (GeneratedArtifact.id).
   * The row is re-read fresh from the database by this action (P2) - only
   * the identity travels in this input, never the content itself, so a
   * preview modal that has been open a while can never post stale
   * client-side text. */
  artifactId: string;
  /** Where the post lands (P5) - required for every kind whose
   * commitMeta.placement is "module-item"; ignored (may be omitted) for a
   * "course-level" kind such as announcements, which has no module to
   * choose at all. */
  target?: ModuleTarget;
  /** "introDiscussion" only - D3/AC14i: absolute Canvas instants ALREADY
   * computed client-side (instructor's own timezone) plus a `note` describing
   * them. Optional: an omitting caller gets no dates at all, never a
   * server-computed one (Finding 1 - see resolveDiscussionDeadlinesForPost,
   * post-outcome-notes.ts). */
  discussionDeadlines?: { initialPostAt: string; repliesDueAt: string; note: string };
  /** "introDiscussion" only - the client's "Use Canvas discussion
   * checkpoints" checkbox (GenerateFromSelectionSection.tsx). Default FALSE:
   * Canvas's createDiscussionTopic mutation is not transactional on a
   * flag-off account (it persists the orphan assignment, THEN raises), so
   * checkpoints are explicit opt-in. Every other kind ignores this. */
  useDiscussionCheckpoints?: boolean;
}

export interface PostGeneratedArtifactSuccess {
  summary: PostSummary;
  /** W6: extra facts summary.text has no channel for - discussion deadlines
   * (or why none were set) and which Canvas path ran (AC14g: never silent). */
  notes?: string[];
}

export interface ListGeneratedArtifactVersionsInput {
  courseUrl: string;
  /** See GenerateFromSelectionInput's own doc comment - same identifier,
   * same source-aware resolution. */
  courseId?: string;
  /** M12: see GenerateFromSelectionInput's own doc comment - same identifier,
   * same threading into resolveGenerationCourseRow. */
  acronym?: string;
  kind: GenerationKindId;
}

export interface ListGeneratedArtifactVersionsSuccess {
  /** Newest-first - see listGeneratedArtifactVersions' own doc comment. */
  versions: GeneratedArtifact[];
}
