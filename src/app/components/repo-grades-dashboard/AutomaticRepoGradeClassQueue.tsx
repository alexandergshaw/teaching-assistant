"use client";

import { useId, useState } from "react";
import { Button, Checkbox, FormControlLabel, List, ListItem, Stack, Typography } from "@mui/material";
import type { AutomaticRepoGradeClassQueue as SavedClassQueue } from "@/lib/repo-grades-dashboard/automatic-status";
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
        <List dense aria-describedby={hintId} aria-label="Classes in automatic grading queue">
          {rows.map(({ courseId, label }) => {
            const position = positions.get(courseId);
            const editable = known.has(courseId);
            return <ListItem key={courseId} disableGutters sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <FormControlLabel sx={{ flex: "1 1 220px", m: 0 }}
                control={<Checkbox size="small" checked={position !== undefined} disabled={pending || !editable}
                  onChange={(_, checked) => edit(checked ? [...included, courseId] : included.filter((id) => id !== courseId),
                    checked ? `${label} added at position ${included.length + 1}.` : `${label} removed from the queue.`)} />}
                label={label} />
              {position !== undefined && <>
                <Typography variant="body2">{position}</Typography>
                {([-1, 1] as const).map((direction) => <Button key={direction} size="small" disabled={pending || position + direction < 1 || position + direction > included.length}
                  aria-label={`Move ${direction < 0 ? "up" : "down"}: ${label}`} onClick={() => {
                    const next = included.slice();
                    [next[position - 1], next[position - 1 + direction]] = [next[position - 1 + direction], next[position - 1]];
                    edit(next, `${label} moved to position ${position + direction} of ${included.length}.`);
                  }}>{direction < 0 ? "Move up" : "Move down"}</Button>)}
              </>}
            </ListItem>;
          })}
        </List>
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
