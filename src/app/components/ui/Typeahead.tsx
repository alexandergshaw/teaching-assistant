"use client";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

export interface TypeaheadOption {
  value: string;
  label: string;
  /** Optional secondary line shown under the label in the dropdown. */
  hint?: string;
}

export interface TypeaheadProps {
  options: TypeaheadOption[];
  /** The currently selected option's value (or "" for none). */
  value: string;
  /** Called with the selected option's value, or "" when cleared. */
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  noOptionsText?: string;
}

/** Project-wide typeahead: filter a list by name, store the underlying value. */
export default function Typeahead({
  options,
  value,
  onChange,
  label,
  placeholder,
  disabled,
  loading,
  noOptionsText,
}: TypeaheadProps) {
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <Autocomplete<TypeaheadOption>
      options={options}
      value={selected}
      onChange={(_, opt) => onChange(opt ? opt.value : "")}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      disabled={disabled}
      loading={loading}
      fullWidth
      size="small"
      noOptionsText={noOptionsText}
      renderOption={(props, o) => (
        <li {...(props as React.HTMLAttributes<HTMLLIElement>)} key={o.value}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span>{o.label}</span>
            {o.hint ? (
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{o.hint}</span>
            ) : null}
          </span>
        </li>
      )}
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} />}
    />
  );
}
