// Pulled out of ContentTab.tsx (which was pressing on the repo's 1000-line
// ceiling - src/file-size-ceiling.structure.test.ts) once this cluster grew
// large enough on its own to be a coherent, self-contained boundary: a
// constant plus two module-level async helpers, none of which read or write
// any React state and none of which are hooks - they take their inputs as
// plain parameters and return plain values, exactly like this directory's
// other non-hook leaf modules (course-copy-purge.ts, importCourseExportPipeline.ts).
// Same idiom recording/useDiscussionSessionSummary.ts and
// recording/CarriedKnowledgePages.tsx used for their own extraction out of a
// panel nearing the same ceiling.
//
// M12c (docs/module-intro-video-script-acceptance-criteria.md, finding 16):
// `tryExportFallbackForFailedLiveRead` is source-referenced by name from
// src/app/actions/lms-syllabus-buttons.test.ts's own comment (that test
// verifies the action this function calls, not this function itself - this
// repo's vitest renders no component, so this glue is verified by reading,
// per that test's own note). That reference is prose only, not a source-text
// scan of this file's path, so moving this function here does not require
// touching that test.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveLmsCourseRowAction,
  listCourseHubAction,
  updateCourseHubAction,
} from "../../actions";
import { readExportCourseContentById } from "@/lib/lms-export-source";
import type { ExportCourseContent } from "@/lib/lms-export-source";
import type { CartridgeCanvasIdentity } from "@/lib/cartridge-canvas-identity";
import { planCanvasUrlBackfill } from "@/lib/canvas-url-backfill";
import { cartridgeCanvasUrl } from "@/lib/cartridge-canvas-identity";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { latestSourceExportFile } from "@/lib/courses-table-helpers";
import type { Database } from "@/lib/supabase/types";

// The "no identity at all" value, so the precondition in
// backfillCanvasUrlForExportSelection can ask cartridgeCanvasUrl the same
// question it would ask for a real identity, rather than spelling a second,
// drift-prone version of that refusal here.
const EMPTY_CANVAS_IDENTITY = { courseId: null, courseName: null, canvasDomain: null };

/**
 * Whether the course picker offers export-sourced courses. TRUE as of
 * docs/REGRESSION.md entry 264 check 9's type widening.
 *
 * The render path this flag used to gate now exists: `loadContent`'s export
 * branch fills `exportContent`, real state ModulesView reads (not the
 * write-only `exportContentRef` this used to be), and converts via
 * `display-module-tree.ts`'s `DisplayModule`/`DisplayModuleItem` - a view
 * model with every Canvas-only field OPTIONAL rather than a widening of
 * `CanvasModuleItem` itself (that type stays exactly as it was, since the
 * Canvas write layer genuinely requires those fields everywhere else).
 * `ModuleCard`/`ModuleItemRow`/`AddItemRow` are retyped against it: a live
 * item/module carries its exact original `CanvasModule`/`CanvasModuleItem`
 * under `.raw` (never fabricated - the same reference, not a clone) for the
 * write controls that need it; an export item/module has no `.raw` and
 * renders the smaller, honest read/select-only row those three components'
 * own early-return branches define. Verified end to end with a standalone
 * fixture rendering the real (unmodified) components against a realistic
 * fake cartridge tree in headless Chrome - see this feature's own
 * assignment notes for what that fixture showed.
 *
 * Every write control an export item/module cannot support was ALREADY
 * gated off by `contentSourceGating.ts` (entry 264 check 8) before this flag
 * existed; that table composed unchanged - it keys purely on
 * `{source, hasLiveCourse}` and never introspects an item's fields, so
 * nothing about it needed to change for the type widening above.
 *
 * One known gap: `hasLiveCourse` is hardcoded `false` whenever the active
 * selection is export-sourced (see ContentTab.tsx's `sourceContext`),
 * because the persisted export selection carries no `canvasUrl` to check -
 * a course with BOTH a live Canvas connection and a stored export currently
 * reads the stricter "no live course" gating reason instead of the more
 * precise "no Canvas identity" one while viewing its export. Follow-up, not
 * a fabrication: it only ever makes gating MORE conservative, never less.
 */
export const EXPORT_COURSES_SELECTABLE = true;

/**
 * Recovery path for a failed LIVE read (live branch of `loadContent` and of
 * the mount auto-load effect in ContentTab.tsx). Live-Canvas set up (an
 * institution acronym) and a working live-Canvas CONNECTION are two
 * different things - an acronym only selects which `<ACRONYM>_CANVAS_URL` /
 * `_CANVAS_API_TOKEN` env vars to try, and a school can be registered with
 * neither set (a live-report bug: WNCC has stored exports for every course
 * and no live LMS connection at all, so `listCourseContentAction` always
 * throws `resolveInstitutionByCode`'s raw "Canvas base URL is not configured
 * for WNCC..." and the tab dead-ended there instead of falling back to the
 * same course's export, which would have loaded fine).
 *
 * Resolves this course's `course_hub` row by its Canvas URL
 * (`resolveLmsCourseRowAction`, the same lookup `readExportCourseContent`
 * uses), checks whether it has a usable instructor-provided export
 * (`latestSourceExportFile` - the same predicate `canImport`/
 * `lmsRenderSourcesFor` use, so this agrees with what the export chip section
 * would have offered), and if so reads it
 * (`readExportCourseContentById`). Returns `null` on ANY failure along the
 * way (no linked row, no source export, or the export itself fails to read)
 * so the caller's existing live-error handling runs completely unchanged -
 * this never throws and never replaces the original live error itself, it
 * only ever adds a successful alternative in front of it.
 *
 * M12/M12c (docs/module-intro-video-script-acceptance-criteria.md, finding
 * 16): `acronym` is threaded through to resolveLmsCourseRowAction so a
 * host-less `courseUrl` (the ONLY shape ContentTab's own live picker ever
 * produces - CoursePicker.tsx:275) can still resolve to the right row. Before
 * M12 this resolution silently failed for EVERY host-less selection - which
 * is every selection - so this recovery path could never fire even though the
 * course genuinely had a usable stored export sitting right there (finding
 * 16's diagnosis of why the reported instructor bug never reached the
 * import).
 */
export async function tryExportFallbackForFailedLiveRead(
  supabase: SupabaseClient<Database>,
  courseUrl: string,
  acronym: string | undefined
): Promise<{ courseId: string; content: ExportCourseContent } | null> {
  const resolved = await resolveLmsCourseRowAction(courseUrl, acronym);
  if ("error" in resolved) return null;
  if (!latestSourceExportFile(resolved.course)) return null;
  const content = await readExportCourseContentById(supabase, resolved.course.id);
  if ("error" in content) return null;
  return { courseId: resolved.course.id, content };
}

/**
 * Chunk 3h Limit 14 close (docs/REGRESSION.md entry 315): an export selected
 * BEFORE commit f47615c started stamping a NEW import's row with the
 * cartridge's own Canvas identity never got that stamp, so its live
 * counterpart still dead-ends with "No saved course is linked to
 * /courses/<id> ...". This performs that stamp lazily, from the client, the
 * first time such a row's export is actually read here.
 *
 * DESIGN DECISION: the read path itself (readExportCourseContentById /
 * readExportCourseContentForRow, src/lib/lms-export-source/
 * read-export-course-content.ts) stays PURE - it now only surfaces
 * `canvasIdentity` additively, it never writes. That function runs
 * server-side from src/app/api/lms-export/selection/route.ts and inside
 * unattended workflow runs, so making a shared read path a silent writer is
 * not acceptable. This function is the write half, and it only ever runs
 * here, client-side, right after a successful EXPORT selection load - the
 * one moment an instructor is demonstrably acting on this course.
 *
 * Called from BOTH of ContentTab.tsx's export-load sites (loadContent's
 * export branch AND the mount-restore effect), deliberately, not only the
 * user-driven one: closing Limit 14 specifically means fixing rows an
 * instructor selected BEFORE this fix shipped, and those rows are read far
 * more often via the mount-restore effect - which re-reads the remembered
 * selection on every page load - than via a fresh CoursePicker click.
 * Restricting this to the click-driven site would leave exactly the
 * population this gap is about fixed only the next time they happen to
 * re-pick the course from the picker.
 *
 * The decision itself is `planCanvasUrlBackfill` (@/lib/canvas-url-backfill,
 * pure) - this function is only the client-side orchestration around it:
 * fetch the owner's rows, ask the pure helper, write only if it says to. A
 * stamp failure (or a failure fetching the row list) is a SILENT NO-OP - a
 * content read that already succeeded must never surface an error because a
 * background backfill of a different field on a different call did.
 * Fire-and-forget (never awaited by a caller): it touches no component
 * state, so it needs no `cancelled` guard the way a setState-reaching effect
 * would.
 */
export async function backfillCanvasUrlForExportSelection(
  courseId: string,
  identity: CartridgeCanvasIdentity | undefined
): Promise<void> {
  try {
    // Cheap precondition BEFORE the round trip: a cartridge with no Canvas
    // identity (a non-Canvas Common Cartridge, a Blackboard archive, or a
    // non-numeric course id - entry 315 check 16) can never produce a URL to
    // stamp, so planCanvasUrlBackfill would refuse anyway. Checking here keeps
    // every such export load from paying for a listCourseHubAction it cannot
    // use. Rows that DO have an identity still pay one list read per load
    // until they are stamped, after which the plan refuses on the target's own
    // non-blank canvasUrl.
    if (!cartridgeCanvasUrl(identity ?? EMPTY_CANVAS_IDENTITY)) return;
    const hub = await listCourseHubAction();
    if ("error" in hub) return;
    const url = planCanvasUrlBackfill(hub.courses, courseId, identity);
    if (!url) return;
    const target = hub.courses.find((c) => c.id === courseId);
    if (!target) return;
    // Full-row idiom (ScheduleCell.tsx precedent) - updateCourseHubAction
    // takes a WHOLE CourseHubInput and toRow maps every missing field to
    // null, so a bare {name, canvasUrl} patch would wipe this row's
    // materials/roster/notes/repos/etc.
    await updateCourseHubAction(courseId, { ...courseToInput(target), canvasUrl: url });
  } catch {
    // Silent no-op - see this function's own doc comment.
  }
}
