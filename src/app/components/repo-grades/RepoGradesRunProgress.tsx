"use client";

import { useId, useState } from "react";
import { Alert, Box, Button, Chip, Divider, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import type { AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import { visuallyHidden } from "../ui/visuallyHidden";
import { repoGradeProgress, type GradeProgressEntry } from "./repoGradeProgress";
import type { TargetRequest } from "./useRepoGradeTargetRequests";

const INITIAL_ACTIVE_REQUESTS = 2;
export const REPO_GRADES_PROGRESS_ID = "repo-grades-run-progress";

export function focusRepoGradesRunProgress() {
  const panel = document.getElementById(REPO_GRADES_PROGRESS_ID);
  if (!panel) return;
  const quotaHeight = document.querySelector<HTMLElement>("[data-repo-grades-quota]")?.offsetHeight ?? 48;
  panel.style.scrollMarginTop = `calc(var(--topbar-height, 58px) + var(--in-session-banner-height, 0px) + ${60 + quotaHeight}px)`;
  panel.focus({ preventScroll: true });
  panel.scrollIntoView({ block: "start" });
}

function ProgressEntry({ entry, stale }: { entry: GradeProgressEntry; stale: boolean }) {
  const title = useId();
  return (
    <Stack component="section" aria-labelledby={title} spacing={1}>
      <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <Typography id={title} component="h4" variant="subtitle2">{entry.title}</Typography>
          <Typography variant="body2" color="text.secondary">{entry.scope}</Typography>
        </Box>
        <Chip size="small" variant="outlined" color={entry.tone} label={entry.stage}
          sx={{ maxWidth: "100%", height: "auto", minHeight: 24, "& .MuiChip-label": { py: 0.25, whiteSpace: "normal" } }} />
      </Stack>
      {entry.repositories && <Typography variant="body2">
        {entry.repositories.checked} of {entry.repositories.found} repositories checked{entry.repositories.enumerationComplete ? "" : " so far"}
      </Typography>}
      {entry.tracked > 0 ? <>
        <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
          <Typography component="p" variant="h5" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>
            {entry.settled}<Typography component="span" variant="body2"> of {entry.tracked} tracked targets settled</Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary">{entry.graded} graded</Typography>
        </Stack>
        <Box role="progressbar"
          aria-label={`${entry.requestId ? `Request ${entry.requestId}` : entry.title} · ${entry.scope}`} aria-valuemin={0} aria-valuemax={entry.tracked}
          aria-valuenow={entry.settled} aria-valuetext={`${entry.settled} of ${entry.tracked} tracked targets settled, ${entry.graded} graded`}
          sx={{ display: "flex", height: 10, overflow: "hidden", borderRadius: 1, bgcolor: "action.hover" }}>
          {entry.segments.map(({ group, count, color }) => (
            <Box key={group} aria-hidden="true" sx={{ flex: `${count} 1 0`, bgcolor: color, minWidth: 1 }} />
          ))}
        </Box>
        <Stack component="ul" direction="row" useFlexGap spacing={1} sx={{ listStyle: "none", p: 0, flexWrap: "wrap" }}>
          {entry.segments.map(({ group, label, count, color }) => <Stack component="li" key={group}
            direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Box aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
            <Typography variant="caption">{count} {label.toLowerCase()}</Typography>
          </Stack>)}
        </Stack>
      </> : <>
        {!stale && (entry.stage === "Checking GitHub repositories" || entry.stage === "Worker is processing the request"
          || entry.stage === "Worker is processing the run") && <LinearProgress aria-hidden="true" sx={{
          borderRadius: 1, "@media (prefers-reduced-motion: reduce)": { "& .MuiLinearProgress-bar": { animation: "none" } },
        }} />}
        <Typography variant="body2" color="text.secondary">{entry.finished
          ? "No grading targets were recorded." : "No grading targets recorded yet."}</Typography>
      </>}
      {entry.reasons.length > 0 && <Stack component="ul" spacing={0.25} sx={{ my: 0, pl: 2.5 }}>
        {entry.reasons.map((reason) => <Typography component="li" key={reason} variant="body2">{reason}</Typography>)}
      </Stack>}
    </Stack>
  );
}

export function RepoGradesRunProgress({ courseId, courseName, folder, requests, ready, unavailable, automaticStatus, automaticStale, refresh }: {
  courseId: string;
  courseName: string;
  folder: string | null;
  requests: readonly TargetRequest[];
  ready: boolean;
  unavailable: boolean;
  automaticStatus?: AutomaticRepoGradeStatus;
  automaticStale: boolean;
  refresh: () => Promise<void>;
}) {
  const heading = useId();
  const extra = useId();
  const [expanded, setExpanded] = useState(false);
  const background = automaticStatus?.status === "loaded"
    ? { run: automaticStatus.run, githubRetryAt: automaticStatus.githubRetryAt, stale: automaticStale } : null;
  const { activeRequests, latestRequest, courseProgress } = repoGradeProgress(requests, courseId, folder, background, ready);
  const extraCount = Math.max(0, activeRequests.length - INITIAL_ACTIVE_REQUESTS);
  const scope = `${courseName} · ${folder === null ? "All folders" : folder || "Repository root"}`;
  const summaries = [activeRequests[0], latestRequest, courseProgress].filter((entry): entry is GradeProgressEntry => !!entry)
    .map((entry) => `${entry.title}: ${entry.stage}.${entry.tracked ? ` ${entry.settled} of ${entry.tracked} tracked targets settled, ${entry.graded} graded.` : ""}`);
  const none = ready && !activeRequests.length && !latestRequest && !courseProgress;
  return (
    <Paper component="section" variant="outlined" id={REPO_GRADES_PROGRESS_ID} tabIndex={-1} aria-labelledby={heading}
      sx={{ p: { xs: 1.5, sm: 2 }, minWidth: 0, scrollMarginTop: "calc(var(--topbar-height, 58px) + var(--in-session-banner-height, 0px) + 108px)" }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography id={heading} component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>Grading progress</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{scope}</Typography>
        </Box>
        <span role="status" aria-atomic="true" style={visuallyHidden}>
          {unavailable ? "Queue status unavailable. Showing last known progress." : !ready ? "Loading grading queue." : ""}
          {activeRequests.length > 1 ? ` ${activeRequests.length} active requests.` : ""} {summaries.join(" ")}
        </span>
        {unavailable ? <Alert severity="warning" role="note" action={<Button size="small" onClick={() => void refresh()}>Retry</Button>}>
          Grading queue status is unavailable. Last known counts may be out of date. Grading controls are disabled until status is restored.
        </Alert> : !ready ? <Typography variant="body2">Loading grading queue…</Typography> : null}
        {automaticStale && courseProgress && <Typography variant="body2" color="warning.main">Showing the last available background run status.</Typography>}
        {none && <Typography variant="body2" color="text.secondary">No recent grading requests for this {folder === null ? "class" : "assignment"}.</Typography>}
        {activeRequests.length > 0 && <Stack spacing={1.5} divider={<Divider />}>
          {activeRequests.slice(0, INITIAL_ACTIVE_REQUESTS).map((entry) => <ProgressEntry key={entry.key} entry={entry} stale={unavailable} />)}
        </Stack>}
        {extraCount > 0 && <>
          <Button size="small" aria-expanded={expanded} aria-controls={extra}
            onClick={() => setExpanded((current) => !current)} sx={{ alignSelf: "start" }}>
            {expanded ? "Show fewer requests" : `Show ${extraCount} more ${extraCount === 1 ? "request" : "requests"}`}
          </Button>
          <Box id={extra} hidden={!expanded}>
            {expanded && <Stack spacing={1.5} divider={<Divider />}>
              {activeRequests.slice(INITIAL_ACTIVE_REQUESTS).map((entry) => <ProgressEntry key={entry.key} entry={entry} stale={unavailable} />)}
            </Stack>}
          </Box>
        </>}
        {latestRequest && <>{activeRequests.length > 0 && <Divider />}<ProgressEntry entry={latestRequest} stale={unavailable} /></>}
        {courseProgress && <>{(activeRequests.length > 0 || latestRequest) && <Divider />}<ProgressEntry entry={courseProgress} stale={automaticStale} /></>}
      </Stack>
    </Paper>
  );
}
