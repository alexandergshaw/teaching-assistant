"use client";

// One row of the multi-draft-slot seam (docs/announcement-from-walkthrough-acceptance-criteria.md 5c) - the only
// new component in this directory. A pre-generate picker row and a drafted
// row are the SAME component in two phases of one SlotDraft union, not two
// components. No `memo`: slotsReducer's own identity preservation (the
// leaf's own test suite, Set G) is what a future memo would depend on;
// nothing memoizes today.
//
// Every markup, focus and keyboard statement in this file is a READING
// CLAIM - vitest here is node-env and collects only src/**/*.test.ts, so no
// test in this repo renders this component.

import { useEffect, useMemo, useRef } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { markdownToHtml } from "@/lib/markdown";
import { toDatetimeLocalValue } from "../canvas-tab/utils";
import {
  builtFromId,
  choiceId,
  optionsForSlot,
  receiptLabel,
  savedFormatsStatusText,
  shouldScrollDraftIntoView,
  timingLabel,
  type AnnouncementTiming,
  type DraftSlot,
  type SlotDraftPhase,
  type TemplateChoice,
  type TemplateOptionSource,
} from "./announcement-draft-slots";
import { resolveScheduledVisibility } from "./scheduled-visibility";

const TIMING_OPTIONS: readonly { readonly value: AnnouncementTiming; readonly label: string }[] = [
  { value: "beginning-of-week", label: "Beginning of week" },
  { value: "midweek", label: "Midweek check-in" },
];

// Impure Date.now() read isolated in this tiny top-level helper (mirrors
// currentTimeMs in WeeklyChecklistCell.tsx and urgencyOf in
// LiveFeedPanel.tsx) so eslint's react-hooks/purity rule - which flags a
// DIRECT Date.now() call inside a component body - reads clean, while the
// row still resolves "is this pick in the future, right now" without
// waiting for a click. scheduled-visibility.ts itself stays a pure module;
// this is the one place its injected `now` parameter is sourced from the
// clock in this component.
function currentTimeMs(): number {
  return Date.now();
}

export interface AnnouncementDraftSlotProps {
  readonly slot: DraftSlot;
  readonly ordinal: number;
  readonly optionSource: TemplateOptionSource;
  readonly onRetryOptions: (() => void) | null;
  readonly postArmed: boolean;
  readonly courseName: string | null;
  readonly canRemove: boolean;
  readonly onChooseTemplate: (id: string, choice: TemplateChoice) => void;
  readonly onChooseTiming: (id: string, timing: AnnouncementTiming) => void;
  readonly onSetScheduledAt: (id: string, raw: string) => void;
  readonly onEdit: (id: string, field: "title" | "message", value: string) => void;
  readonly onRegenerateArm: (id: string) => void;
  readonly onRegenerateConfirm: (id: string) => void;
  readonly onRegenerateCancel: (id: string) => void;
  readonly onPostArm: (id: string) => void;
  readonly onPostCancel: (id: string) => void;
  readonly onCopy: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

export default function AnnouncementDraftSlot({
  slot,
  ordinal,
  optionSource,
  onRetryOptions,
  postArmed,
  courseName,
  canRemove,
  onChooseTemplate,
  onChooseTiming,
  onSetScheduledAt,
  onEdit,
  onRegenerateArm,
  onRegenerateConfirm,
  onRegenerateCancel,
  onPostArm,
  onPostCancel,
  onCopy,
  onRemove,
}: AnnouncementDraftSlotProps) {
  const options = optionsForSlot(slot, optionSource);
  const selectedOption = options.find((o) => o.id === choiceId(slot.choice)) ?? options[0];
  const phase = slot.draft.phase;

  const previewHtml = useMemo(() => {
    if (phase !== "drafted") return "";
    return markdownToHtml(slot.draft.phase === "drafted" ? slot.draft.draft.message : "");
  }, [phase, slot.draft]);

  const rootRef = useRef<HTMLFieldSetElement>(null);
  const prevPhaseRef = useRef<SlotDraftPhase | null>(null);
  useEffect(() => {
    if (shouldScrollDraftIntoView(prevPhaseRef.current, phase)) {
      rootRef.current?.scrollIntoView({ block: "nearest" });
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const staleChoice =
    phase === "drafted" && slot.draft.phase === "drafted" ? choiceId(slot.choice) !== builtFromId(slot.draft.draft.builtFrom) : false;

  const staleTiming =
    phase === "drafted" && slot.draft.phase === "drafted" ? slot.timing !== slot.draft.draft.timing : false;

  // REQ-A32-1: ONE resolution, read by the consequence copy, all five
  // ConfirmArmButtons labels below, AND (via useAnnouncementDraftSlots.ts's
  // commitPost) the post decision itself - so a past-dated pick cannot say
  // "scheduled" while publishing immediately and irrevocably to every
  // student. `now` is read here (not injected) because this is the one
  // production call site; resolveScheduledVisibility.test.ts injects it.
  const visibility = resolveScheduledVisibility(slot.scheduledAt, currentTimeMs());
  const isScheduled = visibility.kind === "scheduled";

  return (
    <fieldset ref={rootRef} className={controls.section}>
      <legend className={controls.sectionLegend}>Draft {ordinal}</legend>

      <div className={styles.adaptRow}>
        <TextField
          select
          size="small"
          label="Format to match"
          className={controls.fieldMd}
          value={selectedOption.id}
          onChange={(e) => {
            const chosen = options.find((o) => o.id === e.target.value);
            if (chosen) onChooseTemplate(slot.id, chosen.choice);
          }}
        >
          {options.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              {option.unavailable ? `${option.label} (no longer available)` : option.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Written for"
          className={controls.fieldMd}
          value={slot.timing}
          onChange={(e) => onChooseTiming(slot.id, e.target.value as AnnouncementTiming)}
        >
          {TIMING_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </div>

      {(() => {
        const statusText = savedFormatsStatusText(optionSource.savedState, optionSource.saved.length);
        if (!statusText) return null;
        // Retry must be reachable in the TIMED-OUT state too, not only after
        // a rejection - a timeout is not a negative result (see
        // savedFormatsStatusText's own doc comment), so it deserves the same
        // way back in as an outright failure.
        const canRetry = (optionSource.savedState === "failed" || optionSource.savedState === "timedout") && onRetryOptions;
        return (
          <p role="status" aria-live="polite" className={styles.fieldHint}>
            {statusText}
            {canRetry && (
              <>
                {" "}
                <button type="button" className={styles.linkButton} onClick={onRetryOptions}>
                  Retry
                </button>
              </>
            )}
          </p>
        );
      })()}

      {selectedOption.unavailable && (
        <p className={styles.fieldHint}>This format is no longer available - choose another before regenerating.</p>
      )}

      {slot.draft.phase !== "drafting" && slot.draft.error && (
        <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {slot.draft.error}
        </div>
      )}

      {phase === "drafted" && slot.draft.phase === "drafted" && (
        <>
          <p className={styles.fieldHint}>{receiptLabel(slot.draft.draft.builtFrom)}</p>
          <p className={styles.fieldHint}>{timingLabel(slot.draft.draft.timing)}</p>
          {/* G3 Ruling 5/14/30: "off", "found", "ran and found nothing", and
              "failed" must be distinguishable to the instructor - researchNotice
              carries the real text; "off" renders nothing here since the
              toggle's own state already communicates that choice. */}
          {slot.draft.draft.researchNotice.kind !== "off" && (
            <p role="status" aria-live="polite" className={styles.fieldHint}>
              {slot.draft.draft.researchNotice.text}
            </p>
          )}
          {staleChoice && (
            <p className={styles.fieldHint}>
              This draft was made from a different format - Regenerate to apply your new choice.
            </p>
          )}
          {staleTiming && (
            <p className={styles.fieldHint}>
              This draft was made with a different timing - Regenerate to apply your new choice.
            </p>
          )}

          <TextField
            size="small"
            label="Subject"
            value={slot.draft.draft.title}
            onChange={(e) => onEdit(slot.id, "title", e.target.value)}
            fullWidth
          />
          <div className={styles.adaptFieldGrid2}>
            <TextField
              size="small"
              label="Message (Markdown)"
              value={slot.draft.draft.message}
              onChange={(e) => onEdit(slot.id, "message", e.target.value)}
              multiline
              minRows={6}
              fullWidth
            />
            <div>
              <p className={styles.fieldHint}>Preview (how this renders on Canvas):</p>
              <div className={controls.draftPreview} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
          <p className={styles.fieldHint}>
            Markdown formatting (##, -, numbered lists, **bold**, *italic*) becomes real headings, lists and emphasis
            when posted to Canvas - and Copy now puts the formatted version on the clipboard alongside the raw
            source, so it is not pasted as literal characters either.
          </p>

          {slot.copyError && (
            <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
              {slot.copyError}
            </div>
          )}
          {slot.copied && (
            <p role="status" aria-live="polite" className={styles.fieldHint}>
              Copied.
            </p>
          )}

          {slot.postError && (
            <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
              {slot.postError}
            </div>
          )}

          <div className={`${styles.ghActions} ${controls.runRow}`}>
            <ConfirmArmButtons
              armed={postArmed}
              idleLabel={isScheduled ? "Schedule post" : "Post to Canvas"}
              confirmLabel={isScheduled ? "Confirm schedule" : "Confirm post"}
              tone="primary"
              idleVariant="contained"
              loading={slot.posting}
              loadingLabel={isScheduled ? "Scheduling…" : "Posting…"}
              disabled={
                slot.postLocked ||
                !courseName ||
                !slot.draft.draft.title.trim() ||
                !slot.draft.draft.message.trim() ||
                visibility.kind === "invalid"
              }
              onArm={() => onPostArm(slot.id)}
              onConfirm={() => onPostArm(slot.id)}
              onCancel={() => onPostCancel(slot.id)}
              consequenceId={`wta-post-consequence-${slot.id}`}
              idleAriaLabel={isScheduled ? `Schedule draft ${ordinal} to post to Canvas` : `Post draft ${ordinal} to Canvas`}
              confirmAriaLabel={
                isScheduled ? `Confirm scheduling draft ${ordinal} to post to Canvas` : `Confirm posting draft ${ordinal} to Canvas`
              }
            />
            <ConfirmArmButtons
              armed={slot.regenerateArmed}
              idleLabel="Regenerate"
              confirmLabel="Confirm regenerate"
              tone="warning"
              idleVariant="outlined"
              onArm={() => onRegenerateArm(slot.id)}
              onConfirm={() => onRegenerateConfirm(slot.id)}
              onCancel={() => onRegenerateCancel(slot.id)}
              consequenceId={`wta-regenerate-consequence-${slot.id}`}
              idleAriaLabel={`Regenerate draft ${ordinal}`}
              confirmAriaLabel={`Confirm regenerating draft ${ordinal}`}
            />
            <Button size="small" variant="outlined" onClick={() => onCopy(slot.id)}>
              Copy
            </Button>
            <div>
              <TextField
                type="datetime-local"
                size="small"
                label="Visible to students (optional)"
                className={controls.fieldMd}
                value={slot.scheduledAt}
                onChange={(e) => onSetScheduledAt(slot.id, e.target.value)}
                slotProps={{
                  htmlInput: { min: toDatetimeLocalValue(new Date()) },
                  inputLabel: { shrink: true },
                }}
              />
              <p className={styles.fieldHint}>
                Leave blank to post immediately. Pick a future date and time to schedule when students can see it.
                {slot.scheduledAt && (
                  <>
                    {" "}
                    <button type="button" className={styles.linkButton} onClick={() => onSetScheduledAt(slot.id, "")}>
                      Clear
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
          {postArmed && (
            <div className={`${controls.notice} ${controls.noticeWarning}`}>
              <p id={`wta-post-consequence-${slot.id}`} role="status" aria-live="polite">
                {isScheduled ? (
                  <>
                    Confirming schedules this announcement to become visible to every student in{" "}
                    {courseName ?? "the course"} at {visibility.kind === "scheduled" ? visibility.label : ""} - Canvas
                    has no unpublished state before then, and this app cannot recall or delete it afterward.
                  </>
                ) : (
                  <>
                    Posting publishes this announcement to every student in {courseName ?? "the course"} immediately -
                    Canvas has no unpublished state for an announcement - and this app cannot recall or delete it
                    afterward.
                  </>
                )}
              </p>
            </div>
          )}
          {slot.regenerateArmed && (
            <p id={`wta-regenerate-consequence-${slot.id}`} className={styles.fieldHint}>
              Regenerating replaces this draft&apos;s hand-edited text - anything typed above will be lost.
            </p>
          )}
          {!courseName && <p className={styles.fieldHint}>Choose a course above to post.</p>}
          {slot.postedTo && (
            <p role="status" aria-live="polite" className={styles.fieldHint}>
              {/* A32/RULING 64, round-2 M4: this line must not claim "can
                  see it now" on the scheduled path - postedScheduledLabel is
                  frozen at commitPost's own decision time (never re-resolved
                  here). The scheduled branch follows the sibling's own
                  branching success copy at announcements-panel.tsx:280-282
                  EXACTLY - announcement scheduled, then when students will
                  see it, with no course interpolated - because "Scheduled
                  for {course}" immediately followed by a time reads as
                  though the course were the time. The immediate branch
                  keeps the course, since "Posted to {course}" is correct
                  and useful there. */}
              {slot.postedScheduledLabel
                ? `Announcement scheduled. Students will see it ${slot.postedScheduledLabel}.`
                : `Posted to ${slot.postedTo}. Students can see it now.`}
            </p>
          )}
          {slot.postLocked && (
            <p role="status" aria-live="polite" className={styles.fieldHint}>
              This draft is already on Canvas. Edit the subject or message, or Regenerate, to post it again.
            </p>
          )}
        </>
      )}

      {phase === "drafting" && <p className={styles.fieldHint}>Drafting…</p>}

      {canRemove && (
        <div className={styles.ghActions}>
          <Button size="small" variant="text" onClick={() => onRemove(slot.id)}>
            Remove this slot
          </Button>
        </div>
      )}
    </fieldset>
  );
}
