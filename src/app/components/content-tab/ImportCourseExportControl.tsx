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
// AC8 of docs/modules-cartridge-import-upload-acceptance-criteria.md: the
// pipeline this used to run inline (parse -> pick/create destination ->
// upload -> attach) now lives in importCourseExportPipeline.ts, shared with
// the Modules view's own `Import cartridge` control (AC7). This component
// keeps only what is specific to IT: the file-size/login guard clauses that
// AC8a deliberately left out of the shared pipeline's fixed signature, the
// busy/error/success UI, and its own caller contract (`onImported`).
//
//   - `onImported`, the caller's existing selection path
//     (ContentTab.tsx's handleSelectExportCourse) - this component never
//     loads content itself, it only gets the export attached and hands back
//     the row id.
//
// B5: deliberately takes no institution/acronym prop at all. Every action
// the shared pipeline runs - parsing a local file, listCourseHubAction,
// createCourseHubAction, uploadCourseZipChunked, appendCourseExportFileAction
// - is owner-scoped and never calls Canvas, so an instructor with zero
// Canvas configuration can complete this end to end.
import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import { importCourseExportFile } from "./importCourseExportPipeline";
import { useSupabase } from "@/context/SupabaseProvider";
import styles from "../../page.module.css";

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

    // Kept here rather than in the shared pipeline: AC8a fixes that
    // pipeline's `userId` parameter as a required string, so "is anyone
    // logged in" is necessarily a caller-side guard clause, not a pipeline
    // step - same wording as before the extraction.
    if (!user) {
      setError("You must be logged in.");
      return;
    }

    try {
      const outcome = await importCourseExportFile(supabase, user.id, file, (phase) => setStatus(phase));
      setStatus("idle");
      setSuccess(
        outcome.kind === "created"
          ? `Created a new course "${outcome.courseName}" and imported the export into it.`
          : outcome.kind === "stamped"
          ? `Attached the export to your existing course "${outcome.courseName}" and linked its Canvas URL.`
          : `Attached the export to your existing course "${outcome.courseName}".`
      );
      // B2 step 5: select it through the caller's existing path - not a new
      // loader.
      onImported(outcome.courseId);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not import this export.");
    }
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
