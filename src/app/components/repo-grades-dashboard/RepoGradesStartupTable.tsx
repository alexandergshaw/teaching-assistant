"use client";

import { useState } from "react";
import { Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from "@mui/material";
import type { CourseStartupProgress } from "./startup-progress";
import { StartupStatusChip } from "./StartupStatusChip";
import {
  formatStartupRepositoryCoverage, nextStartupTableSort, orderStartupStatuses, sortStartupCourses, STARTUP_STATUS,
  type StartupSortColumn, type StartupTableSort,
} from "./startup-table";

const COLUMNS: ReadonlyArray<{ id: StartupSortColumn; label: string }> = [
  { id: "class", label: "Class" },
  { id: "status", label: "Startup status" },
];

export function RepoGradesStartupTable({ courses, headingId }: {
  courses: readonly CourseStartupProgress[];
  headingId: string;
}) {
  const [sort, setSort] = useState<StartupTableSort>({ column: "class", direction: "asc" });
  return (
    <TableContainer>
      <Table size="small" aria-labelledby={headingId}>
        <caption>Sorting by startup status uses the most urgent status in each class.</caption>
        <TableHead>
          <TableRow>
            {COLUMNS.map(({ id, label }) => {
              const active = sort.column === id;
              return (
                <TableCell key={id} scope="col" sortDirection={active ? sort.direction : false}
                  sx={{ bgcolor: "var(--surface-subtle)", fontWeight: 700 }}>
                  <TableSortLabel component="button" type="button" active={active}
                    direction={active ? sort.direction : "asc"}
                    onClick={() => setSort((current) => nextStartupTableSort(current, id))}
                    sx={{
                      py: "var(--space-1)",
                      fontWeight: "inherit",
                      "& .MuiTableSortLabel-icon": { opacity: active ? 1 : 0.55 },
                    }}>
                    {label}
                  </TableSortLabel>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortStartupCourses(courses, sort).map((course) => {
            const targetCount = course.states.reduce((total, { count }) => total + count, 0);
            return (
              <TableRow key={course.courseId}>
                <TableCell component="th" scope="row">{course.label}</TableCell>
                <TableCell>
                  {course.repositories && (
                    <Typography component="p" variant="body2" sx={{ mb: "var(--space-1)" }}>
                      {formatStartupRepositoryCoverage(course.repositories)}
                    </Typography>
                  )}
                  {targetCount > 0 && (
                    <Typography component="p" variant="body2" sx={{ mb: "var(--space-1)" }}>
                      Grading targets identified: {targetCount}
                    </Typography>
                  )}
                  <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
                    {orderStartupStatuses(course.states).map(({ state, count }) => {
                      const { label: statusLabel, tone } = STARTUP_STATUS[state];
                      const label = state === "succeeded" ? "Graded" : statusLabel;
                      return <StartupStatusChip key={state} tone={tone} label={count ? `${label} (${count})` : label} />;
                    })}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
