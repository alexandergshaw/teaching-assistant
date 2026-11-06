"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button, Checkbox, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from "@mui/material";
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

type ClassQueueControls = {
  positions: ReadonlyMap<string, number>;
  classIds: ReadonlySet<string>;
  pending: boolean;
  descriptionId: string;
  toggle: (courseId: string, included: boolean) => void;
  move: (courseId: string, direction: -1 | 1) => void;
};

export function RepoGradesStartupTable({ courses, headingId, classQueue }: {
  courses: readonly CourseStartupProgress[];
  headingId: string;
  classQueue?: ClassQueueControls;
}) {
  const [sort, setSort] = useState<StartupTableSort | null>(classQueue ? null : { column: "class", direction: "asc" });
  const focusAfterMove = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const button = focusAfterMove.current;
    if (button && button.isConnected) button.focus();
    focusAfterMove.current = null;
  }, [courses]);
  return (
    <TableContainer>
      <Table size="small" aria-labelledby={headingId} aria-describedby={classQueue?.descriptionId}>
        <caption>Sorting by startup status uses the most urgent status in each class.</caption>
        <TableHead>
          <TableRow>
            {COLUMNS.map(({ id, label }) => {
              const active = sort?.column === id;
              return (
                <TableCell key={id} scope="col" sortDirection={active ? sort.direction : false}
                  sx={{ bgcolor: "var(--surface-subtle)", fontWeight: 700 }}>
                  <TableSortLabel component="button" type="button" active={active}
                    direction={active ? sort.direction : "asc"}
                    onClick={() => setSort((current) => current ? nextStartupTableSort(current, id) : { column: id, direction: "asc" })}
                    sx={{
                      py: "var(--space-1)",
                      fontWeight: "inherit",
                      "& .MuiTableSortLabel-icon": { opacity: active ? 1 : 0.55 },
                    }}>
                    {classQueue && id === "status" ? "Current or last run" : label}
                  </TableSortLabel>
                </TableCell>
              );
            })}
            {classQueue && <>
              <TableCell scope="col" sx={{ bgcolor: "var(--surface-subtle)", fontWeight: 700 }}>Include next run</TableCell>
              <TableCell scope="col" sortDirection={sort ? false : "asc"} sx={{ bgcolor: "var(--surface-subtle)", fontWeight: 700 }}>
                <TableSortLabel component="button" type="button" active={!sort} onClick={() => setSort(null)}>
                  Queue order
                </TableSortLabel>
              </TableCell>
            </>}
          </TableRow>
        </TableHead>
        <TableBody>
          {(sort ? sortStartupCourses(courses, sort) : courses).map((course) => {
            const targetCount = course.states.reduce((total, { count }) => total + count, 0);
            const position = classQueue?.positions.get(course.courseId);
            return (
              <TableRow key={course.courseId}>
                <TableCell component="th" scope="row">{course.label}</TableCell>
                <TableCell>
                  {classQueue && course.states.length === 0 && "No run status"}
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
                      return <StartupStatusChip key={state} tone={tone}
                        icon={state === "not-configured" ? "organization" : undefined}
                        label={count ? `${label} (${count})` : label} />;
                    })}
                  </Stack>
                </TableCell>
                {classQueue && <>
                  <TableCell>
                    {classQueue.classIds.has(course.courseId) ? <Checkbox size="small" checked={position !== undefined}
                      disabled={classQueue.pending}
                      slotProps={{ input: { "aria-label": `Include ${course.label} in the next automatic run` } }}
                      onChange={(event, included) => {
                        focusAfterMove.current = event.target;
                        classQueue.toggle(course.courseId, included);
                      }} /> : "Class removed"}
                  </TableCell>
                  <TableCell>
                    {position === undefined ? "Not queued" : (
                      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <Typography variant="body2" component="span">{position}</Typography>
                        {([-1, 1] as const).map((direction) => {
                          const label = direction === -1 ? "Move up" : "Move down";
                          const unavailable = classQueue.pending || (direction === -1
                            ? position === 1 : position === classQueue.positions.size);
                          return <Button key={direction} type="button" size="small" aria-label={`${label}: ${course.label}`}
                            aria-disabled={unavailable}
                            sx={{ "&[aria-disabled=true]": { color: "text.disabled", cursor: "default" } }}
                            onClick={(event) => {
                              if (unavailable) return;
                              focusAfterMove.current = event.currentTarget;
                              classQueue.move(course.courseId, direction);
                            }}>{label}</Button>;
                        })}
                      </Stack>
                    )}
                  </TableCell>
                </>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
