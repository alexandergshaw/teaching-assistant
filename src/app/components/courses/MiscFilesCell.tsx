"use client";

// Misc files column cell: arbitrary per-course supporting files, stored in
// Supabase Storage (not Google Drive - explicitly ruled out). Modelled on
// MaterialsCell's per-file list (FilesCell.tsx): a compact count summary in
// the table plus a "Manage" Popover hosting an upload control and the
// per-file Download/Remove list. Unlike materials (zip-only) or LMS exports
// (.imscc/.zip), misc files accept any file type - no `accept` filter -
// since the column is a catch-all for supporting files (this is also where
// Group D's sample Castletop for its CSV generator will live).
import { useRef, useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import { appendCourseMiscFileAction, removeCourseMiscFileAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { useSupabase } from "@/context/SupabaseProvider";
import { storageExtFromFileName } from "@/lib/courses-tab-helpers";
import { uploadCourseFile, getCourseZipUrl, removeCourseZip } from "@/lib/course-files";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

const POPOVER_BODY_STYLE: React.CSSProperties = { padding: 16, width: 360, maxWidth: "90vw" };

export interface MiscFilesCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

export function MiscFilesCell({ course, onCourseUpdated, setError, menu }: MiscFilesCellProps) {
  const { supabase, user } = useSupabase();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleUpload = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setError("File is too large (max 50 MB).");
      return;
    }
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = storageExtFromFileName(file.name);
      const { path } = await uploadCourseFile(supabase, user.id, course.id, file, ext, file.type || "application/octet-stream");
      const r = await appendCourseMiscFileAction(course.id, { name: file.name, path, size: file.size });
      if ("error" in r) {
        setError(r.error);
        await removeCourseZip(supabase, path);
        return;
      }
      if (r.replacedPath) {
        await removeCourseZip(supabase, r.replacedPath);
      }
      const filtered = course.miscFiles.filter((f) => f.name !== file.name);
      onCourseUpdated({
        ...course,
        miscFiles: [...filtered, { name: file.name, path, size: file.size, addedAt: new Date().toISOString() }],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the file.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = async (path: string) => {
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setRemovingPath(path);
    setError(null);
    try {
      await removeCourseZip(supabase, path);
      const r = await removeCourseMiscFileAction(course.id, path);
      if (!("error" in r)) {
        onCourseUpdated({ ...course, miscFiles: course.miscFiles.filter((f) => f.path !== path) });
      } else {
        setError(r.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the file.");
    } finally {
      setRemovingPath(null);
    }
  };

  const handleDownloadFile = async (path: string, name: string) => {
    try {
      const url = await getCourseZipUrl(supabase, path);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the file.");
    }
  };

  const count = course.miscFiles.length;
  const summary = count > 0 ? `${count} file${count !== 1 ? "s" : ""}` : "None";

  return (
    <td style={{ minWidth: 190 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span className={count > 0 ? styles.courseResourceValue : styles.courseResourceEmpty}>{summary}</span>
        <button type="button" className={styles.linkButton} onClick={(e) => setAnchorEl(e.currentTarget)}>
          Manage
        </button>
      </div>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <div style={POPOVER_BODY_STYLE}>
          <div className={styles.courseResourceHead}>
            <span className={styles.courseResourceLabel}>Misc files</span>
          </div>

          <div className={styles.courseResourceActions}>
            <Button variant="outlined" size="small" disabled={uploading} onClick={() => uploadRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload a file"}
            </Button>
          </div>
          <input
            ref={uploadRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />

          {course.miscFiles.length === 0 ? (
            <span className={styles.courseResourceEmpty} style={{ marginTop: 8, display: "block" }}>
              No files yet.
            </span>
          ) : (
            <div style={{ marginTop: 16 }}>
              {course.miscFiles.map((f) => (
                <div key={f.path} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9em" }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name} - {(f.size / 1048576).toFixed(1)} MB
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.85em", marginLeft: 8 }}>
                      {new Date(f.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => void handleDownloadFile(f.path, f.name)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      style={{ color: "var(--danger)" }}
                      disabled={removingPath === f.path}
                      onClick={() => void handleRemoveFile(f.path)}
                    >
                      {removingPath === f.path ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Popover>
      {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
    </td>
  );
}
