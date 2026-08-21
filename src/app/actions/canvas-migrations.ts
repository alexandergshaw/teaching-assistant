"use server";

import {
  listContentMigrations,
  getMigrationProgress,
  cancelMigrationJob,
  type ContentMigrationRow,
  type MigrationProgress,
} from "@/lib/canvas-modules";
import { requireOwner } from "@/lib/supabase/auth";

// ── Canvas jobs diagnostics screen ───────────────────────────────────────────
// Canvas has no DELETE and no dequeue for a content migration - the only
// lever an instructor has on a stuck import is cancelling its Progress
// object. These actions exist to let the diagnostics screen list migrations,
// check their job state, and cancel a job, without the UI ever touching a
// Canvas bearer token directly.

/** List a course's content migrations, newest first. */
export async function listContentMigrationsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ migrations: ContentMigrationRow[] } | { error: string }> {
  try {
    await requireOwner();
    return { migrations: await listContentMigrations(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the content migrations." };
  }
}

/**
 * Resolve every migration row's Progress object in one round trip instead of
 * one request per row - a course can have dozens of migrations, and the
 * diagnostics screen loads all of them at once. A single bad progress URL
 * (foreign origin, 404, network error) must not fail the whole page, so each
 * lookup is isolated under its own URL key.
 *
 * WHY THE FAILURE REASON IS RETURNED RATHER THAN SWALLOWED: an earlier draft
 * collapsed every per-URL failure to a bare `null`, which made the one
 * security-relevant case - getMigrationProgress refusing a progress_url on a
 * foreign origin (the SSRF guard in src/lib/canvas-modules/migrations.ts) -
 * render identically to an ordinary 404. On a screen whose entire purpose is
 * explaining WHY an import is stuck, "could not be loaded" with no reason is
 * the one answer that helps nobody. The reason travels back in a sibling
 * `progressErrors` map keyed by the same URL, so `progress[url] === null`
 * still means "no data" for every existing consumer while the explanation is
 * available alongside it.
 */
export async function listMigrationProgressAction(
  courseUrl: string,
  progressUrls: string[],
  acronym?: string
): Promise<
  | { progress: Record<string, MigrationProgress | null>; progressErrors: Record<string, string> }
  | { error: string }
> {
  try {
    await requireOwner();
    const entries = await Promise.all(
      progressUrls.map(async (url): Promise<[string, MigrationProgress | null, string | null]> => {
        try {
          return [url, await getMigrationProgress(courseUrl, url, acronym), null];
        } catch (err) {
          return [url, null, err instanceof Error ? err.message : "Could not read this job's progress."];
        }
      })
    );
    return {
      progress: Object.fromEntries(entries.map(([url, value]) => [url, value])),
      progressErrors: Object.fromEntries(
        entries
          .filter((entry): entry is [string, MigrationProgress | null, string] => entry[2] !== null)
          .map(([url, , reason]) => [url, reason])
      ),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the job progress." };
  }
}

/** Cancel a migration's underlying Progress job. This is a write to the live Canvas course. */
export async function cancelMigrationJobAction(
  courseUrl: string,
  migrationId: number,
  acronym?: string
): Promise<{ progressState: string } | { error: string }> {
  try {
    await requireOwner();
    return await cancelMigrationJob(courseUrl, migrationId, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not cancel the job." };
  }
}
