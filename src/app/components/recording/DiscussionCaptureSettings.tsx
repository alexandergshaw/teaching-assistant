"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC17: the settings block
// of the Discussion replies panel, extracted out of DiscussionRepliesPanel.tsx
// once that file was pressing on recording-split.structure.test.ts's 1000-line
// ceiling. Moved here: the Capture section (course, save-video checkbox, the
// course-loading/course-error hints), the Replies section (the audience
// toggle, the Redraft every reply arm/confirm cluster and its consequence
// line, then <DiscussionReplyControls>), and the Resources section
// (<DiscussionResourceSettings>). The Context section renders whatever the
// caller passes as `children` - the knowledge-context block's OWN markup
// stays in DiscussionRepliesPanel.tsx, because AddKnowledgePages.test.ts:
// 261-273 and discussion-knowledge-context.test.ts:376-394 both pin its
// JSX (the `{knowledgeContextLabel && (...)}` gate and the unconditional
// <AddKnowledgePages> mount) to that file by path.
//
// CC2's section shape: <fieldset className={controls.section}> with
// <legend className={controls.sectionLegend}>, imported from
// RecordingControls.module.css (group P, wave 0). This file imports
// DiscussionRepliesPanel.module.css for `.reservedSlot` only - every other
// class it needs (section/sectionLegend/fieldMd/consequence) lives in the
// shared controls stylesheet.
//
// The arming STATE, both confirmArming signatures and both
// *_CONSEQUENCE_ID constants stay in DiscussionRepliesPanel.tsx
// (discussion-table-view.test.ts:757-765 pins them there) - this component
// only takes the derived booleans/callbacks/id across the boundary.

import type { ReactNode } from "react";
import { Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import controls from "./RecordingControls.module.css";
import SegmentedToggle, { type SegmentedToggleOption } from "../ui/SegmentedToggle";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import type { DiscussionAudience, ReplyCompositionSettings } from "@/lib/discussion-reply-prompt";
import type { ResourceKind } from "@/lib/resource-kind";
import DiscussionReplyControls from "./DiscussionReplyControls";
import DiscussionResourceSettings from "./DiscussionResourceSettings";

const AUDIENCE_OPTIONS: readonly SegmentedToggleOption<DiscussionAudience>[] = [
  { value: "students", label: "My students" },
  { value: "peers", label: "Fellow educators" },
];

export interface DiscussionCaptureSettingsProps {
  courseId: string;
  setCourseId: (next: string) => void;
  courses: Array<{ id: string; name: string }> | null;
  coursesLoading: boolean;
  coursesError: string | null;
  saveVideo: boolean;
  setSaveVideo: (next: boolean) => void;
  audience: DiscussionAudience;
  setAudience: (next: DiscussionAudience) => void;
  /** F11: the UNFILTERED row count - gates the Redraft slot's visibility (AC61). */
  totalCount: number;
  redraftArmed: boolean;
  onArmRedraft: () => void;
  onConfirmRedraft: () => void;
  onCancelRedraft: () => void;
  redraftConsequenceId: string;
  composition: ReplyCompositionSettings;
  onChangeComposition: (next: ReplyCompositionSettings) => void;
  resourceKinds: readonly ResourceKind[];
  onChangeResourceKinds: (next: readonly ResourceKind[]) => void;
  videoLengthMinMinutes?: number;
  videoLengthMaxMinutes?: number;
  onChangeVideoLength: (min: number | undefined, max: number | undefined) => void;
  /** The Context section's body - the Knowledge-context block, whose own
   *  markup stays in DiscussionRepliesPanel.tsx (see file header). */
  children?: ReactNode;
}

export default function DiscussionCaptureSettings({
  courseId,
  setCourseId,
  courses,
  coursesLoading,
  coursesError,
  saveVideo,
  setSaveVideo,
  audience,
  setAudience,
  totalCount,
  redraftArmed,
  onArmRedraft,
  onConfirmRedraft,
  onCancelRedraft,
  redraftConsequenceId,
  composition,
  onChangeComposition,
  resourceKinds,
  onChangeResourceKinds,
  videoLengthMinMinutes,
  videoLengthMaxMinutes,
  onChangeVideoLength,
  children,
}: DiscussionCaptureSettingsProps) {
  return (
    <>
      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Capture</legend>
        {/* Fixer pass finding 4: pairs a 37.7px select with the "Also save
            the screen recording" checkbox + its hint paragraph (a taller
            composite block) - `.rowTop` keeps their top edges aligned
            instead of bottom-aligning to the taller block. */}
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
        <div className={styles.ghActions}>
          <SegmentedToggle label="Replying to" showLabel value={audience} onChange={setAudience} options={AUDIENCE_OPTIONS} />
          {/* AC61: the slot keeps its layout box even while hidden (visibility,
              not conditional rendering) so this row does not shift sideways the
              moment the first post lands. Gated on `totalCount`, not a filtered
              count - Redraft is a whole-table action and must stay available
              (and visible) even while the current filter happens to show
              nothing. */}
          <div className={panelStyles.reservedSlot} style={{ visibility: totalCount > 0 ? "visible" : "hidden" }} aria-hidden={totalCount === 0}>
            <ConfirmArmButtons
              armed={redraftArmed}
              idleLabel="Redraft every reply"
              confirmLabel="Confirm redraft"
              tone="warning"
              idleVariant="text"
              onArm={onArmRedraft}
              onConfirm={onConfirmRedraft}
              onCancel={onCancelRedraft}
              consequenceId={redraftConsequenceId}
            />
          </div>
        </div>
        {redraftArmed && (
          <p id={redraftConsequenceId} role="status" aria-live="polite" className={controls.consequence}>
            This overwrites every reply in the table, including ones you edited by hand.
          </p>
        )}
        <DiscussionReplyControls composition={composition} onChange={onChangeComposition} />
      </fieldset>

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Context</legend>
        {children}
      </fieldset>

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Resources</legend>
        <DiscussionResourceSettings
          resourceKinds={resourceKinds}
          onChangeResourceKinds={onChangeResourceKinds}
          videoLengthMinMinutes={videoLengthMinMinutes}
          videoLengthMaxMinutes={videoLengthMaxMinutes}
          onChangeVideoLength={onChangeVideoLength}
        />
      </fieldset>
    </>
  );
}
