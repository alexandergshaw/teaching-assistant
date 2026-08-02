"use client";

// The run form's field layout (WorkflowPanel.tsx's aesthetics/placement
// overhaul): a PRIMARY column - required fields, this run's currently-gated
// per-source field, and a handful of early compact decisions (see
// workflow-field-groups.ts for exactly which and why) - rendered inline, no
// click or scroll required. Everything else is deferred into a SECONDARY
// area, grouped into named tabs (Details/Templates/Posting) below the Run
// button/Run Progress block (passed in as `afterPrimary`, still owned by
// WorkflowPanel.tsx) rather than above it, so reaching Run never costs an
// extra scroll past settings most runs never touch.
//
// Layout choice, and why it differs between the two tiers: the primary
// column is a single sequential chain (tile -> source -> that source's own
// input -> what to narrow the build to) where a multi-column grid would
// introduce the classic "read across or down" ambiguity, so it stays one
// column. The secondary tier is a genuine control panel - unordered,
// independent settings the instructor dips into only when needed - so its
// Templates/Posting tabs (uniform, quick controls: selects, checkboxes) use
// a light two-column grid to cut scrolling, while the Details tab (longtext
// boxes mixed with short text fields, uneven heights) stays single-column
// so a grid never puts a tall textarea's row next to a one-line field's.
//
// Tabs (not a second disclosure) for the secondary tier because a
// disclosure already gates the WHOLE section (see the "More settings"
// DisclosureToggle below, default OPEN) - stacking a second click-to-reveal
// layer inside it would only add clicks without cutting any more scrolling
// than the tabs alone already do.
import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { RuntimeFieldInput } from "./RuntimeFieldInput";
import { DisclosureToggle } from "./DisclosureToggle";
import { partitionVisibleFields, groupSecondaryFields, type SecondaryGroupId } from "@/lib/workflow-field-groups";
import type { RuntimeField } from "@/lib/workflows/types";
import pageStyles from "../../page.module.css";
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
  /** Drives the AC4 safety net below (auto-reveal a secondary field a
   * validation error names) - see that block's own comment. */
  validationError: string | null;
  /** Validation error text, the Run button row, and Run Progress - still
   * owned/rendered by WorkflowPanel.tsx, slotted in here so it lands right
   * after the primary column and before the secondary tabs. */
  afterPrimary: ReactNode;
}

const SECONDARY_OPEN_KEY = "ta-workflows-optional-open";
const SECONDARY_TAB_KEY = "ta-workflows-optional-tab";

function readSecondaryOpen(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(SECONDARY_OPEN_KEY);
  // Unset (a first-time visitor, or one who never touched the OLD "Optional
  // inputs" disclosure this key used to back) now defaults to OPEN: the
  // secondary tier no longer gates every optional field behind a reveal
  // click, it only groups them into tabs below the Run button - fewer
  // clicks to reach any of them (AC2). A returning user who explicitly
  // toggled the old disclosure keeps that exact stored choice (AC4 - same
  // key, same round-trip); only the fallback for an unset key changed.
  if (stored === null) return true;
  return stored === "true";
}

function isSecondaryGroupId(value: string | null): value is SecondaryGroupId {
  return value === "details" || value === "templates" || value === "posting";
}

function readSecondaryTab(): SecondaryGroupId | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(SECONDARY_TAB_KEY);
  return isSecondaryGroupId(stored) ? stored : null;
}

export function RunFormFields({
  fields,
  values,
  onValueChange,
  options,
  uploads,
  validationError,
  afterPrimary,
}: RunFormFieldsProps) {
  const { primary, secondary } = partitionVisibleFields(fields);
  const groups = groupSecondaryFields(secondary);

  const [secondaryOpen, setSecondaryOpenState] = useState<boolean>(readSecondaryOpen);
  const persistSecondaryOpen = (next: boolean) => {
    setSecondaryOpenState(next);
    try {
      localStorage.setItem(SECONDARY_OPEN_KEY, next ? "true" : "false");
    } catch {
      // ignore storage write failures
    }
  };

  const [storedTab, setStoredTab] = useState<SecondaryGroupId | null>(readSecondaryTab);
  const persistActiveTab = (next: SecondaryGroupId) => {
    setStoredTab(next);
    try {
      localStorage.setItem(SECONDARY_TAB_KEY, next);
    } catch {
      // ignore storage write failures
    }
  };

  // A persisted tab whose group has no fields on THIS workflow (e.g. "posting"
  // was last active, but this workflow declares no boolean fields) falls back
  // to the first group that actually exists.
  const activeGroup = groups.find((g) => g.id === storedTab) ?? groups[0] ?? null;

  // Defensive safety net (AC4's "a hidden invalid field must never strand
  // the user"): validateRunForm.ts only ever errors on a REQUIRED field, and
  // partitionVisibleFields always keeps required fields in `primary` (never
  // behind a tab) - so under the current invariant this can never actually
  // fire. It stays as a second guarantee, mirroring the original single-
  // disclosure design's own belt-and-suspenders check, in case that
  // invariant is ever weakened by a future change.
  if (validationError && activeGroup) {
    const errorText = validationError.toLowerCase();
    const strandedGroup = groups.find((g) => g.fields.some((f) => errorText.includes(f.label.toLowerCase())));
    if (strandedGroup) {
      if (!secondaryOpen) persistSecondaryOpen(true);
      if (strandedGroup.id !== activeGroup.id) persistActiveTab(strandedGroup.id);
    }
  }

  const focusTab = (id: SecondaryGroupId) => {
    document.getElementById(`workflow-run-tab-${id}`)?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (groups.length === 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % groups.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + groups.length) % groups.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = groups.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = groups[nextIndex];
    persistActiveTab(next.id);
    focusTab(next.id);
  };

  return (
    <>
      <div className={styles.primaryFields}>
        {primary.map((field) => (
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

      {afterPrimary}

      {groups.length > 0 && activeGroup && (
        <div className={styles.secondaryPanel}>
          <DisclosureToggle open={secondaryOpen} onClick={() => persistSecondaryOpen(!secondaryOpen)}>
            More settings ({secondary.length})
          </DisclosureToggle>

          {secondaryOpen && (
            <>
              <div
                role="tablist"
                aria-label="More run settings"
                className={pageStyles.lessonInnerTabs}
                style={{ marginTop: 10 }}
              >
                {groups.map((group, index) => {
                  const isActive = group.id === activeGroup.id;
                  return (
                    <button
                      key={group.id}
                      id={`workflow-run-tab-${group.id}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`workflow-run-tabpanel-${group.id}`}
                      tabIndex={isActive ? 0 : -1}
                      className={[
                        pageStyles.lessonInnerTab,
                        styles.tab,
                        isActive ? pageStyles.lessonInnerTabActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => persistActiveTab(group.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
                    >
                      {group.label} ({group.fields.length})
                    </button>
                  );
                })}
              </div>

              {groups.map((group) => (
                <div
                  key={group.id}
                  role="tabpanel"
                  id={`workflow-run-tabpanel-${group.id}`}
                  aria-labelledby={`workflow-run-tab-${group.id}`}
                  hidden={group.id !== activeGroup.id}
                  className={group.id === "details" ? styles.tabPanel : styles.tabPanelGrid}
                >
                  {group.fields.map((field) => (
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
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
