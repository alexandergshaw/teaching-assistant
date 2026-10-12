import { Button, CircularProgress } from "@mui/material";

// Per-row Regrade control. While the row is queued or in flight it shows a small
// spinner and "Regrading...", is disabled, and announces the state politely; it
// restores itself when the row settles. Presentation only.
export function RegradeButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button
      variant="outlined"
      size="small"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      startIcon={busy ? <CircularProgress size={14} color="inherit" aria-hidden="true" /> : undefined}
    >
      {busy ? "Regrading..." : "Regrade"}
    </Button>
  );
}
