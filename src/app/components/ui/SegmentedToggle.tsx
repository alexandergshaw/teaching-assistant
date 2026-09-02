"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC4: one segmented-toggle
// component, rendered as a track with a raised segment (the app's own
// sub-tab idiom, page.module.css:3712-3742/RecordingTab.tsx:585-598) rather
// than a row of contained/outlined primaries - a selected option rendered as
// the screen's primary fill would breach CC1 (one filled button per screen
// state) and AM11's selected-state rule.
//
// Native <button> elements, never MUI Buttons: MUI ToggleButtonGroup was
// rejected (own grey/uppercase skin, a second focus ring), and a native
// button here means this component never calls `variantFor` - the
// one-primary-per-screen count (CC1) never has to account for a toggle.
//
// Roving tabindex, copied from the exact keyboard model
// RecordingTab.tsx:585-598 already gives the sub-tab strip: the group is ONE
// tab stop (tabIndex 0 on the selected segment, -1 on the rest),
// ArrowLeft/ArrowRight/Home/End move focus AND select.
import { useId, useRef, type KeyboardEvent } from "react";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";

export interface SegmentedToggleOption<V extends string | number> {
  value: V;
  label: string;
  /** Rendered as " (N)" after the label; the status-chips idiom. 0 renders. */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedToggleProps<V extends string | number> {
  /** Accessible name of the group. Rendered VISIBLY as a `.ghMeta` span
   *  ("Replying to:") when `showLabel` is true, and the group then uses
   *  aria-labelledby pointing at it; otherwise aria-label. */
  label: string;
  showLabel?: boolean;
  options: readonly SegmentedToggleOption<V>[];
  value: V;
  onChange: (next: V) => void;
  /** Disables every option (busy). Per-option `disabled` still applies. */
  disabled?: boolean;
}

/** Renders " (N)" after an option's label when `count` is a number - 0
 *  renders too, so an empty status chip still shows "(0)" rather than
 *  silently dropping the count. Imported directly from this `.tsx` under
 *  node-env vitest, the way AddKnowledgePages.test.ts:14 already does. */
export function optionLabel(option: SegmentedToggleOption<string | number>): string {
  return typeof option.count === "number" ? `${option.label} (${option.count})` : option.label;
}

/** Pure walk used by both the keyboard handler and the initial tabbable-index
 *  fallback: starting at `from`, steps by `delta` (wrapping) until it finds
 *  an enabled option, and returns its index. Returns -1 when every option is
 *  disabled (an empty group, or a fully-busy toggle) so callers can no-op.
 *  `from` may be out of range on purpose - Home walks forward from -1 (so
 *  the first step lands on index 0) and End walks backward from
 *  `options.length` (so the first step lands on the last index). */
export function nextEnabledIndex<V extends string | number>(
  options: readonly SegmentedToggleOption<V>[],
  from: number,
  delta: number
): number {
  const count = options.length;
  if (count === 0) return -1;
  let index = from;
  for (let step = 0; step < count; step++) {
    index = (index + delta + count) % count;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

export default function SegmentedToggle<V extends string | number>({
  label,
  showLabel = false,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedToggleProps<V>) {
  const labelId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const firstEnabledIndex = options.findIndex((option) => !option.disabled);
  // Exactly one segment at tabIndex 0: the selected one, or the first
  // enabled one if none is selected. When nothing is selected AND every
  // option is disabled, firstEnabledIndex is also -1 - fall back to 0 so a
  // fully-busy toggle still has exactly one (disabled) tab stop rather than
  // none.
  const tabbableIndex = selectedIndex !== -1 ? selectedIndex : firstEnabledIndex !== -1 ? firstEnabledIndex : 0;

  const selectAndFocus = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    buttonRefs.current[index]?.focus();
    onChange(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    // Arrow keys walk to the NEXT enabled option in that direction
    // (wrapping past a disabled one, never dead-ending on it); Home/End walk
    // to the first/last enabled option.
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = nextEnabledIndex(options, index, 1);
    else if (event.key === "ArrowLeft") nextIndex = nextEnabledIndex(options, index, -1);
    else if (event.key === "Home") nextIndex = nextEnabledIndex(options, -1, 1);
    else if (event.key === "End") nextIndex = nextEnabledIndex(options, options.length, -1);
    else return;
    event.preventDefault();
    selectAndFocus(nextIndex);
  };

  return (
    <>
      {showLabel && (
        <span id={labelId} className={styles.ghMeta}>
          {label}
        </span>
      )}
      <div
        role="group"
        aria-labelledby={showLabel ? labelId : undefined}
        aria-label={showLabel ? undefined : label}
        className={controls.segmented}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              className={`${controls.segment}${selected ? ` ${controls.segmentSelected}` : ""}`}
              aria-pressed={selected}
              disabled={disabled || option.disabled}
              tabIndex={index === tabbableIndex ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {optionLabel(option)}
            </button>
          );
        })}
      </div>
    </>
  );
}
