"use client";

import type { ReactNode } from "react";

// Extracted out of WorkflowPanel.tsx so RunFormFields.tsx (the run form's
// primary/secondary field layout) can reuse the exact same collapsible
// header WorkflowPanel.tsx already uses for "Steps," "Schedule & trigger,"
// and "Run history," rather than a second, subtly different-looking
// disclosure control. Importing it FROM WorkflowPanel.tsx would create a
// cycle (WorkflowPanel -> RunFormFields -> WorkflowPanel), hence its own
// file.
/** A collapsible section header - shared by every disclosure on the
 * workflow panel page so they all look and behave the same way. */
export function DisclosureToggle({
  open,
  onClick,
  children,
}: {
  open: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      style={{
        textAlign: "left",
        padding: "var(--space-2) 0",
        borderRadius: 0,
        border: "none",
        borderTop: "1px solid var(--field-border)",
        cursor: "pointer",
        background: "transparent",
        color: "var(--text-primary)",
        fontWeight: 600,
        fontSize: "var(--font-size-md)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        width: "100%",
        marginTop: "var(--space-3)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.2s",
          flex: "none",
        }}
      >
        <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 2L3 4L5 2" stroke="currentColor" strokeWidth="0.75" />
        </svg>
      </span>
      {children}
    </button>
  );
}
