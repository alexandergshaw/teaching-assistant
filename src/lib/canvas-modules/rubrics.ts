import { canvasError, parseNextLink, resolveCourse } from "../canvas-core";
import { fetchAll, writeJson, type CourseContext } from "./fetch-helpers";
import { createThrottleBudget } from "../canvas-throttle";
import type { CanvasRubric, RubricCriterionInput, RubricDetail } from "./types";
import type { RawRubricCriterion } from "./raw-types";

function mapRawRubrics(raw: Array<{ id?: number; title?: string }>, source: "course" | "account"): CanvasRubric[] {
  return raw
    .filter((r) => typeof r.id === "number")
    .map((r) => ({ id: r.id!, title: (r.title ?? "").trim() || `Rubric ${r.id}`, source }));
}

/** One source's outcome: `ok: true` means Canvas actually answered (even with
 * zero rubrics, or - for the account source - a permission response that is
 * treated as "not visible to this token" rather than a failure). `ok: false`
 * means the fetch itself broke, and `error` explains why. */
type SourceOutcome = { ok: true; rubrics: CanvasRubric[] } | { ok: false; rubrics: []; error: string };

/** List the course's own rubrics. Any failure here (bad token, wrong course,
 * Canvas outage) is a real error, not "no rubrics" - see AC3/bug #2: this
 * used to run through safeFetchAll, which swallowed every failure into an
 * empty list indistinguishable from a course that genuinely has none. */
async function listCourseRubrics(ctx: CourseContext): Promise<SourceOutcome> {
  try {
    const raw = await fetchAll<{ id?: number; title?: string }>(
      `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/rubrics?per_page=100`,
      ctx
    );
    return { ok: true, rubrics: mapRawRubrics(raw, "course") };
  } catch (err) {
    return { ok: false, rubrics: [], error: err instanceof Error ? err.message : "Could not load this course's rubrics." };
  }
}

/**
 * Resolve the Canvas account a course belongs to, via GET /courses/:id's
 * `account_id` field. Verified against Canvas's own Courses API docs
 * (https://canvas.instructure.com/doc/api/courses.html), which document the
 * Course object as including `account_id` ("the account associated with the
 * course") right alongside `id`/`name` in its example response. This app's
 * resolveCourse only carries a course id + institution credentials - it has
 * no account id of its own - so this one extra GET is the only way to reach
 * it from what the app already has.
 */
async function resolveAccountId(ctx: CourseContext): Promise<{ accountId: number | null; error?: string }> {
  let response: Response;
  try {
    response = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
  } catch (err) {
    return {
      accountId: null,
      error: err instanceof Error ? err.message : "Could not reach Canvas to resolve this course's account.",
    };
  }
  // A token that cannot even read the course record itself is the ordinary
  // shape of "this instructor has no account-admin visibility" - the common
  // case for a non-admin instructor token (AC6: this must not read as an
  // error on every normal course load). Canvas commonly answers a 404 (not
  // 401/403) for an account-scoped resource a token cannot see, so it is
  // folded into the same silent bucket. Any other failure is a real problem.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return { accountId: null };
  }
  if (!response.ok) {
    return { accountId: null, error: `Could not resolve this course's Canvas account (HTTP ${response.status}).` };
  }
  // The `.json()` parse can itself reject (a 200 that is actually a login
  // page, a proxy interstitial, or a truncated body - none of which are rare
  // on institution networks) - that must not escape as an unhandled
  // rejection out of listAccountRubrics/listRubrics (finding 2: it used to,
  // discarding whatever the course-level source loaded via the shared
  // Promise.all).
  let data: { account_id?: number };
  try {
    data = (await response.json()) as { account_id?: number };
  } catch (err) {
    return {
      accountId: null,
      error:
        err instanceof Error
          ? err.message
          : "Could not read Canvas's response resolving this course's account.",
    };
  }
  if (typeof data.account_id !== "number") {
    // No account reported is the same "not visible to this token" shape as
    // 401/403/404 above, not a fault of its own (finding 3) - a course whose
    // token has no account-admin visibility should not get a red note on
    // every Modules-view mount.
    return { accountId: null };
  }
  return { accountId: data.account_id };
}

/**
 * List rubrics defined on the course's Canvas ACCOUNT (shared across every
 * course under that account) - verified against Canvas's Rubrics API docs
 * (https://canvas.instructure.com/doc/api/rubrics.html), which document GET
 * /api/v1/accounts/:account_id/rubrics as a real, separate endpoint from the
 * course-level one this file already called.
 *
 * A 401/403/404 anywhere in this path (resolving the account, or listing its
 * rubrics) is treated as "not visible to this token", not an error - almost
 * every instructor token lacks account-admin rights, and account-level
 * rubrics being invisible to them is the everyday case (AC6), not a fault.
 * 404 is included alongside 401/403 because Canvas commonly answers with it
 * (rather than a permission status) for an account-scoped resource a token
 * cannot see. Any other failure (network error, unexpected response, a body
 * that is not the JSON it claims to be, Canvas outage) is a real error,
 * surfaced so it is never confused with "this account genuinely has no
 * rubrics" (AC3).
 */
async function listAccountRubrics(ctx: CourseContext): Promise<SourceOutcome> {
  const resolved = await resolveAccountId(ctx);
  if (resolved.accountId == null) {
    return resolved.error ? { ok: false, rubrics: [], error: resolved.error } : { ok: true, rubrics: [] };
  }
  let next: string | null = `${ctx.baseUrl}/api/v1/accounts/${resolved.accountId}/rubrics?per_page=100`;
  const all: Array<{ id?: number; title?: string }> = [];
  while (next) {
    let response: Response;
    try {
      response = await fetch(next, { headers: { Authorization: `Bearer ${ctx.token}` } });
    } catch (err) {
      return {
        ok: false,
        rubrics: [],
        error: err instanceof Error ? err.message : "Could not reach Canvas for account-level rubrics.",
      };
    }
    // Canvas commonly answers 404 (not 401/403) for an account-scoped
    // resource a token cannot see (finding 4) - folded into the same silent
    // "not visible to this token" bucket as 401/403. A 429 (throttled) is
    // deliberately NOT included here: this raw fetch has no retry of its own
    // (unlike bulkAssociateRubric's throttled loop), so silently reading a
    // 429 as "no account rubrics" would hide a transient, often-fixable
    // condition behind a false "genuinely empty" result - it falls through
    // to the generic `!response.ok` branch below and is surfaced as a real
    // error instead.
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return { ok: true, rubrics: [] };
    }
    if (!response.ok) {
      return { ok: false, rubrics: [], error: `Could not load account-level rubrics (HTTP ${response.status}).` };
    }
    // See resolveAccountId's matching try/catch above (finding 2): a 200
    // response is not a guarantee `.json()` succeeds.
    let page: Array<{ id?: number; title?: string }>;
    try {
      page = (await response.json()) as Array<{ id?: number; title?: string }>;
    } catch (err) {
      return {
        ok: false,
        rubrics: [],
        error: err instanceof Error ? err.message : "Could not read account-level rubrics response.",
      };
    }
    all.push(...page);
    next = parseNextLink(response.headers.get("link"));
  }
  return { ok: true, rubrics: mapRawRubrics(all, "account") };
}

/**
 * List every rubric available to the course: its own course-level rubrics
 * plus any defined on its Canvas account (AC1/AC2). Never throws - each
 * source is fetched independently, so one source failing never discards
 * rubrics the other source loaded (AC4): `error` is set whenever at least one
 * source genuinely failed (its message describing which), while `rubrics`
 * always holds whatever DID load. A caller checking `result.error` can tell
 * "this course really has no rubrics" (rubrics: [], no error) apart from "we
 * could not load your rubrics" (error set) - see useRubrics.ts.
 */
export async function listRubrics(
  courseUrl: string,
  code?: string
): Promise<{ rubrics: CanvasRubric[]; error?: string }> {
  const ctx = resolveCourse(courseUrl, code);
  const [course, account] = await Promise.all([listCourseRubrics(ctx), listAccountRubrics(ctx)]);
  const rubrics = [...course.rubrics, ...account.rubrics];
  const errors = [course, account].filter((r): r is Extract<SourceOutcome, { ok: false }> => !r.ok).map((r) => r.error);
  return errors.length ? { rubrics, error: errors.join(" ") } : { rubrics };
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
  // One shared throttle budget across every association in this loop - see
  // src/lib/canvas-throttle.ts for why an unbounded per-write retry would risk
  // the 60s function cap here under a sustained throttle.
  const ctx = { ...resolveCourse(courseUrl, code), throttleBudget: createThrottleBudget() };
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
