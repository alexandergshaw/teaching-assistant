import { Chip, CircularProgress } from "@mui/material";

const STATUS = {
  queued: { label: "Queued", color: "default" },
  paused: { label: "Paused", color: "warning" },
  running: { label: "Grading", color: "info" },
  stopped: { label: "Stopped", color: "default" },
  blocked: { label: "Blocked", color: "warning" },
  succeeded: { label: "Graded", color: "success" },
  failed: { label: "Failed", color: "error" },
  partial: { label: "Partial grade", color: "warning" },
  "no-submission": { label: "No submission", color: "default" },
  "not-started": { label: "Not graded", color: "default" },
  "draft-score": { label: "Draft score", color: "default" },
  "missing-folder": { label: "Blocked: folder missing", color: "warning" },
  "scan-error": { label: "Blocked: repository scan failed", color: "warning" },
  unknown: { label: "Outcome unknown", color: "warning" },
} as const;

export type RepoGradeStatus = keyof typeof STATUS;

export default function RepoGradeStatusChip({ status, active = false, source }: {
  status: RepoGradeStatus; active?: boolean; source?: "Browser" | "Saved" | "Latest saved";
}) {
  const label = STATUS[status].label;
  return (
    <Chip component="span" size="small" variant="outlined" label={source ? `${source}: ${label}` : label} color={STATUS[status].color}
      icon={active ? <CircularProgress color="inherit" size={14} aria-hidden="true" /> : undefined}
      sx={{
        maxWidth: "100%", height: "auto", minHeight: 24,
        "& .MuiChip-label": { whiteSpace: "normal", py: 0.25 },
        ...(active && { fontWeight: 700, bgcolor: "var(--accent-surface)", "& .MuiChip-icon": { color: "inherit" } }),
      }} />
  );
}
