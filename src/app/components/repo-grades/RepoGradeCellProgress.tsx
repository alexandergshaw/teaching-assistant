import { LinearProgress, Stack, Typography } from "@mui/material";
import type { GradeCellProgress } from "./repoGradeProgress";

const cellStatus = {
  running: { label: "Grading", color: "primary.main" },
  queued: { label: "Queued", color: "text.secondary" },
  paused: { label: "Paused", color: "warning.main" },
  waiting: { label: "Waiting for worker", color: "text.secondary" },
  settled: { label: "Processing finished", color: "text.secondary" },
  stopped: { label: "Stopped", color: "text.secondary" },
  attention: { label: "Grading needs attention", color: "warning.main" },
  unconfirmed: { label: "Progress unconfirmed", color: "warning.main" },
} as const;

export default function RepoGradeCellProgress({ state, repo, folder }: { state: GradeCellProgress; repo: string; folder: string }) {
  const { label, color } = cellStatus[state];
  return (
    <Stack spacing={0.5} sx={{ flexBasis: "100%", minWidth: 0, alignSelf: "stretch" }}>
      <Typography variant="caption" color={color} sx={{ fontWeight: state === "running" ? 650 : 500 }}>{label}</Typography>
      {state === "running" && <LinearProgress aria-label={`Grading ${repo} / ${folder || "repository root"}`} sx={{
        width: "100%", maxWidth: 180, height: 4, borderRadius: 1,
        "@media (prefers-reduced-motion: reduce)": {
          "& .MuiLinearProgress-bar": { animation: "none" },
          "& .MuiLinearProgress-bar1": { width: "35%", left: 0 },
        },
      }} />}
    </Stack>
  );
}
