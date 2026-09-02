"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC5: one arm/confirm
// component for every destructive or overwriting action on these nine
// surfaces. The idle and armed states are ONE Button element whose label,
// variant, colour and handler change in place (the GradingTableRow.tsx:
// 143-147 trick) so focus survives arming - two literal JSX branches for the
// SAME logical button, not a remount.
import { useImperativeHandle, useRef, type Ref } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";

export type ConfirmArmButtonsTone = "danger" | "warning" | "primary";

const TONE_COLOR: Record<ConfirmArmButtonsTone, "error" | "warning" | "primary"> = {
  danger: "error",
  warning: "warning",
  primary: "primary",
};

export interface ConfirmArmButtonsProps {
  armed: boolean;
  idleLabel: string;
  confirmLabel: string;
  tone: ConfirmArmButtonsTone;
  onArm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** id of the consequence line the caller renders; aria-describedby on the confirm button. */
  consequenceId: string;
  /** Idle variant. "outlined" default; "text" for a low-salience overwrite
   *  (Redraft) or a row-level control; "contained" when the action is the
   *  screen's primary (Post). */
  idleVariant?: "outlined" | "text" | "contained";
  /** The in-flight state after confirm ("Posting…"): passed to MUI `loading`. */
  loading?: boolean;
  /** Confirm-button label shown while `loading` is true, swapped in place of
   *  `confirmLabel` for the duration (see the ternary that computes `label`
   *  below); falls back to `confirmLabel` when omitted. */
  loadingLabel?: string;
  /** Non-busy gate, spelled by the caller exactly as today. */
  disabled?: boolean;
  /** Per-row accessible names where N identical labels would otherwise render. */
  idleAriaLabel?: string;
  confirmAriaLabel?: string;
  /** Forwarded to the underlying Button's root node, merged with the
   *  internal ref used for focus-after-cancel - so a caller (e.g.
   *  CaptionsList) can reach the button directly instead of a
   *  querySelector. */
  buttonRef?: Ref<HTMLButtonElement>;
}

export default function ConfirmArmButtons({
  armed,
  idleLabel,
  confirmLabel,
  tone,
  onArm,
  onConfirm,
  onCancel,
  consequenceId,
  idleVariant = "outlined",
  loading = false,
  loadingLabel,
  disabled = false,
  idleAriaLabel,
  confirmAriaLabel,
  buttonRef,
}: ConfirmArmButtonsProps) {
  const mainButtonRef = useRef<HTMLButtonElement>(null);

  // Merges the internal ref (needed for focus-after-cancel) with the
  // caller's optional buttonRef via the framework-blessed API rather than a
  // hand-rolled callback that assigns buttonRef.current directly - the
  // react-hooks/immutability rule forbids mutating a ref received as a prop.
  useImperativeHandle(buttonRef, () => mainButtonRef.current as HTMLButtonElement);

  // The UX pass caught that otherwise every Cancel click drops focus to
  // <body> once Cancel itself unmounts - move focus to the one-element
  // button BEFORE calling the prop.
  const handleCancel = () => {
    mainButtonRef.current?.focus();
    onCancel();
  };

  const color = TONE_COLOR[tone];
  const label = armed ? (loading && loadingLabel ? loadingLabel : confirmLabel) : idleLabel;

  return (
    <span
      className={styles.ghActions}
      onKeyDown={(event) => {
        if (event.key === "Escape" && armed) handleCancel();
      }}
    >
      <Button
        ref={mainButtonRef}
        type="button"
        size="small"
        color={color}
        variant={armed ? "contained" : idleVariant}
        loading={loading}
        loadingPosition="start"
        disabled={disabled}
        aria-describedby={armed ? consequenceId : undefined}
        aria-label={armed ? confirmAriaLabel : idleAriaLabel}
        onClick={armed ? onConfirm : onArm}
      >
        {label}
      </Button>
      {armed && (
        <Button type="button" variant="text" size="small" disabled={loading} onClick={handleCancel}>
          Cancel
        </Button>
      )}
    </span>
  );
}
