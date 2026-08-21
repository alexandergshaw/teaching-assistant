// AC8/AC8a of
// docs/modules-cartridge-import-upload-acceptance-criteria.md: the import
// pipeline that used to live entirely inside ImportCourseExportControl's
// handleFile, extracted so a SECOND caller (the Modules view's
// `Import cartridge` control, AC7) can drive it without a second copy of
// this logic existing anywhere. This is a pure move - see that component's
// own header comment for the reasoning behind each step; it is restated
// inline below rather than re-derived, because the reasoning is what makes
// each step's position non-arbitrary, not just its code.
//
// Original home, and the detour this collapses: Part B of
// docs/import-course-export-to-intro-video-acceptance-criteria.md -
// ImportCourseExportControl.tsx's own header comment.
//
// Reuses, rather than reinvents, every step of that existing detour:
//   - parseCartridgeBlob (@/lib/cartridge-import) - the same client-side
//     parser the .imscc/.zip upload path already runs.
//   - chooseImportDestination (@/lib/imported-export-destination, Part C) -
//     the pure decision of which saved row (if any) this export belongs to.
//   - uploadCourseZipChunked + appendCourseExportFileAction, WITH NO
//     `generated` flag - byte-identical to LmsExportsCell's own upload path
//     (src/app/components/courses/FilesCell.tsx:277-278), so
//     latestSourceExportFile immediately counts this file the same way an
//     instructor's manual upload would.
//
// AC8a - THE FIXED CONTRACT. Two callers are built against this signature
// concurrently; it must not change shape:
//   - `userId` is a required string (not the nullable `user` object the
//     original component read off useSupabase()) - a caller must resolve
//     "is anyone logged in" itself before calling this function. That check
//     ("You must be logged in.") is therefore NOT part of this pipeline; it
//     stays a guard clause in each caller, same wording as before.
//   - `onPhase` is optional, called with "parsing" then "uploading" at the
//     same two points the original component called `setStatus`. Never
//     called with "idle" - callers own their own idle/busy default.
//   - Returns one of three outcomes, matching the three success messages
//     ImportCourseExportControl always distinguished. `courseName` is
//     carried on every branch so a caller can name the row in its own
//     success message without re-reading it from Supabase.
//   - On any failure, throws a plain Error whose `.message` is already the
//     exact, user-ready sentence the original component used to hand
//     `setError` - a caller only needs `catch (err) { setError(err
//     instanceof Error ? err.message : ...) }`.
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import {
  chooseImportDestination,
  resolveImportFallbackName,
} from "@/lib/imported-export-destination";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { uploadCourseZipChunked, removeCourseZipObjects } from "@/lib/course-files";
import {
  listCourseHubAction,
  createCourseHubAction,
  updateCourseHubAction,
  appendCourseExportFileAction,
} from "../../actions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Mirrors LmsExportsCell's own limit (FilesCell.tsx:266) - the same storage
// bucket, so the same ceiling applies regardless of which control uploaded.
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

/** The three reachable outcomes of a successful import - kept as a
 * discriminated union so a caller (AC9) can distinguish "attached to an
 * existing row" from "attached AND stamped that row's Canvas URL" from
 * "created a brand-new row" without re-deriving any of this logic. */
export type ImportOutcome =
  | { kind: "attached"; courseId: string; courseName: string }
  | { kind: "stamped"; courseId: string; courseName: string }
  | { kind: "created"; courseId: string; courseName: string };

/**
 * Run the whole import-an-export pipeline against one already-picked file:
 * parse it, decide (or create) its destination course_hub row, upload it,
 * and attach it. Every step is owner-scoped and never calls Canvas (B5 of
 * the original component's header comment) - `userId` is the only identity
 * this needs.
 *
 * Throws `Error` with a user-ready `.message` on any failure; never rejects
 * with a non-Error value.
 */
export async function importCourseExportFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
  onPhase?: (phase: "parsing" | "uploading") => void
): Promise<ImportOutcome> {
  // Step 1 (AC7): reject over 100 MB - the storage bucket's own ceiling -
  // before anything else runs.
  if (file.size > MAX_EXPORT_BYTES) {
    throw new Error("Export is too large (max 100 MB).");
  }

  // B2 step 1 / B4: parse BEFORE anything is uploaded or created. A parse
  // failure is reported inline and stops here.
  onPhase?.("parsing");
  let parsed;
  try {
    parsed = await parseCartridgeBlob(file);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Could not read this export file.");
  }

  // B2 step 2: decide the destination (Part C's pure helper) against the
  // owner's current saved rows.
  const coursesResult = await listCourseHubAction();
  if ("error" in coursesResult) {
    throw new Error(coursesResult.error);
  }
  const fallbackName = resolveImportFallbackName(parsed.title, file.name);
  const destination = chooseImportDestination(coursesResult.courses, parsed.canvasIdentity, fallbackName);

  let courseId: string;
  // Named only once a row is actually created, so a failure further down
  // (B4) can name it rather than silently orphaning it.
  let createdRowName: string | null = null;
  // Set for BOTH "existing" outcomes (plain attach and stamp-and-attach) -
  // drives the success outcome below.
  let existingCourseName: string | null = null;
  let stamped = false;
  if (destination.kind === "existing") {
    courseId = destination.courseId;
    const targetCourse = coursesResult.courses.find((c) => c.id === destination.courseId);
    // Falls back to the raw id only in the (unreachable in practice) case
    // where the matched row vanished from `coursesResult.courses` between
    // the lookup above and here - never renders the literal string "null"
    // in the success outcome below.
    existingCourseName = targetCourse?.name ?? destination.courseId;

    // Defect fix (chunk 3h): a name match (chooseImportDestination's rule
    // (b)) asks us to stamp the cartridge's own Canvas URL onto the row it
    // matched by name, so the row's canvasUrl stops being blank and the
    // live-selection path can resolve it too (the same C3/C4 payoff the
    // original create-time stamp gives a brand-new row). Done BEFORE the
    // upload, for the same reason B2 step 1 parses before anything is
    // uploaded or created: this is the one irreversible-if-skipped part of
    // the fix (the row's identity), and it should not be silently skipped
    // just because a later network step (the upload) happens to fail. A
    // stamp failure is reported and stops here - nothing is uploaded, and
    // the row is left exactly as it was (never partially updated: this is
    // a single field, single request).
    //
    // Built via courseToInput(targetCourse) - the SAME idiom every other
    // single-field course_hub update in this app uses (ScheduleCell.tsx,
    // WeeklyChecklistCell.tsx, useCourseImportActions.ts) - because
    // updateCourseHubAction takes a FULL CourseInput and toRow (courses.
    // row.ts) writes every column it names; passing only {name, canvasUrl}
    // would silently wipe this row's materials/roster/notes/repos/etc,
    // which is exactly the real data this fix exists to protect.
    if (destination.stampCanvasUrl) {
      if (!targetCourse) {
        // The row chooseImportDestination just matched by name is no
        // longer in the list we read it from - stop rather than guess at
        // its other fields (courseToInput needs the full row to avoid
        // wiping them; see the comment above). Vanishingly unlikely in
        // practice, but an honest failure beats a silent skip here.
        throw new Error("The matched course could not be re-read to link its Canvas URL. Try again.");
      }
      const updated = await updateCourseHubAction(courseId, {
        ...courseToInput(targetCourse),
        canvasUrl: destination.stampCanvasUrl,
      });
      if ("error" in updated) {
        throw new Error(
          `Found your existing course "${targetCourse.name}" by name, but could not link its Canvas URL: ${updated.error} Nothing was uploaded - try again.`
        );
      }
      stamped = true;
    }
  } else {
    const created = await createCourseHubAction({ name: destination.name, canvasUrl: destination.canvasUrl });
    if ("error" in created) {
      throw new Error(created.error);
    }
    courseId = created.course.id;
    createdRowName = created.course.name;
  }

  // B2 steps 3-4: the SAME chunked uploader and attach action
  // LmsExportsCell uses, with no `generated` flag.
  onPhase?.("uploading");
  // `outcomeError` mirrors the original component's "setError then return"
  // exactly, INCLUDING which errors the try/catch below can see: throwing
  // directly out of the try block (instead of routing through this
  // variable) would let this function's own thrown Error be re-caught and
  // re-wrapped by its own catch clause, double-describing the failure. The
  // catch below must only ever wrap errors that come from
  // uploadCourseZipChunked, appendCourseExportFileAction, or
  // removeCourseZipObjects actually throwing - never from this function's
  // own deliberate failure report.
  let outcomeError: string | null = null;
  try {
    const { path, parts } = await uploadCourseZipChunked(supabase, userId, courseId, file);
    const attached = await appendCourseExportFileAction(courseId, {
      name: file.name,
      path,
      size: file.size,
      ...(parts ? { parts } : {}),
    });
    if ("error" in attached) {
      await removeCourseZipObjects(supabase, parts ?? [path]);
      outcomeError = describeFailure(createdRowName, attached.error);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not upload the export.";
    outcomeError = describeFailure(createdRowName, message);
  }
  if (outcomeError) {
    throw new Error(outcomeError);
  }

  // Success reporting: distinguish the three reachable outcomes, naming
  // the course either way, so the instructor knows exactly what happened
  // without opening the Courses table.
  if (createdRowName) {
    return { kind: "created", courseId, courseName: createdRowName };
  }
  // existingCourseName is always set once destination.kind === "existing"
  // (see above) - courseId only reaches here via one of the two branches.
  const courseName = existingCourseName as string;
  return stamped ? { kind: "stamped", courseId, courseName } : { kind: "attached", courseId, courseName };
}

// B4: once a row has been created, a later failure must name it so it is
// findable in the Courses table rather than silently orphaned.
function describeFailure(createdRowName: string | null, message: string): string {
  if (!createdRowName) return message;
  return `Created the course "${createdRowName}", but this failed: ${message} Find "${createdRowName}" in the Courses table and try uploading the export again from its LMS Exports cell.`;
}
