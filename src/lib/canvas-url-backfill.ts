// Chunk 3h Limit 14 close (docs/REGRESSION.md entry 315, check 14): an export
// imported BEFORE commit f47615c never got its row's canvasUrl stamped with
// the cartridge's own Canvas identity (entry 315 check 9 only reaches
// imports made from that commit forward), so its live counterpart still
// dead-ends with "No saved course is linked to /courses/<id> ...". This is
// the pure decision half of closing that gap: GIVEN an already-loaded
// export's identity and the owner's saved rows, decide whether (and what) to
// stamp. No I/O, no Supabase, no mutation - the caller
// (src/app/components/ContentTab.tsx, right after a successful EXPORT
// selection load) is the only thing that acts on this file's verdict, the
// same posture src/lib/imported-export-destination.ts's
// chooseImportDestination already takes for the at-import-time stamp this
// widens the coverage of.
//
// DESIGN DECISION (overrides an earlier scoping pass that recommended
// stamping inside readExportCourseContentForRow,
// src/lib/lms-export-source/read-export-course-content.ts): that function is
// a shared READ path, called server-side from
// src/app/api/lms-export/selection/route.ts and from inside unattended
// workflow runs. Making a shared read path a silent writer is not
// acceptable. This module stays pure; the write happens client-side, in
// ContentTab, at the one moment an instructor is demonstrably looking at
// this course's export.
import { parseCanvasCourseId } from "./canvas-url";
import { cartridgeCanvasUrl, type CartridgeCanvasIdentity } from "./cartridge-canvas-identity";

/**
 * Decide the Canvas URL to stamp onto `targetCourseId`'s saved row, or
 * `null` to do nothing. Refuses (returns `null`) when ANY of the following
 * hold - each one is a reason the stamp would be wrong, not merely
 * unnecessary:
 *
 *   - `identity` is undefined, or `cartridgeCanvasUrl(identity)` is null -
 *     no Canvas identity at all (a non-Canvas Common Cartridge or Blackboard
 *     archive has no context.xml - entry 315 check 16), or a non-numeric
 *     `courseId` that `parseCanvasCourseId` could never parse back out
 *     (cartridge-canvas-identity.ts's own ALL_DIGITS guard).
 *
 *   - `targetCourseId` is not in `courses` - nothing to stamp.
 *
 *   - the target row's own `canvasUrl` is already non-blank. A stored value
 *     is evidence, not a coincidence to overwrite - the same rule
 *     src/lib/imported-export-destination.ts's match order (b) applies
 *     before it will stamp a name-matched row.
 *
 *   - ANY OTHER row's `canvasUrl` already parses (via `parseCanvasCourseId`)
 *     to the SAME Canvas course id. THIS IS THE IMPORTANT REFUSAL. Read
 *     src/lib/course-canvas-url-match.ts:364-371 (branch (b) of
 *     findCourseForCanvasUrl) before assuming this is merely cautious: that
 *     function returns `null` - a deliberate, permanent "unresolvable" -
 *     the moment TWO host-inconclusive saved rows share a numeric course id
 *     and `institution` cannot separate them, because at that point id alone
 *     can never again tell them apart. A backfill that stamped a SECOND row
 *     with an id some other row already carries would MANUFACTURE exactly
 *     that unresolvable state from a previously-fine one - silently turning
 *     one resolvable row into two rows that both fail. Refusing here is the
 *     only way to guarantee this backfill can never make
 *     findCourseForCanvasUrl's outcome for this id worse than it already
 *     was.
 *
 * Every other row's `canvasUrl` is read in BOTH the host-less (`/courses/id`)
 * and full-URL (`https://host/courses/id`) shapes this app actually stores -
 * `parseCanvasCourseId`'s regex matches either, so no separate normalization
 * is needed here for that.
 */
export function planCanvasUrlBackfill(
  courses: { id: string; canvasUrl: string | null }[],
  targetCourseId: string,
  identity: CartridgeCanvasIdentity | undefined
): string | null {
  if (!identity) return null;
  const url = cartridgeCanvasUrl(identity);
  if (!url) return null;

  const target = courses.find((c) => c.id === targetCourseId);
  if (!target) return null;
  if ((target.canvasUrl ?? "").trim()) return null;

  const targetId = parseCanvasCourseId(url);
  if (!targetId) return null;

  const collides = courses.some((c) => {
    if (c.id === targetCourseId) return false;
    const stored = (c.canvasUrl ?? "").trim();
    return !!stored && parseCanvasCourseId(stored) === targetId;
  });
  if (collides) return null;

  return url;
}
