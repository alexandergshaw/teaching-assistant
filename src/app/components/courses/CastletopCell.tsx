"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import TextField from "@mui/material/TextField";
import { generateCastletopWorkbookAction } from "@/app/actions/castletop";
import { appendCourseCastletopFileAction, removeCourseCastletopFileAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { useSupabase } from "@/context/SupabaseProvider";
import { base64ToBlob } from "@/lib/workflows/registry-helpers";
import { uploadCourseFile, getCourseZipUrl, removeCourseZip } from "@/lib/course-files";
import styles from "../../page.module.css";

const POPOVER_BODY_STYLE: React.CSSProperties = { padding: 16, width: 360, maxWidth: "90vw" };

export interface CastletopCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
}

export function CastletopCell({ course, onCourseUpdated }: CastletopCellProps) {
  const { supabase, user } = useSupabase();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [generationNotes, setGenerationNotes] = useState<string[]>([]);
  const [popoverError, setPopoverError] = useState<string | null>(null);

  const storageKeyPrefix = `ta-castletop-${course.id}`;

  const getStorageValue = (key: string, defaultValue: string): string => {
    if (typeof window === "undefined") return defaultValue;
    try {
      return localStorage.getItem(`${storageKeyPrefix}-${key}`) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const setStorageValue = (key: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(`${storageKeyPrefix}-${key}`, value);
    } catch {
    }
  };

  const [instructor, setInstructor] = useState(() => getStorageValue("instructor", ""));
  const [instructorFileAs, setInstructorFileAs] = useState(() => getStorageValue("instructorFileAs", ""));
  const [contactMinutes, setContactMinutes] = useState(() => getStorageValue("contactMinutes", "50"));
  const [readingRate, setReadingRate] = useState(() => getStorageValue("readingRate", "19"));
  const [pagesPerChapter, setPagesPerChapter] = useState(() => getStorageValue("pagesPerChapter", "30"));
  const [classSessionMinutes, setClassSessionMinutes] = useState(() => getStorageValue("classSessionMinutes", "120"));

  const handleInstructorChange = (value: string) => {
    setInstructor(value);
    setStorageValue("instructor", value);
  };

  const handleInstructorFileAsChange = (value: string) => {
    setInstructorFileAs(value);
    setStorageValue("instructorFileAs", value);
  };

  const handleContactMinutesChange = (value: string) => {
    setContactMinutes(value);
    setStorageValue("contactMinutes", value);
  };

  const handleReadingRateChange = (value: string) => {
    setReadingRate(value);
    setStorageValue("readingRate", value);
  };

  const handlePagesPerChapterChange = (value: string) => {
    setPagesPerChapter(value);
    setStorageValue("pagesPerChapter", value);
  };

  const handleClassSessionMinutesChange = (value: string) => {
    setClassSessionMinutes(value);
    setStorageValue("classSessionMinutes", value);
  };

  const handleGenerate = async () => {
    if (!user) {
      setPopoverError("You must be logged in.");
      return;
    }

    setGenerating(true);
    setPopoverError(null);
    setGenerationNotes([]);

    try {
      const contactMinutesNum = contactMinutes.trim() ? parseInt(contactMinutes, 10) : undefined;
      const readingRateNum = readingRate.trim() ? parseInt(readingRate, 10) : undefined;
      const pagesPerChapterNum = pagesPerChapter.trim() ? parseInt(pagesPerChapter, 10) : undefined;
      const classSessionMinutesNum = classSessionMinutes.trim() ? parseInt(classSessionMinutes, 10) : undefined;

      const result = await generateCastletopWorkbookAction(course.id, {
        instructor: instructor.trim() || null,
        instructorFileAs: instructorFileAs.trim() || null,
        contactMinutes: contactMinutesNum,
        readingRate: readingRateNum,
        pagesPerChapter: pagesPerChapterNum,
        classSessionMinutes: classSessionMinutesNum,
      });

      if ("error" in result) {
        setPopoverError(result.error);
        return;
      }

      const blob = base64ToBlob(result.base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const { path } = await uploadCourseFile(supabase, user.id, course.id, blob, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      const appendResult = await appendCourseCastletopFileAction(course.id, {
        name: result.fileName,
        path,
        size: blob.size,
      });

      if ("error" in appendResult) {
        setPopoverError(appendResult.error);
        await removeCourseZip(supabase, path);
        return;
      }

      if (appendResult.replacedPath) {
        await removeCourseZip(supabase, appendResult.replacedPath);
      }

      const updatedFiles = course.castletopFiles.filter((f) => f.name !== result.fileName);
      updatedFiles.push({
        name: result.fileName,
        path,
        size: blob.size,
        addedAt: new Date().toISOString(),
      });

      onCourseUpdated({ ...course, castletopFiles: updatedFiles });
      setGenerationNotes(result.notes);
    } catch (err) {
      setPopoverError(err instanceof Error ? err.message : "Could not generate the workbook.");
    } finally {
      setGenerating(false);
    }
  };

  const handleRemoveFile = async (path: string) => {
    if (!user) {
      setPopoverError("You must be logged in.");
      return;
    }

    setRemovingPath(path);
    setPopoverError(null);

    try {
      await removeCourseZip(supabase, path);
      const removeResult = await removeCourseCastletopFileAction(course.id, path);

      if ("error" in removeResult) {
        setPopoverError(removeResult.error);
      } else {
        onCourseUpdated({
          ...course,
          castletopFiles: course.castletopFiles.filter((f) => f.path !== path),
        });
      }
    } catch (err) {
      setPopoverError(err instanceof Error ? err.message : "Could not remove the file.");
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
      setPopoverError(err instanceof Error ? err.message : "Could not download the file.");
    }
  };

  const summary = course.castletopFiles.length > 0
    ? course.castletopFiles[course.castletopFiles.length - 1].name
    : "Not set";

  return (
    <td style={{ minWidth: 200 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span className={course.castletopFiles.length > 0 ? styles.courseResourceValue : styles.courseResourceEmpty}>
          {summary}
        </span>
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
            <span className={styles.courseResourceLabel}>Castletop</span>
          </div>

          <Button
            variant="outlined"
            size="small"
            disabled={generating}
            onClick={handleGenerate}
            style={{ marginBottom: 12 }}
          >
            {generating ? "Generating..." : "Generate"}
          </Button>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <TextField
              label="Instructor"
              size="small"
              value={instructor}
              onChange={(e) => handleInstructorChange(e.target.value)}
              fullWidth
              variant="outlined"
            />
            <TextField
              label="Instructor (file-as)"
              size="small"
              value={instructorFileAs}
              onChange={(e) => handleInstructorFileAsChange(e.target.value)}
              fullWidth
              variant="outlined"
              placeholder="Loring, William"
              helperText="Names the file. Falls back to Instructor when blank."
            />
            <TextField
              label="Contact minutes"
              type="number"
              size="small"
              value={contactMinutes}
              onChange={(e) => handleContactMinutesChange(e.target.value)}
              fullWidth
              variant="outlined"
            />
            <TextField
              label="Reading rate (pages/hr)"
              type="number"
              size="small"
              value={readingRate}
              onChange={(e) => handleReadingRateChange(e.target.value)}
              fullWidth
              variant="outlined"
            />
            <TextField
              label="Pages per chapter"
              type="number"
              size="small"
              value={pagesPerChapter}
              onChange={(e) => handlePagesPerChapterChange(e.target.value)}
              fullWidth
              variant="outlined"
            />
            <TextField
              label="Class session minutes"
              type="number"
              size="small"
              value={classSessionMinutes}
              onChange={(e) => handleClassSessionMinutesChange(e.target.value)}
              fullWidth
              variant="outlined"
            />
          </div>

          {course.castletopFiles.length === 0 ? (
            <span className={styles.courseResourceEmpty} style={{ marginTop: 8, display: "block" }}>
              No files yet.
            </span>
          ) : (
            <div style={{ marginTop: 16 }}>
              {course.castletopFiles.map((file) => (
                <div key={file.path} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9em" }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.name} - {(file.size / 1048576).toFixed(1)} MB
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.85em", marginLeft: 8 }}>
                      {new Date(file.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => handleDownloadFile(file.path, file.name)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      style={{ color: "var(--danger)" }}
                      disabled={removingPath === file.path}
                      onClick={() => handleRemoveFile(file.path)}
                    >
                      {removingPath === file.path ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {popoverError && (
            <div style={{ color: "var(--danger)", marginTop: 8, fontSize: "0.875rem" }}>
              {popoverError}
            </div>
          )}

          {generationNotes.length > 0 && (
            <div style={{ marginTop: 8, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {generationNotes.map((note, i) => (
                <div key={i}>{note}</div>
              ))}
            </div>
          )}
        </div>
      </Popover>
    </td>
  );
}
