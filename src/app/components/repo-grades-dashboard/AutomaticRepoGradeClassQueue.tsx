"use client";

import { useId, useState } from "react";
import { Button, Stack, Typography } from "@mui/material";
import type { AutomaticRepoGradeClassQueue as SavedClassQueue } from "@/lib/repo-grades-dashboard/automatic-status";
import { RepoGradesStartupTable } from "./RepoGradesStartupTable";
import type { CourseStartupProgress } from "./startup-progress";

export function AutomaticRepoGradeClassQueue({ queue, courses, pending, save }: {
  queue: SavedClassQueue;
  courses: readonly CourseStartupProgress[];
  pending: boolean;
  save: (courseIds: string[] | null) => Promise<boolean>;
}) {
  const headingId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState<string[] | null>();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = queue.courses.filter((course) => course.included).map((course) => course.courseId);
  const known = new Map(queue.courses.map((course) => [course.courseId, course]));
  const configured = draft === undefined ? queue.customized : draft !== null;
  const included = draft === null ? [...known.keys()].sort() : (draft ?? saved).filter((id) => known.has(id));
  const changed = configured !== queue.customized || included.length !== saved.length
    || included.some((id, i) => id !== saved[i]);
  const positions = new Map(included.map((id, i) => [id, i + 1]));
  const runProgress = new Map(courses.map((course) => [course.courseId, course]));
  const rows = [
    ...included,
    ...[...known.keys()].filter((id) => !positions.has(id)),
    ...courses.flatMap(({ courseId }) => known.has(courseId) ? [] : [courseId]),
  ].map((courseId): CourseStartupProgress => ({
    ...runProgress.get(courseId),
    courseId,
    label: known.get(courseId)?.label ?? runProgress.get(courseId)?.label ?? "Unnamed course",
    states: runProgress.get(courseId)?.states ?? [],
  }));

  function edit(next: string[] | null, announcement = "") {
    setDraft(next);
    setMessage(announcement);
  }

  async function saveDraft() {
    if (pending || saving || !changed) return;
    setSaving(true);
    try {
      const confirmed = await save(configured ? included : null).catch(() => false);
      if (confirmed) setDraft(undefined);
      setMessage(confirmed ? "Class queue saved for the next run." : "Could not confirm that the class queue was saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack component="section" aria-labelledby={headingId} spacing={1} sx={{ mt: "var(--space-3)" }}>
      <Typography id={headingId} component="h3" variant="subtitle1">Automatic grading class queue</Typography>
      <Typography id={hintId} variant="body2">
        Save which classes to check and in what order. Changes apply to the next run. New classes are included only in the default queue.
      </Typography>
      {rows.length === 0 ? <Typography variant="body2">No classes are available.</Typography> : (
        <RepoGradesStartupTable courses={rows} headingId={headingId} classQueue={{
          positions, classIds: new Set(known.keys()), pending, descriptionId: hintId,
          toggle(id, checked) {
            edit(checked ? [...included, id] : included.filter((courseId) => courseId !== id),
              checked ? `${known.get(id)?.label} added at position ${included.length + 1}.` : `${known.get(id)?.label} removed from the queue.`);
          },
          move(id, direction) {
            const current = included.indexOf(id);
            const next = current + direction;
            if (current < 0 || next < 0 || next >= included.length) return;
            const reordered = included.slice();
            [reordered[current], reordered[next]] = [reordered[next], reordered[current]];
            edit(reordered, `${known.get(id)?.label} moved to position ${next + 1} of ${included.length}.`);
          },
        }} />
      )}
      <Typography variant="body2">
        {included.length === 0 ? "No classes selected." : `${included.length} ${included.length === 1 ? "class" : "classes"} selected.`}
        {changed ? " Unsaved changes." : ""}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button type="button" variant="contained" size="small" aria-disabled={pending || saving || !changed}
          sx={{ "&[aria-disabled=true]": { color: "text.disabled", bgcolor: "action.disabledBackground", cursor: "default" } }}
          onClick={() => void saveDraft()}>{saving ? "Saving queue" : "Save queue"}</Button>
        <Button type="button" size="small" disabled={pending || !changed}
          onClick={() => { setDraft(undefined); setMessage("Queue edits discarded."); }}>Discard edits</Button>
        <Button type="button" size="small" disabled={pending || !configured}
          onClick={() => edit(null, "Default queue selected. Save to apply.")}>Use default queue</Button>
      </Stack>
      <Typography variant="body2" role="status" aria-atomic="true">{message}</Typography>
    </Stack>
  );
}
