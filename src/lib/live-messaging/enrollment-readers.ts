/**
 * Aggregator glue (LIVE-LMS-STUDENT-MESSAGING W3 core): a concrete
 * EnrollmentReaders that composes the real Canvas readers so
 * enrollment-aggregator.ts can run against live Canvas. Pure composition; the
 * view shell that calls it lands in W3-surface, so it has no caller yet (like
 * the W1 modules).
 *
 * TERM BINDING. listActiveTeacherCourses (canvas/listings.ts) is active-only
 * but carries no term; listCoursesByTerm has termName but is not active-only.
 * Chosen: the ACTIVE list is authoritative for membership, and termName is
 * looked up by course id from listCoursesByTerm(code, ""). If the term lookup
 * throws, courses still list with termName null (term is a display column, so
 * it must not blank the table); if the active list throws, the error
 * propagates and the aggregator reports it as listError.
 *
 * MISSING. resolveInstitutionByCode (which wraps resolveCanvasCredential)
 * yields the institution/token/baseUrl the grid reader needs; assignments come
 * from listAssignments, the grid from listCourseSubmissionGrid, folded through
 * countMissingByUser (Canvas's own missing flag, never re-derived).
 *
 * Every reader function is injectable (LiveCanvasDeps) so tests mock the
 * readers, never the network.
 */

import { resolveInstitutionByCode } from "../canvas-core";
import {
  listActiveTeacherCourses,
  listAssignments,
  listCourseRoster,
  listCoursesByTerm,
  listStudentGradeSummaries,
} from "../canvas/listings";
import { listCourseSectionAssignments } from "../canvas/sections";
import { listCourseSubmissionGrid } from "../canvas/submissions-grid";
import { countMissingByUser, type EnrollmentReaders } from "./enrollment-aggregator";

export interface LiveCanvasDeps {
  resolveInstitutionByCode: typeof resolveInstitutionByCode;
  listActiveTeacherCourses: typeof listActiveTeacherCourses;
  listCoursesByTerm: typeof listCoursesByTerm;
  listAssignments: typeof listAssignments;
  listCourseRoster: typeof listCourseRoster;
  listStudentGradeSummaries: typeof listStudentGradeSummaries;
  listCourseSectionAssignments: typeof listCourseSectionAssignments;
  listCourseSubmissionGrid: typeof listCourseSubmissionGrid;
}

const REAL_DEPS: LiveCanvasDeps = {
  resolveInstitutionByCode,
  listActiveTeacherCourses,
  listCoursesByTerm,
  listAssignments,
  listCourseRoster,
  listStudentGradeSummaries,
  listCourseSectionAssignments,
  listCourseSubmissionGrid,
};

export function buildLiveEnrollmentReaders(deps: LiveCanvasDeps = REAL_DEPS): EnrollmentReaders {
  return {
    async listCourses(institution) {
      const ctx = await deps.resolveInstitutionByCode(institution);
      const active = await deps.listActiveTeacherCourses(ctx);
      const termById = new Map<string, string | null>();
      try {
        for (const c of await deps.listCoursesByTerm(institution, "")) termById.set(c.id, c.termName);
      } catch {
        // Term is display-only: degrade to null rather than blank the table.
      }
      return active.map((c) => ({ id: c.id, name: c.name, termName: termById.get(c.id) ?? null }));
    },

    async listRoster(institution, courseId) {
      const roster = await deps.listCourseRoster(institution, courseId);
      return roster.map((r) => ({ id: r.id, name: r.name, sortableName: r.sortableName }));
    },

    async listGrades(institution, courseId) {
      const grades = await deps.listStudentGradeSummaries(institution, courseId);
      return grades.map((g) => ({ userId: g.userId, currentScore: g.currentScore }));
    },

    async listMissing(institution, courseId) {
      const { institution: inst, token, baseUrl } = await deps.resolveInstitutionByCode(institution);
      const assignments = await deps.listAssignments(institution, courseId);
      const grid = await deps.listCourseSubmissionGrid(
        baseUrl,
        token,
        inst,
        courseId,
        assignments.map((a) => a.id)
      );
      return countMissingByUser(grid.rows);
    },

    async listSections(institution, courseId) {
      const sections = await deps.listCourseSectionAssignments(institution, courseId);
      return sections.map((s) => ({ userId: s.userId, sectionId: s.sectionId, sectionName: s.sectionName }));
    },
  };
}
