"use client";

import { Button, MenuItem, TextField, Checkbox, FormControlLabel, Autocomplete } from "@mui/material";
import { ALL_SCOPE } from "@/lib/workflows/scope";
import CoursePicker from "../CoursePicker";
import GithubRepoPicker from "../GithubRepoPicker";
import Typeahead from "../ui/Typeahead";
import SourcePolicyEditor from "./SourcePolicyEditor";
import { readCachedSelectorLabel, writeCachedSelectorLabel, resolveSelectorLabel } from "@/lib/course-selector-labels";
import { parseMultiSelectValue, serializeMultiSelectValue, usesMultiSelect } from "@/lib/multi-select-value";
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

interface RuntimeFieldInputOptions {
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

interface RuntimeFieldInputUploads {
  files: Record<string, File[]>;
  setFiles: (update: (prev: Record<string, File[]>) => Record<string, File[]>) => void;
}

interface RuntimeFieldInputProps {
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
  const {
    orgs,
    orgsError,
    hubCourses,
    hubCoursesError,
    lmsCourseOptions,
    lmsCourseOptionsError,
    lmsModuleOptions,
    lmsModuleError,
    lmsModuleFromExport,
    lmsModuleCanvasUrl,
    deckTemplates,
    deckTemplatesError,
    assignmentTemplates,
    assignmentTemplatesError,
    testTemplates,
    testTemplatesError,
    classSessionTemplates,
    classSessionTemplatesError,
    institutions,
    activeInstitution,
  } = options;

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
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <Autocomplete
          multiple
          freeSolo
          options={field.options}
          value={selected}
          onChange={(_, newValue) => onChange(serializeMultiSelectValue(newValue))}
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label={field.label}
              placeholder={selected.length === 0 ? "Select or type one or more..." : undefined}
            />
          )}
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "org") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <Typeahead
          options={(orgs ?? []).map((o) => ({ value: o, label: o }))}
          value={value}
          onChange={onChange}
          placeholder={
            orgs === null
              ? "Loading organizations..."
              : "Choose an organization..."
          }
          loading={orgs === null}
          noOptionsText="No organizations"
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
        {orgsError && <p className={styles.error}>{orgsError}</p>}
      </div>
    );
  } else if (field.type === "orgList") {
    const isAll = value.trim() === ALL_SCOPE;
    const orgArray = isAll
      ? []
      : value.split("\n").map((s) => s.trim()).filter(Boolean);
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isAll}
              onChange={(e) =>
                onChange(e.target.checked ? ALL_SCOPE : "")
              }
            />
          }
          label="All organizations"
        />
        {!isAll && (
          <Autocomplete
            multiple
            options={orgs ?? []}
            getOptionLabel={(o) => o}
            value={orgArray}
            onChange={(_, newValue) =>
              onChange(newValue.join("\n"))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label={field.label}
                placeholder={
                  orgs === null ? "Loading organizations..." : "Select organizations..."
                }
              />
            )}
            loading={orgs === null}
            noOptionsText="No organizations"
            disabled={orgs === null}
          />
        )}
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
        {orgsError && <p className={styles.error}>{orgsError}</p>}
      </div>
    );
  } else if (field.type === "longtext" || field.type === "concepts") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          multiline
          minRows={COMPACT_TEXTAREA_MIN_ROWS}
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          size="small"
          slotProps={{ htmlInput: { style: COMPACT_TEXTAREA_STYLE } }}
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "text" && field.options && field.options.length > 0) {
    // A fixed set of choices. Without this the run form would show a free text
    // box for an input the step parses as an enum, so a typo would silently
    // become an unrecognized value rather than being impossible to enter.
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField select size="small" fullWidth value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
        {field.help && <p className={styles.fieldHint}>{field.help}</p>}
      </div>
    );
  } else if (field.type === "text") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          size="small"
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "number") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          type="number"
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          size="small"
        />
      </div>
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
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <TextField
            type="number"
            placeholder="0"
            value={decomposed.value}
            onChange={(e) => handleNumberChange(e.target.value)}
            size="small"
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
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "sourcePolicy") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <SourcePolicyEditor value={value} onChange={onChange} />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "moduleOffset") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          type="number"
          placeholder="0"
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          size="small"
          slotProps={{ htmlInput: { min: 0 } }}
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "date") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          type="date"
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "repo") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <span className={styles.fieldHint}>{field.label}</span>
        <GithubRepoPicker
          value={value}
          onChange={onChange}
        />
      </div>
    );
  } else if (field.type === "lmsCourse") {
    if (!activeInstitution) {
      return (
        <div key={field.fieldKey} className={styles.field}>
          <p className={styles.fieldHint}>
            Pick an institution in the top bar first.
          </p>
          {field.help && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              {field.help}
            </p>
          )}
        </div>
      );
    }
    return (
      <div key={field.fieldKey} className={styles.field}>
        <span className={styles.fieldHint}>{field.label}</span>
        <CoursePicker
          activeInstitution={activeInstitution}
          courseUrl={value}
          onSelect={onChange}
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "hubCourse") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          select
          size="small"
          fullWidth
          value={value}
          onChange={(e) => {
            const newId = e.target.value;
            // The moment the user picks a course from a LOADED list, its
            // name is known for certain - cache it so a later reload can
            // show the name immediately instead of the raw id while
            // hubCourses is still loading (or if it never loads at all).
            const pickedName = hubCourses?.find((c) => c.id === newId)?.name;
            if (newId && pickedName) {
              writeCachedSelectorLabel("hubCourse", newId, pickedName);
            }
            onChange(newId);
          }}
        >
          {hubCourses === null ? (
            value ? (
              // Restored from localStorage before the course list has
              // resolved (or after it failed to load - hubCourses stays
              // null forever on error, see useWorkflowOptions.ts). A child
              // MenuItem must carry the current `value` or MUI falls back to
              // rendering the raw id verbatim, which is the bug this fixes.
              <MenuItem value={value}>
                {resolveSelectorLabel({
                  id: value,
                  cachedLabel: readCachedSelectorLabel("hubCourse", value),
                  fallback: "Selected course",
                })}
              </MenuItem>
            ) : (
              <MenuItem disabled>Loading courses...</MenuItem>
            )
          ) : hubCourses.length > 0 ? (
            [
              ...hubCourses.map((course) => (
                <MenuItem key={course.id} value={course.id}>
                  {course.name}
                </MenuItem>
              )),
              ...(value && !hubCourses.some((c) => c.id === value)
                ? [
                    <MenuItem key="stale" value={value}>
                      Previous course (reselect)
                    </MenuItem>,
                  ]
                : []),
            ]
          ) : (
            <MenuItem disabled>No courses available</MenuItem>
          )}
        </TextField>
        {hubCoursesError && (
          <p className={styles.error}>{hubCoursesError}</p>
        )}
      </div>
    );
  } else if (field.type === "deckTemplate") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          select
          size="small"
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
        >
          {deckTemplates === null ? (
            <MenuItem disabled>Loading templates...</MenuItem>
          ) : deckTemplates.length > 0 ? (
            [
              ...deckTemplates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.name}
                </MenuItem>
              )),
              ...(value && !deckTemplates.some((t) => t.id === value)
                ? [
                    <MenuItem key="stale" value={value}>
                      Previous template (reselect)
                    </MenuItem>,
                  ]
                : []),
            ]
          ) : (
            <MenuItem disabled>No templates - create one in the PowerPoint Design tab</MenuItem>
          )}
        </TextField>
        {deckTemplatesError && (
          <p className={styles.error}>{deckTemplatesError}</p>
        )}
      </div>
    );
  } else if (field.type === "assignmentTemplate") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          select
          size="small"
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
        >
          {assignmentTemplates === null ? (
            <MenuItem disabled>Loading templates...</MenuItem>
          ) : assignmentTemplates.length > 0 ? (
            [
              ...assignmentTemplates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.name}
                </MenuItem>
              )),
              ...(value && !assignmentTemplates.some((t) => t.id === value)
                ? [
                    <MenuItem key="stale" value={value}>
                      Previous template (reselect)
                    </MenuItem>,
                  ]
                : []),
            ]
          ) : (
            <MenuItem disabled>No templates available</MenuItem>
          )}
        </TextField>
        {assignmentTemplatesError && (
          <p className={styles.error}>{assignmentTemplatesError}</p>
        )}
      </div>
    );
  } else if (field.type === "testTemplate") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          select
          size="small"
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
        >
          {testTemplates === null ? (
            <MenuItem disabled>Loading templates...</MenuItem>
          ) : testTemplates.length > 0 ? (
            [
              ...testTemplates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.name}
                </MenuItem>
              )),
              ...(value && !testTemplates.some((t) => t.id === value)
                ? [
                    <MenuItem key="stale" value={value}>
                      Previous template (reselect)
                    </MenuItem>,
                  ]
                : []),
            ]
          ) : (
            <MenuItem disabled>No templates available</MenuItem>
          )}
        </TextField>
        {testTemplatesError && (
          <p className={styles.error}>{testTemplatesError}</p>
        )}
      </div>
    );
  } else if (field.type === "classSessionTemplate") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          select
          size="small"
          fullWidth
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
        >
          {classSessionTemplates === null ? (
            <MenuItem disabled>Loading templates...</MenuItem>
          ) : classSessionTemplates.length > 0 ? (
            [
              ...classSessionTemplates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.name}
                </MenuItem>
              )),
              ...(value && !classSessionTemplates.some((t) => t.id === value)
                ? [
                    <MenuItem key="stale" value={value}>
                      Previous template (reselect)
                    </MenuItem>,
                  ]
                : []),
            ]
          ) : (
            <MenuItem disabled>No templates available</MenuItem>
          )}
        </TextField>
        {classSessionTemplatesError && (
          <p className={styles.error}>{classSessionTemplatesError}</p>
        )}
      </div>
    );
  } else if (field.type === "lmsCourseList") {
    if (!activeInstitution) {
      return (
        <div key={field.fieldKey} className={styles.field}>
          <p className={styles.fieldHint}>
            Pick an institution in the top bar first.
          </p>
          {field.help && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              {field.help}
            </p>
          )}
        </div>
      );
    }
    const isAll = value.trim() === ALL_SCOPE;
    const urlArray = isAll
      ? []
      : value.split("\n").map((s) => s.trim()).filter(Boolean);
    const selectedOptions = urlArray.map((url) => {
      const found = lmsCourseOptions?.find((o) => o.url === url);
      return found || { url, name: url };
    });
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isAll}
              onChange={(e) =>
                onChange(e.target.checked ? ALL_SCOPE : "")
              }
            />
          }
          label="All courses at this institution"
        />
        {!isAll && (
          <Autocomplete
            multiple
            options={lmsCourseOptions ?? []}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, val) => option.url === val.url}
            value={selectedOptions}
            onChange={(_, newValue) => {
              const urls = newValue.map((o) => o.url).join("\n");
              onChange(urls);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label={field.label}
                placeholder={
                  lmsCourseOptions === null
                    ? "Loading courses..."
                    : "Select courses..."
                }
              />
            )}
            loading={lmsCourseOptions === null}
            noOptionsText="No courses found"
            disabled={lmsCourseOptions === null}
          />
        )}
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
        {lmsCourseOptionsError && (
          <p className={styles.error}>{lmsCourseOptionsError}</p>
        )}
      </div>
    );
  } else if (field.type === "boolean") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <FormControlLabel
          control={
            <Checkbox
              checked={value === "1"}
              onChange={(e) =>
                onChange(e.target.checked ? "1" : "")
              }
            />
          }
          label={field.label}
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "institution") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <Typeahead
          options={institutions.map((code) => ({
            value: code,
            label: code,
          }))}
          value={value}
          onChange={onChange}
          placeholder="Choose an institution..."
          noOptionsText="No institutions available"
        />
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "hubCourseList") {
    const isAll = value.trim() === ALL_SCOPE;
    const idArray = isAll
      ? []
      : value.split("\n").map((s) => s.trim()).filter(Boolean);
    const selectedOptions = idArray.map((id) => {
      const found = hubCourses?.find((c) => c.id === id);
      return (
        found ?? { id, name: id, canvasUrl: null, repos: [] as string[] }
      );
    });
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isAll}
              onChange={(e) =>
                onChange(e.target.checked ? ALL_SCOPE : "")
              }
            />
          }
          label="All course tiles"
        />
        {!isAll && (
          <Autocomplete
            multiple
            options={hubCourses ?? []}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            value={selectedOptions}
            onChange={(_, newValue) => {
              const ids = newValue.map((o) => o.id).join("\n");
              onChange(ids);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label={field.label}
                placeholder={
                  hubCourses === null
                    ? "Loading courses..."
                    : "Select courses..."
                }
              />
            )}
            loading={hubCourses === null}
            noOptionsText="No courses available"
            disabled={hubCourses === null}
          />
        )}
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
        {hubCoursesError && (
          <p className={styles.error}>{hubCoursesError}</p>
        )}
      </div>
    );
  } else if (field.type === "uploads") {
    const files = uploads.files[field.fieldKey] ?? [];
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <Button
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
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
            {field.help}
          </p>
        )}
      </div>
    );
  } else if (field.type === "lmsModule") {
    const moduleValue =
      value && !value.includes("|")
        ? lmsModuleOptions.find((o) => o.value.startsWith(`${value}|`))?.value ?? value
        : value;
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <Typeahead
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
        {field.help && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {field.help}
          </p>
        )}
      </div>
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
