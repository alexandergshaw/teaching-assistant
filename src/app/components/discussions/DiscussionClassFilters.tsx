"use client";

import { useState } from "react";
import { Chip, FormControl, FormLabel, Stack } from "@mui/material";
import { discussionClassFilters, discussionSchoolLabel, type DiscussionClass } from "./discussion-class-filters";

export default function DiscussionClassFilters({ courses, selectedId, onSelect, disabled }: {
  courses: readonly DiscussionClass[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [school, setSchool] = useState<string | null>(null);
  const { institutions, activeInstitution, classes } = discussionClassFilters(courses, school);
  if (!institutions.length) return null;
  return <Stack spacing={1}>
    <FormControl component="fieldset"><FormLabel component="legend">School</FormLabel><Stack direction="row" useFlexGap sx={{ flexWrap: "wrap" }} spacing={1}>
      {institutions.map((institution) => <Chip key={institution} component="button" type="button" label={discussionSchoolLabel(institution, institutions)} color={institution === activeInstitution ? "primary" : "default"} variant={institution === activeInstitution ? "filled" : "outlined"} aria-pressed={institution === activeInstitution} disabled={disabled} onClick={() => setSchool(institution)} />)}
    </Stack></FormControl>
    <FormControl component="fieldset"><FormLabel component="legend">Class</FormLabel><Stack direction="row" useFlexGap sx={{ flexWrap: "wrap" }} spacing={1}>
      {classes.map((course) => <Chip key={course.id} component="button" type="button" label={course.label} color={course.id === selectedId ? "primary" : "default"} variant={course.id === selectedId ? "filled" : "outlined"} aria-pressed={course.id === selectedId} disabled={disabled} onClick={() => onSelect(course.id)} />)}
    </Stack></FormControl>
  </Stack>;
}
