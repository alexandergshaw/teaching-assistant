"use client";

// docs/reply-composition-controls-acceptance-criteria.md C0-1 (this group,
// implementer C2): the announcement half of the reply-composition controls -
// "This announcement should include" and a formality slider. No
// "address by name" control on this surface - see src/lib/take-announcement
// .ts's header for why that omission is deliberate, not an oversight.
//
// This is a SIBLING of DiscussionReplyControls.tsx, not that component made
// generic. DiscussionReplyControls's `composition` prop is hardwired to the
// full ReplyCompositionSettings shape (all five ingredients, plus an
// addressByName field this surface has no toggle for at all); giving it an
// optional "which ingredients / which controls" prop would change its
// existing contract, which this group's brief says not to do. So this file
// is new - but it reuses DiscussionReplyControls's PURE HELPER MODULE
// (discussion-reply-controls.ts) directly, unmodified: ingredientsRenderValue,
// formalityIndexFromStop/formalityStopFromIndex and formalityAriaValueText
// are all already generic over the full ReplyIngredient/ReplyFormality
// types, not hardcoded to five ingredients, so they work correctly for this
// surface's two-member subset with zero changes to that file.
//
// Owns no persisted state of its own, exactly like DiscussionReplyControls -
// `composition` is fully owned by useTakeAnnouncement (persistence and
// coercion are this group's own, in announcement-composition.ts). This
// component only edits the object it is handed and returns the WHOLE next
// object through `onChange`.

import { useState } from "react";
import { MenuItem, Slider, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { REPLY_FORMALITY_LABELS, REPLY_FORMALITY_STOPS } from "@/lib/discussion-reply-prompt";
import {
  ANNOUNCEMENT_INGREDIENTS,
  ANNOUNCEMENT_INGREDIENT_LABELS,
  type AnnouncementCompositionSettings,
  type AnnouncementIngredient,
} from "@/lib/take-announcement";
import {
  formalityAriaValueText,
  formalityIndexFromStop,
  formalityStopFromIndex,
  ingredientsRenderValue,
} from "./discussion-reply-controls";

const FORMALITY_LABEL_ID = "announcement-formality-label";

// C4a: three stops, marks built once from the same REPLY_FORMALITY_STOPS
// order the prompt builder reads, so the slider's own visible order can
// never drift from the persisted/prompt order.
const FORMALITY_MARKS = REPLY_FORMALITY_STOPS.map((stop, index) => ({
  value: index,
  label: REPLY_FORMALITY_LABELS[stop],
}));

export default function AnnouncementCompositionControls({
  composition,
  onChange,
  disabled,
}: {
  composition: AnnouncementCompositionSettings;
  onChange: (next: AnnouncementCompositionSettings) => void;
  disabled?: boolean;
}) {
  // Same "adjust state during render" sync as DiscussionReplyControls.tsx -
  // this repo's eslint config rejects a useEffect that calls setState
  // synchronously, so the drag position is reconciled against the composed
  // value inline, in the same render, rather than in an effect.
  const [prevFormality, setPrevFormality] = useState(composition.formality);
  const [formalityIndex, setFormalityIndex] = useState(() => formalityIndexFromStop(composition.formality));
  if (composition.formality !== prevFormality) {
    setPrevFormality(composition.formality);
    setFormalityIndex(formalityIndexFromStop(composition.formality));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
      <TextField
        select
        label="This announcement should include"
        size="small"
        value={composition.ingredients}
        disabled={disabled}
        slotProps={{
          select: {
            multiple: true,
            // C2c-i, transferred: an empty multi-select renders visually
            // identically to one that failed to load, so a real phrase is
            // required in both directions.
            renderValue: (selected) => ingredientsRenderValue(selected as AnnouncementIngredient[]),
          },
        }}
        onChange={(e) => {
          const raw = e.target.value as unknown as string[];
          // C2c-ii, transferred: no last-item guard - zero selected is a
          // legal, meaningful state ("a plain announcement") and must stay
          // reachable.
          const ingredients = ANNOUNCEMENT_INGREDIENTS.filter((id) => raw.includes(id));
          onChange({ ...composition, ingredients });
        }}
        sx={{ minWidth: 260 }}
      >
        {ANNOUNCEMENT_INGREDIENTS.map((id) => (
          <MenuItem key={id} value={id}>
            {ANNOUNCEMENT_INGREDIENT_LABELS[id]}
          </MenuItem>
        ))}
      </TextField>

      <div style={{ width: 220, paddingInline: 24 }}>
        <p id={FORMALITY_LABEL_ID} className={styles.ghMeta} style={{ marginBottom: 8 }}>
          Formality
        </p>
        <Slider
          value={formalityIndex}
          min={0}
          max={2}
          step={1}
          marks={FORMALITY_MARKS}
          valueLabelDisplay="off"
          disabled={disabled}
          getAriaValueText={formalityAriaValueText}
          aria-labelledby={FORMALITY_LABEL_ID}
          onChange={(_e, value) => setFormalityIndex(Array.isArray(value) ? value[0] : value)}
          // C4c: persist (and re-arm nothing but the composition object
          // itself) on commit only - MUI's onChange fires continuously
          // through a drag, and persisting there would write to
          // localStorage on every pixel.
          onChangeCommitted={(_e, value) => {
            const index = Array.isArray(value) ? value[0] : value;
            onChange({ ...composition, formality: formalityStopFromIndex(index) });
          }}
        />
      </div>
    </div>
  );
}
