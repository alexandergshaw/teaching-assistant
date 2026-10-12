"use client";

import { useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { useGradingCourses } from "./grading-recording/useGradingCourses";
import { parseRosterNames } from "./grading-recording/grading-course-roster";
import { KNOWN_STUDENTS_FIELD } from "@/lib/grade/knownStudents";
import styles from "../page.module.css";

// A45 wave 3: the course picker on the Upload ZIP form. The chosen course's
// roster names ride the form as the hidden `knownStudents` field (one name
// per line) so the server's collision check can tell a student's own folder
// from a shared one (docs/a45-external-identity-corroboration-scope.md 5.4).
// No course selected -> an empty field -> the server degrades to A44's
// path-only decision. The selection persists under this ta- key.
const GRADE_ZIP_COURSE_STORAGE_KEY = "ta-grade-zip-course";

function readStoredCourseId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(GRADE_ZIP_COURSE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function GradingCoursePicker() {
  const { courses, coursesLoading, coursesError } = useGradingCourses(true);
  const [courseId, setCourseId] = useState<string>(readStoredCourseId);
  // Only a course that is actually loaded counts as selected; a stale stored
  // id (deleted course, list not loaded yet) behaves as "none".
  const selected = courses?.find((c) => c.id === courseId) ?? null;
  const names = selected ? parseRosterNames(selected.roster) : [];

  const choose = (next: string) => {
    setCourseId(next);
    try {
      localStorage.setItem(GRADE_ZIP_COURSE_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice still applies for this page view.
    }
  };

  return (
    <div className={styles.field}>
      <label htmlFor="grade-zip-course">Course roster (optional)</label>
      <TextField
        select
        size="small"
        id="grade-zip-course"
        value={selected ? selected.id : ""}
        onChange={(e) => choose(e.target.value)}
        disabled={coursesLoading}
        sx={{ minWidth: 240 }}
      >
        <MenuItem value="">No course</MenuItem>
        {(courses ?? []).map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <input type="hidden" name={KNOWN_STUDENTS_FIELD} value={names.join("\n")} />
      <p className={styles.fieldHint}>
        {coursesError
          ? `Could not load your courses: ${coursesError}`
          : selected && names.length === 0
            ? "This course has no roster text, so folders are not checked against a roster."
            : "Pick the course so files in a folder that does not match exactly one student on its roster are refused instead of graded together."}
      </p>
    </div>
  );
}
