// Persistence for GithubGradingPanel.tsx's last completed grading run
// (docs/repo-grading-records-acceptance-criteria.md, R2). The panel already
// persists its QUEUE under `ta-github-grading-queue` (GithubGradingPanel.tsx)
// but held its RESULTS in plain React state only - a reload, or switching
// tabs and back, discarded every score and comment along with the only
// chance to export them (GradingResults.tsx already has a working Export CSV
// button; R2.1 says the gap is persistence, not download). This module owns
// every decision needed to close that gap - what shape survives to
// localStorage (R2.4), how a malformed/partial/hand-edited blob degrades to
// "no run" instead of a crash (R2.3), and the wording that marks a restored
// run as restored (R2.5) - kept out of the .tsx entirely because vitest here
// is node-env and renders no component: any decision left inside the
// component would be untested forever.
//
// Follows this repo's load/persist idiom (repoGradesUiState.ts): a pure
// parse/serialize pair a node-env test can exercise directly (no fake
// localStorage needed), wrapped by a typeof-window-guarded load/persist pair
// for the component to call.

import type { GradeResult, GradingRun, RubricAreaResult } from "@/lib/grade";
import { stripGradingRunForDraft } from "@/lib/workflows/grading-review-rows";

const RUN_KEY = "ta-github-grading-run";

/**
 * What actually survives to localStorage: the graded-at timestamp (R2.5),
 * the grading-folder scope the run used (mirrors GithubGradingPanel's own
 * `lastGradedFolder`, so a restored run's scope banner reads exactly the
 * same as a freshly-graded one's), and the run itself.
 */
export interface StoredGithubGradingRun {
  gradedAt: string;
  lastGradedFolder: string;
  // C2 (docs/folder-scoped-grading-completeness-acceptance-criteria.md):
  // which queued repos had their folder ingest hit a cap this run. Persisted
  // deliberately, not dropped - a restored run that silently lost this fact
  // would tell the instructor their submission was complete when it was not,
  // the exact defect entry 344 exists to remove. Required (not optional) like
  // rubricAreaNames/fullCreditChecklist below: a blob saved before this field
  // existed cannot say whether anything was truncated, so it is treated as
  // untrustworthy and restores as "no run" rather than as a run that silently
  // claims nothing was cut.
  truncatedRepos: string[];
  run: GradingRun;
}

// ---------------------------------------------------------------------------
// R2.4 - strip before serialize.
//
// grading_drafts already strips the submitted file bytes before storing a
// run (stripGradeResultForDraft / stripGradingRunForDraft,
// src/lib/workflows/grading-review-rows.ts): it empties `submittedFiles`
// entirely (name, extension, previewContent AND rawBase64 - not just the raw
// bytes) and drops `codeExecution` by omission, because drafts never post
// from submittedFiles and the review step re-fetches files from Canvas on
// demand. localStorage's budget is smaller than a DB row's, so this module
// reuses that exact strip rather than writing a looser one: whatever the DB
// already decided is safe to drop, localStorage drops too, which trivially
// satisfies "strip at least as much" (R2.4). The one cost is that a restored
// run's Files column reads "-" for every student - a reasonable trade
// against the alternative of persisting a whole queue's raw submissions
// (potentially megabytes) into an origin-wide 5-10MB budget.
export function serializeGithubGradingRun(input: {
  run: GradingRun;
  gradedAt: string;
  lastGradedFolder: string;
  truncatedRepos: string[];
}): string {
  const stripped = stripGradingRunForDraft(input.run);
  // stripGradeResultForDraft (grading-review-rows.ts, shared with
  // grading_drafts) is an explicit allowlist that predates
  // `submissionTruncated` (docs/folder-scoped-grading-completeness-acceptance
  // -criteria.md C2) and drops it along with the file-bytes fields it exists
  // to strip. Re-attached here by index-pairing against the untouched input -
  // not because the shared strip is wrong for its own callers, but because a
  // restored run silently missing its truncation warning would tell the
  // instructor their submission was complete when it was not, the same
  // defect this whole feature exists to remove. The value re-attached is a
  // single boolean already computed server-side, never any of the raw
  // bytes/preview text the R2.4 strip exists to keep out of localStorage.
  const resultsWithTruncation = stripped.results.map((result, i) => ({
    ...result,
    submissionTruncated: input.run.results[i]?.submissionTruncated,
  }));
  const stored: StoredGithubGradingRun = {
    gradedAt: input.gradedAt,
    lastGradedFolder: input.lastGradedFolder,
    truncatedRepos: input.truncatedRepos,
    run: { ...stripped, results: resultsWithTruncation },
  };
  return JSON.stringify(stored);
}

// ---------------------------------------------------------------------------
// R2.3 - never trust stored data.
//
// Every field is read out by hand and type-checked; nothing is ever spread or
// cast wholesale from the parsed JSON. This also means a hand-edited blob
// that reintroduces `rawBase64`/`previewContent`/`codeExecution` cannot bring
// them back - `submittedFiles` is always rebuilt as `[]` here, never copied
// from the input, mirroring the strip on the write side above.
//
// A malformed OR PARTIAL blob restores as "no run" (parseStoredGithubGradingRun
// returns null), never as a crash and never as a run missing some of its
// students silently passed off as complete - the whole point of this record
// is telling the instructor what they actually graded, so a run that cannot
// be fully trusted is not shown at all.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRubricAreaResult(value: unknown): value is RubricAreaResult {
  return (
    isPlainObject(value) &&
    typeof value.area === "string" &&
    typeof value.score === "string" &&
    typeof value.comment === "string"
  );
}

function parseRubricAreas(value: unknown): RubricAreaResult[] | null {
  if (!Array.isArray(value)) return null;
  const areas: RubricAreaResult[] = [];
  for (const raw of value) {
    if (!isRubricAreaResult(raw)) return null;
    areas.push({ area: raw.area, score: raw.score, comment: raw.comment });
  }
  return areas;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    out.push(item);
  }
  return out;
}

/** A field that may be a string or null, distinguished from "absent/wrong
 * type" (undefined return) so a caller can tell "explicitly not set" apart
 * from "malformed". */
function parseNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function parseGradeResult(raw: unknown): GradeResult | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.student !== "string") return null;
  if (typeof raw.overallComment !== "string") return null;
  const rubricAreas = parseRubricAreas(raw.rubricAreas);
  if (rubricAreas === null) return null;
  if (typeof raw.totalScore !== "string") return null;
  if (typeof raw.feedback !== "string") return null;
  if (typeof raw.mergedFileCount !== "number") return null;

  const userId = typeof raw.userId === "number" ? raw.userId : undefined;
  const gradedRepo = parseNullableString(raw.gradedRepo);
  const gradedRef = parseNullableString(raw.gradedRef);
  // C2: optional like userId/gradedRepo/gradedRef above - absent (older
  // stored run, or a result the field was never set on) or wrong-typed
  // degrades to undefined rather than invalidating the whole run, since this
  // one flag being unreadable does not make the rest of the result untrustworthy.
  const submissionTruncated = typeof raw.submissionTruncated === "boolean" ? raw.submissionTruncated : undefined;
  // docs/grading-results-feedback-boxes-acceptance-criteria.md A5 item 18: the
  // three feedback-box fields are REQUIRED on GradeResult (unlike
  // submissionTruncated above), so unlike that field they cannot degrade to
  // undefined - but they follow the exact same PRINCIPLE this file's header
  // names: a blob predating this feature (or a wrong-typed field within it)
  // degrades that one field to a default ("") rather than invalidating the
  // whole run via the strict-validation idiom below. Losing every stored run
  // in a user's localStorage the moment this feature ships would be far worse
  // than a restored run whose new boxes are temporarily blank.
  const strengths = typeof raw.strengths === "string" ? raw.strengths : "";
  const improvements = typeof raw.improvements === "string" ? raw.improvements : "";
  const resubmitNotice = typeof raw.resubmitNotice === "string" ? raw.resubmitNotice : "";

  return {
    student: raw.student,
    overallComment: raw.overallComment,
    strengths,
    improvements,
    resubmitNotice,
    rubricAreas,
    totalScore: raw.totalScore,
    feedback: raw.feedback,
    mergedFileCount: raw.mergedFileCount,
    // R2.4: never restored from the stored blob, regardless of what it
    // contains - see this file's header.
    submittedFiles: [],
    userId,
    gradedRepo,
    gradedRef,
    submissionTruncated,
  };
}

function parseGradingRun(raw: unknown): GradingRun | null {
  if (!isPlainObject(raw)) return null;
  if (!Array.isArray(raw.results)) return null;
  const results: GradeResult[] = [];
  for (const item of raw.results) {
    const parsed = parseGradeResult(item);
    // A single bad result invalidates the whole run (R2.3) rather than
    // silently dropping that student - a run that looks complete but is
    // missing a student is worse than no run at all.
    if (parsed === null) return null;
    results.push(parsed);
  }
  const rubricAreaNames = parseStringArray(raw.rubricAreaNames);
  if (rubricAreaNames === null) return null;
  const fullCreditChecklist = parseStringArray(raw.fullCreditChecklist);
  if (fullCreditChecklist === null) return null;
  const speedGraderUrl = parseNullableString(raw.speedGraderUrl);
  const sampleAnswer = typeof raw.sampleAnswer === "string" ? raw.sampleAnswer : undefined;

  return { results, rubricAreaNames, fullCreditChecklist, speedGraderUrl, sampleAnswer };
}

/** Pure parse: a hand-edited or partially-written blob (bad JSON, a missing
 * field, a wrong-typed field anywhere in the structure) returns null rather
 * than throwing or returning a partial run. */
export function parseStoredGithubGradingRun(raw: string | null): StoredGithubGradingRun | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if (typeof parsed.gradedAt !== "string") return null;
  if (typeof parsed.lastGradedFolder !== "string") return null;
  // Required, like rubricAreaNames/fullCreditChecklist below - see the
  // interface's doc comment for why a blob predating this field is treated
  // as untrustworthy rather than defaulting to "nothing was truncated".
  const truncatedRepos = parseStringArray(parsed.truncatedRepos);
  if (truncatedRepos === null) return null;
  const run = parseGradingRun(parsed.run);
  if (run === null) return null;
  return { gradedAt: parsed.gradedAt, lastGradedFolder: parsed.lastGradedFolder, truncatedRepos, run };
}

// ---------------------------------------------------------------------------
// R2.2 - load/persist, following repoGradesUiState.ts's typeof-window guard.

export function loadStoredGithubGradingRun(): StoredGithubGradingRun | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredGithubGradingRun(localStorage.getItem(RUN_KEY));
  } catch {
    // A localStorage read can throw too (some private-browsing modes); treat
    // it the same as "nothing stored".
    return null;
  }
}

/** Best-effort write: a throw (quota exceeded, private browsing) loses
 * persistence for this one run and nothing else (R2.4) - the run stays
 * visible in the caller's React state for the rest of this session, it just
 * will not survive a reload. */
export function persistGithubGradingRun(input: {
  run: GradingRun;
  gradedAt: string;
  lastGradedFolder: string;
  truncatedRepos: string[];
}): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RUN_KEY, serializeGithubGradingRun(input));
  } catch {
    // best-effort persistence only, matching persistRepoGradesUiState.
  }
}

// ---------------------------------------------------------------------------
// R2.5 - a restored run must be obviously restored.

/** The exact wording GithubGradingPanel shows above a restored run, kept here
 * (not in the .tsx) so vitest can pin it. An instructor who cannot tell a
 * restored run from one they just produced may post stale scores elsewhere
 * believing they are fresh (posting from THIS panel is out of scope - R3 -
 * but the same instructor uses other surfaces that do post, and a stale run
 * presented as fresh is misleading regardless of where it is acted on). Falls
 * back to the raw stored string for a `gradedAt` that fails to parse as a
 * date, rather than showing "Invalid Date".
 */
export function describeRestoredGithubGradingRun(gradedAtIso: string): string {
  const parsed = new Date(gradedAtIso);
  const when = Number.isNaN(parsed.getTime()) ? gradedAtIso : parsed.toLocaleString();
  return `Restored from your last run, graded ${when}. Re-grade to refresh these results.`;
}

// ---------------------------------------------------------------------------
// C2 (docs/folder-scoped-grading-completeness-acceptance-criteria.md) - the
// "reachability catch" entry 344 closed for the Repo Grades view but left
// open for this panel: `gradeReposAction` returns `truncatedRepos` (repos
// whose folder ingest hit a file/byte cap) and each `GradeResult` carries
// `submissionTruncated` (the assembled text was cut again, before the model
// ever saw it) - both computed, both returned, neither rendered here. Kept
// as a pure helper (not inline JSX) because vitest is node-env and renders
// no component: the wording, which repos/students get named, and whether to
// render anything at all must all be directly testable.
//
// Reported as two SEPARATE facts, never merged into one "truncated" line -
// they are different cuts at different layers (the ingest cap vs. the
// pre-prompt assembly cap), and an instructor chasing missing code needs to
// know which budget to raise.

export interface GithubGradingTruncationNotice {
  /** Set only when at least one repo's folder ingest hit a cap. */
  ingestMessage: string | null;
  /** Set only when at least one result's assembled text was cut before the model saw it. */
  submissionMessage: string | null;
}

/**
 * Builds the truncation notice for a completed run, or null when nothing was
 * truncated. Deliberately returns null rather than a "0 truncated" message:
 * a permanent all-clear line trains readers to ignore the one row where it
 * matters.
 */
export function describeGithubGradingTruncation(
  results: Array<Pick<GradeResult, "student" | "submissionTruncated">>,
  truncatedRepos: string[]
): GithubGradingTruncationNotice | null {
  const repos = truncatedRepos.map((name) => name.trim()).filter((name) => name.length > 0);
  const students = results.filter((r) => r.submissionTruncated === true).map((r) => r.student);
  if (repos.length === 0 && students.length === 0) return null;
  return {
    ingestMessage:
      repos.length > 0
        ? `Folder ingest hit its cap and left files out for ${repos.length} repo${repos.length === 1 ? "" : "s"}: ${repos.join(", ")}.`
        : null,
    submissionMessage:
      students.length > 0
        ? `The assembled submission text was cut before grading for ${students.length} student${students.length === 1 ? "" : "s"}: ${students.join(", ")}.`
        : null,
  };
}
