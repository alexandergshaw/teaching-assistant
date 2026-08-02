import type { GradingRun } from "@/lib/grade";
import type { TestQuestionKind } from "@/lib/artifact-templates/types";
import type { SlideGraphic } from "@/lib/slide-graphics";

export interface SlideData {
  title: string;
  bullets: string[];
  // Optional example code snippet, rendered as a formatted monospace code block
  // in the generated deck. Populated on the example slide that immediately
  // follows a coding-concept slide (loops, conditionals, functions, etc.).
  code?: string;
  // Language label for the code block (e.g. "python", "javascript").
  codeLanguage?: string;
  // Speaker notes for this slide - what the instructor says while it is up.
  // These replace the separate lecture-notes document that used to ship
  // alongside the deck: the notes belong with the slide they narrate.
  notes?: string;
  // Optional visual (a matrix, a process, or a table) for applied (no-code)
  // decks - see src/lib/slide-graphics.ts. Ignored on slides that also carry
  // "code".
  graphic?: SlideGraphic;
}

export interface GenerateLessonPlanResult {
  presentationTitle: string;
  slides: SlideData[];
}

export interface AssignmentStep {
  stepTitle: string;
  description: string;
}

export interface AssignmentData {
  title: string;
  overview: string;
  steps: AssignmentStep[];
  tools: string[];
  deliverables: string[];
}

export interface ModuleIntroData {
  overview: string;
  keyTerms: string;
}

export interface TestQuestionItem {
  kind: TestQuestionKind;
  prompt: string;
  choices: string[];
  answer: string;
  points: number;
}

export interface TestQuestionsData {
  title: string;
  instructions: string;
  questions: TestQuestionItem[];
}

export interface ExampleItem {
  concept: string;
  title: string;
  content: string;
  explanation: string;
  language?: string;
}

export interface ExamplesData {
  lessonType: "math" | "programming" | "general";
  examples: ExampleItem[];
}

export interface TestGeminiState {
  result: string | null;
  error: string | null;
}

export interface GradeActionState {
  run: GradingRun | null;
  error: string | null;
  generatedRubric?: string;
  warnings?: string[];
}

export type MissingAssignmentReport = {
  assignmentId: string;
  assignmentName: string;
  dueAt: string | null;
  pointsPossible: number | null;
  students: Array<{ userId?: number; name: string; email?: string }>;
};

export interface SyllabusInputField {
  /** The paragraph id (matches parseOfficeParagraphs) to rewrite. */
  paragraphId: string;
  /** Short human label for the input. */
  label: string;
  /** The paragraph's current text in the uploaded syllabus. */
  currentText: string;
  /** AI-suggested replacement text for this offering. */
  suggestedText: string;
}

/** Instructor-provided facts the codebase can't supply; not assumed across syllabi. */
export interface SyllabusCourseInfo {
  /** Course name/title, e.g. "Database Management". */
  courseName?: string;
  /** Course code/number, e.g. "BIT270". */
  courseCode?: string;
  /** Instructor name. */
  instructorName?: string;
  /** Instructor email. */
  instructorEmail?: string;
  /** Official course description (use verbatim for the description section). */
  courseDescription?: string;
  /** Course start date including the year, e.g. "2026-08-25". */
  startDate?: string;
  /** Meeting days, e.g. "Mon/Wed/Fri". */
  meetingDays?: string;
  /** Meeting times, e.g. "9:00–10:15am". */
  meetingTimes?: string;
  /** Meeting location, e.g. "Room 204, Science Hall". */
  location?: string;
  /** Required textbooks / materials (e.g. extracted from an uploaded screenshot). */
  textbookInfo?: string;
}

export interface SlideNarration {
  slide: number;
  title: string;
  text: string;
  narration: string;
}

export interface ScreenCaption {
  start: number;
  end: number;
  text: string;
}

export interface SelectionChatMessage {
  role: "user" | "model";
  text: string;
}

export interface CourseScheduleRow {
  week: number;
  dates: string;
  topics: string;
  assignment: string;
}

export interface CourseScheduleResult {
  rows: CourseScheduleRow[];
  topics?: string[];
}

export interface AssignmentPlan {
  assignmentName: string;
  // Human-readable, unique label derived from the folder slug (e.g. "Review 1",
  // "Assignment 3"). Used for file names and the editor header so two folders
  // with the same number (assignment1 / review1 / exam1) never collide.
  label: string;
  presentationTitle: string;
  slides: SlideData[];
  // True when slide generation failed for this assignment after retries, so the
  // deck above is an empty placeholder. The UI surfaces this so the instructor
  // can regenerate rather than silently shipping a blank deck.
  slidesFailed?: boolean;
  /** Count of slides the applied (no-code) guard had to strip "code"/
   * "codeLanguage" from - see enforceNoCodeForApplied in slide-prompt.ts.
   * A prompt regression can still ask an applied-course model for code; this
   * records that it happened even though the shipped slides are now clean,
   * so the run can surface it instead of looking silently successful.
   * Always undefined for a coding course or a clean applied run. */
  codeStrippedFromApplied?: number;
  /** Generation fell back to the deterministic scaffold for this week's
   * module introduction / assignment instructions. The document still ships,
   * but as placeholder prose rather than real content - so a run must be able
   * to say so instead of looking like it succeeded. */
  introFailed?: boolean;
  instructionsFailed?: boolean;
  /** True when an applied (no-code) week came back with no shared required
   * tool - selectRequiredTools (course-planning-grounding.ts) either failed
   * or returned nothing usable, so the assignment and the deck each named a
   * tool independently instead of agreeing on one. Always undefined for a
   * coding week (moduleTools is an applied-only concept) or a clean applied
   * run - mirrors codeStrippedFromApplied's "degraded but not fatal" shape. */
  moduleToolsSelectionFailed?: boolean;
  moduleIntroduction: string;
  assignmentInstructions: string;
  /** What a student must be able to DO by the end of this module - derived
   * from the module's ASSIGNMENT (buildScheduleWeekPlan's already-generated
   * text where available, or the repo-driven buildAssignmentPlan's source
   * content otherwise), not a generic restatement of the topic. "The
   * assignment is what proves the objective" - see docs/REGRESSION.md for
   * this decision. Always populated (real generation or, on failure, the
   * deterministic scaffold) - never absent, mirroring moduleIntroduction. */
  moduleObjectives: string;
  /** Generation fell back to the deterministic scaffold for this week's
   * module objectives - mirrors introFailed/instructionsFailed. */
  objectivesFailed?: boolean;
  /** This week's class opener document text (case study discussion / warm-up
   * exercise / debrief), generated BEFORE the deck only when the caller turns
   * on an in-plan sequencing path (buildScheduleWeekPlan's
   * sequenceOpenerBeforeDeck parameter, or the repo-driven buildAssignmentPlan
   * equivalent) - undefined for every other caller/path, which never attempt
   * one here at all.
   * assembleLectureFiles (registry-helpers.ts) ships this as its own
   * "opener" role docx, mirroring the standalone generate-class-openers step,
   * only when it is present. */
  openerText?: string;
  /** Generation of the in-plan opener (above) failed - mirrors
   * introFailed/instructionsFailed/objectivesFailed. Always undefined when
   * sequenceOpenerBeforeDeck is off (no opener was attempted here at all). */
  openerFailed?: boolean;
  // Normalized week number (1-based) aligned with the course schedule. Zero-based
  // folder sets (week-00, week-01, ...) are shifted up by one; 1-based sets keep
  // their numbers exactly (gaps preserved, no compaction). A folder without digits
  // falls back to its own position in the sorted list.
  weekNumber: number;
  // The exact heading lines found in the supplied templates (paragraphs styled
  // as headings/titles in the .docx). When a template is provided, only these
  // lines may receive heading formatting in the generated document — body text
  // must never be promoted to a heading. Empty when no template was supplied.
  introTemplateHeadings: string[];
  instructionsTemplateHeadings: string[];
}

export interface StudentRepoResult {
  student: string;
  name: string;
  htmlUrl?: string;
  error?: string;
}

/** One row's outcome when inviting students to their own repos. */
export interface StudentInviteResult {
  repo: string;
  username: string;
  error?: string;
}

export interface ClassroomRowResult {
  repo: string;
  created: "created" | "existed" | "failed";
  createError?: string;
  invited: boolean;
  inviteError?: string;
}

export interface RepoQueueItem {
  repoRef: string;
  branch?: string;
  /** Friendly student label; falls back to the repo's full name. */
  label?: string;
}

export interface TestSummary {
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  passed: number;
}

export interface ScheduleWeekPlan {
  /** The week number (1-based). */
  week: number;
  /** Short topic name for the week. */
  topic: string;
  /** 1-2 sentence description of the week's learning outcomes. */
  summary: string;
  /** Title of the assignment for this week, or null if this week has a test instead. */
  assignmentTitle: string | null;
  /** Kebab-case unique slug for the assignment folder (e.g., "week-01-variables"), or null. */
  assignmentSlug: string | null;
  /** Name of the test for this week (e.g., "Test 1"), or null if no test this week. */
  testName: string | null;
}
