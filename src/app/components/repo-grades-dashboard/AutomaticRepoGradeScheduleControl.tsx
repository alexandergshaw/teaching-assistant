"use client";

import { useId, useState } from "react";
import { Autocomplete, Button, Stack, TextField, Typography } from "@mui/material";
import type { AutomaticRepoGradeSchedule } from "@/lib/repo-grades-dashboard/automatic-status";

const ZONES = [...new Set(["UTC", ...Intl.supportedValuesOf("timeZone")])];
const unavailableButton = { "&[aria-disabled=true]": { color: "text.disabled", cursor: "default" } };

export function AutomaticRepoGradeScheduleControl({ schedule, pending, save }: {
  schedule: AutomaticRepoGradeSchedule | null;
  pending: boolean;
  save: (time: string | null, zone: string | null) => Promise<void>;
}) {
  const headingId = useId();
  const timingId = useId();
  const [time, setTime] = useState(schedule?.time ?? "08:00");
  const [zone, setZone] = useState<string | null>(schedule?.zone ?? "UTC");
  const zones = zone && !ZONES.includes(zone) ? [zone, ...ZONES] : ZONES;
  const nextRun = schedule && new Intl.DateTimeFormat("en", {
    timeZone: schedule.zone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(schedule.nextAt));

  return (
    <Stack component="form" spacing={1} aria-labelledby={headingId} aria-describedby={timingId} onSubmit={(event) => {
      event.preventDefault();
      if (time && zone && !pending) void save(time, zone);
    }}>
      <Typography component="h3" id={headingId}>Daily grading schedule</Typography>
      <Typography variant="body2" id={timingId}>
        The worker checks for due runs after the scheduled time. The app can be closed.
      </Typography>
      <Typography variant="body2" role="status">
        {schedule ? `Next scheduled run: ${nextRun} (${schedule.zone}).` : "No daily run scheduled."}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField type="time" label="Daily time" size="small" value={time} required disabled={pending}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => setTime(event.target.value)} />
        <Autocomplete options={zones} value={zone} onChange={(_, selected) => setZone(selected)} disabled={pending}
          size="small" sx={{ minWidth: 220 }} renderInput={(props) => <TextField {...props} label="Time zone" required />} />
      </Stack>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
        <Button type="submit" variant="outlined" size="small" aria-disabled={pending || !time || !zone}
          sx={unavailableButton}>Save daily schedule</Button>
        <Button type="button" size="small" aria-disabled={pending || !schedule} sx={unavailableButton}
          onClick={() => { if (schedule && !pending) void save(null, null); }}>Remove daily schedule</Button>
      </Stack>
    </Stack>
  );
}
