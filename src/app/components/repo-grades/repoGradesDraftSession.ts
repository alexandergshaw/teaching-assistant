import {
  defaultRepoGradeCellEdit,
  type RepoGradeCellEditsByRepo,
} from "./repoGradesCellEdits";
import {
  parseStoredCells,
  restoreRepoGradeCells,
  toPersisted,
  type PersistedCellsByCourse,
} from "./repoGradesResultsStore";

export const REPO_GRADE_SESSION_SAVE_FAILURE =
  "Saved grading results could not be stored. Your work remains available while Repo Grades stays open.";

export interface RepoGradesDraftSessionSnapshot {
  readonly liveEdits: RepoGradeCellEditsByRepo;
  readonly persistedBaseline: RepoGradeCellEditsByRepo;
  readonly saveNotice: typeof REPO_GRADE_SESSION_SAVE_FAILURE | null;
  readonly saveStatus: "ready" | "pending" | "uncertain";
}

type Scope = object;
type CourseEntry = {
  snapshot: RepoGradesDraftSessionSnapshot;
  pendingSave: symbol | null;
};

function cloneEdits(edits: RepoGradeCellEditsByRepo): RepoGradeCellEditsByRepo {
  // Preserve own-key lookup semantics for repo and folder names.
  const repos = Object.create(null) as Record<string, RepoGradeCellEditsByRepo[string]>;
  for (const [repo, folders] of Object.entries(edits)) {
    repos[repo] = Object.assign(Object.create(null), structuredClone(folders));
  }
  return repos;
}

const DEFAULT_PERSISTED_CELL = JSON.stringify(toPersisted(defaultRepoGradeCellEdit(), ""));

function normalizePersistedBaseline(edits: RepoGradeCellEditsByRepo): RepoGradeCellEditsByRepo {
  const repos = Object.create(null) as PersistedCellsByCourse[string];
  for (const [repo, editsByFolder] of Object.entries(edits)) {
    const folders = Object.create(null) as PersistedCellsByCourse[string][string];
    for (const [folder, edit] of Object.entries(editsByFolder)) {
      const cell = toPersisted(edit, "");
      if (JSON.stringify(cell) !== DEFAULT_PERSISTED_CELL) folders[folder] = cell;
    }
    if (Object.keys(folders).length) repos[repo] = folders;
  }
  return restoreRepoGradeCells(parseStoredCells(JSON.stringify({ course: repos })).course);
}

/** The owner creates one cache per app session. An account or lifetime change
 * erases every cached course. Leaving a course revokes its outstanding scope.
 */
export function createRepoGradesDraftSession() {
  const courses = new Map<string, CourseEntry>();
  let identity: { accountId: string; lifetimeId: string } | null = null;
  let active: { courseId: string; scope: Scope } | null = null;

  function clearAccount(): void {
    courses.clear();
    identity = null;
    active = null;
  }

  function activate(accountId: string, lifetimeId: string, courseId: string | null): Scope | null {
    if (identity?.accountId !== accountId || identity.lifetimeId !== lifetimeId) {
      clearAccount();
      identity = { accountId, lifetimeId };
    }
    if (courseId === null) {
      active = null;
      return null;
    }
    if (active?.courseId !== courseId) {
      active = { courseId, scope: {} };
    }
    return active.scope;
  }

  function read(scope: Scope): RepoGradesDraftSessionSnapshot | undefined {
    const entry = active?.scope === scope ? courses.get(active.courseId)?.snapshot : undefined;
    if (!entry) return undefined;
    return {
      ...entry,
      liveEdits: cloneEdits(entry.liveEdits),
      persistedBaseline: cloneEdits(entry.persistedBaseline),
    };
  }

  /** Seed a course from the store's readback, preserving legacy entries. */
  function initialize(scope: Scope, persistedBaseline: RepoGradeCellEditsByRepo): void {
    if (active?.scope !== scope || courses.has(active.courseId)) return;
    const baseline = cloneEdits(persistedBaseline);
    courses.set(active.courseId, {
      snapshot: { liveEdits: baseline, persistedBaseline: baseline, saveNotice: null, saveStatus: "ready" },
      pendingSave: null,
    });
  }

  /** Call during the authorized edit transition, before scheduling any save. */
  function recordEdit(scope: Scope, liveEdits: RepoGradeCellEditsByRepo): boolean {
    if (active?.scope !== scope) return false;
    const entry = courses.get(active.courseId);
    if (!entry) return false;
    entry.snapshot = { ...entry.snapshot, liveEdits: cloneEdits(liveEdits) };
    return true;
  }

  /** Pass edits and expected to the store. Acknowledge only the result of that
   * write. Use "uncertain" when the write may have occurred without a
   * definitive result. That course cannot save again against the old baseline.
   */
  function beginSave(scope: Scope) {
    if (active?.scope !== scope) return undefined;
    const { courseId } = active;
    const entry = courses.get(courseId);
    if (!entry || entry.snapshot.saveStatus !== "ready") return undefined;
    const { liveEdits, persistedBaseline } = entry.snapshot;
    const baseline = normalizePersistedBaseline(liveEdits);
    const edits = cloneEdits(liveEdits);
    const expected = cloneEdits(persistedBaseline);
    const attempt = Symbol();
    entry.pendingSave = attempt;
    entry.snapshot = { ...entry.snapshot, saveStatus: "pending" };
    return {
      edits,
      expected,
      acknowledge(outcome: boolean | "uncertain"): void {
        // Selection may move while a write completes. The course entry lives
        // until discard or account reset, which revoke even confirmed callbacks.
        if (courses.get(courseId) !== entry || entry.pendingSave !== attempt) return;
        entry.pendingSave = null;
        entry.snapshot = {
          ...entry.snapshot,
          persistedBaseline: outcome === true ? baseline : entry.snapshot.persistedBaseline,
          saveNotice: outcome === true ? null : REPO_GRADE_SESSION_SAVE_FAILURE,
          saveStatus: outcome === "uncertain" ? "uncertain" : "ready",
        };
      },
    };
  }

  function acknowledgeDiscard(scope: Scope, success: boolean): void {
    if (active?.scope !== scope || !success) return;
    courses.delete(active.courseId);
    active = null;
  }

  return { activate, read, initialize, recordEdit, beginSave, acknowledgeDiscard, clearAccount };
}
