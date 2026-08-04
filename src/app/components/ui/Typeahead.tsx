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
  /** Optional id for the underlying text input, so an external `<label
   * htmlFor>` (or `aria-describedby`) can point at the actual control
   * instead of at whatever id MUI's Autocomplete generates internally.
   * Omitted by every pre-existing caller, which keeps MUI's own generated
   * id exactly as before. */
  id?: string;
  /** Optional aria-describedby for the underlying text input - see `id`. */
  "aria-describedby"?: string;
  /** Optional required flag for the underlying text input - see `id`. */
  required?: boolean;
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
  id,
  "aria-describedby": ariaDescribedBy,
  required,
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
      renderInput={(params) => (
        // `id ?? params.id`: every pre-existing caller omits `id`, so this
        // keeps MUI's own generated id (already correctly wired to the
        // floating label via `params`) exactly as before - only a caller
        // that explicitly passes `id` overrides it. `aria-describedby` is
        // NOT a recognized top-level TextField prop - it is routed through
        // slotProps.htmlInput, merged with Autocomplete's own htmlInput
        // wiring (params.slotProps.htmlInput - role/aria-autocomplete/
        // onChange for the combobox), which is the only channel that
        // actually reaches the underlying native <input>.
        <TextField
          {...params}
          id={id ?? params.id}
          required={required}
          label={label}
          placeholder={placeholder}
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, "aria-describedby": ariaDescribedBy },
          }}
        />
      )}
    />
  );
}
