"use client";

import { IconButton } from "@mui/material";

// Small "move up" / "move down" icon button shared by module and item rows.
export function ArrowButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      {label === "Move up" ? "↑" : "↓"}
    </IconButton>
  );
}
