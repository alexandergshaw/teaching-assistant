// Client-safe leaf: the pure migration verdict type and its classifier.
//
// WHY THIS FILE EXISTS. `migrations.ts` imports `../canvas-core`, which since
// the per-user credential work resolves credentials through
// `canvas-credentials.ts` -> `supabase/server.ts` -> `next/headers` and
// `node:async_hooks`. That is genuinely server-only and CANNOT be bundled for
// a browser target at all.
//
// `/account/diagnostics/page.tsx` is a Client Component and needs
// `classifyMigration`, which is pure - two strings in, a verdict object out,
// no network, no token, no environment. Importing it through the
// `@/lib/canvas-modules` barrel dragged the entire server graph into the
// browser chunk and broke `next build` outright.
//
// So the pure half lives here, importing NOTHING, and `migrations.ts`
// re-exports it so every existing server caller and the barrel are unchanged.
// A client component must import from THIS module directly - going through
// the barrel would reintroduce the exact edge this file removes.

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
