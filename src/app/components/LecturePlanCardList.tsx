"use client";

import Button from "@mui/material/Button";
import type { AssignmentPlan } from "../actions";
import {
  planHasEdits,
  isRegenerateConfirmArmed,
  regenerateButtonLabel,
  regenerateTooltip,
  type RegenerateArmed,
} from "./lecture-planning-decisions";

type Props = {
  plans: AssignmentPlan[];
  originalPlans: AssignmentPlan[];
  regeneratingIndex: number | null;
  regenerateArmed: RegenerateArmed;
  onSelect: (index: number) => void;
  onRegenerateClick: (index: number) => void;
};

// Extracted from LecturePlanningTab.tsx: keeps that file under this project's
// 1000-line cap, and fixes two audit findings that live entirely inside this
// list:
//
// A4 - each card used to be `<li role="button" tabIndex={0}>` wrapping a REAL
// `<button>` (invalid nesting - a button cannot contain a button), and the
// Space-key handler on the li never called preventDefault(), so pressing
// Space also scrolled the page. Now the `<li>` is a plain container with no
// role/tabIndex/onKeyDown; the clickable title area is a real `<button>`,
// and Regenerate is a SIBLING button, never nested inside it - so the
// stopPropagation() workarounds the old nesting needed are gone too.
//
// BLOCKER 2 - Regenerate used to overwrite the plan AND its reset-snapshot
// unconfirmed. Confirmation now only appears when the card actually HAS
// edits (planHasEdits) - an unedited card still regenerates on the first
// click, since there is nothing at risk to confirm.
export default function LecturePlanCardList({
  plans,
  originalPlans,
  regeneratingIndex,
  regenerateArmed,
  onSelect,
  onRegenerateClick,
}: Props) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {plans.map((plan, i) => {
        const badges: string[] = [];
        if (!plan.slidesFailed) {
          badges.push(`${plan.slides.length + 1} slide${plan.slides.length !== 0 ? "s" : ""}`);
        }
        if (plan.moduleIntroduction) badges.push("Module Intro");
        if (plan.assignmentInstructions) badges.push("Instructions");

        const original = originalPlans[i];
        const hasEdits = original ? planHasEdits(plan, original) : false;
        const confirmArmed = isRegenerateConfirmArmed(regenerateArmed, i, plan);

        return (
          <li
            key={plan.assignmentName}
            style={{
              background: "var(--field-background)",
              border: "1px solid var(--field-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3) var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1)",
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(i)}
              style={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
                width: "100%",
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {plan.presentationTitle}
              </span>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", fontWeight: 500 }}>
                {plan.assignmentName}
              </span>
              <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap", marginTop: "var(--space-1)" }}>
                {plan.slidesFailed && (
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      fontWeight: 500,
                      padding: "var(--space-1) var(--space-2)",
                      borderRadius: "var(--radius-pill)",
                      background: "color-mix(in srgb, var(--warning) 14%, transparent 86%)",
                      color: "var(--warning-ink)",
                      border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent 65%)",
                    }}
                  >
                    Slides failed
                  </span>
                )}
                {badges.map((badge) => (
                  <span
                    key={badge}
                    style={{
                      fontSize: "var(--font-size-xs)",
                      fontWeight: 500,
                      padding: "var(--space-1) var(--space-2)",
                      borderRadius: "var(--radius-pill)",
                      background: "color-mix(in srgb, var(--accent) 12%, transparent 88%)",
                      color: "var(--accent-ink)",
                      border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent 75%)",
                    }}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => onRegenerateClick(i)}
              disabled={regeneratingIndex !== null}
              title={regenerateTooltip({ hasEdits, confirmArmed })}
              sx={{
                alignSelf: "flex-start",
                marginTop: 1,
                opacity: regeneratingIndex !== null && regeneratingIndex !== i ? 0.5 : 1,
              }}
            >
              {regenerateButtonLabel({ regenerating: regeneratingIndex === i, confirmArmed })}
            </Button>
            {confirmArmed && (
              <p role="alert" style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--danger)" }}>
                This module has unsaved edits. Click Regenerate again to discard them.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
