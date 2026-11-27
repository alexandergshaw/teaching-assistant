"use client";

import { useState } from "react";
import { Chip, FormControl, FormLabel } from "@mui/material";
import type { Course } from "@/lib/supabase/courses";
import { buildRepoGradeTermFilters } from "./repoGradesCoursePicker";
import styles from "./repo-grades-dashboard.module.css";

export default function RepoGradeCourseFilters({ courses, courseId, onCourseIdChange }: {
  courses: readonly Course[];
  courseId: string;
  onCourseIdChange: (courseId: string) => void;
}) {
  const [preferredInstitution, setPreferredInstitution] = useState<string | null>(null);
  const [preferredTerm, setPreferredTerm] = useState<string | null>(null);
  const { institutions, courseInstitution, activeInstitution, terms, courseTerm, activeTerm, classes } =
    buildRepoGradeTermFilters(courses, courseId, preferredInstitution, preferredTerm);
  if (institutions.length === 0) return null;
  let missingTermLabel = "Term not set";
  while (terms.includes(missingTermLabel)) missingTermLabel += " (missing)";

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
                if (institution !== activeInstitution) setPreferredTerm(null);
                if (courseId && institution !== courseInstitution) onCourseIdChange("");
              }} />
          ))}
        </div>
      </FormControl>
      <FormControl component="fieldset">
        <FormLabel component="legend">Term</FormLabel>
        <div className={styles.courseChipRow}>
          {terms.map((term) => (
            <Chip key={term} className={styles.courseChip} component="button" type="button"
              label={term || missingTermLabel}
              color={term === activeTerm ? "primary" : "default"}
              variant={term === activeTerm ? "filled" : "outlined"}
              aria-pressed={term === activeTerm}
              onClick={() => {
                setPreferredInstitution(activeInstitution);
                setPreferredTerm(term);
                if (courseId && term !== courseTerm) onCourseIdChange("");
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
