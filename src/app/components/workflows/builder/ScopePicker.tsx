"use client";

import { Checkbox, FormControlLabel, Autocomplete, TextField } from "@mui/material";
import { ALL_SCOPE } from "@/lib/workflows/scope";

function ScopePicker({
  value,
  onChange,
  options,
  allLabel,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  loading: boolean;
}) {
  const isAll = value.trim() === ALL_SCOPE;
  const selected = isAll ? [] : value.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 4 }}>
      <FormControlLabel
        control={
          <Checkbox size="small" checked={isAll} onChange={(e) => onChange(e.target.checked ? ALL_SCOPE : "")} />
        }
        label={allLabel}
      />
      {!isAll && (
        <Autocomplete
          multiple
          size="small"
          options={options.map((o) => o.value)}
          getOptionLabel={(v) => options.find((o) => o.value === v)?.label ?? v}
          value={selected}
          onChange={(_, v) => onChange(v.join("\n"))}
          loading={loading}
          renderInput={(params) => (
            <TextField {...params} size="small" placeholder={loading ? "Loading..." : "Select..."} />
          )}
        />
      )}
    </div>
  );
}

export { ScopePicker };
export default ScopePicker;
