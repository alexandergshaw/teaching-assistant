"use client";

// The persistent step tracker for a running (or just-finished) workflow.
//
// Before this component existed, the ONLY place an instructor could see
// "which step are we on, and how did the earlier ones go" was the stack of
// RunStepCard cards in the main column - the same place the step's own
// detailed OUTPUT (progress text, errors, summaries, pause/input prompts)
// renders. For anything but a short workflow, scrolling down to read a
// later step's output pushed the step list itself out of view, so there was
// no way to check overall progress without scrolling back up - exactly the
// "step list competing with the run output for vertical space" this
// component exists to fix. WorkflowPanel.tsx now renders this alongside the
// main column (see its own "Run Progress" block) rather than folding
// per-step status into that column at all; the main column still owns every
// step's actual OUTPUT unchanged.
//
// Deliberately its own file rather than folded into WorkflowPanel.tsx: it
// owns real state (the collapsed/expanded persistence below), matching the
// same "each sidebar owns its own persisted UI state" shape
// WorkflowListSidebar.tsx already established for this page - the workflow
// LIST sidebar's collapsed-folder state lives inside that component, not
// lifted to WorkflowsTab, and this run-progress sidebar's collapsed state
// follows the same rule rather than growing WorkflowPanel's already-large
// prop list.
import { useEffect, useState } from "react";
import { stepStatusBadgeClass, stepStatusLabel } from "./RunStepCard";
import { countSettledSteps, describeRunProgressAnnouncement, type ActiveStepLocation } from "./run-progress-sidebar";
import { composedGroupLabel } from "@/lib/workflows/fanout";
import type { RunStateGroup } from "./attended-fanout";
import pageStyles from "../../page.module.css";
import panelStyles from "./WorkflowPanel.module.css";

const OPEN_KEY = "ta-workflow-run-progress-open";

interface RunProgressSidebarProps {
  groups: RunStateGroup[];
  /** Display name for each step, parallel to every group's own `steps`
   * array - see WorkflowPanel.tsx's `stepDisplayNames` (built the same way
   * the main column already resolves a step's name via getStepDefinition,
   * computed once rather than per group so this component stays decoupled
   * from the step registry). */
  stepNames: string[];
  /** The step currently blocking the run on the instructor - a
   * confirmation prompt (runPause) or a run-input prompt (runInput); see
   * useWorkflowRun.ts. Both share the same {groupIndex, stepIndex} shape,
   * so WorkflowPanel.tsx collapses whichever is active into this one prop
   * rather than this component needing to know about either hook's own
   * richer type. */
  waitingFor: ActiveStepLocation | null;
}

export function RunProgressSidebar({ groups, stepNames, waitingFor }: RunProgressSidebarProps) {
  // Persisted the same way WorkflowListSidebar.tsx persists its own
  // collapsed-folder state: read once, lazily, guarded for SSR (no
  // `window`/`localStorage` on the server), then written back on every
  // change via a plain effect - no setState inside that effect, so this
  // never runs into the react-hooks/globals "setState synchronously from an
  // effect" rule the project's ESLint config enforces.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(OPEN_KEY);
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      // Ignore storage failures (private mode, quota) - the toggle still
      // works for the rest of this session, it just won't be remembered.
    }
  }, [open]);

  const { settled, total } = countSettledSteps(groups);
  const announcement = describeRunProgressAnnouncement(groups, stepNames, waitingFor);

  return (
    <aside className={panelStyles.runProgressSidebar} aria-label="Run progress">
      <div className={panelStyles.runProgressCard}>
        {/* A locally-fitted disclosure header rather than a reuse of
            DisclosureToggle (Steps/Run history/Schedule & trigger's shared
            control): that component hard-codes a `borderTop` + `marginTop`
            sized for stacking directly in the page's own flow, which would
            double up against this card's own border/padding as its first
            child. DisclosureToggle.tsx isn't in this change's allowed-edit
            list either way, so rather than fight its fixed spacing, this
            mirrors the SAME chevron idiom (identical SVG, identical
            rotation) without it. */}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className={panelStyles.runProgressToggle}
        >
          <span
            className={panelStyles.runProgressChevron}
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          >
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 2L3 4L5 2" stroke="currentColor" strokeWidth="0.75" />
            </svg>
          </span>
          Run progress ({settled}/{total} steps)
        </button>

        {/* Narrow, deliberately quiet aria-live region: this text only
            changes when the currently-running (or currently-waiting) step
            changes, never on every minor status update - see
            describeRunProgressAnnouncement's own doc comment for why. It is
            visually hidden because the step list right below it already
            shows the same information to sighted users; screen reader users
            get it announced instead of having to navigate to find it. */}
        <p className={panelStyles.visuallyHidden} aria-live="polite" aria-atomic="true">
          {announcement ?? ""}
        </p>

        {open &&
          groups.map((group, g) => {
            const groupLabel = group.courseId
              ? composedGroupLabel(group.courseName ?? "", group.institution)
              : group.institution;
            return (
              <div key={group.courseId ?? group.institution ?? g}>
                {groupLabel && <div className={panelStyles.runProgressGroupLabel}>{groupLabel}</div>}
                <ol className={panelStyles.runProgressList} aria-label={groupLabel ? `Steps for ${groupLabel}` : "Steps"}>
                  {group.steps.map((step, i) => {
                    const isWaiting = waitingFor?.groupIndex === g && waitingFor?.stepIndex === i;
                    const isCurrent = isWaiting || step.status === "running";
                    return (
                      <li
                        key={i}
                        className={panelStyles.runProgressStepRow}
                        aria-current={isCurrent ? "step" : undefined}
                      >
                        <span className={panelStyles.runProgressStepIndex}>{i + 1}</span>
                        <span className={panelStyles.runProgressStepName}>{stepNames[i] ?? ""}</span>
                        <span
                          className={`${pageStyles.ghBadge} ${
                            isWaiting ? pageStyles.ghBadgeWarning : stepStatusBadgeClass(step.status)
                          }`}
                        >
                          {isWaiting ? "Needs input" : stepStatusLabel(step.status)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
      </div>
    </aside>
  );
}
