// Domain model for reusable artifact templates: one user-level, composable template
// entity shared by the assignment / test / discussion / quiz / class-session families
// via a `kind` discriminator. Pure, unit-testable; no I/O or React dependencies.
//
// Ids and timestamps are supplied by callers (the persistence layer / an editor UI) -
// this module never calls Date.now(), new Date(), Math.random(), or crypto.randomUUID().

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

// ── Placeholder specs for the other four kinds ──────────────────────────────
// Each is confirmed with the user at its own kickoff; only the shape (an empty
// object) is reserved here so the table and picker are ready for them.

// TODO: design the test spec's fields with the user at its own kickoff.
export type TestSpec = Record<string, never>;

// TODO: design the test spec's fields with the user at its own kickoff.
export function emptyTestSpec(): TestSpec {
  return {};
}

// TODO: design the discussion spec's fields with the user at its own kickoff.
export type DiscussionSpec = Record<string, never>;

// TODO: design the discussion spec's fields with the user at its own kickoff.
export function emptyDiscussionSpec(): DiscussionSpec {
  return {};
}

// TODO: design the quiz spec's fields with the user at its own kickoff.
export type QuizSpec = Record<string, never>;

// TODO: design the quiz spec's fields with the user at its own kickoff.
export function emptyQuizSpec(): QuizSpec {
  return {};
}

// TODO: design the class-session spec's fields with the user at its own kickoff.
export type ClassSessionSpec = Record<string, never>;

// TODO: design the class-session spec's fields with the user at its own kickoff.
export function emptyClassSessionSpec(): ClassSessionSpec {
  return {};
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
