"use client";

import { Chip, ListItemText, MenuItem, Tooltip } from "@mui/material";
import RepoGradeActionsMenu from "./RepoGradeActionsMenu";
import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";
import type { TargetCommand, TargetRequest } from "./useRepoGradeTargetRequests";

export function findTargetRequests(requests: readonly TargetRequest[], courseId: string, folder: string, repo: string | null) {
  const sameRepo = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  return requests.filter((request) => request.courseId === courseId && (request.bulk
    ? request.pairs ? request.pairs.some((cell) => cell.folder === folder && (repo === null || sameRepo(cell.repo, repo)))
      : (!request.folders || request.folders.includes(folder)) && (repo === null || !request.repos || request.repos.some((entry) => sameRepo(entry, repo)))
    : request.folder === folder && (repo === null || request.repo === null || sameRepo(request.repo, repo))));
}

export function TargetRequestChip({ request }: { request?: TargetRequest }) {
  if (!request) return null;
  const terminal = request.state === "complete" || request.state === "incomplete" || request.state === "stopped";
  const paused = request.state === "paused" || request.state === "paused-running";
  const text = request.state === "complete" ? "Complete" : request.state === "incomplete" ? "Incomplete" : request.state === "stopped" ? "Stopped"
    : request.state === "paused-running" ? "Pausing" : request.state === "running" ? "Grading"
    : request.state === "paused" ? "Paused" : "Queued";
  const totals = Object.entries(request.counts ?? {}).filter(([name, count]) => /^[a-z-]{1,40}$/.test(name) && Number.isSafeInteger(count) && count >= 0)
    .map(([name, count]) => `${count} ${name.replaceAll("-", " ")}`).join(", ");
  const description = [request.bulk || request.repo === null ? "Request totals may include other cells." : "Latest grading request.",
    totals, request.reason ? automaticReasonLabel(request.reason) : ""].filter(Boolean).join(" ");
  const chip = <Chip size="small" label={text} color={request.state === "incomplete" ? "warning" : paused ? "warning" : "info"}
    variant="outlined" tabIndex={terminal ? 0 : undefined} />;
  return terminal ? <Tooltip title={description}>{chip}</Tooltip> : chip;
}

export function activeTargetRequests(requests: readonly TargetRequest[]) {
  return requests.filter(({ state }) => state === "queued" || state === "paused" || state === "running" || state === "paused-running");
}

export function latestTargetRequest(requests: readonly TargetRequest[]) {
  return requests[requests.length - 1];
}

/** A completed request adds no information beside an existing graded result. */
export function visibleTargetRequest(requests: readonly TargetRequest[], hasGradedResult: boolean) {
  const active = activeTargetRequests(requests);
  const latest = active[0] ?? latestTargetRequest(requests);
  return hasGradedResult && latest?.state === "complete" ? undefined : latest;
}

export function targetRequestMenuItems(request: TargetRequest | undefined, available: boolean, pending: boolean,
  root: boolean, onStart: () => void, onControl: (id: number, action: TargetCommand) => void, close: () => void) {
  if (!request) return [<MenuItem key="grade" disabled={root || !available || pending} onClick={() => { close(); onStart(); }}>
    <ListItemText primary="Start grading" secondary={root ? "Repository root grading is not supported by the background worker." : undefined} />
  </MenuItem>];
  const paused = request.state === "paused" || request.state === "paused-running";
  const detail = [request.bulk ? "Controls the entire selected group." : "", request.inFlight ? "Work already started may finish." : ""].filter(Boolean).join(" ") || undefined;
  return [
    <MenuItem key="pause" disabled={pending} onClick={() => { close(); onControl(request.id, paused ? "resume" : "pause"); }}>
      <ListItemText primary={paused ? (request.bulk ? "Resume group" : "Resume grading") : (request.bulk ? "Pause group" : "Pause grading")} secondary={detail} />
    </MenuItem>,
    <MenuItem key="stop" disabled={pending} onClick={() => { close(); onControl(request.id, "stop"); }}>
      <ListItemText primary={request.bulk ? "Stop group" : "Stop grading"} secondary={detail} />
    </MenuItem>,
  ];
}

export function multipleTargetRequestMenuItems(requests: TargetRequest[], available: boolean, pending: boolean,
  root: boolean, onStart: () => void, onControl: (id: number, action: TargetCommand) => void, close: () => void) {
  if (!requests.length) return targetRequestMenuItems(undefined, available, pending, root, onStart, onControl, close);
  return requests.flatMap((request, index) => {
    const paused = request.state === "paused" || request.state === "paused-running";
    const grouped = request.bulk || request.repo === null;
    const scope = requests.length > 1 ? `request ${index + 1}` : grouped ? "group" : "grading";
    const detail = [grouped ? "Controls the entire assignment or selected group." : "", request.inFlight ? "Work already started may finish." : ""].filter(Boolean).join(" ") || undefined;
    return [<MenuItem key={`${request.id}-pause`} disabled={pending} onClick={() => { close(); onControl(request.id, paused ? "resume" : "pause"); }}>
      <ListItemText primary={`${paused ? "Resume" : "Pause"} ${scope}`} secondary={detail} />
    </MenuItem>, <MenuItem key={`${request.id}-stop`} disabled={pending} onClick={() => { close(); onControl(request.id, "stop"); }}>
      <ListItemText primary={`Stop ${scope}`} secondary={detail} />
    </MenuItem>];
  });
}

export function RepoTargetGradeActions({ label, requests, available, pending, onStart, onControl, root, hasGradedResult = false }: {
  label: string; requests: TargetRequest[]; available: boolean; pending: boolean;
  onStart: () => void; onControl: (id: number, action: TargetCommand) => void; root: boolean; hasGradedResult?: boolean;
}) {
  const active = activeTargetRequests(requests);
  return <>
    {active.length > 1 ? <Chip size="small" label={`${active.length} requests`} color="info" variant="outlined" /> : <TargetRequestChip request={visibleTargetRequest(requests, hasGradedResult)} />}
    <RepoGradeActionsMenu label={label}>
      {(close) => multipleTargetRequestMenuItems(active, available, pending, root, onStart, onControl, close)}
    </RepoGradeActionsMenu>
  </>;
}
