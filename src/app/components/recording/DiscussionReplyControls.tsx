"use client";

// docs/reply-composition-controls-acceptance-criteria.md JOB 1: the reply
// composition cluster - "Each reply should include", the address-by-name
// checkbox, and the formality slider. Extracted out of
// DiscussionRepliesPanel.tsx rather than grown inline, per that panel's own
// note about the 1000-line ceiling enforced by recording-split.structure
// .test.ts.
//
// C0-0: PLACEMENT (inline, above Start capture, no disclosure) is decided
// by the caller - this file owns only the three controls themselves.
//
// Owns no persisted state of its own. `composition` is fully owned by
// useDiscussionReplies (persistence, coercion and the arming signature are
// all wave B's, already built and tested) - this component only edits the
// object it is handed and returns the WHOLE next object through `onChange`,
// exactly matching `setComposition`'s own signature. That also means C6b
// holds automatically: calling `onChange` here never enqueues or rewrites
// anything by itself - it only ever updates the settings object the caller
// already re-arms drafting from.

import { useState } from "react";
import { Checkbox, FormControlLabel, MenuItem, Slider, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import controls from "./RecordingControls.module.css";
import {
  REPLY_FORMALITY_LABELS,
  REPLY_FORMALITY_STOPS,
  REPLY_INGREDIENTS,
  REPLY_INGREDIENT_LABELS,
  type ReplyCompositionSettings,
  type ReplyIngredient,
} from "@/lib/discussion-reply-prompt";
import {
  formalityAriaValueText,
  formalityIndexFromStop,
  formalityStopFromIndex,
  ingredientsRenderValue,
} from "./discussion-reply-controls";

const FORMALITY_LABEL_ID = "discussion-reply-formality-label";
// SHOULD 3 fixer pass: id for the address-by-name checkbox's caveat hint,
// referenced by the checkbox's own aria-describedby below.
const ADDRESS_BY_NAME_HINT_ID = "discussion-reply-address-by-name-hint";

// C4a: three stops, marks built once from the same REPLY_FORMALITY_STOPS
// order the prompt builder reads, so the slider's own visible order can
// never drift from the persisted/prompt order.
const FORMALITY_MARKS = REPLY_FORMALITY_STOPS.map((stop, index) => ({
  value: index,
  label: REPLY_FORMALITY_LABELS[stop],
}));

export default function DiscussionReplyControls({
  composition,
  onChange,
}: {
  composition: ReplyCompositionSettings;
  onChange: (next: ReplyCompositionSettings) => void;
}) {
  // C4c: "Persist on onChangeCommitted, NOT onChange" is about the SIDE
  // EFFECT (writing to localStorage and disarming the redraft confirm) -
  // MUI's Slider.onChange still has to run on every pixel of a drag for the
  // thumb to visually track the pointer at all, so the drag position lives
  // in local state here and `onChange` (the composition setter, wired to
  // persistence in useDiscussionReplies) is called exactly once, from
  // onChangeCommitted.
  //
  // Synced from `composition.formality` using the "adjust state during
  // render" pattern (compare current vs previous, setState in the same
  // render) rather than a useEffect that calls setState synchronously -
  // this repo's eslint config rejects the latter (see
  // DiscussionRepliesPanel.tsx's own `prevCapturing`/`prevSort` for the same
  // idiom against the same rule).
  const [prevFormality, setPrevFormality] = useState(composition.formality);
  const [formalityIndex, setFormalityIndex] = useState(() => formalityIndexFromStop(composition.formality));
  if (composition.formality !== prevFormality) {
    setPrevFormality(composition.formality);
    setFormalityIndex(formalityIndexFromStop(composition.formality));
  }

  return (
    // Fixer pass finding 4: this row pairs a 37.7px select with a taller
    // composite block (the checkbox + its hint paragraph) - `.rowTop`
    // (DiscussionRepliesPanel.module.css) overrides `.adaptRow`'s own
    // bottom-align so the select's top lines up with the block's, instead of
    // sinking ~30px below it.
    <div className={`${styles.adaptRow} ${panelStyles.rowTop}`}>
      <TextField
        select
        label="Each reply should include"
        size="small"
        value={composition.ingredients}
        // Wraps like the Course select above it in the panel (a bounded
        // field-width class, not a full-bleed field) - deliberately no
        // `fullWidth` here, to match that idiom exactly.
        slotProps={{
          select: {
            multiple: true,
            // C2c-i: required in both directions - empty reads as a real
            // phrase, non-empty prints labels rather than raw enum ids.
            renderValue: (selected) => ingredientsRenderValue(selected as ReplyIngredient[]),
          },
        }}
        onChange={(e) => {
          const raw = e.target.value as unknown as string[];
          // C2c-ii: copy ClassSessionSpecEditor.tsx's multi-select idiom
          // MINUS its last-item guard. That guard exists there to prevent a
          // quiz with zero answerable question kinds; here C2c requires the
          // opposite - zero selected must be reachable, since it is itself
          // a legal, meaningful state ("a plain, well-judged reply").
          const ingredients = REPLY_INGREDIENTS.filter((id) => raw.includes(id));
          onChange({ ...composition, ingredients });
        }}
        className={controls.fieldLg}
      >
        {REPLY_INGREDIENTS.map((id) => (
          <MenuItem key={id} value={id}>
            {REPLY_INGREDIENT_LABELS[id]}
          </MenuItem>
        ))}
      </TextField>

      <div>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={composition.addressByName}
              onChange={(e) => onChange({ ...composition, addressByName: e.target.checked })}
              // SHOULD 3 fixer pass: ties the checkbox to its own caveat
              // hint below, the same idiom DiscussionReplyRow.tsx already
              // uses for its "(derived)"/"(no greeting)" hints - a `title`
              // alone (or nothing at all, as this control had before) never
              // reaches assistive tech.
              aria-describedby={ADDRESS_BY_NAME_HINT_ID}
            />
          }
          // SHOULD 2 fixer pass: this toggle also applies to the peers
          // register, where the person addressed is a fellow educator, not
          // a student - "the student's first name" was false for half of
          // this control's uses. "the person's" is true in both registers.
          label="Open each reply with the person's first name"
        />
        <p id={ADDRESS_BY_NAME_HINT_ID} className={styles.fieldHint}>
          Uses the name as captured off the screen; skips the greeting for a post where a clean first name can&apos;t
          be read.
        </p>
      </div>

      {/* Fixer pass finding 5: `controls.sliderBox` (RecordingControls.module
          .css, group P) replaces this file's own `panelStyles.formalitySlider`
          copy - that class is deleted from DiscussionRepliesPanel.module.css
          in the same pass. */}
      <div className={controls.sliderBox}>
        {/* Same small-label idiom as the "Replying to:" span above this
            cluster (styles.ghMeta) - visible, not a floating MUI label,
            since the Slider itself has no label slot of its own. */}
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
            onChange({ ...composition, formality: formalityStopFromIndex(index) });
          }}
        />
      </div>
    </div>
  );
}
