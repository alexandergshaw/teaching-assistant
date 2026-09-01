"use client";

import { useState, type ReactNode } from "react";
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
import tableStyles from "./CoursesTable.module.css";

export interface CastletopCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

export function CastletopCell({ course, onCourseUpdated, menu }: CastletopCellProps) {
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
      <div className={`${tableStyles.stackXs} ${tableStyles.alignStart}`}>
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
        <div className={tableStyles.popoverBody}>
          <div className={styles.courseResourceHead}>
            <span className={styles.courseResourceLabel}>Castletop</span>
          </div>

          <Button
            variant="outlined"
            size="small"
            disabled={generating}
            onClick={handleGenerate}
            className={tableStyles.mb3}
          >
            {generating ? "Generating…" : "Generate"}
          </Button>

          <div className={`${tableStyles.stackSm} ${tableStyles.mb3}`}>
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
            <span className={`${styles.courseResourceEmpty} ${tableStyles.mt2}`} style={{ display: "block" }}>
              No files yet.
            </span>
          ) : (
            <div className={tableStyles.mt4}>
              {course.castletopFiles.map((file) => (
                <div key={file.path} className={tableStyles.fileListRow}>
                  <div className={tableStyles.fileRowHead}>
                    <span className={tableStyles.fileRowName}>
                      {file.name} - {(file.size / 1048576).toFixed(1)} MB
                    </span>
                    <span className={tableStyles.fileRowMeta}>
                      {new Date(file.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={tableStyles.fileRowActions}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => handleDownloadFile(file.path, file.name)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className={`${styles.linkButton} ${tableStyles.dangerLink}`}
                      disabled={removingPath === file.path}
                      onClick={() => handleRemoveFile(file.path)}
                    >
                      {removingPath === file.path ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {popoverError && (
            <div className={tableStyles.errorNote}>
              {popoverError}
            </div>
          )}

          {generationNotes.length > 0 && (
            <div className={tableStyles.noteText}>
              {generationNotes.map((note, i) => (
                <div key={i}>{note}</div>
              ))}
            </div>
          )}
        </div>
      </Popover>
      {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
    </td>
  );
}
