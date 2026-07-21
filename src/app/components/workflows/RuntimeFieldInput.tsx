"use client";

import { Button, MenuItem, TextField, Checkbox, FormControlLabel, Autocomplete } from "@mui/material";
import { ALL_SCOPE } from "@/lib/workflows/scope";
import CoursePicker from "../CoursePicker";
import GithubRepoPicker from "../GithubRepoPicker";
import Typeahead from "../ui/Typeahead";
import type { RuntimeField } from "@/lib/workflows/types";
import styles from "../../page.module.css";

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
    institutions,
    activeInstitution,
  } = options;

  if (field.type === "org") {
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
  } else if (field.type === "longtext") {
    return (
      <div key={field.fieldKey} className={styles.field}>
        <label>{field.label}</label>
        <TextField
          multiline
          minRows={4}
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
          onChange={(e) =>
            onChange(e.target.value)
          }
        >
          {hubCourses === null ? (
            <MenuItem disabled>Loading courses...</MenuItem>
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
