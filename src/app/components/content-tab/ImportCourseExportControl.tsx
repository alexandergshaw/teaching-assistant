"use client";

// Part B of docs/import-course-export-to-intro-video-acceptance-criteria.md:
// "import an export in one step, from where it is needed" - a first-time
// importer arrives at the Course Content source picker with only a file and
// no live Canvas connection, and today has no way to turn that file into
// something generation can read short of the nine-click detour F4 describes
// (Courses tab -> new course -> LMS Exports cell -> Manage -> Upload export
// -> back to Course Content -> find the chip). This control collapses that
// to three: open Course Content -> Import a course export -> pick the file.
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
//   - `onImported`, the caller's existing selection path
//     (ContentTab.tsx's handleSelectExportCourse) - this component never
//     loads content itself, it only gets the export attached and hands back
//     the row id.
//
// B5: deliberately takes no institution/acronym prop at all. Every action
// here - parsing a local file, listCourseHubAction, createCourseHubAction,
// uploadCourseZipChunked, appendCourseExportFileAction - is owner-scoped and
// never calls Canvas, so an instructor with zero Canvas configuration can
// complete this end to end.
import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import {
  chooseImportDestination,
  resolveImportFallbackName,
} from "@/lib/imported-export-destination";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { uploadCourseZipChunked, removeCourseZipObjects } from "@/lib/course-files";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  listCourseHubAction,
  createCourseHubAction,
  updateCourseHubAction,
  appendCourseExportFileAction,
} from "../../actions";
import styles from "../../page.module.css";

// Mirrors LmsExportsCell's own limit (FilesCell.tsx:266) - the same storage
// bucket, so the same ceiling applies regardless of which control uploaded.
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

type Status = "idle" | "parsing" | "uploading";

export interface ImportCourseExportControlProps {
  /** Fires once the export is fully attached to a course_hub row - the
   * caller selects it through its OWN existing export-selection path
   * (ContentTab.tsx's handleSelectExportCourse), never a new loader here. */
  onImported: (courseId: string) => void;
}

export function ImportCourseExportControl({ onImported }: ImportCourseExportControlProps) {
  const { supabase, user } = useSupabase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // What the last successful import actually did - distinguishes the three
  // reachable outcomes (attach plain, attach + link Canvas URL, create) so
  // the instructor isn't left staring at a control that says nothing after
  // it worked. This control stays mounted after a successful import (its
  // parent, CoursePicker, renders it unconditionally alongside the picker -
  // see ImportCourseExportControlProps' onImported comment), so this message
  // is actually seen rather than being dead UI.
  const [success, setSuccess] = useState<string | null>(null);

  const busy = status !== "idle";

  const handleFile = async (file: File) => {
    setError(null);
    setSuccess(null);

    if (file.size > MAX_EXPORT_BYTES) {
      setError("Export is too large (max 100 MB).");
      return;
    }
    if (!user) {
      setError("You must be logged in.");
      return;
    }

    // B2 step 1 / B4: parse BEFORE anything is uploaded or created. A parse
    // failure is reported inline and stops here.
    setStatus("parsing");
    let parsed;
    try {
      parsed = await parseCartridgeBlob(file);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not read this export file.");
      return;
    }

    // B2 step 2: decide the destination (Part C's pure helper) against the
    // owner's current saved rows.
    const coursesResult = await listCourseHubAction();
    if ("error" in coursesResult) {
      setStatus("idle");
      setError(coursesResult.error);
      return;
    }
    const fallbackName = resolveImportFallbackName(parsed.title, file.name);
    const destination = chooseImportDestination(coursesResult.courses, parsed.canvasIdentity, fallbackName);

    let courseId: string;
    // Named only once a row is actually created, so a failure further down
    // (B4) can name it rather than silently orphaning it.
    let createdRowName: string | null = null;
    // Set for BOTH "existing" outcomes (plain attach and stamp-and-attach) -
    // drives the success message below.
    let existingCourseName: string | null = null;
    let stamped = false;
    if (destination.kind === "existing") {
      courseId = destination.courseId;
      const targetCourse = coursesResult.courses.find((c) => c.id === destination.courseId);
      // Falls back to the raw id only in the (unreachable in practice) case
      // where the matched row vanished from `coursesResult.courses` between
      // the lookup above and here - never renders the literal string "null"
      // in the success message below.
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
          setStatus("idle");
          setError("The matched course could not be re-read to link its Canvas URL. Try again.");
          return;
        }
        const updated = await updateCourseHubAction(courseId, {
          ...courseToInput(targetCourse),
          canvasUrl: destination.stampCanvasUrl,
        });
        if ("error" in updated) {
          setStatus("idle");
          setError(
            `Found your existing course "${targetCourse.name}" by name, but could not link its Canvas URL: ${updated.error} Nothing was uploaded - try again.`
          );
          return;
        }
        stamped = true;
      }
    } else {
      const created = await createCourseHubAction({ name: destination.name, canvasUrl: destination.canvasUrl });
      if ("error" in created) {
        setStatus("idle");
        setError(created.error);
        return;
      }
      courseId = created.course.id;
      createdRowName = created.course.name;
    }

    // B2 steps 3-4: the SAME chunked uploader and attach action
    // LmsExportsCell uses, with no `generated` flag.
    setStatus("uploading");
    try {
      const { path, parts } = await uploadCourseZipChunked(supabase, user.id, courseId, file);
      const attached = await appendCourseExportFileAction(courseId, {
        name: file.name,
        path,
        size: file.size,
        ...(parts ? { parts } : {}),
      });
      if ("error" in attached) {
        await removeCourseZipObjects(supabase, parts ?? [path]);
        setStatus("idle");
        setError(describeFailure(createdRowName, attached.error));
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not upload the export.";
      setStatus("idle");
      setError(describeFailure(createdRowName, message));
      return;
    }

    setStatus("idle");
    // Success reporting: distinguish the three reachable outcomes, naming
    // the course either way, so the instructor knows exactly what happened
    // without opening the Courses table.
    setSuccess(
      createdRowName
        ? `Created a new course "${createdRowName}" and imported the export into it.`
        : stamped
        ? `Attached the export to your existing course "${existingCourseName}" and linked its Canvas URL.`
        : `Attached the export to your existing course "${existingCourseName}".`
    );
    // B2 step 5: select it through the caller's existing path - not a new
    // loader.
    onImported(courseId);
  };

  return (
    <div className={styles.field}>
      <input
        ref={inputRef}
        type="file"
        accept=".imscc,.zip,application/zip"
        style={{ display: "none" }}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void handleFile(picked);
        }}
      />
      <Button variant="outlined" size="small" disabled={busy} onClick={() => inputRef.current?.click()}>
        {status === "parsing" ? "Reading export…" : status === "uploading" ? "Uploading…" : "Import a course export"}
      </Button>
      <p className={styles.fieldHint}>
        Pick a Canvas or Common Cartridge export (.imscc/.zip) to work with it here - no live Canvas connection needed.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {success && <p style={{ fontSize: "0.85rem", color: "var(--success)" }}>{success}</p>}
    </div>
  );
}

// B4: once a row has been created, a later failure must name it so it is
// findable in the Courses table rather than silently orphaned.
function describeFailure(createdRowName: string | null, message: string): string {
  if (!createdRowName) return message;
  return `Created the course "${createdRowName}", but this failed: ${message} Find "${createdRowName}" in the Courses table and try uploading the export again from its LMS Exports cell.`;
}
