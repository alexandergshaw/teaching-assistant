"use client";

import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import type { InstitutionPage } from "@/lib/knowledge-base";
import { invalidParentIds } from "./knowledge-helpers";

const ROOT_VALUE = "__root__";

interface ParentPickerProps {
  pages: InstitutionPage[];
  movingId: string;
  currentParentId: string | null;
  onChange: (parentId: string | null) => void;
  disabled?: boolean;
}

/**
 * Re-parent picker for a page: "Top level" plus every other page in the
 * institution, minus the page itself and its own descendants (invalidParentIds
 * reuses the server's wouldCreateCycle check - see that function's docstring
 * for why offering an invalid choice here would just be refused server-side).
 */
export default function ParentPicker({ pages, movingId, currentParentId, onChange, disabled }: ParentPickerProps) {
  const invalid = invalidParentIds(pages, movingId);
  const options = pages
    .filter((p) => !invalid.has(p.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <TextField
      select
      size="small"
      label="Parent page"
      value={currentParentId ?? ROOT_VALUE}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === ROOT_VALUE ? null : e.target.value)}
      sx={{ minWidth: 220 }}
    >
      <MenuItem value={ROOT_VALUE}>Top level</MenuItem>
      {options.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {p.title.trim() || "Untitled page"}
        </MenuItem>
      ))}
    </TextField>
  );
}
