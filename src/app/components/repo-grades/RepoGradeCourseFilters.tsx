"use client";

import { useState } from "react";
import { Chip, FormControl, FormLabel } from "@mui/material";
import type { Course } from "@/lib/supabase/courses";
import { buildRepoGradeCourseFilters } from "./repoGradesCoursePicker";
import styles from "./repo-grades-dashboard.module.css";

export default function RepoGradeCourseFilters({ courses, courseId, onCourseIdChange }: {
  courses: readonly Course[];
  courseId: string;
  onCourseIdChange: (courseId: string) => void;
}) {
  const [preferredInstitution, setPreferredInstitution] = useState<string | null>(null);
  const { institutions, courseInstitution, activeInstitution, classes } =
    buildRepoGradeCourseFilters(courses, courseId, preferredInstitution);
  if (institutions.length === 0) return null;

  return (
    <div className={styles.courseFilters}>
      <FormControl component="fieldset">
        <FormLabel component="legend">Institution</FormLabel>
        <div className={styles.courseChipRow}>
          {institutions.map((institution) => (
            <Chip key={institution} className={styles.courseChip} component="button" type="button"
              label={institution || "Institution not set"}
              color={institution === activeInstitution ? "primary" : "default"}
              variant={institution === activeInstitution ? "filled" : "outlined"}
              aria-pressed={institution === activeInstitution}
              onClick={() => {
                setPreferredInstitution(institution);
                if (courseId && institution !== courseInstitution) onCourseIdChange("");
              }} />
          ))}
        </div>
      </FormControl>
      <FormControl component="fieldset">
        <FormLabel component="legend">Class</FormLabel>
        <div className={styles.courseChipRow}>
          {classes.map(({ id, label }) => (
            <Chip key={id} className={styles.courseChip} component="button" type="button"
              label={label}
              color={id === courseId ? "primary" : "default"}
              variant={id === courseId ? "filled" : "outlined"}
              aria-pressed={id === courseId} onClick={() => onCourseIdChange(id)} />
          ))}
        </div>
      </FormControl>
    </div>
  );
}
