"use client";

import { Button, MenuItem, TextField, Checkbox, FormControlLabel, Autocomplete } from "@mui/material";
import Typeahead from "../ui/Typeahead";
import SourcePolicyEditor from "./SourcePolicyEditor";
import { parseMultiSelectValue, serializeMultiSelectValue, usesMultiSelect } from "@/lib/multi-select-value";
import { EntityFieldInput } from "./RuntimeFieldInputEntityPickers";
import { TemplateFieldInput } from "./RuntimeFieldInputTemplates";
import { FieldShell } from "./FieldShell";
import type { RuntimeField } from "@/lib/workflows/types";
import styles from "../../page.module.css";

// Compact sizing for the run form's longtext/concepts inputs ONLY - scoped
// this way deliberately. page.module.css's shared ".field textarea" rule
// (min-height: 220px, padding: 16px 18px) is a GLOBAL rule reused by every
// ".field" consumer across the app (course tiles, Knowledge, chat,
// slide/caption studio, and dozens more - grep "styles.field" before ever
// touching that rule), so it is left completely untouched here. These two
// values are applied instead as an inline style on just this TextField's
// underlying textarea via slotProps.htmlInput.style, which wins over that
// global CSS rule (inline style beats any stylesheet selector, regardless
// of source order) without affecting any other consumer of ".field".
// Verified against node_modules/@mui/material/TextareaAutosize/
// TextareaAutosize.js: its autosize logic only ever imperatively mutates
// `textarea.style.height` / `.overflow` after mount (never replaces the
// whole style attribute), so minHeight/padding set here survive every
// autosize recalculation and every keystroke.
//
// minRows drops from the previous 4 to 2 - MUI computes the textarea's
// actual empty-state height from minRows, and a smaller CSS min-height
// alone would not shrink anything below that computed height (min-height
// only ever raises a smaller height, never lowers a larger one). Both
// changes are required together.
//
// minHeight 72px and padding "8px 12px" reuse this app's existing 8px/12px
// spacing tokens (8px already backs field-hint margins throughout this
// file, e.g. style={{ margin: "8px 0 0 0" }}; 12px already backs
// WorkflowPanel.module.css's .sectionLegend margin and page.module.css's
// own .clearFileButton padding) rather than introducing new spacing values.
// line-height is left alone (still the shared 1.55 from .field textarea) -
// already proportionate at any box size, so nothing new is needed there.
// At this app's run-form textarea font (0.9rem, from theme.ts's
// MuiOutlinedInput override) that line-height is about 22px/row, so 72px
// minus the 16px of vertical padding leaves roughly 2.5 visible lines -
// "on the order of 2 to 3 rows" without reading as a single-line field.
// resize: vertical is untouched (still governed by the shared .field
// textarea rule), so the box stays user-resizable.
const COMPACT_TEXTAREA_MIN_ROWS = 2;
const COMPACT_TEXTAREA_STYLE = { minHeight: "72px", padding: "8px 12px" };

// Field-type families delegated to a sibling file (docs/HANDOFF.md CHUNK E's
// line-cap ratchet - this file was 1012 lines, split MECHANICALLY, no
// behavior change, once it collided with CHUNK C's own edits here). Each
// family is a real seam: every type in ENTITY_PICKER_TYPES picks an
// institution/course tile/Canvas course/GitHub org or repo, or a "several/
// all" list of one of those (RuntimeFieldInputEntityPickers.tsx); every type
// in TEMPLATE_PICKER_TYPES is one of the four near-identical "select from a
// loaded template list" controls (RuntimeFieldInputTemplates.tsx). Both sets
// are mutually exclusive with every OTHER type this file still handles
// inline below, and with each other, so moving them out changes nothing
// about which branch a given field.type reaches.
const ENTITY_PICKER_TYPES = new Set([
  "org",
  "orgList",
  "repo",
  "lmsCourse",
  "hubCourse",
  "lmsCourseList",
  "institution",
  "hubCourseList",
]);
const TEMPLATE_PICKER_TYPES = new Set([
  "deckTemplate",
  "assignmentTemplate",
  "testTemplate",
  "classSessionTemplate",
]);

export interface RuntimeFieldInputOptions {
  orgs: string[] | null;
  orgsError: string | null;
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  hubCoursesError: string | null;
  lmsCourseOptions: Array<{ url: string; name: string }> | null;
  lmsCourseOptionsError: string | null;
  lmsModuleOptions: Array<{ label: string; value: string }>;
  lmsModuleError: string | null;
  lmsModuleFromExport: boolean;
  lmsModuleCanvasUrl: string | null;
  deckTemplates: Array<{ id: string; name: string }> | null;
  deckTemplatesError: string | null;
  assignmentTemplates: Array<{ id: string; name: string }> | null;
  assignmentTemplatesError: string | null;
  testTemplates: Array<{ id: string; name: string }> | null;
  testTemplatesError: string | null;
  classSessionTemplates: Array<{ id: string; name: string }> | null;
  classSessionTemplatesError: string | null;
  institutions: string[];
  activeInstitution: string | null;
}

export interface RuntimeFieldInputUploads {
  files: Record<string, File[]>;
  setFiles: (update: (prev: Record<string, File[]>) => Record<string, File[]>) => void;
}

// Exported (rather than kept module-private, as it was before the CHUNK E
// split) so RuntimeFieldInputEntityPickers.tsx and RuntimeFieldInputTemplates.tsx
// can import the exact same prop shape via `import type` - a type-only
// import, erased at compile time, so it creates no runtime circular
// dependency even though this file also imports a value (the component
// itself) back from each of those sibling files.
export interface RuntimeFieldInputProps {
  field: RuntimeField;
  value: string;
  onChange: (newValue: string) => void;
  options: RuntimeFieldInputOptions;
  uploads: RuntimeFieldInputUploads;
}

export function RuntimeFieldInput({
  field,
  value,
  onChange,
  options,
  uploads,
}: RuntimeFieldInputProps) {
  const { lmsModuleOptions, lmsModuleError, lmsModuleFromExport, lmsModuleCanvasUrl } = options;

  if (usesMultiSelect(field) && field.options) {
    // A fixed set of choices where several may be selected at once
    // (StepInputSpec.options + multi, types.ts) - e.g. course-build's
    // "outputs" field (steps.course-build-scope.ts, blank = every family -
    // see output-selection.ts's parseOutputSelection) and messaging's
    // "instructions" field (steps.messaging.ts, blank = no guidance added -
    // see draftMessageReplyAction in actions/messaging.ts). Checked BEFORE
    // any type-specific branch below so it applies regardless of the
    // field's underlying value type (both current fields happen to be
    // "longtext").
    //
    // Reuses the same MUI Autocomplete "multiple" pattern already used
    // below for orgList/hubCourseList/lmsCourseList: options are picked
    // from a real list (never typed from memory to select them), the
    // stored value stays newline-joined via
    // parseMultiSelectValue/serializeMultiSelectValue (src/lib/multi-
    // select-value.ts), and a stale value from a saved run whose option
    // list has since changed round-trips and still displays rather than
    // being silently dropped - exactly like orgList already does for a
    // stale org (its `value` array is never filtered against `orgs`
    // either). freeSolo stays on: messaging's help text explicitly invites
    // "type your own" in addition to the listed options, and
    // draftMessageReplyAction never validates `instructions` against the
    // option list, so removing free entry would be a real capability loss,
    // not just a cosmetic one. (A field like "outputs" whose consuming step
    // DOES validate against a fixed set - parseOutputSelection throws on an
    // unrecognized value - still gets a clear error at run time for a
    // free-typed entry, exactly as it would have from a typo in the old
    // textarea; the option dropdown means that path is no longer the one an
    // instructor has to use.)
    //
    // Blank means different things per field (verified by reading each
    // step's own run/consuming code, not assumed): "every output" for
    // outputs, "no added guidance" for messaging. This control does not
    // guess or editorialize which one applies - it shows the literal
    // selection (nothing checked when blank) and leaves the field's own
    // `help` text (already accurate for both fields today) to explain the
    // consequence, so an empty selection is never dressed up to look like
    // "nothing will happen" when it might mean the opposite.
    const selected = parseMultiSelectValue(value);
    // B1 (run-form cleanup): the option TEXT an instructor reads/picks is now
    // the human label (field.optionLabels, carried from StepInputSpec -
    // types.ts), never the raw stored key - getOptionLabel governs both the
    // dropdown list AND the selected chips (MUI's default renderTags calls
    // it too), while `selected`/`onChange` keep working with the raw keys
    // unchanged, so the stored/submitted value format is untouched. A field
    // with no optionLabels (e.g. messaging's freeSolo "instructions") falls
    // back to the raw value, identical to before. A free-typed value (this
    // control stays freeSolo) is also just its own raw string, so the same
    // fallback covers it too.
    const optionLabel = (opt: string) => field.optionLabels?.[opt] ?? opt;
    // Captured as a local `const` (rather than reading `field.options`
    // again below) so its narrowed type (this branch's own `if` guard
    // already proved it non-undefined) survives into the FieldShell render
    // prop's nested closure - TS control-flow narrowing on a property
    // access like `field.options` does not persist across a function
    // boundary, only on a local binding.
    const options = field.options;
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <Autocomplete
            // `id` set on Autocomplete itself (not the inner TextField)
            // so its internal ARIA wiring (listbox id, aria-owns,
            // aria-activedescendant, option ids) is all built from OUR id
            // consistently - useAutocomplete derives every one of those
            // from this single id. `{...params}` below then already
            // carries the matching id/htmlInput props; overriding just the
            // inner TextField's id after the fact would leave those
            // internal references pointing at a DIFFERENT (Autocomplete's
            // own auto-generated) id.
            id={id}
            multiple
            freeSolo
            options={options}
            getOptionLabel={optionLabel}
            value={selected}
            onChange={(_, newValue) => onChange(serializeMultiSelectValue(newValue))}
            renderInput={(params) => (
              <TextField
                {...params}
                required={required}
                size="small"
                placeholder={selected.length === 0 ? "Select or type one or more..." : undefined}
                slotProps={{
                  ...params.slotProps,
                  // Merge (not replace) params.slotProps.htmlInput - it
                  // already carries Autocomplete's own combobox wiring
                  // (role, aria-autocomplete, aria-expanded, onChange) that
                  // a flat `slotProps={{ htmlInput: {...} }}` would
                  // otherwise clobber outright.
                  htmlInput: { ...params.slotProps.htmlInput, "aria-describedby": ariaDescribedBy },
                }}
              />
            )}
          />
        )}
      </FieldShell>
    );
  } else if (ENTITY_PICKER_TYPES.has(field.type)) {
    return <EntityFieldInput field={field} value={value} onChange={onChange} options={options} uploads={uploads} />;
  } else if (field.type === "longtext" || field.type === "concepts") {
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <TextField
            id={id}
            required={required}
            multiline
            minRows={COMPACT_TEXTAREA_MIN_ROWS}
            fullWidth
            value={value}
            onChange={(e) =>
              onChange(e.target.value)
            }
            size="small"
            // aria-describedby is NOT a recognized top-level TextField prop
            // (MUI hardcodes its OWN "aria-describedby" - its helperText
            // id, always unset here since this app renders help/error text
            // itself rather than via TextField's `helperText` - on the
            // underlying input); routing it through slotProps.htmlInput,
            // merged AFTER that default, is the documented way to actually
            // reach the native element. See MUI's TextField.js source for
            // the exact merge order this relies on.
            slotProps={{ htmlInput: { style: COMPACT_TEXTAREA_STYLE, "aria-describedby": ariaDescribedBy } }}
          />
        )}
      </FieldShell>
    );
  } else if (field.type === "text" && field.options && field.options.length > 0) {
    // A fixed set of choices. Without this the run form would show a free text
    // box for an input the step parses as an enum, so a typo would silently
    // become an unrecognized value rather than being impossible to enter.
    // B1: the MenuItem TEXT is the human label (field.optionLabels) when one
    // exists - e.g. course-schedule-from-source's "source" field - falling
    // back to the raw option for a field with none; `value={option}` keeps
    // submitting the raw key either way.
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <TextField
            id={id}
            required={required}
            select
            size="small"
            fullWidth
            value={value}
            onChange={(e) => onChange(e.target.value)}
            // Select mode renders through MUI's own Select component (not
            // a plain <input>) - slotProps.select is the channel that
            // reaches its actual root element; slotProps.htmlInput would
            // not apply here.
            slotProps={{ select: { "aria-describedby": ariaDescribedBy } }}
          >
            {field.options!.map((option) => (
              <MenuItem key={option} value={option}>
                {field.optionLabels?.[option] ?? option}
              </MenuItem>
            ))}
          </TextField>
        )}
      </FieldShell>
    );
  } else if (field.type === "text") {
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <TextField
            id={id}
            required={required}
            fullWidth
            value={value}
            onChange={(e) =>
              onChange(e.target.value)
            }
            size="small"
            slotProps={{ htmlInput: { "aria-describedby": ariaDescribedBy } }}
          />
        )}
      </FieldShell>
    );
  } else if (field.type === "number") {
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <TextField
            id={id}
            required={required}
            type="number"
            fullWidth
            value={value}
            onChange={(e) =>
              onChange(e.target.value)
            }
            size="small"
            slotProps={{ htmlInput: { "aria-describedby": ariaDescribedBy } }}
          />
        )}
      </FieldShell>
    );
  } else if (field.type === "lookahead") {
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
        onChange(
          String(parseInt(newNum, 10) * unitFactor)
        );
      }
    };

    const handleUnitChange = (newUnit: "days" | "weeks" | "months") => {
      if (!decomposed.value) {
        onChange("");
      } else {
        const numVal = parseInt(decomposed.value, 10);
        const unitFactor =
          newUnit === "months" ? 30 : newUnit === "weeks" ? 7 : 1;
        onChange(
          String(numVal * unitFactor)
        );
      }
    };

    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <TextField
              id={id}
              required={required}
              type="number"
              placeholder="0"
              value={decomposed.value}
              onChange={(e) => handleNumberChange(e.target.value)}
              size="small"
              slotProps={{ htmlInput: { min: 1, "aria-describedby": ariaDescribedBy } }}
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
        )}
      </FieldShell>
    );
  } else if (field.type === "sourcePolicy") {
    // "legend": SourcePolicyEditor is several actual controls (a checkbox
    // per source, per-row Up/Down buttons, a strategy select, a reset link)
    // at once - a single <label> can only ever name ONE of them, so this
    // gets a group label instead (see FieldShell's own "legend" comment).
    return (
      <FieldShell field={field} variant="legend">
        {() => <SourcePolicyEditor value={value} onChange={onChange} />}
      </FieldShell>
    );
  } else if (field.type === "moduleOffset") {
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <TextField
            id={id}
            required={required}
            type="number"
            placeholder="0"
            value={value}
            onChange={(e) =>
              onChange(e.target.value)
            }
            size="small"
            slotProps={{ htmlInput: { min: 0, "aria-describedby": ariaDescribedBy } }}
          />
        )}
      </FieldShell>
    );
  } else if (field.type === "date") {
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <TextField
            id={id}
            required={required}
            type="date"
            fullWidth
            value={value}
            onChange={(e) =>
              onChange(e.target.value)
            }
            size="small"
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { "aria-describedby": ariaDescribedBy } }}
          />
        )}
      </FieldShell>
    );
  } else if (TEMPLATE_PICKER_TYPES.has(field.type)) {
    return <TemplateFieldInput field={field} value={value} onChange={onChange} options={options} uploads={uploads} />;
  } else if (field.type === "boolean") {
    // "hidden": FormControlLabel already supplies this control's accessible
    // name by visually WRAPPING `label` below - a second heading from
    // FieldShell would announce the same text twice (see FieldShell's own
    // "hidden" comment). If this field is ever required, the asterisk is
    // appended into FormControlLabel's own label text instead, since there
    // is no separate heading here to carry FieldShell's usual RequiredMark.
    return (
      <FieldShell field={field} variant="hidden">
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <FormControlLabel
            control={
              <Checkbox
                id={id}
                required={required}
                // aria-describedby is not a recognized top-level Checkbox
                // prop - like TextField, it needs the slot channel that
                // actually reaches the native <input type="checkbox">.
                slotProps={{ input: { "aria-describedby": ariaDescribedBy } }}
                checked={value === "1"}
                onChange={(e) =>
                  onChange(e.target.checked ? "1" : "")
                }
              />
            }
            label={field.required ? `${field.label} *` : field.label}
          />
        )}
      </FieldShell>
    );
  } else if (field.type === "uploads") {
    const files = uploads.files[field.fieldKey] ?? [];
    return (
      <FieldShell field={field}>
        {({ id, "aria-describedby": ariaDescribedBy }) => (
          <>
            {/* A <button> is a labelable element (HTML "labelable" set
                includes button, input, select, textarea, meter, output,
                progress) - FieldShell's <label htmlFor> above resolves to
                THIS button, the one focusable control an upload field
                actually has. */}
            <Button
              id={id}
              aria-describedby={ariaDescribedBy}
              size="small"
              variant="outlined"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.multiple = true;
                input.accept = field.accept ?? ".imscc,.zip";
                input.onchange = (e) => {
                  const newFiles = Array.from((e.target as HTMLInputElement).files ?? []);
                  uploads.setFiles((prev) => ({
                    ...prev,
                    [field.fieldKey]: newFiles,
                  }));
                };
                input.click();
              }}
            >
              Upload files
            </Button>
            {files.length > 0 && (
              <ul className={styles.fieldHint} style={{ margin: "8px 0 0 16px" }}>
                {files.map((f, idx) => (
                  <li
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {f.name}
                    <button
                      className={styles.linkButton}
                      onClick={() => {
                        uploads.setFiles((prev) => ({
                          ...prev,
                          [field.fieldKey]: prev[field.fieldKey]?.filter(
                            (_, i) => i !== idx
                          ) ?? [],
                        }));
                      }}
                      style={{ padding: 0, marginLeft: 4 }}
                    >
                      x
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </FieldShell>
    );
  } else if (field.type === "lmsModule") {
    const moduleValue =
      value && !value.includes("|")
        ? lmsModuleOptions.find((o) => o.value.startsWith(`${value}|`))?.value ?? value
        : value;
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <>
            <Typeahead
              id={id}
              required={required}
              aria-describedby={ariaDescribedBy}
              options={lmsModuleOptions}
              value={moduleValue}
              onChange={onChange}
              placeholder="Choose a module..."
              noOptionsText={
                lmsModuleError
                  ? `Error: ${lmsModuleError}`
                  : lmsModuleCanvasUrl
                  ? "No modules available"
                  : "No modules available - add a Canvas URL or upload an LMS export to the course tile"
              }
            />
            {lmsModuleFromExport && (
              <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
                {lmsModuleCanvasUrl
                  ? "The live LMS is unavailable - these modules come from the course's LMS export."
                  : "No live LMS connection - these modules come from the course's LMS export."}
              </p>
            )}
          </>
        )}
      </FieldShell>
    );
  } else if (field.type === "courseList") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <p className={styles.fieldHint}>
          {field.label}: this input can only come from a previous step.
        </p>
      </div>
    );
  } else {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <p className={styles.fieldHint}>
          {field.label}: this input can only come from a previous step.
        </p>
      </div>
    );
  }
}
