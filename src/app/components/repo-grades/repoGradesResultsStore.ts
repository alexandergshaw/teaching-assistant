// RG-PERSIST-RESULTS (W5): persist the repo grader's graded cells across a
// reload. Pure leaf - no React, no `window`, no localStorage global. Every
// storage call goes through the injected `RepoGradeCellsStorage` seam so the
// storage refusal paths are node-testable, and the storage KEY is a parameter
// (the quoted literal lives in repoGradesUiState.ts, the single home of every
// key for this view; that module imports this one, so importing the constant
// back here would be a cycle).
//
// The persisted shape enumerates the allowed fields. Grading status, errors,
// submitted files and code execution output are unrepresentable in storage. The blob is
// swept on sign-out by client-state-sweep (the key is deliberately NOT on its
// keep-list).

import type { RubricAreaResult } from "@/lib/grade";
import type { BranchMergeStatus } from "@/lib/repo-grade-merge-check";
import {
  defaultRepoGradeCellEdit,
  LEGACY_REPO_GRADE_RESULT_ID,
  projectRepoGradeFeedbackDraft,
  snapshotRetainedRepoGradeSource,
  type RepoGradeCellEdit,
  type RepoGradeCellEditsByRepo,
  type RepoGradeFeedbackDraft,
  type RetainedRepoGradeResult,
  type RetainedRepoGradeSource,
} from "./repoGradesCellEdits";
import type { RepoGradePostStatus } from "./repoGradesRows";

/** "posting" is deliberately absent: an in-flight post cannot be resumed. */
export type PersistedRepoGradePostStatus = Exclude<RepoGradePostStatus, "posting">;

interface PersistedRepoGradeCellFields {
  draftRevision?: number;
  at: string;
  comment: string;
  generatedComment: string | null;
  generatedScore: string | null;
  improvements: string;
  /** Tolerant on read: absent / invalid in a legacy blob -> null (cell kept). */
  mergeFoundOnBranch: string | null;
  mergeStatus: BranchMergeStatus | null;
  postMessage: string | null;
  postStatus: PersistedRepoGradePostStatus;
  resubmitNotice: string;
  rubricAreas: RubricAreaResult[];
  score: string;
  strengths: string;
  submissionTruncated: boolean;
}

export interface PersistedRepoGradeCell extends PersistedRepoGradeCellFields {
  retainedResults?: readonly RetainedRepoGradeResult[];
}

/** Shown (and persisted) when a cell was mid-post at write time. Frozen copy. */
export const RELOAD_INTERRUPTED_POST_MESSAGE =
  "A reload interrupted this post. Check the Canvas gradebook before re-posting.";

/** Fixed, content-free text for a failed save. Never interpolate a cell field. */
export const RESULTS_PERSIST_ERROR =
  "Saved grading results could not be stored (browser storage is full). Your work is still here for this session but may not survive a reload.";

/** Serialized-size budget for the whole blob (all courses). */
export const RESULTS_MAX_CHARS = 1_000_000;

/** Cap on a persisted post message (post-action errors are not enumerated). */
const POST_MESSAGE_MAX_CHARS = 500;

export interface RepoGradeCellsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type RepoFeedbackStorageResult = {
  outcome: "success" | "blocked" | "denied" | "failed" | "partial";
  failureCategory: "none" | "permission_denied" | "quota_exceeded" | "storage_unavailable" |
    "invalid_stored_data" | "retention_limit" | "transport_rejected" | "service_rejected" |
    "stale_scope" | "conflict" | "unknown";
  affectedResultCount?: number;
};

export function classifyRepoFeedbackStorageError(error: unknown): RepoFeedbackStorageResult {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError") return { outcome: "failed", failureCategory: "quota_exceeded" };
  if (name === "SecurityError" || name === "NotAllowedError") return { outcome: "denied", failureCategory: "permission_denied" };
  return { outcome: "failed", failureCategory: "storage_unavailable" };
}

const INVALID_STORED_DATA = "Some saved grading results could not be read because the browser data is invalid.";
const STORAGE_UNAVAILABLE = "Browser grading results could not be accessed. Work shown in this session may not survive a reload.";
const STORAGE_LIMIT = "The browser storage limit prevented this save. Your work remains available in this session.";
const DRAFT_CONFLICT = "A different version of this draft was saved in this browser. Your edits are available in this session.";
export const RESULTS_DISCARD_ERROR = "Saved grading results could not be discarded. Your work remains available in this session.";

type RepoFeedbackStorageAttempt = { notice: string | null; result: RepoFeedbackStorageResult };

/** courseId -> repo -> folder -> persisted cell. Containers are null-prototype. */
export type PersistedCellsByCourse = Record<string, Record<string, Record<string, PersistedRepoGradeCell>>>;

function newMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function clipMessage(message: string | null): string | null {
  if (message === null) return null;
  return message.length > POST_MESSAGE_MAX_CHARS ? message.slice(0, POST_MESSAGE_MAX_CHARS) : message;
}

/** The ONLY writer of the persisted shape. Enumerated field by field. */
export function toPersisted(edit: RepoGradeCellEdit, at: string): PersistedRepoGradeCell {
  const interrupted = edit.postStatus === "posting";
  const postStatus: PersistedRepoGradePostStatus = edit.postStatus === "posting" ? "error" : edit.postStatus;
  return {
    at,
    comment: edit.comment,
    generatedComment: edit.generatedComment,
    generatedScore: edit.generatedScore,
    improvements: edit.improvements,
    mergeFoundOnBranch: edit.mergeFoundOnBranch,
    mergeStatus: edit.mergeStatus,
    postMessage: interrupted ? RELOAD_INTERRUPTED_POST_MESSAGE : clipMessage(edit.postMessage),
    postStatus,
    resubmitNotice: edit.resubmitNotice,
    rubricAreas: edit.rubricAreas.map((a) => ({ area: a.area, score: a.score, comment: a.comment })),
    score: edit.score,
    strengths: edit.strengths,
    submissionTruncated: edit.submissionTruncated,
    ...(edit.draftRevision ? { draftRevision: edit.draftRevision } : {}),
    ...(edit.retainedResults?.length
      ? { retainedResults: edit.retainedResults.map(({ id, source, draft }) => ({
        id,
        source: snapshotRetainedRepoGradeSource(source),
        draft: draft === null ? null : projectRepoGradeFeedbackDraft(draft),
      })) }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

const PERSISTED_STATUSES: readonly string[] = ["idle", "posted", "error", "skipped"];
const MERGE_STATUSES: readonly string[] = ["merged", "not-merged", "no-submission", "unknown"];

/** Tolerant: a legacy blob (field absent) or an unknown value yields null and
 * NEVER rejects the cell - rejecting would drop every pre-existing saved grade. */
function parseMergeStatus(value: unknown): BranchMergeStatus | null {
  return typeof value === "string" && MERGE_STATUSES.includes(value) ? (value as BranchMergeStatus) : null;
}

function parseFeedbackDraft(value: Record<string, unknown>): RepoGradeFeedbackDraft | null {
  const { comment, improvements, resubmitNotice, score, strengths } = value;
  if (
    typeof comment !== "string" ||
    typeof improvements !== "string" ||
    typeof resubmitNotice !== "string" ||
    typeof score !== "string" ||
    typeof strengths !== "string"
  ) {
    return null;
  }
  return { score, comment, strengths, improvements, resubmitNotice };
}

function parseRubricAreas(value: unknown): RubricAreaResult[] | null {
  if (!Array.isArray(value)) return null;
  const rubricAreas: RubricAreaResult[] = [];
  for (const area of value) {
    if (!isRecord(area) || hasNestedResults(area)) return null;
    if (typeof area.area !== "string" || typeof area.score !== "string" || typeof area.comment !== "string") return null;
    rubricAreas.push({ area: area.area, score: area.score, comment: area.comment });
  }
  return rubricAreas;
}

function parseFeedbackSource(value: Record<string, unknown>) {
  const draft = parseFeedbackDraft(value);
  const { submissionTruncated } = value;
  const generatedComment = strOrNull(value.generatedComment);
  const generatedScore = strOrNull(value.generatedScore);
  const rubricAreas = parseRubricAreas(value.rubricAreas);
  if (!draft || typeof submissionTruncated !== "boolean" || generatedComment === undefined || generatedScore === undefined || !rubricAreas) return null;
  return {
    ...draft,
    generatedComment,
    generatedScore,
    mergeFoundOnBranch: typeof value.mergeFoundOnBranch === "string" ? value.mergeFoundOnBranch : null,
    mergeStatus: parseMergeStatus(value.mergeStatus),
    rubricAreas,
    submissionTruncated,
  };
}

function parseCellFields(value: Record<string, unknown>): PersistedRepoGradeCellFields | null {
  const feedback = parseFeedbackSource(value);
  const { at, postStatus } = value;
  const postMessage = strOrNull(value.postMessage);
  if (!feedback || typeof at !== "string" || postMessage === undefined ||
    typeof postStatus !== "string" || !PERSISTED_STATUSES.includes(postStatus)) return null;
  return {
    at,
    comment: feedback.comment,
    generatedComment: feedback.generatedComment,
    generatedScore: feedback.generatedScore,
    improvements: feedback.improvements,
    mergeFoundOnBranch: feedback.mergeFoundOnBranch,
    mergeStatus: feedback.mergeStatus,
    postMessage,
    postStatus: postStatus as PersistedRepoGradePostStatus,
    resubmitNotice: feedback.resubmitNotice,
    rubricAreas: feedback.rubricAreas,
    score: feedback.score,
    strengths: feedback.strengths,
    submissionTruncated: feedback.submissionTruncated,
    ...(typeof value.draftRevision === "number" && Number.isSafeInteger(value.draftRevision) && value.draftRevision > 0
      ? { draftRevision: value.draftRevision } : {}),
  };
}

function hasNestedResults(value: Record<string, unknown>): boolean {
  return Object.hasOwn(value, "retainedResults") || Object.hasOwn(value, "conflictingGrade");
}

function parseRetainedSource(value: unknown): RetainedRepoGradeSource | null {
  if (!isRecord(value) || hasNestedResults(value)) return null;
  if ((value.mergeStatus !== null && parseMergeStatus(value.mergeStatus) === null) ||
    strOrNull(value.mergeFoundOnBranch) === undefined) return null;
  const source = parseFeedbackSource(value);
  return source ? snapshotRetainedRepoGradeSource(source) : null;
}

function parseRetainedResult(value: unknown): RetainedRepoGradeResult | null {
  if (!isRecord(value) || hasNestedResults(value)) return null;
  const { id, draft } = value;
  if (typeof id !== "string" || (id !== LEGACY_REPO_GRADE_RESULT_ID && !/^local:[1-9]\d*$/.test(id))) return null;
  const source = parseRetainedSource(value.source);
  const parsedDraft = isRecord(draft) && !hasNestedResults(draft) ? parseFeedbackDraft(draft) : null;
  if (!source || (draft !== null && !parsedDraft)) return null;
  return { id, source, draft: parsedDraft };
}

function parseRetainedResults(value: Record<string, unknown>): RetainedRepoGradeResult[] | null {
  const results = new Map<string, RetainedRepoGradeResult>();
  if (Object.hasOwn(value, "retainedResults")) {
    if (!Array.isArray(value.retainedResults)) return null;
    for (const item of value.retainedResults) {
      const result = parseRetainedResult(item);
      if (!result || results.has(result.id)) return null;
      results.set(result.id, result);
    }
  }
  if (Object.hasOwn(value, "conflictingGrade")) {
    const legacy = value.conflictingGrade;
    if (!isRecord(legacy) || hasNestedResults(legacy)) return null;
    const feedback = parseCellFields(legacy);
    if (!feedback) return null;
    const source = snapshotRetainedRepoGradeSource(feedback);
    const canonical = results.get(LEGACY_REPO_GRADE_RESULT_ID);
    if (canonical && JSON.stringify(canonical.source) !== JSON.stringify(source)) return null;
    if (!canonical) results.set(LEGACY_REPO_GRADE_RESULT_ID, { id: LEGACY_REPO_GRADE_RESULT_ID, source, draft: null });
  }
  return [...results.values()];
}

function parseCell(value: unknown, invalid: () => void): PersistedRepoGradeCell | null {
  if (!isRecord(value)) return null;
  const fields = parseCellFields(value);
  if (!fields) return null;
  const retainedResults = parseRetainedResults(value);
  if (!retainedResults) invalid();
  return retainedResults?.length ? { ...fields, retainedResults } : fields;
}

/** Never throws. Non-JSON or a wrong top-level shape -> empty. A bad CELL is
 * dropped; its good siblings (and other courses) are kept. */
export function parseStoredCells(raw: string | null, invalid = () => {}): PersistedCellsByCourse {
  return parseStoredBlob(raw, invalid).cells;
}

function parseStoredBlob(raw: string | null, invalid: () => void) {
  const result = newMap<Record<string, Record<string, PersistedRepoGradeCell>>>();
  const empty = { cells: result, rawCourses: newMap<unknown>() };
  if (raw === null) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid();
    return empty;
  }
  if (!isRecord(parsed)) {
    invalid();
    return empty;
  }
  for (const courseId of Object.keys(parsed)) {
    const byRepo = parsed[courseId];
    if (!isRecord(byRepo)) { invalid(); continue; }
    const repos = newMap<Record<string, PersistedRepoGradeCell>>();
    for (const repo of Object.keys(byRepo)) {
      const byFolder = byRepo[repo];
      if (!isRecord(byFolder)) { invalid(); continue; }
      const folders = newMap<PersistedRepoGradeCell>();
      for (const folder of Object.keys(byFolder)) {
        const cell = parseCell(byFolder[folder], invalid);
        if (cell) folders[folder] = cell;
        else invalid();
      }
      if (Object.keys(folders).length > 0) repos[repo] = folders;
    }
    if (Object.keys(repos).length > 0) result[courseId] = repos;
  }
  return { cells: result, rawCourses: parsed };
}

/** Persisted cells -> live edits (dropped fields take their defaults).
 * Containers stay null-prototype so a folder named `constructor` or
 * `__proto__` never resolves to an inherited member. */
export function restoreRepoGradeCells(
  stored: Record<string, Record<string, PersistedRepoGradeCell>> | undefined
): RepoGradeCellEditsByRepo {
  const result = newMap<Record<string, RepoGradeCellEdit>>();
  if (!stored) return result;
  for (const repo of Object.keys(stored)) {
    const folders = newMap<RepoGradeCellEdit>();
    for (const folder of Object.keys(stored[repo])) {
      folders[folder] = restoreCell(stored[repo][folder]);
    }
    result[repo] = folders;
  }
  return result;
}

function restoreCell(p: PersistedRepoGradeCell): RepoGradeCellEdit {
  return {
    ...defaultRepoGradeCellEdit(),
    score: p.score,
    comment: p.comment,
    strengths: p.strengths,
    improvements: p.improvements,
    resubmitNotice: p.resubmitNotice,
    postStatus: p.postStatus,
    postMessage: p.postMessage,
    rubricAreas: p.rubricAreas.map((a) => ({ area: a.area, score: a.score, comment: a.comment })),
    generatedScore: p.generatedScore,
    generatedComment: p.generatedComment,
    mergeStatus: p.mergeStatus,
    mergeFoundOnBranch: p.mergeFoundOnBranch,
    submissionTruncated: p.submissionTruncated,
    ...(p.draftRevision ? { draftRevision: p.draftRevision } : {}),
    ...(p.retainedResults?.length ? { retainedResults: p.retainedResults } : {}),
  };
}

/** READ ONLY: one course's restored edits. Never writes or removes. */
export function loadRepoGradeCellsFrom(storage: RepoGradeCellsStorage, key: string, courseId: string): RepoGradeCellEditsByRepo {
  return readRepoGradeCellsFrom(storage, key, courseId).edits;
}

export function readRepoGradeCellsFrom(storage: RepoGradeCellsStorage, key: string, courseId: string) {
  try {
    let invalid = false;
    const cells = parseStoredCells(storage.getItem(key), () => { invalid = true; });
    const slice = cells[courseId];
    const count = countCells(slice);
    const result: RepoFeedbackStorageResult = invalid
      ? { outcome: count ? "partial" : "failed", failureCategory: "invalid_stored_data", affectedResultCount: count }
      : { outcome: "success", failureCategory: "none", affectedResultCount: count };
    return { edits: restoreRepoGradeCells(slice), notice: invalid ? INVALID_STORED_DATA : null, result };
  } catch (error) {
    return { edits: restoreRepoGradeCells(undefined), notice: STORAGE_UNAVAILABLE, result: classifyRepoFeedbackStorageError(error) };
  }
}

function countCells(slice: PersistedCellsByCourse[string] | undefined): number {
  let count = 0;
  for (const folders of Object.values(slice ?? {})) count += Object.keys(folders).length;
  return count;
}

/** Keeps a cell's stored timestamp when its persisted content is unchanged. */
function stampCell(
  edit: RepoGradeCellEdit,
  now: string,
  previous: PersistedRepoGradeCell | undefined
): PersistedRepoGradeCell {
  const fresh = toPersisted(edit, now);
  if (!previous) return fresh;
  const kept = { ...fresh, at: previous.at };
  return JSON.stringify(kept) === JSON.stringify(previous) ? previous : fresh;
}

function isDefaultLike(edit: RepoGradeCellEdit): boolean {
  const d = toPersisted(defaultRepoGradeCellEdit(), "");
  return JSON.stringify(toPersisted(edit, "")) === JSON.stringify(d);
}

/** Extracts untouched entries from already-validated JSON. Keeping their source
 * also preserves numbers that cannot round-trip through a JavaScript Number. */
function untouchedCourseEntries(raw: string | null, courseId: string): string[] {
  if (raw === null) return [];
  const entries: string[] = [];
  let depth = 0;
  let entryStart = -1;
  let atCourseKey = true;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') {
      const quoteStart = index;
      for (index += 1; raw[index] !== '"'; index += 1) {
        if (raw[index] === "\\") index += 1;
      }
      if (depth === 1 && atCourseKey) {
        if (JSON.parse(raw.slice(quoteStart, index + 1)) !== courseId) entryStart = quoteStart;
        atCourseKey = false;
      }
      continue;
    }
    if (depth === 1 && (char === "," || char === "}")) {
      if (entryStart !== -1) entries.push(raw.slice(entryStart, index).trimEnd());
      entryStart = -1;
      atCourseKey = true;
    }
    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") depth -= 1;
  }
  return entries;
}

function updateStoredCourse(
  storage: RepoGradeCellsStorage,
  key: string,
  courseId: string,
  replace?: (previous: PersistedCellsByCourse[string] | undefined) => PersistedCellsByCourse[string],
  expected?: RepoGradeCellEditsByRepo,
): RepoFeedbackStorageAttempt {
  try {
    let invalid = false;
    const raw = storage.getItem(key);
    const { cells, rawCourses } = parseStoredBlob(raw, () => { invalid = true; });
    if (invalid) {
      return { notice: INVALID_STORED_DATA, result: { outcome: "blocked", failureCategory: "invalid_stored_data" } };
    }
    const previous = cells[courseId];
    // The baseline is checked against this read. Browser storage provides no atomic compare-and-set.
    if (expected && JSON.stringify(restoreRepoGradeCells(previous)) !== JSON.stringify(expected)) {
      return { notice: DRAFT_CONFLICT, result: { outcome: "blocked", failureCategory: "conflict" } };
    }
    const replacement = replace?.(previous);
    const affectedResultCount = countCells(replace ? replacement : previous);
    const success: RepoFeedbackStorageAttempt = { notice: null, result: { outcome: "success", failureCategory: "none", affectedResultCount } };
    const hasReplacement = replacement && Object.keys(replacement).length > 0;
    if (!hasReplacement && !Object.hasOwn(rawCourses, courseId)) return success;

    const entries = untouchedCourseEntries(raw, courseId);
    if (hasReplacement) entries.push(`${JSON.stringify(courseId)}:${JSON.stringify(replacement)}`);
    if (entries.length === 0) {
      storage.removeItem(key);
      return success;
    }
    const serialized = `{${entries.join(",")}}`;
    if (serialized.length > RESULTS_MAX_CHARS) {
      return { notice: STORAGE_LIMIT, result: { outcome: "blocked", failureCategory: "retention_limit", affectedResultCount } };
    }
    storage.setItem(key, serialized);
    return success;
  } catch (error) {
    const result = classifyRepoFeedbackStorageError(error);
    return { notice: result.failureCategory === "quota_exceeded" ? RESULTS_PERSIST_ERROR : STORAGE_UNAVAILABLE, result };
  }
}

/** Saves only the target course. Returns a fixed notice when storage refuses. */
export function persistRepoGradeCellsTo(
  storage: RepoGradeCellsStorage,
  key: string,
  courseId: string,
  edits: RepoGradeCellEditsByRepo,
  now: string,
  report?: (result: RepoFeedbackStorageResult) => void,
  expected?: RepoGradeCellEditsByRepo,
): string | null {
  const { notice, result } = updateStoredCourse(storage, key, courseId, (previous) => {
    const slice = newMap<Record<string, PersistedRepoGradeCell>>();
    for (const repo of Object.keys(edits)) {
      const folders = newMap<PersistedRepoGradeCell>();
      for (const folder of Object.keys(edits[repo])) {
        const edit = edits[repo][folder];
        if (isDefaultLike(edit)) continue;
        folders[folder] = stampCell(edit, now, previous?.[repo]?.[folder]);
      }
      if (Object.keys(folders).length > 0) slice[repo] = folders;
    }
    return slice;
  }, expected);
  try {
    report?.(result);
  } catch {
    // Diagnostics are best effort after the storage attempt completes.
  }
  return notice;
}

/** Removes only the target course and reports whether storage accepted the discard. */
export function clearRepoGradeCellsIn(storage: RepoGradeCellsStorage, key: string, courseId: string): RepoFeedbackStorageAttempt {
  const { notice, result } = updateStoredCourse(storage, key, courseId);
  return { notice: notice === null ? null : RESULTS_DISCARD_ERROR, result };
}

/** Restored-results banner copy (null when nothing was restored). */
export function describeRestoredRepoGradeCells(edits: RepoGradeCellEditsByRepo): string | null {
  let count = 0;
  for (const repo of Object.keys(edits)) count += Object.keys(edits[repo]).length;
  if (count === 0) return null;
  return (
    `Restored ${count} saved grading result${count === 1 ? "" : "s"} for this course. ` +
    "Submitted files and code-run output are not saved - grade again to see them."
  );
}
