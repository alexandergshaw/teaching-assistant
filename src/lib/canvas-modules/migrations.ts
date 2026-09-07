/**
 * Diagnostics for a course's content migrations (Canvas import jobs).
 *
 * Why this file exists: the Canvas content_migrations API has no DELETE and
 * no documented cancel/abort on the migration resource itself. The ONLY
 * lever an operator has over a stuck import is POST'ing to the Progress
 * object's own /cancel endpoint (progress_url on the migration). A
 * diagnostics screen that pretended otherwise - showing a "delete" button
 * that cannot work, or letting a user believe cancelling removes the row -
 * would be worse than no screen at all. So this module's job is to report
 * the truth about each migration and expose exactly the one lever Canvas
 * actually offers.
 *
 * SSRF note: progress_url comes back inside Canvas's own JSON response, i.e.
 * from a remote server the app does not control the content of. Nothing here
 * may fetch a URL taken from that JSON without first checking its origin
 * matches the Canvas host this request was already authorized for - a
 * mismatch would mean sending this course's bearer token to an arbitrary
 * host named by whatever answered the content_migrations request. This was
 * the one hand-rolled instance of that check in the codebase - see
 * src/lib/canvas-remote-url.ts's own header for how it was generalized from
 * here into `assertCanvasSuppliedUrlIsSameOrigin`, which this file now calls
 * directly rather than keeping a second, locally-owned copy. Every fetch of a
 * remote-supplied URL in this file goes through it first, and dials the
 * value IT RETURNS (never the raw candidate - a relative candidate resolves
 * against the base inside the guard, so only the returned string is safe).
 */

import { canvasError, resolveCourse } from "../canvas-core";
import { assertCanvasSuppliedUrlIsSameOrigin } from "../canvas-remote-url";
import { canvasGet } from "../canvas-fetch-response";
import { fetchAll, writeJson, type CourseContext } from "./fetch-helpers";
import type { RawMigration } from "./raw-types";
// Re-exported from a client-safe leaf. Both are pure, and a Client Component
// (the diagnostics page) needs classifyMigration - but this module imports
// ../canvas-core, which is now genuinely server-only and cannot be bundled
// for a browser target. See ./migration-verdict.ts for the full reasoning.
export { classifyMigration, type MigrationVerdict } from "./migration-verdict";

/**
 * The content_migrations list/show response carries several fields
 * RawMigration (raw-types.ts) does not declare, because copy.ts - the only
 * other consumer - only ever reads `id` and `workflow_state`. Extending
 * locally rather than editing raw-types.ts keeps this addition scoped to the
 * one module that needs it, and still satisfies the repo's "no duplicate raw
 * shape" rule since it composes RawMigration instead of re-declaring its
 * fields.
 */
type RawContentMigration = RawMigration & {
  migration_type?: string;
  created_at?: string | null;
  finished_at?: string | null;
  progress_url?: string | null;
  migration_issues_count?: number;
  migration_issues_url?: string | null;
};

/** The Progress object Canvas returns from progress_url and from /cancel. */
interface RawProgress {
  id?: number;
  workflow_state?: string;
  completion?: number | null;
  message?: string | null;
}

/** One row of a course's content_migrations list, as shown on the diagnostics screen. */
export interface ContentMigrationRow {
  id: number;
  migrationType: string;
  workflowState: string;
  createdAt: string | null;
  finishedAt: string | null;
  progressUrl: string | null;
  migrationIssuesCount: number;
  migrationIssuesUrl: string | null;
}

/** The Progress object tied to one migration's job. */
export interface MigrationProgress {
  id: number;
  workflowState: string;
  completion: number | null;
  message: string | null;
}


function mapContentMigration(row: RawContentMigration): ContentMigrationRow {
  // row.id is already known numeric here - callers filter before mapping.
  return {
    id: row.id as number,
    migrationType: row.migration_type ?? "",
    workflowState: row.workflow_state ?? "",
    createdAt: row.created_at ?? null,
    finishedAt: row.finished_at ?? null,
    progressUrl: row.progress_url ?? null,
    migrationIssuesCount:
      typeof row.migration_issues_count === "number" ? row.migration_issues_count : 0,
    migrationIssuesUrl: row.migration_issues_url ?? null,
  };
}

function mapProgress(row: RawProgress): MigrationProgress {
  return {
    id: typeof row.id === "number" ? row.id : 0,
    workflowState: row.workflow_state ?? "",
    completion: typeof row.completion === "number" ? row.completion : null,
    message: row.message ?? null,
  };
}

/** Sort key for "newest first": missing/unparsable createdAt sorts as oldest,
 * never as newest - a migration with no timestamp should not jump to the top. */
function createdAtSortKey(iso: string | null): number {
  if (!iso) return -Infinity;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

/**
 * List every content migration on the course, newest first.
 *
 * Rows with no numeric id are dropped rather than mapped with a fabricated
 * id, because the id is how the diagnostics screen keys its cancel action -
 * a row this app cannot uniquely address is not safe to show a control for.
 */
export async function listContentMigrations(
  courseUrl: string,
  code?: string
): Promise<ContentMigrationRow[]> {
  const ctx = await resolveCourse(courseUrl, code);
  const rows = await fetchAll<RawContentMigration>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/content_migrations?per_page=100`,
    ctx
  );
  return rows
    .filter((row) => typeof row.id === "number")
    .map(mapContentMigration)
    .sort((a, b) => createdAtSortKey(b.createdAt) - createdAtSortKey(a.createdAt));
}

/** Shared by getMigrationProgress and cancelMigrationJob so the SSRF guard
 * lives in exactly one place for every GET of a progress_url. Guarded with
 * `assertCanvasSuppliedUrlIsSameOrigin` (src/lib/canvas-remote-url.ts) -
 * fetches the value IT RETURNS, never the raw progressUrl parameter. */
async function fetchProgress(progressUrl: string, ctx: CourseContext): Promise<MigrationProgress> {
  const safeUrl = assertCanvasSuppliedUrlIsSameOrigin(progressUrl, ctx.baseUrl);
  const response = await canvasGet(safeUrl, ctx.token);
  if (!response.ok) throw canvasError(response.status, ctx.institution);
  const data = (await response.json()) as RawProgress;
  return mapProgress(data);
}

/** Poll a migration's Progress object. progress_url is remote-supplied - see
 * the SSRF note at the top of this file; a foreign-origin URL is refused
 * before any network request is issued. */
export async function getMigrationProgress(
  courseUrl: string,
  progressUrl: string,
  code?: string
): Promise<MigrationProgress> {
  const ctx = await resolveCourse(courseUrl, code);
  return fetchProgress(progressUrl, ctx);
}

/**
 * Cancel a migration's underlying job - the only lever Canvas offers over a
 * stuck migration (see the file header). Three refusal paths, all thrown
 * rather than silently no-op'd, so the caller can surface exactly why
 * nothing happened:
 *   - no progress_url at all (migration never got far enough to have a job)
 *   - the job already finished (completed/failed)
 *   - progress_url is on a foreign origin (SSRF guard)
 */
export async function cancelMigrationJob(
  courseUrl: string,
  migrationId: number,
  code?: string
): Promise<{ progressState: string }> {
  const ctx = await resolveCourse(courseUrl, code);
  const response = await canvasGet(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/content_migrations/${migrationId}`,
    ctx.token
  );
  if (!response.ok) throw canvasError(response.status, ctx.institution);
  const raw = (await response.json()) as RawContentMigration;
  const progressUrl = raw.progress_url ?? null;
  if (!progressUrl) {
    throw new Error(
      `This migration's workflow_state is "${raw.workflow_state ?? "unknown"}" and it has no ` +
        "progress_url - there is no job to cancel and no way to delete the migration."
    );
  }

  const progress = await fetchProgress(progressUrl, ctx);
  if (progress.workflowState === "completed" || progress.workflowState === "failed") {
    throw new Error(
      `This migration's job has already finished (progress state "${progress.workflowState}"); ` +
        "there is nothing left to cancel."
    );
  }

  const safeProgressUrl = assertCanvasSuppliedUrlIsSameOrigin(progressUrl, ctx.baseUrl);
  const result = await writeJson<RawProgress>(
    `${safeProgressUrl}/cancel`,
    "POST",
    ctx,
    new URLSearchParams({ message: "Cancelled from the diagnostics screen" })
  );
  return { progressState: result.workflow_state ?? "" };
}

