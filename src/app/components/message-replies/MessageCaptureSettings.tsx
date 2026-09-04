"use client";

// Message replies (Manual > Recording > Message replies) - the Capture/
// Replies/Context settings block. Mirrors DiscussionCaptureSettings.tsx's
// own fieldset shape (CC17: <fieldset className={controls.section}> /
// <legend className={controls.sectionLegend}>), but this feature's own file
// plan (docs/message-replies-acceptance-criteria.md section 9) names no
// sibling for the composition controls the way the discussion tool has
// DiscussionReplyControls.tsx - the ingredients/address-by-name/formality
// cluster is inlined directly below (M10), alongside the sign-off and
// instructor-name fields (M11) and the skip-answered/thread-expand
// checkboxes (M12/M13). No audience toggle (a message reply has one fixed
// register, section 6) and no Resources fieldset (this feature drops the
// resource lane, section 0).
//
// Owns no persisted state of its own - `composition`/`signoff`/
// `instructorName`/`skipAnswered`/`threadExpand` are all owned by
// useMessageReplies.ts (persistence, coercion) exactly as `composition` is
// owned by useDiscussionReplies in the sibling; this component only edits
// what it is handed and returns the whole next value through the matching
// setter.

import { useState, type ReactNode } from "react";
import { Checkbox, FormControlLabel, MenuItem, Slider, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "../recording/DiscussionRepliesPanel.module.css";
import controls from "../recording/RecordingControls.module.css";
import {
  MESSAGE_INGREDIENTS,
  MESSAGE_INGREDIENT_LABELS,
  ingredientsRenderValue,
  type MessageCompositionSettings,
  type MessageIngredient,
} from "@/lib/message-reply-prompt";
import { REPLY_FORMALITY_LABELS, REPLY_FORMALITY_STOPS } from "@/lib/discussion-reply-prompt";
import { formalityAriaValueText, formalityIndexFromStop, formalityStopFromIndex } from "../recording/discussion-reply-controls";

const FORMALITY_LABEL_ID = "message-reply-formality-label";
const ADDRESS_BY_NAME_HINT_ID = "message-reply-address-by-name-hint";

const FORMALITY_MARKS = REPLY_FORMALITY_STOPS.map((stop, index) => ({ value: index, label: REPLY_FORMALITY_LABELS[stop] }));

export interface MessageCaptureSettingsProps {
  courseId: string;
  setCourseId: (next: string) => void;
  courses: Array<{ id: string; name: string }> | null;
  coursesLoading: boolean;
  coursesError: string | null;
  saveVideo: boolean;
  setSaveVideo: (next: boolean) => void;
  composition: MessageCompositionSettings;
  onChangeComposition: (next: MessageCompositionSettings) => void;
  signoff: string;
  setSignoff: (next: string) => void;
  instructorName: string;
  setInstructorName: (next: string) => void;
  skipAnswered: boolean;
  setSkipAnswered: (next: boolean) => void;
  threadExpand: boolean;
  setThreadExpand: (next: boolean) => void;
  /** The Context section's body - the Knowledge-context block, whose own
   *  markup stays in MessageRepliesPanel.tsx (AddKnowledgePages.test.ts's
   *  own precedent pins that JSX to the panel by path). */
  children?: ReactNode;
}

export default function MessageCaptureSettings({
  courseId,
  setCourseId,
  courses,
  coursesLoading,
  coursesError,
  saveVideo,
  setSaveVideo,
  composition,
  onChangeComposition,
  signoff,
  setSignoff,
  instructorName,
  setInstructorName,
  skipAnswered,
  setSkipAnswered,
  threadExpand,
  setThreadExpand,
  children,
}: MessageCaptureSettingsProps) {
  const [prevFormality, setPrevFormality] = useState(composition.formality);
  const [formalityIndex, setFormalityIndex] = useState(() => formalityIndexFromStop(composition.formality));
  if (composition.formality !== prevFormality) {
    setPrevFormality(composition.formality);
    setFormalityIndex(formalityIndexFromStop(composition.formality));
  }

  return (
    <>
      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Capture</legend>
        <div className={`${styles.adaptRow} ${panelStyles.rowTop}`}>
          <TextField
            select
            label="Course"
            size="small"
            className={controls.fieldMd}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={coursesLoading}
          >
            <MenuItem value="">No course selected</MenuItem>
            {(courses ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <div>
            <FormControlLabel
              control={<Checkbox size="small" checked={saveVideo} onChange={(e) => setSaveVideo(e.target.checked)} />}
              label="Also save the screen recording"
            />
            <p className={styles.fieldHint}>Applies to the next capture.</p>
          </div>
        </div>
        {coursesLoading && (
          <p role="status" aria-live="polite" className={controls.loadingLine}>
            <span className={styles.spinner} aria-hidden="true" />
            Loading your courses…
          </p>
        )}
        {coursesError && <p className={styles.fieldHint}>Could not load your courses - drafting still works without one.</p>}
      </fieldset>

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Replies</legend>
        <div className={`${styles.adaptRow} ${panelStyles.rowTop}`}>
          <div>
            <TextField
              select
              label="Each reply should include"
              size="small"
              value={composition.ingredients}
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (selected) => ingredientsRenderValue(selected as MessageIngredient[]),
                },
              }}
              onChange={(e) => {
                const raw = e.target.value as unknown as string[];
                const ingredients = MESSAGE_INGREDIENTS.filter((id) => raw.includes(id));
                onChangeComposition({ ...composition, ingredients });
              }}
              className={controls.fieldLg}
            >
              {MESSAGE_INGREDIENTS.map((id) => (
                <MenuItem key={id} value={id}>
                  {MESSAGE_INGREDIENT_LABELS[id]}
                </MenuItem>
              ))}
            </TextField>
            {/* M10: "when answer is unselected the cluster shows one
                fieldHint" - so the instructor knows a direct answer to the
                student's question is not guaranteed just because they see a
                drafted reply. */}
            {!composition.ingredients.includes("answer") && (
              <p className={styles.fieldHint}>Replies will not try to answer the question directly.</p>
            )}
          </div>

          <div>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={composition.addressByName}
                  onChange={(e) => onChangeComposition({ ...composition, addressByName: e.target.checked })}
                  aria-describedby={ADDRESS_BY_NAME_HINT_ID}
                />
              }
              label="Open each reply with the student's first name"
            />
            <p id={ADDRESS_BY_NAME_HINT_ID} className={styles.fieldHint}>
              Uses the name as captured off the screen; skips the greeting for a student whose first name can&apos;t
              be read cleanly.
            </p>
          </div>

          <div className={controls.sliderBox}>
            <p id={FORMALITY_LABEL_ID} className={`${styles.ghMeta} ${panelStyles.formalityLabel}`}>
              Formality
            </p>
            <Slider
              value={formalityIndex}
              min={0}
              max={2}
              step={1}
              marks={FORMALITY_MARKS}
              valueLabelDisplay="off"
              getAriaValueText={formalityAriaValueText}
              aria-labelledby={FORMALITY_LABEL_ID}
              onChange={(_e, value) => setFormalityIndex(Array.isArray(value) ? value[0] : value)}
              onChangeCommitted={(_e, value) => {
                const index = Array.isArray(value) ? value[0] : value;
                onChangeComposition({ ...composition, formality: formalityStopFromIndex(index) });
              }}
            />
          </div>
        </div>

        <div className={styles.adaptRow}>
          <TextField
            size="small"
            label="Sign off with"
            placeholder="Best, Dr. Ruiz"
            className={controls.fieldLg}
            value={signoff}
            onChange={(e) => setSignoff(e.target.value)}
          />
          <div>
            <TextField
              size="small"
              label="Your name in Canvas"
              className={controls.fieldLg}
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
            />
            {/* M9: while the instructor's own Canvas display name is unset,
                every message reads as incoming and no thread can ever be
                "answered" - rendered directly under the field it describes,
                not surfaced separately by the panel. */}
            {instructorName.trim() === "" && (
              <p className={styles.fieldHint}>Set your Canvas display name so replies you already sent are recognised.</p>
            )}
          </div>
        </div>

        <div className={styles.adaptRow}>
          <FormControlLabel
            control={<Checkbox size="small" checked={skipAnswered} onChange={(e) => setSkipAnswered(e.target.checked)} />}
            label="Skip answered threads"
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={threadExpand} onChange={(e) => setThreadExpand(e.target.checked)} />}
            label="Show the whole thread"
          />
        </div>
      </fieldset>

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Context</legend>
        {children}
      </fieldset>
    </>
  );
}
