"use client";

import { Button, Select, MenuItem } from "@mui/material";
import { SLIDE_ROLES } from "@/lib/decks/types";

interface AddContentPanelProps {
  isReadOnly: boolean;
  onAddSlide: (role: string) => void;
  onAddLoop: () => void;
}

export default function AddContentPanel({
  isReadOnly,
  onAddSlide,
  onAddLoop,
}: AddContentPanelProps) {
  return (
    <div
      style={{
        marginBottom: "var(--space-6)",
        padding: "var(--space-4)",
        backgroundColor: "var(--field-bg)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <h4
        style={{
          margin: "0 0 var(--space-4) 0",
          fontSize: "var(--font-size-2xs)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-secondary)",
        }}
      >
        Add content
      </h4>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Select
          defaultValue="concept"
          disabled={isReadOnly}
          size="small"
          sx={{ flex: "1 1 150px", minWidth: "120px" }}
          onChange={(e) => {
            onAddSlide(e.target.value);
            (e.target as HTMLSelectElement).value = "concept";
          }}
        >
          {SLIDE_ROLES.map((r) => (
            <MenuItem key={r.role} value={r.role}>
              {r.label}
            </MenuItem>
          ))}
        </Select>
        <Button
          variant="contained"
          size="small"
          onClick={() => onAddSlide("concept")}
          disabled={isReadOnly}
          sx={{ textTransform: "none" }}
        >
          Add slide
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={onAddLoop}
          disabled={isReadOnly}
          sx={{ textTransform: "none" }}
        >
          Add loop
        </Button>
      </div>
    </div>
  );
}
