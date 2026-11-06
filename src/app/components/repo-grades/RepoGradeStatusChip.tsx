import { Chip, CircularProgress } from "@mui/material";

const STATUS = {
  queued: { label: "Queued", color: "default" },
  paused: { label: "Paused", color: "warning" },
  running: { label: "Grading", color: "info" },
  stopped: { label: "Stopped", color: "default" },
  blocked: { label: "Blocked", color: "warning" },
  succeeded: { label: "Succeeded", color: "success" },
  failed: { label: "Failed", color: "error" },
  partial: { label: "Partial evaluation", color: "warning" },
  "no-submission": { label: "No submission", color: "default" },
  "not-started": { label: "Not graded yet", color: "default" },
  "missing-folder": { label: "Blocked: folder missing", color: "warning" },
  "scan-error": { label: "Blocked: repository scan failed", color: "warning" },
  unknown: { label: "Outcome unknown", color: "warning" },
} as const;

export type RepoGradeStatus = keyof typeof STATUS;

export default function RepoGradeStatusChip({ status, active = false }: { status: RepoGradeStatus; active?: boolean }) {
  return (
    <Chip component="span" size="small" variant="outlined" label={STATUS[status].label} color={STATUS[status].color}
      icon={active ? <CircularProgress color="inherit" size={14} aria-hidden="true" /> : undefined}
      sx={active ? { fontWeight: 700, bgcolor: "var(--accent-surface)", "& .MuiChip-icon": { color: "inherit" } } : undefined} />
  );
}
