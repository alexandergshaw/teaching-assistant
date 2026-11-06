"use client";

import { useId, useState } from "react";
import { Autocomplete, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import {
  AUTOMATIC_REPO_GRADE_INTERVAL_LIMITS, type AutomaticRepoGradeScheduleDraft,
} from "@/lib/repo-grades-dashboard/automatic-schedule";
import type { AutomaticRepoGradeSchedule } from "@/lib/repo-grades-dashboard/automatic-status";

const ZONES = [...new Set(["UTC", ...Intl.supportedValuesOf("timeZone")])];
const unavailableButton = { "&[aria-disabled=true]": { color: "text.disabled", cursor: "default" } };
type Cadence = "daily" | "hours" | "days";

export function AutomaticRepoGradeScheduleControl({ schedule, pending, save }: {
  schedule: AutomaticRepoGradeSchedule | null;
  pending: boolean;
  save: (draft: AutomaticRepoGradeScheduleDraft | null) => Promise<void>;
}) {
  const headingId = useId();
  const timingId = useId();
  const [cadence, setCadence] = useState<Cadence>(schedule?.kind === "interval" ? schedule.unit : "daily");
  const [time, setTime] = useState(schedule?.kind === "daily" ? schedule.time : "08:00");
  const [zone, setZone] = useState<string | null>(schedule?.kind === "daily" ? schedule.zone : "UTC");
  const [count, setCount] = useState(schedule?.kind === "interval" ? String(schedule.count) : "1");
  const zones = zone && !ZONES.includes(zone) ? [zone, ...ZONES] : ZONES;
  const displayZone = schedule?.kind === "daily" ? schedule.zone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nextRun = schedule && new Intl.DateTimeFormat("en", {
    timeZone: displayZone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(schedule.nextAt));
  const intervalCount = Number(count);
  const draft: AutomaticRepoGradeScheduleDraft | null = cadence === "daily"
    ? time && zone ? { kind: "daily", time, zone } : null
    : Number.isInteger(intervalCount) && intervalCount >= 1 && intervalCount <= AUTOMATIC_REPO_GRADE_INTERVAL_LIMITS[cadence]
      ? { kind: "interval", count: intervalCount, unit: cadence } : null;

  return (
    <Stack component="form" spacing={1} aria-labelledby={headingId} aria-describedby={timingId} onSubmit={(event) => {
      event.preventDefault();
      if (draft && !pending) void save(draft);
    }}>
      <Typography component="h3" id={headingId}>Background grading schedule</Typography>
      <Typography variant="body2" id={timingId}>
        The app can be closed. The worker picks up due checks and skips an occurrence if a run is still active.
      </Typography>
      <Typography variant="body2" role="status">
        {schedule ? `Next scheduled run: ${nextRun} (${displayZone}).` : "No background run scheduled."}
        {schedule?.kind === "interval" && ` Repeats every ${schedule.count} ${schedule.count === 1 ? schedule.unit.slice(0, -1) : schedule.unit}.`}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField select label="Check frequency" size="small" value={cadence} disabled={pending} sx={{ minWidth: 170 }}
          onChange={(event) => setCadence(event.target.value as Cadence)}>
          <MenuItem value="daily">Daily at a set time</MenuItem>
          <MenuItem value="hours">Every few hours</MenuItem>
          <MenuItem value="days">Every few days</MenuItem>
        </TextField>
        {cadence === "daily" ? (
          <>
            <TextField type="time" label="Daily time" size="small" value={time} required disabled={pending}
              slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => setTime(event.target.value)} />
            <Autocomplete options={zones} value={zone} onChange={(_, selected) => setZone(selected)} disabled={pending}
              size="small" sx={{ minWidth: 220 }} renderInput={(props) => <TextField {...props} label="Time zone" required />} />
          </>
        ) : (
          <TextField type="number" label={cadence === "hours" ? "Hours between checks" : "Days between checks"}
            size="small" value={count} required disabled={pending} sx={{ minWidth: 200 }}
            helperText={cadence === "days" ? "A day is 24 hours. The first check is due one interval after saving."
              : "The first check is due one interval after saving."}
            slotProps={{ htmlInput: { min: 1, max: AUTOMATIC_REPO_GRADE_INTERVAL_LIMITS[cadence], step: 1 } }}
            onChange={(event) => setCount(event.target.value)} />
        )}
      </Stack>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
        <Button type="submit" variant="outlined" size="small" aria-disabled={pending || !draft}
          sx={unavailableButton}>Save schedule</Button>
        <Button type="button" size="small" aria-disabled={pending || !schedule} sx={unavailableButton}
          onClick={() => { if (schedule && !pending) void save(null); }}>Remove schedule</Button>
      </Stack>
    </Stack>
  );
}
