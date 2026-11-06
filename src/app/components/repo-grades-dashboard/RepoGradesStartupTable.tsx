"use client";

import { useState } from "react";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import type { CourseStartupProgress } from "./startup-progress";
import {
  nextStartupTableSort, orderStartupStatuses, sortStartupCourses, STARTUP_STATUS,
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
          {sortStartupCourses(courses, sort).map((course) => (
            <TableRow key={course.courseId}>
              <TableCell component="th" scope="row">{course.label}</TableCell>
              <TableCell>
                <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
                  {orderStartupStatuses(course.states).map(({ state, count }) => {
                    const { label: statusLabel, tone } = STARTUP_STATUS[state];
                    const label = state === "succeeded" ? "Graded" : statusLabel;
                    return (
                      <Chip key={state} size="small" variant="outlined"
                        label={count ? `${label} (${count})` : label}
                        sx={{
                          height: "auto",
                          minHeight: 24,
                          fontWeight: 700,
                          color: tone === "neutral" ? "var(--text-secondary)" : `var(--${tone}-ink)`,
                          bgcolor: tone === "neutral" ? "var(--surface-subtle)" : `var(--${tone}-surface)`,
                          "& .MuiChip-label": { whiteSpace: "normal" },
                        }}
                      />
                    );
                  })}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
