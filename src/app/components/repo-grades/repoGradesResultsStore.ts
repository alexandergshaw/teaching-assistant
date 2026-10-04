// RG-PERSIST-RESULTS (W5): persist the repo grader's graded cells across a
// reload. Pure leaf - no React, no `window`, no localStorage global. Every
// storage call goes through the injected `RepoGradeCellsStorage` seam so the
// quota/eviction paths are node-testable, and the storage KEY is a parameter
// (the quoted literal lives in repoGradesUiState.ts, the single home of every
// key for this view; that module imports this one, so importing the constant
// back here would be a cycle).
//
// The persisted shape is a CONSTRUCTION, not a filter: toPersisted enumerates
// exactly 12 fields (`at` plus 11 kept ones) and never spreads the source
// edit, so `grading`, `gradeError`, `submittedFiles` and `codeExecution` -
// the heavy / sensitive fields - are unrepresentable in storage. The blob is
// swept on sign-out by client-state-sweep (the key is deliberately NOT on its
// keep-list).

import type { RubricAreaResult } from "@/lib/grade";
import { defaultRepoGradeCellEdit, type RepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import type { RepoGradePostStatus } from "./repoGradesRows";

/** "posting" is deliberately absent: an in-flight post cannot be resumed. */
export type PersistedRepoGradePostStatus = Exclude<RepoGradePostStatus, "posting">;

export interface PersistedRepoGradeCell {
  at: string;
  comment: string;
  generatedComment: string | null;
  generatedScore: string | null;
  improvements: string;
  postMessage: string | null;
  postStatus: PersistedRepoGradePostStatus;
  resubmitNotice: string;
  rubricAreas: RubricAreaResult[];
  score: string;
  strengths: string;
  submissionTruncated: boolean;
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
    postMessage: interrupted ? RELOAD_INTERRUPTED_POST_MESSAGE : clipMessage(edit.postMessage),
    postStatus,
    resubmitNotice: edit.resubmitNotice,
    rubricAreas: edit.rubricAreas.map((a) => ({ area: a.area, score: a.score, comment: a.comment })),
    score: edit.score,
    strengths: edit.strengths,
    submissionTruncated: edit.submissionTruncated,
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

/** Tolerant typed parse of ONE cell; null when any field is malformed. */
function parseCell(value: unknown): PersistedRepoGradeCell | null {
  if (!isRecord(value)) return null;
  const { at, comment, improvements, resubmitNotice, score, strengths, submissionTruncated } = value;
  if (
    typeof at !== "string" ||
    typeof comment !== "string" ||
    typeof improvements !== "string" ||
    typeof resubmitNotice !== "string" ||
    typeof score !== "string" ||
    typeof strengths !== "string" ||
    typeof submissionTruncated !== "boolean"
  ) {
    return null;
  }
  const generatedComment = strOrNull(value.generatedComment);
  const generatedScore = strOrNull(value.generatedScore);
  const postMessage = strOrNull(value.postMessage);
  if (generatedComment === undefined || generatedScore === undefined || postMessage === undefined) return null;
  const status = value.postStatus;
  if (typeof status !== "string" || !PERSISTED_STATUSES.includes(status)) return null;
  if (!Array.isArray(value.rubricAreas)) return null;
  const rubricAreas: RubricAreaResult[] = [];
  for (const area of value.rubricAreas) {
    if (!isRecord(area)) return null;
    if (typeof area.area !== "string" || typeof area.score !== "string" || typeof area.comment !== "string") return null;
    rubricAreas.push({ area: area.area, score: area.score, comment: area.comment });
  }
  return {
    at,
    comment,
    generatedComment,
    generatedScore,
    improvements,
    postMessage,
    postStatus: status as PersistedRepoGradePostStatus,
    resubmitNotice,
    rubricAreas,
    score,
    strengths,
    submissionTruncated,
  };
}

/** Never throws. Non-JSON or a wrong top-level shape -> empty. A bad CELL is
 * dropped; its good siblings (and other courses) are kept. */
export function parseStoredCells(raw: string | null): PersistedCellsByCourse {
  const result = newMap<Record<string, Record<string, PersistedRepoGradeCell>>>();
  if (!raw) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!isRecord(parsed)) return result;
  for (const courseId of Object.keys(parsed)) {
    const byRepo = parsed[courseId];
    if (!isRecord(byRepo)) continue;
    const repos = newMap<Record<string, PersistedRepoGradeCell>>();
    for (const repo of Object.keys(byRepo)) {
      const byFolder = byRepo[repo];
      if (!isRecord(byFolder)) continue;
      const folders = newMap<PersistedRepoGradeCell>();
      for (const folder of Object.keys(byFolder)) {
        const cell = parseCell(byFolder[folder]);
        if (cell) folders[folder] = cell;
      }
      if (Object.keys(folders).length > 0) repos[repo] = folders;
    }
    if (Object.keys(repos).length > 0) result[courseId] = repos;
  }
  return result;
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
      const p = stored[repo][folder];
      folders[folder] = {
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
        submissionTruncated: p.submissionTruncated,
      };
    }
    result[repo] = folders;
  }
  return result;
}

/** READ ONLY: one course's restored edits. Never writes or removes. */
export function loadRepoGradeCellsFrom(storage: RepoGradeCellsStorage, key: string, courseId: string): RepoGradeCellEditsByRepo {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    raw = null;
  }
  return restoreRepoGradeCells(parseStoredCells(raw)[courseId]);
}

interface FlatCell {
  repo: string;
  folder: string;
  at: string;
}

function flatten(slice: Record<string, Record<string, PersistedRepoGradeCell>>): FlatCell[] {
  const flat: FlatCell[] = [];
  for (const repo of Object.keys(slice)) {
    for (const folder of Object.keys(slice[repo])) flat.push({ repo, folder, at: slice[repo][folder].at });
  }
  return flat;
}

/** Drops the `count` oldest-`at` cells from the whole blob (all courses). */
function dropOldest(blob: PersistedCellsByCourse, count: number): PersistedCellsByCourse {
  const all: Array<FlatCell & { courseId: string }> = [];
  for (const courseId of Object.keys(blob)) for (const c of flatten(blob[courseId])) all.push({ ...c, courseId });
  all.sort((a, b) => a.at.localeCompare(b.at));
  const doomed = new Set(all.slice(0, count).map((c) => JSON.stringify([c.courseId, c.repo, c.folder])));
  const next = newMap<Record<string, Record<string, PersistedRepoGradeCell>>>();
  for (const courseId of Object.keys(blob)) {
    const repos = newMap<Record<string, PersistedRepoGradeCell>>();
    for (const repo of Object.keys(blob[courseId])) {
      const folders = newMap<PersistedRepoGradeCell>();
      for (const folder of Object.keys(blob[courseId][repo])) {
        if (!doomed.has(JSON.stringify([courseId, repo, folder]))) folders[folder] = blob[courseId][repo][folder];
      }
      if (Object.keys(folders).length > 0) repos[repo] = folders;
    }
    if (Object.keys(repos).length > 0) next[courseId] = repos;
  }
  return next;
}

function totalCells(blob: PersistedCellsByCourse): number {
  let n = 0;
  for (const courseId of Object.keys(blob)) n += flatten(blob[courseId]).length;
  return n;
}

/** Evicts oldest-`at` cells until the serialized blob fits `maxChars`. */
export function evictToBudget(blob: PersistedCellsByCourse, maxChars: number = RESULTS_MAX_CHARS): PersistedCellsByCourse {
  let current = blob;
  while (JSON.stringify(current).length > maxChars && totalCells(current) > 0) {
    current = dropOldest(current, 1);
  }
  return current;
}

function writeBlob(storage: RepoGradeCellsStorage, key: string, blob: PersistedCellsByCourse): void {
  if (Object.keys(blob).length === 0) storage.removeItem(key);
  else storage.setItem(key, JSON.stringify(blob));
}

/** Keeps a cell's stored `at` when its content is unchanged, so eviction order
 * reflects when a result last CHANGED, not when the effect last ran. */
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

/**
 * Writes `courseId`'s slice (other courses untouched). Returns null on
 * success or the FIXED RESULTS_PERSIST_ERROR; never throws, never embeds a
 * cell field. A QuotaExceededError evicts 25% of cells and retries once.
 */
export function persistRepoGradeCellsTo(
  storage: RepoGradeCellsStorage,
  key: string,
  courseId: string,
  edits: RepoGradeCellEditsByRepo,
  now: string
): string | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    raw = null;
  }
  const blob = parseStoredCells(raw);
  const previous = blob[courseId];
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
  if (Object.keys(slice).length > 0) blob[courseId] = slice;
  else delete blob[courseId];

  const next = evictToBudget(blob);
  try {
    if (raw === null && Object.keys(next).length === 0) return null;
    writeBlob(storage, key, next);
    return null;
  } catch {
    // fall through to evict-and-retry
  }
  try {
    const reduced = dropOldest(next, Math.max(1, Math.ceil(totalCells(next) * 0.25)));
    // Reporting success while nothing was stored would be a lie.
    if (Object.keys(reduced).length === 0 && Object.keys(next).length > 0) return RESULTS_PERSIST_ERROR;
    writeBlob(storage, key, reduced);
    return null;
  } catch {
    return RESULTS_PERSIST_ERROR;
  }
}

/** Removes ONLY `courseId`'s saved results; other courses are untouched. */
export function clearRepoGradeCellsIn(storage: RepoGradeCellsStorage, key: string, courseId: string): void {
  try {
    const blob = parseStoredCells(storage.getItem(key));
    if (!(courseId in blob)) return;
    delete blob[courseId];
    writeBlob(storage, key, blob);
  } catch {
    // best-effort, like every other persistence helper in this view
  }
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
