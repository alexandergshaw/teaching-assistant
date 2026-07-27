// Domain model for reusable artifact templates: one user-level, composable template
// entity shared by the assignment / test / discussion / quiz / class-session families
// via a `kind` discriminator. Pure, unit-testable; no I/O or React dependencies.
//
// Ids and timestamps are supplied by callers (the persistence layer / an editor UI) -
// this module never calls Date.now(), new Date(), Math.random(), or crypto.randomUUID().

import type { QuizQuestionType } from "@/lib/canvas-modules/types";

export type ArtifactTemplateKind =
  | "assignment"
  | "test"
  | "discussion"
  | "quiz"
  | "class-session";

export const ARTIFACT_TEMPLATE_KINDS: readonly ArtifactTemplateKind[] = [
  "assignment",
  "test",
  "discussion",
  "quiz",
  "class-session",
];

export const ARTIFACT_TEMPLATE_KIND_LABELS: Record<ArtifactTemplateKind, string> = {
  assignment: "Assignment",
  test: "Test",
  discussion: "Discussion",
  quiz: "Quiz",
  "class-session": "Class Session",
};

export interface ArtifactTemplate<S = unknown> {
  id: string;
  kind: ArtifactTemplateKind;
  name: string;
  description: string;
  spec: S;
  createdAt?: string;
  updatedAt?: string;
}

// ── Assignment spec (the only kind designed this wave) ─────────────────────

export type TechnicalAptitude = "intro" | "intermediate" | "advanced";
export type Grouping = "solo" | "group";

export interface AssignmentSpec {
  goal: string; // what the student should achieve
  activity: string; // what they actually do
  aptitude: TechnicalAptitude;
  minutes: number; // expected time to complete
  deliverables: string[]; // what they hand in
  grouping: Grouping;
  groupSize: number | null; // only meaningful when grouping === "group"
  /** In-person session bookends. */
  includeOpener: boolean;
  openerMinutes: number | null;
  includeCloser: boolean;
  closerMinutes: number | null;
}

export interface TechnicalAptitudeDef {
  value: TechnicalAptitude;
  label: string;
  hint: string;
  promptContract: string;
}

export const TECHNICAL_APTITUDES: TechnicalAptitudeDef[] = [
  {
    value: "intro",
    label: "Introductory",
    hint: "No prior exposure assumed; every step is scaffolded and explained.",
    promptContract:
      "Assume no prior exposure; scaffold every step and define terms on first use.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    hint: "Comfortable with the fundamentals; ready to combine concepts with some guidance.",
    promptContract:
      "Assume familiarity with the fundamentals; combine concepts and expect the student to work through routine steps independently.",
  },
  {
    value: "advanced",
    label: "Advanced",
    hint: "Confident and independent; expects ambiguity and open-ended problem solving.",
    promptContract:
      "Assume strong prior experience; introduce ambiguity, edge cases, and open-ended design decisions with minimal hand-holding.",
  },
];

export interface GroupingDef {
  value: Grouping;
  label: string;
  hint: string;
  promptContract: string;
}

export const GROUPINGS: GroupingDef[] = [
  {
    value: "solo",
    label: "Individual",
    hint: "Each student completes and submits the work on their own.",
    promptContract:
      "This is individual work; each student completes and submits their own deliverables independently.",
  },
  {
    value: "group",
    label: "Group",
    hint: "Students complete the work together in a fixed-size group.",
    promptContract:
      "This is group work; the named group size collaborates on one shared set of deliverables.",
  },
];

export function emptyAssignmentSpec(): AssignmentSpec {
  return {
    goal: "",
    activity: "",
    aptitude: "intro",
    minutes: 60,
    deliverables: [],
    grouping: "solo",
    groupSize: null,
    includeOpener: false,
    openerMinutes: null,
    includeCloser: false,
    closerMinutes: null,
  };
}

/**
 * Defensive coercion for jsonb loaded from the DB (or any other untrusted
 * source): never throws, and any unknown/missing/malformed field falls back
 * to the empty-spec default rather than propagating garbage to callers.
 */
export function coerceAssignmentSpec(raw: unknown): AssignmentSpec {
  const defaults = emptyAssignmentSpec();

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  const coerceFiniteNonNegative = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

  const goal = typeof obj.goal === "string" ? obj.goal : defaults.goal;
  const activity = typeof obj.activity === "string" ? obj.activity : defaults.activity;

  const aptitude: TechnicalAptitude = TECHNICAL_APTITUDES.some((a) => a.value === obj.aptitude)
    ? (obj.aptitude as TechnicalAptitude)
    : defaults.aptitude;

  const grouping: Grouping = GROUPINGS.some((g) => g.value === obj.grouping)
    ? (obj.grouping as Grouping)
    : defaults.grouping;

  const minutes = coerceFiniteNonNegative(obj.minutes) ?? defaults.minutes;

  const deliverables = Array.isArray(obj.deliverables)
    ? obj.deliverables.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : defaults.deliverables;

  const groupSize = coerceFiniteNonNegative(obj.groupSize);

  const includeOpener =
    typeof obj.includeOpener === "boolean" ? obj.includeOpener : defaults.includeOpener;
  const openerMinutes = coerceFiniteNonNegative(obj.openerMinutes);

  const includeCloser =
    typeof obj.includeCloser === "boolean" ? obj.includeCloser : defaults.includeCloser;
  const closerMinutes = coerceFiniteNonNegative(obj.closerMinutes);

  return {
    goal,
    activity,
    aptitude,
    minutes,
    deliverables,
    grouping,
    groupSize,
    includeOpener,
    openerMinutes,
    includeCloser,
    closerMinutes,
  };
}

// ── Test spec ────────────────────────────────────────────────────────────

export type TestFormat = "in-class" | "take-home" | "online";
export type TestQuestionKind =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "essay";

export interface TestSectionSpec {
  kind: TestQuestionKind;
  count: number; // how many questions of this kind
  pointsEach: number; // points per question
}

export interface TestSpec {
  goal: string; // what the test must measure
  coverage: string; // topics/weeks it draws from
  aptitude: TechnicalAptitude; // REUSED vocabulary, not a new one
  format: TestFormat;
  minutes: number;
  sections: TestSectionSpec[];
  allowedResources: string[]; // "open book", "one index card", ...
  includeAnswerKey: boolean;
  includeStudyGuide: boolean;
}

export interface TestQuestionKindDef {
  value: TestQuestionKind;
  label: string;
  hint: string;
  promptContract: string;
  /** The Canvas classic-quiz question type this kind maps to. This mapping
   * lives ONLY here - steps.assignments-test-template.ts looks it up rather
   * than re-deriving it locally, so the mapping cannot drift. */
  canvasType: QuizQuestionType;
}

export const TEST_QUESTION_KINDS: TestQuestionKindDef[] = [
  {
    value: "multiple_choice",
    label: "Multiple choice",
    hint: "One correct answer among several choices.",
    promptContract:
      "Write a multiple-choice question with exactly one correct answer and at least three plausible distractors.",
    canvasType: "multiple_choice_question",
  },
  {
    value: "true_false",
    label: "True / False",
    hint: "A single true-or-false statement.",
    promptContract:
      "Write a single, unambiguous statement that the student marks true or false.",
    canvasType: "true_false_question",
  },
  {
    value: "short_answer",
    label: "Short answer",
    hint: "A brief written answer graded against one expected response.",
    promptContract:
      "Write a question answerable in a short phrase or sentence, with one specific expected answer.",
    canvasType: "short_answer_question",
  },
  {
    value: "essay",
    label: "Essay",
    hint: "An open-ended written response, graded by hand against a rubric.",
    promptContract:
      "Write an open-ended question that requires a multi-sentence written response and cannot be answered with a single word or phrase.",
    canvasType: "essay_question",
  },
];

export interface TestFormatDef {
  value: TestFormat;
  label: string;
  hint: string;
  promptContract: string;
}

export const TEST_FORMATS: TestFormatDef[] = [
  {
    value: "in-class",
    label: "In-class",
    hint: "Closed-environment, proctored, taken during class time.",
    promptContract:
      "This test is taken in class under time pressure; questions should be answerable without outside research.",
  },
  {
    value: "take-home",
    label: "Take-home",
    hint: "Untimed or loosely timed, completed outside class.",
    promptContract:
      "This is a take-home test; questions may require deeper thought or reference to course materials, since students are not under in-class time pressure.",
  },
  {
    value: "online",
    label: "Online",
    hint: "Delivered and taken through the LMS.",
    promptContract:
      "This test is delivered online through the LMS; questions should be self-contained and never depend on a paper handout.",
  },
];

export function emptyTestSpec(): TestSpec {
  return {
    goal: "",
    coverage: "",
    aptitude: "intro",
    format: "in-class",
    minutes: 60,
    sections: [],
    allowedResources: [],
    includeAnswerKey: true,
    includeStudyGuide: false,
  };
}

/** sum(count * pointsEach) across every section - the single source of truth
 * for a test's total point value; every caller uses this, never its own sum. */
export function testTotalPoints(spec: TestSpec): number {
  return spec.sections.reduce((sum, s) => sum + s.count * s.pointsEach, 0);
}

/** sum(count) across every section. */
export function testQuestionCount(spec: TestSpec): number {
  return spec.sections.reduce((sum, s) => sum + s.count, 0);
}

/**
 * Defensive coercion for jsonb loaded from the DB (or any other untrusted
 * source): never throws, and any unknown/missing/malformed field falls back
 * to the empty-spec default rather than propagating garbage to callers. A
 * malformed section (unrecognized kind, or a non-finite/negative/non-integer
 * count, or a non-finite/negative pointsEach) is DROPPED rather than
 * defaulted - a section with a garbage kind must never silently become a
 * multiple-choice section.
 */
export function coerceTestSpec(raw: unknown): TestSpec {
  const defaults = emptyTestSpec();

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  const coerceFiniteNonNegativeInt = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
      ? value
      : null;
  const coerceFiniteNonNegative = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

  const goal = typeof obj.goal === "string" ? obj.goal : defaults.goal;
  const coverage = typeof obj.coverage === "string" ? obj.coverage : defaults.coverage;

  const aptitude: TechnicalAptitude = TECHNICAL_APTITUDES.some((a) => a.value === obj.aptitude)
    ? (obj.aptitude as TechnicalAptitude)
    : defaults.aptitude;

  const format: TestFormat = TEST_FORMATS.some((f) => f.value === obj.format)
    ? (obj.format as TestFormat)
    : defaults.format;

  const minutes = coerceFiniteNonNegative(obj.minutes) ?? defaults.minutes;

  const sections: TestSectionSpec[] = Array.isArray(obj.sections)
    ? obj.sections
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
        .map((s) => ({
          kind: s.kind,
          count: coerceFiniteNonNegativeInt(s.count),
          pointsEach: coerceFiniteNonNegative(s.pointsEach),
        }))
        .filter(
          (s): s is { kind: TestQuestionKind; count: number; pointsEach: number } =>
            TEST_QUESTION_KINDS.some((k) => k.value === s.kind) && s.count !== null && s.pointsEach !== null
        )
    : defaults.sections;

  const allowedResources = Array.isArray(obj.allowedResources)
    ? obj.allowedResources.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : defaults.allowedResources;

  const includeAnswerKey =
    typeof obj.includeAnswerKey === "boolean" ? obj.includeAnswerKey : defaults.includeAnswerKey;
  const includeStudyGuide =
    typeof obj.includeStudyGuide === "boolean" ? obj.includeStudyGuide : defaults.includeStudyGuide;

  return {
    goal,
    coverage,
    aptitude,
    format,
    minutes,
    sections,
    allowedResources,
    includeAnswerKey,
    includeStudyGuide,
  };
}

// ── Discussion, quiz, and class-session specs ───────────────────────────────
//
// These three are designed together because the class session BUNDLES the
// other two: one per-module package of a recent-events case study, a
// discussion board post about it, a hands-on assignment, and a quiz. Giving
// the discussion and quiz legs their own specs keeps each reusable on its own
// rather than burying its fields inside the bundle.

export interface DiscussionSpec {
  prompt: string; // what students are asked to discuss
  postMinWords: number;
  requiredReplies: number;
  points: number;
}

export function emptyDiscussionSpec(): DiscussionSpec {
  return { prompt: "", postMinWords: 150, requiredReplies: 2, points: 10 };
}

export interface QuizSpec {
  questionCount: number;
  pointsEach: number;
  /** Which question kinds the quiz may draw from. */
  kinds: TestQuestionKind[];
}

export function emptyQuizSpec(): QuizSpec {
  return { questionCount: 5, pointsEach: 2, kinds: ["multiple_choice"] };
}

/**
 * How the session's hands-on assignment is submitted. This is the ONE
 * difference between the no-code course's class template and the codebase
 * course's, so it is a discriminator on one template family rather than two
 * parallel families that would drift apart.
 */
export type ClassSessionVariant = "no-code" | "codebase";

export interface ClassSessionAssignmentSpec {
  goal: string;
  aptitude: TechnicalAptitude;
  minutes: number;
  points: number;
  /** Whether the week's work feeds a semester-long project. */
  buildsTowardProject: boolean;
  projectDescription: string;
}

export interface ClassSessionSpec {
  variant: ClassSessionVariant;
  includeCaseStudy: boolean;
  /** How recent the case study's events must be, e.g. "the past 30 days". */
  caseStudyWindow: string;
  discussion: DiscussionSpec;
  assignment: ClassSessionAssignmentSpec;
  quiz: QuizSpec;
}

export interface ClassSessionVariantDef {
  value: ClassSessionVariant;
  label: string;
  hint: string;
  promptContract: string;
  /** The Canvas submission type the assignment is created with. */
  submissionType: string;
}

export const CLASS_SESSION_VARIANTS: ClassSessionVariantDef[] = [
  {
    value: "no-code",
    label: "No-code course",
    hint: "Students use tools rather than write code; work is submitted in the LMS.",
    promptContract:
      "This is a no-code course: the hands-on work must use accessible tools (spreadsheets, no-code builders, SaaS free tiers, notebooks with prewritten cells) and must not require the student to write or run code from scratch.",
    submissionType: "online_text_entry",
  },
  {
    value: "codebase",
    label: "Codebase course",
    hint: "Students write code and submit a GitHub URL.",
    promptContract:
      "This is a programming course: the hands-on work must require writing and running real code, and the student submits the URL of the GitHub repository containing their work.",
    submissionType: "online_url",
  },
];

export function emptyClassSessionSpec(): ClassSessionSpec {
  return {
    variant: "no-code",
    includeCaseStudy: true,
    caseStudyWindow: "the past 30 days",
    discussion: emptyDiscussionSpec(),
    assignment: {
      goal: "",
      aptitude: "intro",
      minutes: 90,
      points: 20,
      buildsTowardProject: false,
      projectDescription: "",
    },
    quiz: emptyQuizSpec(),
  };
}

function asSpecRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Defensive coercion for a discussion spec; never throws. */
export function coerceDiscussionSpec(raw: unknown): DiscussionSpec {
  const defaults = emptyDiscussionSpec();
  const obj = asSpecRecord(raw);
  if (!obj) return defaults;
  return {
    prompt: typeof obj.prompt === "string" ? obj.prompt : defaults.prompt,
    postMinWords: nonNegativeNumber(obj.postMinWords) ?? defaults.postMinWords,
    requiredReplies: nonNegativeNumber(obj.requiredReplies) ?? defaults.requiredReplies,
    points: nonNegativeNumber(obj.points) ?? defaults.points,
  };
}

/** Defensive coercion for a quiz spec; never throws. */
export function coerceQuizSpec(raw: unknown): QuizSpec {
  const defaults = emptyQuizSpec();
  const obj = asSpecRecord(raw);
  if (!obj) return defaults;
  const kinds = Array.isArray(obj.kinds)
    ? obj.kinds.filter((k): k is TestQuestionKind =>
        TEST_QUESTION_KINDS.some((def) => def.value === k)
      )
    : defaults.kinds;
  return {
    questionCount: nonNegativeNumber(obj.questionCount) ?? defaults.questionCount,
    pointsEach: nonNegativeNumber(obj.pointsEach) ?? defaults.pointsEach,
    // An empty list after filtering would mean a quiz with no answerable
    // question kind, so it falls back rather than producing an unusable quiz.
    kinds: kinds.length > 0 ? kinds : defaults.kinds,
  };
}

/** Defensive coercion for a class-session spec; never throws. */
export function coerceClassSessionSpec(raw: unknown): ClassSessionSpec {
  const defaults = emptyClassSessionSpec();
  const obj = asSpecRecord(raw);
  if (!obj) return defaults;

  const variant: ClassSessionVariant = CLASS_SESSION_VARIANTS.some((v) => v.value === obj.variant)
    ? (obj.variant as ClassSessionVariant)
    : defaults.variant;

  const assignmentRaw = asSpecRecord(obj.assignment) ?? {};
  const aptitude: TechnicalAptitude = TECHNICAL_APTITUDES.some(
    (a) => a.value === assignmentRaw.aptitude
  )
    ? (assignmentRaw.aptitude as TechnicalAptitude)
    : defaults.assignment.aptitude;

  return {
    variant,
    includeCaseStudy:
      typeof obj.includeCaseStudy === "boolean" ? obj.includeCaseStudy : defaults.includeCaseStudy,
    caseStudyWindow:
      typeof obj.caseStudyWindow === "string" && obj.caseStudyWindow.trim()
        ? obj.caseStudyWindow
        : defaults.caseStudyWindow,
    discussion: coerceDiscussionSpec(obj.discussion),
    assignment: {
      goal: typeof assignmentRaw.goal === "string" ? assignmentRaw.goal : defaults.assignment.goal,
      aptitude,
      minutes: nonNegativeNumber(assignmentRaw.minutes) ?? defaults.assignment.minutes,
      points: nonNegativeNumber(assignmentRaw.points) ?? defaults.assignment.points,
      buildsTowardProject:
        typeof assignmentRaw.buildsTowardProject === "boolean"
          ? assignmentRaw.buildsTowardProject
          : defaults.assignment.buildsTowardProject,
      projectDescription:
        typeof assignmentRaw.projectDescription === "string"
          ? assignmentRaw.projectDescription
          : defaults.assignment.projectDescription,
    },
    quiz: coerceQuizSpec(obj.quiz),
  };
}

function emptySpecForKind(kind: ArtifactTemplateKind): unknown {
  switch (kind) {
    case "assignment":
      return emptyAssignmentSpec();
    case "test":
      return emptyTestSpec();
    case "discussion":
      return emptyDiscussionSpec();
    case "quiz":
      return emptyQuizSpec();
    case "class-session":
      return emptyClassSessionSpec();
    default:
      return {};
  }
}

/** A blank template of the given kind. `id` is supplied by the caller. */
export function emptyArtifactTemplate(kind: ArtifactTemplateKind, id: string): ArtifactTemplate {
  return {
    id,
    kind,
    name: "",
    description: "",
    spec: emptySpecForKind(kind),
  };
}

// Pure structural clone: spec content is always JSON-safe (jsonb round-trips
// through exactly this shape), so JSON parse/stringify is a deterministic,
// dependency-free deep copy - no Date/Math.random involved.
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A copy of `template` under a new id (supplied by the caller), name suffixed
 * " (copy)", and timestamps cleared. The spec is deep-cloned so mutating the
 * copy's spec can never affect the original's.
 */
export function duplicateArtifactTemplate<S>(
  template: ArtifactTemplate<S>,
  id: string
): ArtifactTemplate<S> {
  return {
    id,
    kind: template.kind,
    name: `${template.name} (copy)`,
    description: template.description,
    spec: deepClone(template.spec),
  };
}
