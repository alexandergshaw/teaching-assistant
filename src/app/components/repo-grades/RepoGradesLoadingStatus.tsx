import { Box, LinearProgress, Typography } from "@mui/material";

export function RepoGradesLoadingStatus({ label, settledLabel }: { label: string | null; settledLabel?: string }) {
  return (
    <Box role="status" sx={label ? {
      borderInlineStart: "4px solid var(--accent-ink)",
      borderRadius: "var(--radius-md)",
      bgcolor: "var(--accent-surface)",
      p: "var(--space-3)",
    } : settledLabel ? undefined : { position: "absolute" }}>
      {label ? (
        <>
          <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{label}</Typography>
          <LinearProgress aria-hidden="true" sx={{ mt: "var(--space-2)", borderRadius: 1 }} />
        </>
      ) : settledLabel && <Typography variant="body2">{settledLabel}</Typography>}
    </Box>
  );
}

export function RepoGradesColumnProgress({ folder, progress, state }: {
  folder: string;
  progress: { done: number; total: number } | null;
  state?: "running" | "paused" | "stopping";
}) {
  const action = state === "paused" ? "Paused" : state === "stopping" ? "Stopping" : "Grading";
  const label = `${action} ${folder}`;
  const count = progress && progress.total > 0 ? `${progress.done} of ${progress.total} finished` : null;
  return (
    <Box sx={{
      bgcolor: state === "paused" ? "var(--warning-surface)" : "var(--accent-surface)",
      borderRadius: "var(--radius-md)",
      p: "var(--space-2)",
    }}>
      <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
        {label}{count && ` · ${count}`}
      </Typography>
      {progress && count ? (
        <LinearProgress variant="determinate" max={progress.total} value={progress.done}
          color={state === "paused" ? "warning" : "primary"} aria-label={label}
          aria-valuetext={count} sx={{ mt: "var(--space-1)", borderRadius: 1 }} />
      ) : state !== "paused" && (
        <LinearProgress aria-label={label} sx={{ mt: "var(--space-1)", borderRadius: 1 }} />
      )}
    </Box>
  );
}
