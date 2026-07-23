import { canvasError, resolveCourse } from "../canvas-core";
import { safeFetchAll, writeJson } from "./fetch-helpers";
import type { CanvasRubric, RubricCriterionInput, RubricDetail } from "./types";
import type { RawRubricCriterion } from "./raw-types";

/** List the course's grading rubrics. */
export async function listRubrics(courseUrl: string, code?: string): Promise<CanvasRubric[]> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await safeFetchAll<{ id?: number; title?: string }>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubrics?per_page=100`,
    ctx
  );
  return raw
    .filter((r) => typeof r.id === "number")
    .map((r) => ({ id: r.id!, title: (r.title ?? "").trim() || `Rubric ${r.id}` }));
}

function appendRubricFields(params: URLSearchParams, title: string, criteria: RubricCriterionInput[]): void {
  params.append("rubric[title]", title.trim());
  params.append("rubric[free_form_criterion_comments]", "false");
  criteria.forEach((c, i) => {
    params.append(`rubric[criteria][${i}][description]`, c.description.trim() || `Criterion ${i + 1}`);
    if (c.longDescription?.trim()) {
      params.append(`rubric[criteria][${i}][long_description]`, c.longDescription.trim());
    }
    params.append(`rubric[criteria][${i}][points]`, String(c.points));
    c.ratings.forEach((r, j) => {
      params.append(`rubric[criteria][${i}][ratings][${j}][description]`, r.description.trim() || `${r.points} pts`);
      if (r.longDescription?.trim()) {
        params.append(`rubric[criteria][${i}][ratings][${j}][long_description]`, r.longDescription.trim());
      }
      params.append(`rubric[criteria][${i}][ratings][${j}][points]`, String(r.points));
    });
  });
}

/** Fetch one rubric with its criteria + rating tiers, for the editor. */
export async function getRubric(courseUrl: string, rubricId: number, code?: string): Promise<RubricDetail> {
  const ctx = resolveCourse(courseUrl, code);
  const response = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubrics/${rubricId}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!response.ok) throw canvasError(response.status, ctx.institution);
  const data = (await response.json()) as { id?: number; title?: string; data?: RawRubricCriterion[] };
  return {
    id: data.id ?? rubricId,
    title: (data.title ?? "").trim(),
    criteria: (data.data ?? []).map((c) => ({
      description: (c.description ?? "").trim(),
      longDescription: c.long_description?.trim() || undefined,
      points: typeof c.points === "number" ? c.points : 0,
      ratings: (c.ratings ?? []).map((r) => ({
        description: (r.description ?? "").trim(),
        longDescription: r.long_description?.trim() || undefined,
        points: typeof r.points === "number" ? r.points : 0,
      })),
    })),
  };
}

/** Update an existing rubric's title + criteria/tiers in place. */
export async function updateRubric(
  courseUrl: string,
  rubricId: number,
  input: { title: string; criteria: RubricCriterionInput[] },
  code?: string
): Promise<void> {
  if (!input.title.trim()) throw new Error("A rubric needs a title.");
  if (input.criteria.length === 0) throw new Error("A rubric needs at least one criterion.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  appendRubricFields(params, input.title, input.criteria);
  await writeJson(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubrics/${rubricId}`, "PUT", ctx, params);
}

/**
 * Create a new course rubric from criteria + point-tier ratings. When
 * `associateAssignmentId` is given, the rubric is attached to that assignment in
 * the same call (and used for grading), so it shows up in SpeedGrader.
 */
export async function createRubric(
  courseUrl: string,
  input: {
    title: string;
    criteria: RubricCriterionInput[];
    associateAssignmentId?: number;
    useForGrading?: boolean;
  },
  code?: string
): Promise<{ id: number; title: string }> {
  if (!input.title.trim()) throw new Error("A rubric needs a title.");
  if (input.criteria.length === 0) throw new Error("A rubric needs at least one criterion.");
  const ctx = resolveCourse(courseUrl, code);

  const params = new URLSearchParams();
  appendRubricFields(params, input.title, input.criteria);
  if (typeof input.associateAssignmentId === "number") {
    params.append("rubric_association[association_type]", "Assignment");
    params.append("rubric_association[association_id]", String(input.associateAssignmentId));
    params.append("rubric_association[purpose]", "grading");
    params.append("rubric_association[use_for_grading]", String(input.useForGrading ?? true));
  }

  const data = await writeJson<{ rubric?: { id?: number; title?: string }; id?: number; title?: string }>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubrics`,
    "POST",
    ctx,
    params
  );
  const r = data.rubric ?? data;
  if (typeof r.id !== "number") throw new Error("Canvas did not return the new rubric.");
  return { id: r.id, title: (r.title ?? input.title).trim() || input.title.trim() };
}

/** Attach a rubric to many assignments (one rubric_association per assignment). */
export async function bulkAssociateRubric(
  courseUrl: string,
  rubricId: number,
  assignmentIds: string[],
  code?: string
): Promise<{ updated: number; failures: Array<{ id: string; error: string }> }> {
  const ctx = resolveCourse(courseUrl, code);
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of assignmentIds) {
    try {
      const params = new URLSearchParams();
      params.append("rubric_association[rubric_id]", String(rubricId));
      params.append("rubric_association[association_type]", "Assignment");
      params.append("rubric_association[association_id]", id);
      params.append("rubric_association[purpose]", "grading");
      params.append("rubric_association[use_for_grading]", "true");
      await writeJson(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubric_associations`, "POST", ctx, params);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Could not associate the rubric." });
    }
  }
  return { updated, failures };
}
