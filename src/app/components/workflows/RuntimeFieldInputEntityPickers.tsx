"use client";

// Split out of RuntimeFieldInput.tsx (docs/HANDOFF.md CHUNK E's line-cap
// ratchet - that file was 1012 lines, over the 1000-line cap) - MECHANICAL
// only, no behavior change. This is the "entity/scope target picker" family:
// every field type whose control lets an instructor choose an institution,
// course tile, Canvas course, GitHub org/repo, or a "several/all" list of
// any of those - the run-form types that reuse the workflow-scope entity
// vocabulary (ALL_SCOPE, the hubCourses/orgs/lmsCourseOptions/institutions
// option lists from useWorkflowOptions.ts). Every branch below is copied
// verbatim from RuntimeFieldInput.tsx's own former if/else-if chain; only
// the surrounding function boundary changed. RuntimeFieldInput.tsx still
// owns the top-level dispatch (the multi-select pre-check and every other
// field-type family) and calls into EntityFieldInput for exactly the types
// handled here.
import { MenuItem, TextField, Checkbox, FormControlLabel, Autocomplete } from "@mui/material";
import { ALL_SCOPE } from "@/lib/workflows/scope";
import CoursePicker from "../CoursePicker";
import GithubRepoPicker from "../GithubRepoPicker";
import Typeahead from "../ui/Typeahead";
import { readCachedSelectorLabel, writeCachedSelectorLabel, resolveSelectorLabel } from "@/lib/course-selector-labels";
import { FieldShell } from "./FieldShell";
import type { RuntimeFieldInputProps } from "./RuntimeFieldInput";
import styles from "../../page.module.css";

/**
 * Renders the run-form control for one of: org, orgList, repo, lmsCourse,
 * hubCourse, lmsCourseList, institution, hubCourseList. RuntimeFieldInput.tsx
 * only ever calls this for a `field.type` in that set (see its own dispatch
 * chain), so the final `return null` below is unreachable in practice - kept
 * only to satisfy TypeScript's "not all code paths return a value" check the
 * same way the family split at RuntimeFieldInputTemplates.tsx does.
 */
export function EntityFieldInput({
  field,
  value,
  onChange,
  options,
}: RuntimeFieldInputProps) {
  const {
    orgs,
    orgsError,
    hubCourses,
    hubCoursesError,
    lmsCourseOptions,
    lmsCourseOptionsError,
    institutions,
    activeInstitution,
  } = options;

  if (field.type === "org") {
    return (
      <FieldShell field={field} error={orgsError}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <Typeahead
            id={id}
            required={required}
            aria-describedby={ariaDescribedBy}
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
        )}
      </FieldShell>
    );
  } else if (field.type === "orgList") {
    const isAll = value.trim() === ALL_SCOPE;
    const orgArray = isAll
      ? []
      : value.split("\n").map((s) => s.trim()).filter(Boolean);
    // "legend": this field is actually TWO controls (the "All organizations"
    // checkbox, plus a conditional multi-select) - see FieldShell's own
    // "legend" comment for why a group gets a <fieldset><legend> instead of
    // a <label> that can only ever name one control.
    return (
      <FieldShell field={field} variant="legend" error={orgsError}>
        {() => (
          <>
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
          </>
        )}
      </FieldShell>
    );
  } else if (field.type === "repo") {
    // No FieldShell here: GithubRepoPicker (a general-purpose, shared
    // component used well beyond this run form) exposes no id to point a
    // <label htmlFor> at, and renders its own error text internally - the
    // same "no single control to name" shape as the sourcePolicy/composite
    // fields above would call for a <legend>, but a <fieldset> wrapping a
    // single free-text Autocomplete would be an odd, unfamiliar landmark
    // for what reads as one text box. Kept as a heading span, matching this
    // field's behavior before this change.
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
    // Same "no id to point at" reasoning as "repo" above - CoursePicker is
    // a shared, general-purpose component with its own internal Typeahead.
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
      <FieldShell field={field} error={hubCoursesError}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <TextField
            id={id}
            required={required}
            slotProps={{ select: { "aria-describedby": ariaDescribedBy } }}
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
        )}
      </FieldShell>
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
      <FieldShell field={field} variant="legend" error={lmsCourseOptionsError}>
        {() => (
          <>
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
          </>
        )}
      </FieldShell>
    );
  } else if (field.type === "institution") {
    return (
      <FieldShell field={field}>
        {({ id, required, "aria-describedby": ariaDescribedBy }) => (
          <Typeahead
            id={id}
            required={required}
            aria-describedby={ariaDescribedBy}
            options={institutions.map((code) => ({
              value: code,
              label: code,
            }))}
            value={value}
            onChange={onChange}
            placeholder="Choose an institution..."
            noOptionsText="No institutions available"
          />
        )}
      </FieldShell>
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
      <FieldShell field={field} variant="legend" error={hubCoursesError}>
        {() => (
          <>
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
          </>
        )}
      </FieldShell>
    );
  }
  return null;
}
