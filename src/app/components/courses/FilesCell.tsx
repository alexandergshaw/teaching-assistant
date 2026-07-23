"use client";

// Materials and LMS Exports column cells - ported verbatim from the
// row-expansion cards (formerly RowDetailFiles.tsx): zip uploads stored via
// Supabase storage, with download/replace/remove. Each cell shows a compact
// summary in the table and hosts the full (unchanged) card body in a small
// MUI Popover anchored to the cell's "Manage" affordance, matching the
// Columns-menu dropdown idiom.
import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import {
  setCourseMaterialsAction,
  removeCourseMaterialFileAction,
  appendCourseExportFileAction,
  removeCourseExportFileAction,
} from "@/app/actions";
import type { Course, CourseMaterialFile } from "@/lib/supabase/courses";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  uploadCourseZip,
  uploadCourseZipChunked,
  getCourseZipUrl,
  downloadCourseZipBlob,
  removeCourseZip,
  removeCourseZipObjects,
  courseZipObjectPaths,
} from "@/lib/course-files";
import styles from "../../page.module.css";

const POPOVER_BODY_STYLE: React.CSSProperties = { padding: 16, width: 360, maxWidth: "90vw" };

export interface MaterialsCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
}

export function MaterialsCell({ course, onCourseUpdated, setError }: MaterialsCellProps) {
  const { supabase, user } = useSupabase();
  const materialsUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingMaterials, setUploadingMaterials] = useState(false);
  const [materialsRemoveConfirm, setMaterialsRemoveConfirm] = useState(false);
  const [removingMaterialFile, setRemovingMaterialFile] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleMaterialsUpload = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setError("Zip is too large (max 50 MB).");
      return;
    }
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setUploadingMaterials(true);
    setError(null);
    try {
      const { path } = await uploadCourseZip(supabase, user.id, course.id, file, course.materialsZipPath ?? null);
      const r = await setCourseMaterialsAction(course.id, { materialsZipName: file.name, materialsZipPath: path, materialsZipSize: file.size });
      if ("error" in r) {
        setError(r.error);
        await removeCourseZip(supabase, path);
        return;
      }
      onCourseUpdated({ ...course, materialsZipName: file.name, materialsZipPath: path, materialsZipSize: file.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the materials.");
    } finally {
      setUploadingMaterials(false);
    }
  };

  const handleRemoveMaterialFile = async (path: string) => {
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setRemovingMaterialFile(path);
    setError(null);
    try {
      await removeCourseZip(supabase, path);
      const r = await removeCourseMaterialFileAction(course.id, path);
      if (!("error" in r)) {
        onCourseUpdated({ ...course, materialsFiles: course.materialsFiles.filter((f) => f.path !== path) });
      } else {
        setError(r.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the file from the course materials.");
    } finally {
      setRemovingMaterialFile(null);
    }
  };

  const removeMaterials = async () => {
    if (!course.materialsZipPath) return;
    await removeCourseZip(supabase, course.materialsZipPath);
    const r = await setCourseMaterialsAction(course.id, { materialsZipName: null, materialsZipPath: null, materialsZipSize: null });
    if (!("error" in r)) {
      onCourseUpdated({ ...course, materialsZipName: null, materialsZipPath: null, materialsZipSize: null });
      setMaterialsRemoveConfirm(false);
    } else {
      setError(r.error);
    }
  };

  const downloadMaterials = async () => {
    try {
      const url = await getCourseZipUrl(supabase, course.materialsZipPath ?? "");
      const a = document.createElement("a");
      a.href = url;
      a.download = course.materialsZipName || "materials.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the materials.");
    }
  };

  const summary = course.materialsZipPath
    ? `${course.materialsZipName} - ${((course.materialsZipSize || 0) / 1048576).toFixed(1)} MB`
    : "Not set";

  return (
    <td style={{ minWidth: 190 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span className={course.materialsZipPath ? styles.courseResourceValue : styles.courseResourceEmpty}>{summary}</span>
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
            <span className={styles.courseResourceLabel}>Materials</span>
          </div>
          {!course.materialsZipPath ? (
            <>
              <span className={styles.courseResourceEmpty}>Not set</span>
              <div className={styles.courseResourceActions}>
                <Button variant="outlined" size="small" disabled={uploadingMaterials} onClick={() => materialsUploadRef.current?.click()}>
                  {uploadingMaterials ? "Uploading…" : "Upload zip"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className={styles.courseResourceValue}>{course.materialsZipName} - {((course.materialsZipSize || 0) / 1048576).toFixed(1)} MB</span>
              <div className={styles.courseResourceActions}>
                <button type="button" className={styles.linkButton} onClick={() => void downloadMaterials()}>
                  Download
                </button>
                <button type="button" className={styles.linkButton} disabled={uploadingMaterials} onClick={() => materialsUploadRef.current?.click()}>
                  {uploadingMaterials ? "Uploading…" : "Replace"}
                </button>
                <button type="button" className={styles.linkButton} style={{ color: "var(--danger)" }} onClick={() => setMaterialsRemoveConfirm((v) => !v)}>
                  {materialsRemoveConfirm ? "Confirm" : "Remove"}
                </button>
              </div>
              {materialsRemoveConfirm && (
                <div style={{ marginTop: 8 }}>
                  <Button variant="outlined" size="small" color="error" onClick={() => void removeMaterials()}>
                    Delete materials
                  </Button>
                  <Button variant="text" size="small" onClick={() => setMaterialsRemoveConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
          <input
            ref={materialsUploadRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleMaterialsUpload(f);
              e.target.value = "";
            }}
          />
          {course.materialsFiles.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {course.materialsFiles.map((f) => (
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
                      onClick={async () => {
                        try {
                          const url = await getCourseZipUrl(supabase, f.path);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = f.name;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Could not download the file.");
                        }
                      }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      style={{ color: "var(--danger)" }}
                      disabled={removingMaterialFile === f.path}
                      onClick={() => void handleRemoveMaterialFile(f.path)}
                    >
                      {removingMaterialFile === f.path ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Popover>
    </td>
  );
}

export interface LmsExportsCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  canLms: boolean;
  exportBusy: boolean;
  onExportFromLms: (course: Course) => void;
}

export function LmsExportsCell({ course, onCourseUpdated, setError, canLms, exportBusy, onExportFromLms }: LmsExportsCellProps) {
  const { supabase, user } = useSupabase();
  const [uploadingExport, setUploadingExport] = useState(false);
  const [exportRemoveConfirm, setExportRemoveConfirm] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleExportUpload = async (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      setError("Export is too large (max 100 MB).");
      return;
    }
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    setUploadingExport(true);
    setError(null);
    try {
      const { path, parts } = await uploadCourseZipChunked(supabase, user.id, course.id, file);
      const r = await appendCourseExportFileAction(course.id, { name: file.name, path, size: file.size, ...(parts ? { parts } : {}) });
      if ("error" in r) {
        setError(r.error);
        await removeCourseZipObjects(supabase, parts ?? [path]);
        return;
      }
      const filtered = course.exportFiles.filter((f) => f.name !== file.name);
      onCourseUpdated({
        ...course,
        exportFiles: [...filtered, { name: file.name, path, size: file.size, addedAt: new Date().toISOString(), ...(parts ? { parts } : {}) }],
      });
      await removeCourseZipObjects(supabase, r.replacedPaths);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not upload the export.";
      if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message)) {
        setError("This export exceeds the storage upload limit. Raise \"Upload file size limit\" in Supabase Storage settings (currently the project default is 50 MB), then retry.");
      } else {
        setError(message);
      }
    } finally {
      setUploadingExport(false);
    }
  };

  const handleRemoveExportFile = async (file: CourseMaterialFile) => {
    if (!user) {
      setError("You must be logged in.");
      return;
    }
    try {
      await removeCourseZipObjects(supabase, courseZipObjectPaths(file));
      const r = await removeCourseExportFileAction(course.id, file.path);
      if (!("error" in r)) {
        onCourseUpdated({ ...course, exportFiles: course.exportFiles.filter((f) => f.path !== file.path) });
        setExportRemoveConfirm(null);
      } else {
        setError(r.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the export file.");
    }
  };

  const handleDownloadExportFile = async (file: CourseMaterialFile) => {
    try {
      if (file.parts && file.parts.length > 0) {
        const blob = await downloadCourseZipBlob(supabase, file);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      const url = await getCourseZipUrl(supabase, file.path);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the file.");
    }
  };

  const openUploadPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".imscc,.zip,application/zip";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void handleExportUpload(f);
    };
    input.click();
  };

  const summary = course.exportFiles.length > 0 ? `${course.exportFiles.length} file${course.exportFiles.length !== 1 ? "s" : ""}` : "Not set";

  return (
    <td style={{ minWidth: 190 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span className={course.exportFiles.length > 0 ? styles.courseResourceValue : styles.courseResourceEmpty}>{summary}</span>
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
            <span className={styles.courseResourceLabel}>LMS Exports</span>
            {course.exportFiles.length > 0 && (
              <span style={{ marginLeft: "auto", fontSize: "0.85em", color: "var(--text-secondary)" }}>{course.exportFiles.length} file(s)</span>
            )}
          </div>
          {course.exportFiles.length === 0 ? (
            <>
              <span className={styles.courseResourceEmpty}>No exports yet - Course Refresh saves its cartridge here, or upload an LMS export.</span>
              <div className={styles.courseResourceActions}>
                <Button variant="outlined" size="small" disabled={uploadingExport} onClick={openUploadPicker}>
                  {uploadingExport ? "Uploading..." : "Upload export"}
                </Button>
                {canLms && (
                  <button type="button" className={styles.linkButton} disabled={exportBusy} onClick={() => onExportFromLms(course)}>
                    {exportBusy ? "Exporting... (takes a minute)" : "Pull export from LMS"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 8 }}>
                {course.exportFiles.map((f) => (
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
                      <button type="button" className={styles.linkButton} onClick={() => void handleDownloadExportFile(f)}>
                        Download
                      </button>
                      <button
                        type="button"
                        className={styles.linkButton}
                        style={{ color: "var(--danger)" }}
                        onClick={() => setExportRemoveConfirm(exportRemoveConfirm === f.path ? null : f.path)}
                      >
                        {exportRemoveConfirm === f.path ? "Confirm" : "Remove"}
                      </button>
                    </div>
                    {exportRemoveConfirm === f.path && (
                      <div style={{ marginTop: 8 }}>
                        <Button variant="outlined" size="small" color="error" onClick={() => void handleRemoveExportFile(f)}>
                          Delete export
                        </Button>
                        <Button variant="text" size="small" onClick={() => setExportRemoveConfirm(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className={styles.courseResourceActions} style={{ marginTop: 12 }}>
                <Button variant="outlined" size="small" disabled={uploadingExport} onClick={openUploadPicker}>
                  {uploadingExport ? "Uploading..." : "Upload export"}
                </Button>
                {canLms && (
                  <button type="button" className={styles.linkButton} disabled={exportBusy} onClick={() => onExportFromLms(course)}>
                    {exportBusy ? "Exporting... (takes a minute)" : "Pull export from LMS"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Popover>
    </td>
  );
}
