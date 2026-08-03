"use client";

// Split out of RuntimeFieldInput.tsx (docs/HANDOFF.md CHUNK E's line-cap
// ratchet - that file was 1012 lines, over the 1000-line cap) - MECHANICAL
// only, no behavior change. This is the "template picker" family: the four
// near-identical "select from a loaded template list, with a 'stale value
// still selected' fallback option" controls (deck/assignment/test/class-
// session templates). Every branch below is copied verbatim from
// RuntimeFieldInput.tsx's own former if/else-if chain; only the surrounding
// function boundary changed. RuntimeFieldInput.tsx still owns the top-level
// dispatch and calls into TemplateFieldInput for exactly the types handled
// here.
import { MenuItem, TextField } from "@mui/material";
import type { RuntimeFieldInputProps } from "./RuntimeFieldInput";
import styles from "../../page.module.css";

/**
 * Renders the run-form control for one of: deckTemplate, assignmentTemplate,
 * testTemplate, classSessionTemplate. RuntimeFieldInput.tsx only ever calls
 * this for a `field.type` in that set (see its own dispatch chain), so the
 * final `return null` below is unreachable in practice - kept only to
 * satisfy TypeScript's "not all code paths return a value" check.
 */
export function TemplateFieldInput({
  field,
  value,
  onChange,
  options,
}: RuntimeFieldInputProps) {
  const {
    deckTemplates,
    deckTemplatesError,
    assignmentTemplates,
    assignmentTemplatesError,
    testTemplates,
    testTemplatesError,
    classSessionTemplates,
    classSessionTemplatesError,
  } = options;

  if (field.type === "deckTemplate") {
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
  }
  return null;
}
