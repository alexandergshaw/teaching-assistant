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
 * host named by whatever answered the content_migrations request. See
 * assertProgressUrlIsSameOrigin below; every fetch of a remote-supplied URL
 * in this file goes through it first.
 */

import { canvasError, resolveCourse } from "../canvas-core";
import { fetchAll, writeJson, type CourseContext } from "./fetch-helpers";
import type { RawMigration } from "./raw-types";

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

/** The outcome of classifying one migration+progress pair for display. */
export interface MigrationVerdict {
  kind:
    | "stuck-no-file"
    | "parked"
    | "cancellable"
    | "running"
    | "done"
    | "failed"
    | "unknown";
  /** The ONLY place any user-facing sentence about a migration's state is
   * written. The UI renders this verbatim rather than re-wording it, so a
   * wording change here is the whole fix - never patch a sentence in the UI. */
  sentence: string;
  cancellable: boolean;
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
  const ctx = resolveCourse(courseUrl, code);
  const rows = await fetchAll<RawContentMigration>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/content_migrations?per_page=100`,
    ctx
  );
  return rows
    .filter((row) => typeof row.id === "number")
    .map(mapContentMigration)
    .sort((a, b) => createdAtSortKey(b.createdAt) - createdAtSortKey(a.createdAt));
}

/**
 * Refuse to follow a remote-supplied URL that is not on the Canvas host this
 * request already resolved credentials for. Must run BEFORE any fetch of
 * that URL - never after, and never "log and continue".
 */
function assertProgressUrlIsSameOrigin(progressUrl: string, ctx: CourseContext): void {
  const progressOrigin = new URL(progressUrl).origin;
  const canvasOrigin = new URL(ctx.baseUrl).origin;
  if (progressOrigin !== canvasOrigin) {
    throw new Error(
      "Refusing to follow a progress URL that is not on this Canvas host."
    );
  }
}

/** Shared by getMigrationProgress and cancelMigrationJob so the SSRF guard
 * lives in exactly one place for every GET of a progress_url. */
async function fetchProgress(progressUrl: string, ctx: CourseContext): Promise<MigrationProgress> {
  assertProgressUrlIsSameOrigin(progressUrl, ctx);
  const response = await fetch(progressUrl, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
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
  const ctx = resolveCourse(courseUrl, code);
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
  const ctx = resolveCourse(courseUrl, code);
  const response = await fetch(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/content_migrations/${migrationId}`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
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

  assertProgressUrlIsSameOrigin(progressUrl, ctx);
  const result = await writeJson<RawProgress>(
    `${progressUrl}/cancel`,
    "POST",
    ctx,
    new URLSearchParams({ message: "Cancelled from the diagnostics screen" })
  );
  return { progressState: result.workflow_state ?? "" };
}

/**
 * Classify a migration+progress pair into exactly one verdict, PURE and
 * exhaustively unit-testable (no I/O, no imports beyond types already in
 * this file). Every user-facing sentence about a migration's state is
 * written here and ONLY here - see the MigrationVerdict.sentence doc comment.
 *
 * `progressState` is the Progress object's workflow_state, or null when
 * there is no progress object to read (no progress_url, or it was never
 * fetched). Order matters: the migration's own workflow_state is checked
 * first for the two states that mean "no job exists yet", then the
 * progress state for the states that mean an actual job is in flight, then
 * either state for the terminal outcomes, falling back to "unknown" rather
 * than inventing a diagnosis for any other combination.
 */
export function classifyMigration(
  workflowState: string,
  progressState: string | null
): MigrationVerdict {
  if (workflowState === "pre_processing") {
    return {
      kind: "stuck-no-file",
      sentence:
        "The file for this migration never finished uploading to Canvas, so there is no job to cancel and no way to delete this row.",
      cancellable: false,
    };
  }

  if (workflowState === "waiting_for_select") {
    return {
      kind: "parked",
      sentence:
        "Nothing has been imported yet - Canvas is waiting for content types to be selected, and abandoning it imports nothing.",
      cancellable: false,
    };
  }

  if (progressState === "queued") {
    return {
      kind: "cancellable",
      sentence: "This job is queued and has not started running yet. It can be cancelled.",
      cancellable: true,
    };
  }

  if (progressState === "running") {
    return {
      kind: "running",
      sentence:
        "This job is running now. Cancelling it may leave partially imported content in the course.",
      cancellable: true,
    };
  }

  if (progressState === "completed" || workflowState === "completed") {
    return {
      kind: "done",
      sentence: "This migration finished successfully. There is nothing left to do.",
      cancellable: false,
    };
  }

  if (progressState === "failed" || workflowState === "failed") {
    return {
      kind: "failed",
      sentence: "This migration's job failed. There is nothing left to cancel.",
      cancellable: false,
    };
  }

  return {
    kind: "unknown",
    sentence: `Canvas reports migration state "${workflowState}" and progress state "${
      progressState ?? "none"
    }", which does not match a known combination.`,
    cancellable: false,
  };
}
