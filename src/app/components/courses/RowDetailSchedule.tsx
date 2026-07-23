"use client";

// Row-detail "Schedule of Topics" (csv) and "Rubric" editors - ported from
// the tile system's "csv"/"rubric" cases: single-file text slots with
// upload/preview/download/replace/remove plus From LMS/From import.
import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import { updateCourseHubAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { courseToInput, readFileText } from "@/lib/courses-tab-helpers";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import styles from "../../page.module.css";

export interface RowDetailScheduleProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  onPreviewCsv: (name: string, csv: string) => void;
  onPreviewRubric: (name: string, rubric: string) => void;
  canLms: boolean;
  canImport: boolean;
  csvBusy: boolean;
  rubricBusy: boolean;
  onCsvFromLms: (course: Course) => void;
  onCsvFromImport: (course: Course) => void;
  onRubricFromLms: (course: Course) => void;
  onRubricFromImport: (course: Course) => void;
}

export default function RowDetailSchedule({
  course,
  onCourseUpdated,
  setError,
  onPreviewCsv,
  onPreviewRubric,
  canLms,
  canImport,
  csvBusy,
  rubricBusy,
  onCsvFromLms,
  onCsvFromImport,
  onRubricFromLms,
  onRubricFromImport,
}: RowDetailScheduleProps) {
  const csvUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [csvRemoveConfirm, setCsvRemoveConfirm] = useState(false);
  const [uploadingRubric, setUploadingRubric] = useState(false);
  const [rubricRemoveConfirm, setRubricRemoveConfirm] = useState(false);

  const handleCsvUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError("CSV is too large (max 2 MB).");
      return;
    }
    setUploadingCsv(true);
    setError(null);
    try {
      const text = await readFileText(file);
      const r = await updateCourseHubAction(course.id, { ...courseToInput(course), csvName: file.name, csvData: text });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      onCourseUpdated(r.course);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the CSV file.");
    } finally {
      setUploadingCsv(false);
    }
  };

  const removeCsv = async () => {
    const r = await updateCourseHubAction(course.id, { ...courseToInput(course), csvName: null, csvData: null });
    if ("error" in r) {
      setError(r.error);
      return;
    }
    onCourseUpdated(r.course);
    setCsvRemoveConfirm(false);
  };

  const handleRubricUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError("Rubric file is too large (max 2 MB).");
      return;
    }
    setUploadingRubric(true);
    setError(null);
    try {
      const text = await readFileText(file);
      const r = await updateCourseHubAction(course.id, { ...courseToInput(course), rubricName: file.name, rubricData: text });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      onCourseUpdated(r.course);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the rubric file.");
    } finally {
      setUploadingRubric(false);
    }
  };

  const openRubricPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/plain,text/markdown";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void handleRubricUpload(f);
    };
    input.click();
  };

  const removeRubric = async () => {
    const r = await updateCourseHubAction(course.id, { ...courseToInput(course), rubricName: null, rubricData: null });
    if ("error" in r) {
      setError(r.error);
      return;
    }
    onCourseUpdated(r.course);
    setRubricRemoveConfirm(false);
  };

  return (
    <>
      <div className={styles.courseResource}>
        <div className={styles.courseResourceHead}>
          <span className={styles.courseResourceLabel}>Schedule of Topics</span>
          {course.csvData && course.csvData.trim() && (
            <span className={styles.navBadge} style={{ marginLeft: 8 }}>
              {(() => {
                const lines = course.csvData.split("\n").map((l) => l.trim()).filter(Boolean);
                const count = lines.length > 1 ? lines.length - 1 : lines.length;
                return `${count} row${count !== 1 ? "s" : ""}`;
              })()}
            </span>
          )}
        </div>
        {!course.csvData ? (
          <>
            <span className={styles.courseResourceEmpty}>No schedule saved yet - Course Refresh saves one here, or upload a CSV.</span>
            <div className={styles.courseResourceActions}>
              <Button variant="outlined" size="small" disabled={uploadingCsv} onClick={() => csvUploadRef.current?.click()}>
                {uploadingCsv ? "Uploading…" : "Upload CSV"}
              </Button>
              {canLms && (
                <button type="button" className={styles.linkButton} disabled={csvBusy} onClick={() => onCsvFromLms(course)}>
                  {csvBusy ? "Loading..." : "From LMS"}
                </button>
              )}
              {canImport && (
                <button type="button" className={styles.linkButton} disabled={csvBusy} onClick={() => onCsvFromImport(course)}>
                  {csvBusy ? "Loading..." : "From import"}
                </button>
              )}
            </div>
            <input
              ref={csvUploadRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvUpload(f);
                e.target.value = "";
              }}
            />
          </>
        ) : (
          <>
            <span className={styles.courseResourceValue}>{course.csvName || "course.csv"}</span>
            <div className={styles.courseResourceActions}>
              <button type="button" className={styles.linkButton} onClick={() => onPreviewCsv(course.csvName || "course.csv", course.csvData ?? "")}>
                Preview
              </button>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  const blob = new Blob([course.csvData ?? ""], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = course.csvName || "course.csv";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </button>
              <button type="button" className={styles.linkButton} disabled={uploadingCsv} onClick={() => csvUploadRef.current?.click()}>
                {uploadingCsv ? "Uploading…" : "Replace"}
              </button>
              <button type="button" className={styles.linkButton} style={{ color: "var(--danger)" }} onClick={() => setCsvRemoveConfirm((v) => !v)}>
                {csvRemoveConfirm ? "Confirm" : "Remove"}
              </button>
              {canLms && (
                <button type="button" className={styles.linkButton} disabled={csvBusy} onClick={() => onCsvFromLms(course)}>
                  {csvBusy ? "Loading..." : "From LMS"}
                </button>
              )}
              {canImport && (
                <button type="button" className={styles.linkButton} disabled={csvBusy} onClick={() => onCsvFromImport(course)}>
                  {csvBusy ? "Loading..." : "From import"}
                </button>
              )}
            </div>
            {csvRemoveConfirm && (
              <div style={{ marginTop: 8 }}>
                <Button variant="outlined" size="small" color="error" onClick={() => void removeCsv()}>
                  Delete CSV
                </Button>
                <Button variant="text" size="small" onClick={() => setCsvRemoveConfirm(false)}>
                  Cancel
                </Button>
              </div>
            )}
            <input
              ref={csvUploadRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvUpload(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      <div className={styles.courseResource}>
        <div className={styles.courseResourceHead}>
          <span className={styles.courseResourceLabel}>Rubric</span>
          {course.rubricData && course.rubricData.trim() && (
            <span className={styles.navBadge} style={{ marginLeft: 8 }}>
              {(() => {
                const rows = parseGeneratedRubric(course.rubricData ?? "");
                const count = rows?.length ?? 0;
                return `${count} criteri${count === 1 ? "on" : "a"}`;
              })()}
            </span>
          )}
        </div>
        {!course.rubricData ? (
          <>
            <span className={styles.courseResourceEmpty}>No rubric yet - Course Refresh generates one here, or upload a rubric.</span>
            <div className={styles.courseResourceActions}>
              <Button variant="outlined" size="small" disabled={uploadingRubric} onClick={openRubricPicker}>
                {uploadingRubric ? "Uploading…" : "Upload rubric"}
              </Button>
              {canLms && (
                <button type="button" className={styles.linkButton} disabled={rubricBusy} onClick={() => onRubricFromLms(course)}>
                  {rubricBusy ? "Loading..." : "From LMS"}
                </button>
              )}
              {canImport && (
                <button type="button" className={styles.linkButton} disabled={rubricBusy} onClick={() => onRubricFromImport(course)}>
                  {rubricBusy ? "Loading..." : "From import"}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className={styles.courseResourceValue}>{course.rubricName || "rubric.md"}</span>
            <div className={styles.courseResourceActions}>
              <button type="button" className={styles.linkButton} onClick={() => onPreviewRubric(course.rubricName || "rubric.md", course.rubricData ?? "")}>
                Preview
              </button>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  const blob = new Blob([course.rubricData ?? ""], { type: "text/markdown;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = course.rubricName || "rubric.md";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </button>
              <button type="button" className={styles.linkButton} disabled={uploadingRubric} onClick={openRubricPicker}>
                {uploadingRubric ? "Uploading…" : "Replace"}
              </button>
              <button type="button" className={styles.linkButton} style={{ color: "var(--danger)" }} onClick={() => setRubricRemoveConfirm((v) => !v)}>
                {rubricRemoveConfirm ? "Confirm" : "Remove"}
              </button>
              {canLms && (
                <button type="button" className={styles.linkButton} disabled={rubricBusy} onClick={() => onRubricFromLms(course)}>
                  {rubricBusy ? "Loading..." : "From LMS"}
                </button>
              )}
              {canImport && (
                <button type="button" className={styles.linkButton} disabled={rubricBusy} onClick={() => onRubricFromImport(course)}>
                  {rubricBusy ? "Loading..." : "From import"}
                </button>
              )}
            </div>
            {rubricRemoveConfirm && (
              <div style={{ marginTop: 8 }}>
                <Button variant="outlined" size="small" color="error" onClick={() => void removeRubric()}>
                  Delete rubric
                </Button>
                <Button variant="text" size="small" onClick={() => setRubricRemoveConfirm(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
