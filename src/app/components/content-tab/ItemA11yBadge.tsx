"use client";

import type { CanvasModuleItem } from "@/lib/canvas-modules";
import { useAccessibility } from "../AccessibilityProvider";
import { a11yRefForItem } from "./utils";
import IconButton from "@mui/material/IconButton";

// A small badge on a module item row showing its accessibility error/warning
// tally; click opens the Accessibility Center. Renders nothing when clean or
// not yet scanned (the TopBar pill shows overall scan progress).
export function ItemA11yBadge({ item }: { item: CanvasModuleItem }) {
  const a11y = useAccessibility();
  const ref = a11yRefForItem(item);
  const scan = ref ? a11y.getItem(ref.type, ref.id) : undefined;
  if (!scan) return null;
  const issues = scan.errorCount + scan.warningCount;
  if (issues === 0) return null;
  const color = scan.errorCount > 0 ? "#dc2626" : "#d97706";
  return (
    <IconButton
      size="small"
      onClick={() => a11y.setCenterOpen(true)}
      title={`${issues} accessibility issue${issues === 1 ? "" : "s"} — open Accessibility Center`}
      aria-label={`${issues} accessibility issue${issues === 1 ? "" : "s"} — open Accessibility Center`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        height: 24,
        padding: "0 7px",
        borderRadius: 0.75,
        border: `1px solid ${color}`,
        background: "#fff",
        color,
        fontSize: "0.74rem",
        fontWeight: 700,
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {issues}
    </IconButton>
  );
}
