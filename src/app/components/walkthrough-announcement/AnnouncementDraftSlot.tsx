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

import { useMemo } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { markdownToHtml } from "@/lib/markdown";
import {
  builtFromId,
  choiceId,
  optionsForSlot,
  receiptLabel,
  savedFormatsStatusText,
  timingLabel,
  type AnnouncementTiming,
  type DraftSlot,
  type TemplateChoice,
  type TemplateOptionSource,
} from "./announcement-draft-slots";

const TIMING_OPTIONS: readonly { readonly value: AnnouncementTiming; readonly label: string }[] = [
  { value: "beginning-of-week", label: "Beginning of week" },
  { value: "midweek", label: "Midweek check-in" },
];

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

  const staleChoice =
    phase === "drafted" && slot.draft.phase === "drafted" ? choiceId(slot.choice) !== builtFromId(slot.draft.draft.builtFrom) : false;

  const staleTiming =
    phase === "drafted" && slot.draft.phase === "drafted" ? slot.timing !== slot.draft.draft.timing : false;

  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Draft {ordinal}</legend>

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
        label="Timing"
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
          <TextField
            size="small"
            label="Message (Markdown)"
            value={slot.draft.draft.message}
            onChange={(e) => onEdit(slot.id, "message", e.target.value)}
            multiline
            minRows={6}
            fullWidth
          />
          <p className={styles.fieldHint}>Preview (how this renders on Canvas):</p>
          <div className={controls.draftPreview} dangerouslySetInnerHTML={{ __html: previewHtml }} />
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

          {postArmed && (
            <div className={`${controls.notice} ${controls.noticeWarning}`}>
              <p id={`wta-post-consequence-${slot.id}`} role="status" aria-live="polite">
                Posting publishes this announcement to every student in {courseName ?? "the course"} immediately -
                Canvas has no unpublished state for an announcement - and this app cannot recall or delete it
                afterward.
              </p>
            </div>
          )}
          {slot.postError && (
            <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
              {slot.postError}
            </div>
          )}

          <div className={`${styles.ghActions} ${controls.runRow}`}>
            <ConfirmArmButtons
              armed={postArmed}
              idleLabel="Post to Canvas"
              confirmLabel="Confirm post"
              tone="primary"
              idleVariant="contained"
              loading={slot.posting}
              loadingLabel="Posting…"
              disabled={!courseName || !slot.draft.draft.title.trim() || !slot.draft.draft.message.trim()}
              onArm={() => onPostArm(slot.id)}
              onConfirm={() => onPostArm(slot.id)}
              onCancel={() => onPostCancel(slot.id)}
              consequenceId={`wta-post-consequence-${slot.id}`}
              idleAriaLabel={`Post draft ${ordinal} to Canvas`}
              confirmAriaLabel={`Confirm posting draft ${ordinal} to Canvas`}
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
          </div>
          {slot.regenerateArmed && (
            <p id={`wta-regenerate-consequence-${slot.id}`} className={styles.fieldHint}>
              Regenerating replaces this draft&apos;s hand-edited text - anything typed above will be lost.
            </p>
          )}
          {!courseName && <p className={styles.fieldHint}>Choose a course above to post.</p>}
          {slot.postedTo && (
            <p role="status" aria-live="polite" className={styles.fieldHint}>
              Posted to {slot.postedTo}. Students can see it now.
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
