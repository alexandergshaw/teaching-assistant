"use client";

// The run form's field layout (WorkflowPanel.tsx's aesthetics/professionalism
// pass, second iteration): every visible field sits in exactly one LABELLED
// section (<fieldset><legend>), not an unlabelled column plus tabs. "Setup"
// (groupRunFormFields, workflow-field-groups.ts - required fields, this
// run's currently-gated per-source field, and a handful of early compact
// decisions; see that function's own header comment for exactly which and
// why) renders first and is never hidden - it is the decision chain that
// gates what a run does (course tile -> source -> that source's own input ->
// what to narrow the build to), so it must be reachable without hunting.
// Everything else (Details/Templates/Posting) is deferred into a single
// "More settings" disclosure below the Run button/Run Progress block (passed
// in as `afterPrimary`, still owned by WorkflowPanel.tsx) rather than above
// it, so reaching Run never costs an extra scroll past settings most runs
// never touch.
//
// Tabs-versus-visible-sections, resolved: the first pass put every deferred
// field behind a click-to-switch tab strip specifically to cut clicks and
// scrolls. Plain labelled sections (this pass) still do that AND read better:
// the "More settings" disclosure still gates ALL of it behind at most one
// click (same persisted key, same default-open behavior - AC6), so a user
// who does not care about optional settings sees exactly as little as
// before. The difference is what happens once it IS open: the old tab strip
// could cost a SECOND click (open the disclosure, then guess and click the
// right tab) to reach a field not in the last-active tab, and hid every
// other group's fields entirely while doing it. Labelled sections cost that
// same at-most-one click to reveal everything, then let the eye jump
// straight to the right legend instead of hunting through tabs one at a
// time - fewer clicks in the case that matters (reaching a field outside
// today's default tab) at the cost of more scrolling, which is what makes
// the form scannable rather than a wall of controls once it is open.
//
// Layout choice, and why it differs between sections: "Setup" is a single
// sequential chain (tile -> source -> that source's own input -> what to
// narrow the build to) where a multi-column grid would introduce the
// classic "read across or down" ambiguity, so it stays one column, same as
// "Details" (free text mixed with longtext boxes - a grid would put a tall
// textarea's row next to a one-line field's). "Templates" and "Posting" are
// genuine control panels - unordered, independent, uniform quick controls
// (selects, checkboxes) - so they use a light two-column grid to cut
// scrolling, exactly as the first pass's tab panels did.
//
// AC3 (semantics matching visuals): each section is a native <fieldset> with
// a <legend>, so a screen reader announces "Setup" (or "Details" etc.)
// before its controls without any bespoke ARIA - the specific accessibility
// win labelled sections give over the old tab strip's plain buttons.
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { RuntimeFieldInput } from "./RuntimeFieldInput";
import { DisclosureToggle } from "./DisclosureToggle";
import { groupRunFormFields, type FieldSectionId } from "@/lib/workflow-field-groups";
import { resolveFieldRequirements } from "@/lib/workflow-field-visibility";
import type { RuntimeField, WorkflowScope } from "@/lib/workflows/types";
import styles from "./WorkflowPanel.module.css";

type FieldInputOptions = ComponentProps<typeof RuntimeFieldInput>["options"];
type FieldInputUploads = ComponentProps<typeof RuntimeFieldInput>["uploads"];

interface RunFormFieldsProps {
  /** Already filtered to this run's currently-visible fields (isFieldVisible,
   * workflow-field-visibility.ts) - this component only ever classifies and
   * lays them out, it never re-checks visibility itself. */
  fields: RuntimeField[];
  values: Record<string, string>;
  onValueChange: (fieldKey: string, value: string) => void;
  options: FieldInputOptions;
  uploads: FieldInputUploads;
  /** C2: the workflow's own scope ("this workflow is for"), passed straight
   * through to groupRunFormFields (workflow-field-groups.ts) so a field the
   * scope already covers is dropped before sectioning - see that function's
   * own comment for why this is a defensive second guarantee rather than a
   * second copy of the coverage rule. Undefined (an unscoped workflow) never
   * drops anything. */
  scope?: WorkflowScope;
  /** Validation error text, the Run button row, and Run Progress - still
   * owned/rendered by WorkflowPanel.tsx, slotted in here so it lands right
   * after the "Setup" section and before the deferred sections. */
  afterPrimary: ReactNode;
}

const SECONDARY_OPEN_KEY = "ta-workflows-optional-open";
// Retired (AC6): the first pass's tab strip persisted its last-active tab
// under this key. Sections now render simultaneously (no active tab to
// remember), so nothing reads or writes it anymore - the effect below just
// deletes any value a returning user's browser still has, so it never
// lingers as orphaned storage. Deleting an already-absent key is a no-op.
const RETIRED_SECONDARY_TAB_KEY = "ta-workflows-optional-tab";

function readSecondaryOpen(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(SECONDARY_OPEN_KEY);
  // Unset (a first-time visitor, or one who never touched the OLD "Optional
  // inputs" disclosure this key used to back) now defaults to OPEN: the
  // deferred sections no longer gate every optional field behind a reveal
  // click, it only groups them below the Run button - fewer clicks to reach
  // any of them. A returning user who explicitly toggled the old disclosure
  // keeps that exact stored choice (same key, same round-trip); only the
  // fallback for an unset key changed.
  if (stored === null) return true;
  return stored === "true";
}

export function RunFormFields({
  fields,
  values,
  onValueChange,
  options,
  uploads,
  scope,
  afterPrimary,
}: RunFormFieldsProps) {
  // Resolve conditional requiredness (StepInputSpec.requiredWhen, types.ts)
  // against the CURRENT values immediately before grouping, so
  // groupRunFormFields and everything downstream of it (FieldShell's required
  // marker, RuntimeFieldInput's " *" suffix, the native `required` attribute)
  // all read the effective value off `field.required` with no new parameter -
  // see AC3 item 8 of docs/conditional-required-inputs-acceptance-criteria.md
  // for why this sits here rather than in WorkflowPanel.tsx or
  // workflow-field-groups.ts.
  const resolvedFields = resolveFieldRequirements(fields, values);
  const sections = groupRunFormFields(resolvedFields, undefined, scope);
  const essentials = sections.find((s) => s.id === "essentials") ?? null;
  const deferredSections = sections.filter((s) => s.id !== "essentials");
  const deferredFieldCount = deferredSections.reduce((n, s) => n + s.fields.length, 0);

  const [secondaryOpen, setSecondaryOpenState] = useState<boolean>(readSecondaryOpen);
  const persistSecondaryOpen = (next: boolean) => {
    setSecondaryOpenState(next);
    try {
      localStorage.setItem(SECONDARY_OPEN_KEY, next ? "true" : "false");
    } catch {
      // ignore storage write failures
    }
  };

  useEffect(() => {
    try {
      localStorage.removeItem(RETIRED_SECONDARY_TAB_KEY);
    } catch {
      // best-effort cleanup only
    }
  }, []);

  // A "hidden invalid field must never strand the user" safety net used to
  // live here (auto-revealing "More settings" when validateRunForm's error
  // named a field hidden inside it), calling persistSecondaryOpen -
  // setState plus a localStorage write - SYNCHRONOUSLY DURING RENDER. Its
  // own comment already said why: validateRunForm.ts only ever errors on a
  // REQUIRED field, and groupRunFormFields (workflow-field-groups.ts)
  // always keeps a required OR currently-visibleWhen-gated field in the
  // primary "Setup" tier, never deferred - so the block it guarded could
  // never actually fire under the current invariant. Removed rather than
  // preserved as inert insurance, per that same reasoning: dead code that
  // reaches into render-time setState is a real eslint/React footgun (the
  // exact "setState synchronously from render/an effect" shape this
  // codebase's lint rule exists to catch) for a branch that can never run.
  // If that invariant is ever weakened, this needs a real re-introduction
  // (an effect, not a render-time call), not an un-delete.
  //
  // Conditionally-required fields (StepInputSpec.requiredWhen) weaken this
  // invariant in exactly the way that would matter: `required` is no longer
  // a static property groupRunFormFields can just read. It stays true by
  // construction rather than by remembering, because `resolveFieldRequirements`
  // above runs ONE line before the `groupRunFormFields` call it feeds - so by
  // the time grouping (and validateRunForm, on its own separate path) sees a
  // field, `required` already reflects the current gate. See
  // docs/conditional-required-inputs-acceptance-criteria.md AC3 item 10a.

  return (
    <>
      {essentials && (
        <FieldSectionBlock
          id={essentials.id}
          label={essentials.label}
          fields={essentials.fields}
          values={values}
          onValueChange={onValueChange}
          options={options}
          uploads={uploads}
        />
      )}

      {afterPrimary}

      {deferredSections.length > 0 && (
        <div className={styles.secondaryPanel}>
          <DisclosureToggle open={secondaryOpen} onClick={() => persistSecondaryOpen(!secondaryOpen)}>
            More settings ({deferredFieldCount})
          </DisclosureToggle>

          {secondaryOpen && (
            <div className={styles.secondaryGroups}>
              {deferredSections.map((section) => (
                <FieldSectionBlock
                  key={section.id}
                  id={section.id}
                  label={section.label}
                  fields={section.fields}
                  values={values}
                  onValueChange={onValueChange}
                  options={options}
                  uploads={uploads}
                  // Templates/Posting are uniform, independent, quick
                  // controls (selects, checkboxes) - a genuine control-panel
                  // context where reading across is unambiguous, so they use
                  // a light two-column grid to cut scrolling. Details mixes
                  // free text with longtext boxes (uneven heights) and stays
                  // single-column - see this file's header comment.
                  grid={section.id === "templates" || section.id === "posting"}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** One labelled section: a native <fieldset>/<legend> pair (AC3 - a screen
 * reader announces the legend before the controls it groups, with no
 * bespoke ARIA needed) wrapping that section's fields. */
function FieldSectionBlock({
  id,
  label,
  fields,
  values,
  onValueChange,
  options,
  uploads,
  grid,
}: {
  id: FieldSectionId;
  label: string;
  fields: RuntimeField[];
  values: Record<string, string>;
  onValueChange: (fieldKey: string, value: string) => void;
  options: FieldInputOptions;
  uploads: FieldInputUploads;
  grid?: boolean;
}) {
  return (
    <fieldset className={styles.section} data-section={id}>
      <legend className={styles.sectionLegend}>{label}</legend>
      <div className={grid ? styles.sectionFieldsGrid : styles.sectionFields}>
        {fields.map((field) => (
          <RuntimeFieldInput
            key={field.fieldKey}
            field={field}
            value={values[field.fieldKey] ?? ""}
            onChange={(newValue) => onValueChange(field.fieldKey, newValue)}
            options={options}
            uploads={uploads}
          />
        ))}
      </div>
    </fieldset>
  );
}

