import { EMPTY_REPO_GRADE_CELL_EDITS, setRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { createRepoGradesDraftSession } from "./repoGradesDraftSession";
import { updateRepoGradesCourseEdits, type RepoGradesCourseEdits } from "./repoGradesDashboardModel";
import { describeRestoredRepoGradeCells } from "./repoGradesResultsStore";

type CourseDraft = RepoGradesCourseEdits & {
  courseId: string;
  restoredNotice: string | null;
  saveNotice: string | null;
  discardNotice: string | null;
  savePending: boolean;
  saveDue: boolean;
};

type CourseState = {
  revision: number;
  attemptedRevision: number;
  restoredNotice: string | null;
  canSave: boolean;
  discardNotice: string | null;
};

interface DraftStorage {
  restore(courseId: string): { edits: RepoGradeCellEditsByRepo; notice: string | null };
  save(courseId: string, edits: RepoGradeCellEditsByRepo, expected: RepoGradeCellEditsByRepo): string | null | Promise<string | null>;
  discard(courseId: string): { notice: string | null };
}

function newCourseState(notice: string | null, edits: RepoGradeCellEditsByRepo): CourseState {
  return {
    revision: 0,
    attemptedRevision: 0,
    restoredNotice: notice
      ? `${notice} Edits are available while Repo Grades stays open.`
      : describeRestoredRepoGradeCells(edits),
    canSave: notice === null,
    discardNotice: null,
  };
}

function endAbandonedActions(edits: RepoGradeCellEditsByRepo): RepoGradeCellEditsByRepo {
  let next = edits;
  for (const [repo, folders] of Object.entries(edits)) {
    for (const [folder, edit] of Object.entries(folders)) {
      if (edit.grading) next = setRepoGradeCellEdit(next, repo, folder, { grading: false });
      if (edit.postStatus === "posting") {
        next = setRepoGradeCellEdit(next, repo, folder, {
          postStatus: "error",
          postMessage: "The post outcome could not be confirmed. Check the Canvas gradebook before re-posting.",
        });
      }
    }
  }
  return next;
}

/** Owns the active selection and records edits before React schedules a save. */
export function createRepoGradesDraftController(accountId: string, storage: DraftStorage) {
  const session = createRepoGradesDraftSession();
  const courses = new Map<string, CourseState>();
  const listeners = new Set<() => void>();
  // Each controller belongs to one keyed account mount and is reset on unmount.
  const lifetimeId = "repo-grades-mount";
  let current: CourseDraft | null = null;

  function publish(next: CourseDraft | null) {
    if (current === next) return;
    current = next;
    listeners.forEach((listener) => listener());
  }

  function select(courseId: string) {
    if (current?.courseId === courseId) return;
    const scope = session.activate(accountId, lifetimeId, courseId)!;
    const saved = session.read(scope);
    let course = courses.get(courseId);
    if (!saved || !course) {
      const { edits, notice } = storage.restore(courseId);
      session.initialize(scope, edits);
      course = newCourseState(notice, edits);
      courses.set(courseId, course);
    }
    const snapshot = session.read(scope)!;
    const edits = endAbandonedActions(snapshot.liveEdits);
    if (edits !== snapshot.liveEdits) session.recordEdit(scope, edits);
    publish({
      courseId,
      scope,
      edits,
      restoredNotice: course.restoredNotice,
      saveNotice: snapshot.saveNotice,
      discardNotice: course.discardNotice,
      savePending: snapshot.saveStatus === "pending",
      saveDue: snapshot.saveStatus === "ready" && course.canSave && course.revision !== course.attemptedRevision,
    });
  }

  function leave() {
    session.activate(accountId, lifetimeId, null);
    publish(null);
  }

  function isCurrent(scope: object | null): boolean {
    return !!current && current.scope === scope;
  }

  function edit(scope: object | null, update: (edits: RepoGradeCellEditsByRepo) => RepoGradeCellEditsByRepo) {
    if (!current || current.scope !== scope) return;
    const next = updateRepoGradesCourseEdits(current, current.scope, update);
    if (next === current || !session.recordEdit(current.scope, next.edits)) return;
    const course = courses.get(current.courseId)!;
    course.revision += 1;
    publish({ ...current, edits: next.edits, saveDue: course.canSave && !current.savePending });
  }

  async function save(scope: object) {
    if (!current || current.scope !== scope || !current.saveDue) return;
    const { courseId } = current;
    const course = courses.get(courseId)!;
    const attempt = session.beginSave(scope);
    if (!attempt) return;
    course.attemptedRevision = course.revision;
    publish({ ...current, savePending: true, saveDue: false });
    let outcome: boolean | "uncertain";
    try {
      outcome = (await storage.save(courseId, attempt.edits, attempt.expected)) === null;
    } catch {
      outcome = "uncertain";
    }
    attempt.acknowledge(outcome);
    if (outcome === "uncertain") course.canSave = false;
    // A returned selection may see the result for its course. A discard or a
    // lifetime reset replaces the course entry and revokes that acknowledgement.
    if (current?.courseId !== courseId || courses.get(courseId) !== course) return;
    const snapshot = session.read(current.scope)!;
    publish({
      ...current,
      saveNotice: snapshot.saveNotice,
      savePending: false,
      saveDue: course.canSave && course.revision !== course.attemptedRevision,
    });
  }

  function discard(scope: object): boolean {
    if (!current || current.scope !== scope || current.savePending) return false;
    const { courseId } = current;
    const course = courses.get(courseId)!;
    const { notice } = storage.discard(courseId);
    if (notice !== null) {
      course.discardNotice = notice;
      publish({ ...current, discardNotice: notice });
      return false;
    }
    session.acknowledgeDiscard(scope, true);
    const nextScope = session.activate(accountId, lifetimeId, courseId)!;
    session.initialize(nextScope, EMPTY_REPO_GRADE_CELL_EDITS);
    courses.set(courseId, newCourseState(null, EMPTY_REPO_GRADE_CELL_EDITS));
    publish({ courseId, scope: nextScope, edits: EMPTY_REPO_GRADE_CELL_EDITS, restoredNotice: null,
      saveNotice: null, discardNotice: null, savePending: false, saveDue: false });
    return true;
  }

  return {
    select, leave, edit, save, discard, isCurrent,
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    reset() {
      session.clearAccount();
      courses.clear();
      publish(null);
    },
  };
}
