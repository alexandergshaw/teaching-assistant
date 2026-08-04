"use client";

// The shared label/help/error/required shell for every run-form field
// control (AC B4/B5, run-form cleanup): before this, all three renderer
// files (RuntimeFieldInput.tsx and its two split-out siblings,
// RuntimeFieldInputEntityPickers.tsx / RuntimeFieldInputTemplates.tsx) each
// rendered their own bare `<label>{field.label}</label>` - not associated
// with the control it sat above by anything but visual proximity - and their
// own `{field.help && <p>...}` paragraph, thirteen times over. No control
// anywhere in this directory carried an `htmlFor`/`id` pair, an
// `aria-describedby`, or any visual signal that a field was required beyond
// whatever the control itself happened to show.
//
// `children` is a RENDER PROP (a function, not a plain node) rather than the
// more common "wrap a fixed node" shape, specifically so the `id` this shell
// computes - and the `aria-describedby` it derives from `help`/`error` - can
// be handed straight to whatever control a branch renders, without either
// side recomputing or duplicating that logic. `fieldControlId` is exported
// so a caller that needs the id BEFORE it can call FieldShell (there are
// none today, but the shape is safer than an opaque internal id) can compute
// the exact same value.
import type { ReactNode } from "react";
import type { RuntimeField } from "@/lib/workflows/types";
import fieldStyles from "../../page.module.css";
import panelStyles from "./WorkflowPanel.module.css";

/** Stable id for a run-form field's control, derived from its fieldKey (the
 * SAME key `values`/`onValueChange`/`uploads` are already keyed by - see
 * RunFormFields.tsx). Deterministic (no useId/random suffix) so a
 * `<label htmlFor>` written once always resolves, and so the structural test
 * in `runtime-field-accessible-labels.test.ts` can reason about it without
 * rendering anything. */
export function fieldControlId(fieldKey: string): string {
  return `run-field-${fieldKey}`;
}

export interface FieldControlBinding {
  id: string;
  required: boolean;
  "aria-describedby": string | undefined;
}

interface FieldShellProps {
  field: Pick<RuntimeField, "fieldKey" | "label" | "help" | "required">;
  /** A field-specific status message (e.g. "Could not list organizations") -
   * distinct from run-form VALIDATION error, which today is a single
   * whole-form message rendered once near the Run button
   * (validate-run-form.ts / WorkflowPanel.tsx have no per-field slot for
   * one). Kept as its own prop so a future per-field validation error has
   * somewhere to plug in without a second shell. */
  error?: string | null;
  /**
   * How the field's name is exposed - the control(s) `children` renders
   * determine which shape actually applies:
   *  - "label" (default): a single `<label htmlFor>` pointing at the ONE
   *    control this field renders - the common case (a text box, select,
   *    date, textarea, single picker).
   *  - "legend": a `<fieldset><legend>` instead of a div/label pair - for a
   *    field whose control is actually SEVERAL inputs at once
   *    (orgList/lmsCourseList/hubCourseList's "All ..." checkbox plus a
   *    conditional multi-select; sourcePolicy's checkbox list/reorder/
   *    strategy composite) - a `<label>` can only ever name ONE control, so
   *    a group gets a group label instead. The same native-HTML answer
   *    RunFormFields.tsx's own section fieldsets already use for the SAME
   *    "one heading, several controls" shape.
   *  - "hidden": no heading is rendered by FieldShell at all - for a
   *    control that already supplies its own accessible name by visually
   *    WRAPPING the label text (MUI's FormControlLabel, used for every
   *    boolean/checkbox field) - a second heading here would announce the
   *    same text twice.
   */
  variant?: "label" | "legend" | "hidden";
  children: (binding: FieldControlBinding) => ReactNode;
}

function RequiredMark({ required }: { required: boolean }) {
  if (!required) return null;
  return (
    <>
      {/* Visual signal for a sighted user; hidden from assistive tech so it
          is never announced as a stray "asterisk" - the REAL semantic
          required-ness for AT comes from the visually-hidden text right
          after it, and from `required`/`aria-required` on the control
          itself (see FieldControlBinding.required, wired at each call
          site). */}
      <span aria-hidden="true"> *</span>
      <span className={panelStyles.visuallyHidden}> (required)</span>
    </>
  );
}

/** Owns the label/legend, help text, error text, and required-ness for ONE
 * run-form field - the shell every branch of the three renderer files above
 * renders its control inside. `help`/`error` render HERE and only here (AC
 * B5) - a branch that used to end with its own `{field.help && <p>...}`
 * paragraph now just returns its control from `children`. */
export function FieldShell({ field, error, variant = "label", children }: FieldShellProps) {
  const id = fieldControlId(field.fieldKey);
  const helpId = field.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const binding: FieldControlBinding = { id, required: field.required, "aria-describedby": describedBy };

  const helpAndError = (
    <>
      {field.help && (
        <p id={helpId} className={fieldStyles.fieldHint} style={{ margin: 0 }}>
          {field.help}
        </p>
      )}
      {error && (
        <p id={errorId} className={fieldStyles.error}>
          {error}
        </p>
      )}
    </>
  );

  if (variant === "legend") {
    return (
      <fieldset className={fieldStyles.field} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
        <legend
          style={{
            padding: 0,
            margin: 0,
            // Restates .field label's own type treatment (page.module.css) -
            // a <legend> is a different element, so that descendant selector
            // does not reach it; this keeps a group's heading looking
            // identical to every single-control field's <label> above it.
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {field.label}
          <RequiredMark required={field.required} />
        </legend>
        {children(binding)}
        {helpAndError}
      </fieldset>
    );
  }

  return (
    <div className={fieldStyles.field}>
      {variant === "label" && (
        <label htmlFor={id}>
          {field.label}
          <RequiredMark required={field.required} />
        </label>
      )}
      {children(binding)}
      {helpAndError}
    </div>
  );
}
