"use client";

import { Autocomplete, MenuItem, TextField } from "@mui/material";
import GithubRepoPicker from "../../GithubRepoPicker";
import SourcePolicyEditor from "../SourcePolicyEditor";
import ScopePicker from "./ScopePicker";
import { type BuilderPickerData } from "./builder-shared";
import { parseMultiSelectValue, serializeMultiSelectValue, usesMultiSelect } from "@/lib/multi-select-value";

function LiteralEditor({
  type,
  value,
  picker,
  onChange,
  options,
  multi,
}: {
  type: string;
  value: string;
  picker: BuilderPickerData;
  onChange: (value: string) => void;
  // Carried through from StepInputSpec.options/multi (types.ts) only for
  // inputs that declare BOTH - the caller (InputBindingRow.tsx) still routes
  // an options-only (no multi) literal to its own OptionsSelect control
  // unchanged, so these two props are only ever set together in practice.
  options?: string[];
  multi?: boolean;
}) {
  const sx = { flex: 1, minWidth: 200 };

  // Checked before any `type` branch below, mirroring RuntimeFieldInput.tsx's
  // run-form control: usesMultiSelect is true only when BOTH options and
  // multi are set (multi-select-value.ts), so this never intercepts the
  // options-without-multi case (that stays on OptionsSelect, unchanged) or
  // any of the plain `type` branches. Reuses parseMultiSelectValue /
  // serializeMultiSelectValue - the SAME newline-joined format the run form
  // reads and writes - so a value saved here loads correctly there and vice
  // versa. freeSolo and an unfiltered `options` list mean a stale saved
  // value (naming an option the field no longer declares) still round-trips
  // and displays as a chip rather than being silently dropped.
  if (usesMultiSelect({ options, multi })) {
    const selected = parseMultiSelectValue(value);
    return (
      <Autocomplete
        multiple
        freeSolo
        options={options ?? []}
        value={selected}
        onChange={(_, newValue) => onChange(serializeMultiSelectValue(newValue))}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder={selected.length === 0 ? "Select or type one or more..." : undefined}
          />
        )}
        sx={sx}
      />
    );
  }

  if (type === "hubCourse") {
    const opts = picker.hubCourses ?? [];
    const missing = !!value && !opts.some((c) => c.id === value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.hubCourses === null ? "Loading courses..." : opts.length === 0 ? "No course tiles yet." : undefined}>
        <MenuItem value="">Choose a course tile</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((c) => (
          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "institution") {
    const missing = !!value && !picker.institutions.includes(value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}>
        <MenuItem value="">Choose an institution</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {picker.institutions.map((i) => (
          <MenuItem key={i} value={i}>{i}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "org") {
    const opts = picker.orgs ?? [];
    const missing = !!value && !opts.includes(value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.orgs === null ? "Loading organizations..." : opts.length === 0 ? "No organizations." : undefined}>
        <MenuItem value="">Choose an organization</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((o) => (
          <MenuItem key={o} value={o}>{o}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "hubCourseList") {
    return (
      <ScopePicker
        value={value}
        onChange={onChange}
        options={(picker.hubCourses ?? []).map((c) => ({ value: c.id, label: c.name }))}
        allLabel="All course tiles"
        loading={picker.hubCourses === null}
      />
    );
  }
  if (type === "orgList") {
    return (
      <ScopePicker
        value={value}
        onChange={onChange}
        options={(picker.orgs ?? []).map((o) => ({ value: o, label: o }))}
        allLabel="All organizations"
        loading={picker.orgs === null}
      />
    );
  }
  if (type === "boolean") {
    return (
      <TextField select size="small" value={value === "1" ? "1" : ""} onChange={(e) => onChange(e.target.value)} sx={sx}>
        <MenuItem value="1">True</MenuItem>
        <MenuItem value="">False</MenuItem>
      </TextField>
    );
  }
  if (type === "date") {
    return (
      <TextField
        type="date"
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={sx}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    );
  }
  if (type === "time") {
    // A dedicated branch, not folded into "date" above: a preset ("Fixed
    // value") for a time input needs its own native <input type="time">, not
    // a date picker - the two render entirely different controls even
    // though both special-case the same way relative to every OTHER type
    // here (docs/announcement-post-time-acceptance-criteria.md T1.3).
    return (
      <TextField
        type="time"
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={sx}
      />
    );
  }
  if (type === "repo") {
    return (
      <div style={{ flex: 1, minWidth: 200 }}>
        <GithubRepoPicker value={value} onChange={onChange} />
      </div>
    );
  }
  if (type === "deckTemplate") {
    const opts = picker.deckTemplates ?? [];
    const missing = !!value && !opts.some((t) => t.id === value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.deckTemplates === null ? "Loading templates..." : opts.length === 0 ? "No templates yet." : undefined}>
        <MenuItem value="">Choose a template</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((t) => (
          <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "assignmentTemplate") {
    const opts = picker.assignmentTemplates ?? [];
    const missing = !!value && !opts.some((t) => t.id === value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.assignmentTemplates === null ? "Loading templates..." : opts.length === 0 ? "No templates yet." : undefined}>
        <MenuItem value="">Choose a template</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((t) => (
          <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "testTemplate") {
    const opts = picker.testTemplates ?? [];
    const missing = !!value && !opts.some((t) => t.id === value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.testTemplates === null ? "Loading templates..." : opts.length === 0 ? "No templates yet." : undefined}>
        <MenuItem value="">Choose a template</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((t) => (
          <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "classSessionTemplate") {
    const opts = picker.classSessionTemplates ?? [];
    const missing = !!value && !opts.some((t) => t.id === value);
    return (
      <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={sx}
        helperText={picker.classSessionTemplates === null ? "Loading templates..." : opts.length === 0 ? "No templates yet." : undefined}>
        <MenuItem value="">Choose a template</MenuItem>
        {missing && <MenuItem value={value}>{value} (unavailable)</MenuItem>}
        {opts.map((t) => (
          <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
        ))}
      </TextField>
    );
  }
  if (type === "lookahead") {
    const numDays = parseInt(value, 10);
    const decomposed =
      isNaN(numDays) || numDays <= 0
        ? { value: "", unit: "days" as const }
        : numDays % 30 === 0
          ? { value: String(numDays / 30), unit: "months" as const }
          : numDays % 7 === 0
            ? { value: String(numDays / 7), unit: "weeks" as const }
            : { value: String(numDays), unit: "days" as const };

    const handleNumberChange = (newNum: string) => {
      if (!newNum || parseInt(newNum, 10) <= 0) {
        onChange("");
      } else {
        const unitFactor =
          decomposed.unit === "months" ? 30 : decomposed.unit === "weeks" ? 7 : 1;
        onChange(String(parseInt(newNum, 10) * unitFactor));
      }
    };

    const handleUnitChange = (newUnit: "days" | "weeks" | "months") => {
      if (!decomposed.value) {
        onChange("");
      } else {
        const numVal = parseInt(decomposed.value, 10);
        const unitFactor = newUnit === "months" ? 30 : newUnit === "weeks" ? 7 : 1;
        onChange(String(numVal * unitFactor));
      }
    };

    return (
      <div style={{ flex: 1, minWidth: 200, display: "flex", gap: 8 }}>
        <TextField
          type="number"
          size="small"
          placeholder="0"
          value={decomposed.value}
          onChange={(e) => handleNumberChange(e.target.value)}
          slotProps={{ htmlInput: { min: 1 } }}
          sx={{ flex: 1, minWidth: 80 }}
        />
        <TextField
          select
          size="small"
          value={decomposed.unit}
          onChange={(e) =>
            handleUnitChange(e.target.value as "days" | "weeks" | "months")
          }
          sx={{ flex: 1, minWidth: 100 }}
        >
          <MenuItem value="days">days</MenuItem>
          <MenuItem value="weeks">weeks</MenuItem>
          <MenuItem value="months">months</MenuItem>
        </TextField>
      </div>
    );
  }
  if (type === "sourcePolicy") {
    return <SourcePolicyEditor value={value} onChange={onChange} />;
  }
  if (type === "moduleOffset") {
    return (
      <TextField
        type="number"
        size="small"
        placeholder="0"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (!val || parseInt(val, 10) < 0) {
            onChange("");
          } else {
            onChange(String(parseInt(val, 10)));
          }
        }}
        slotProps={{ htmlInput: { min: 0 } }}
        sx={sx}
      />
    );
  }
  // lmsCourse / lmsCourseList / text / longtext / number / concepts: the builder has no
  // live-course list (that needs an institution + fetch), so a field is used.
  // Only the SCOPEABLE list type accepts "*" (all); a singular lmsCourse does
  // NOT expand "*" at run time, so its hint must not offer it.
  const lmsHint =
    type === "lmsCourseList"
      ? "Paste one Canvas course URL per line, or * for all courses at the institution."
      : type === "lmsCourse"
        ? "Paste the Canvas course URL."
        : undefined;
  return (
    <TextField
      size="small"
      type={type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={type === "lmsCourseList" ? "Canvas course URL(s); * = all" : type === "lmsCourse" ? "Canvas course URL" : undefined}
      helperText={lmsHint}
      multiline={type === "longtext" || type === "concepts"}
      minRows={type === "longtext" || type === "concepts" ? 3 : undefined}
      sx={sx}
    />
  );
}

export { LiteralEditor };
export default LiteralEditor;
