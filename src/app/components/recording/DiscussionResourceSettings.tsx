"use client";

// Resource-controls feature: "what resources are eligible to pull into
// things" (eligible resource kinds) and "the min and/or max length of video
// I want pulled in" (preferred video length). Extracted into its own file
// rather than grown inline in DiscussionRepliesPanel.tsx, mirroring
// DiscussionReplyControls.tsx's own extraction reasoning (that panel's
// 1000-line ceiling, enforced by recording-split.structure.test.ts).
//
// Owns no persisted state of its own - both settings are fully owned by
// discussion-persisted-controls.ts (persistence, coercion) and threaded
// through useDiscussionReplies.ts exactly like `composition` is. This
// component only edits the values it is handed and calls back with the
// WHOLE next value, exactly matching setResourceKinds/setVideoLengthPreference's
// own signatures.

import { TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import { RESOURCE_KINDS, RESOURCE_KIND_LABELS, type ResourceKind } from "@/lib/resource-kind";
import {
  resourceKindsRenderValue,
  parseVideoLengthMinutesInput,
  videoLengthRangeIsInverted,
} from "./discussion-resource-settings";

const VIDEO_LENGTH_HINT_ID = "discussion-video-length-hint";

export default function DiscussionResourceSettings({
  resourceKinds,
  onChangeResourceKinds,
  videoLengthMinMinutes,
  videoLengthMaxMinutes,
  onChangeVideoLength,
}: {
  resourceKinds: readonly ResourceKind[];
  onChangeResourceKinds: (next: readonly ResourceKind[]) => void;
  videoLengthMinMinutes?: number;
  videoLengthMaxMinutes?: number;
  onChangeVideoLength: (min: number | undefined, max: number | undefined) => void;
}) {
  // FIX 3 (review pass): see videoLengthRangeIsInverted's own doc comment
  // (discussion-resource-settings.ts) for why an inverted pair is shown as a
  // message here rather than silently swapped or blocked at the keystroke.
  const rangeInverted = videoLengthRangeIsInverted(videoLengthMinMinutes, videoLengthMaxMinutes);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-5)", alignItems: "flex-start" }}>
      <TextField
        select
        label="Eligible resource kinds"
        size="small"
        value={resourceKinds}
        // Deliberately no `fullWidth` - matches the composition cluster's
        // own bounded minWidth flex-item idiom (DiscussionReplyControls.tsx).
        slotProps={{
          select: {
            multiple: true,
            renderValue: (selected) => resourceKindsRenderValue(selected as ResourceKind[]),
          },
        }}
        onChange={(e) => {
          const raw = e.target.value as unknown as string[];
          // C2c-ii idiom (DiscussionReplyControls.tsx): zero selected must be
          // reachable - it is itself a legal, meaningful state ("search no
          // resource kinds at all"), not an error to guard against.
          const next = RESOURCE_KINDS.filter((id) => raw.includes(id));
          onChangeResourceKinds(next);
        }}
        sx={{ minWidth: 260 }}
      >
        {RESOURCE_KINDS.map((id) => (
          <MenuItem key={id} value={id}>
            {RESOURCE_KIND_LABELS[id]}
          </MenuItem>
        ))}
      </TextField>

      <div style={{ minWidth: 260 }}>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <TextField
            type="number"
            label="Min video length (min)"
            size="small"
            value={videoLengthMinMinutes ?? ""}
            onChange={(e) =>
              onChangeVideoLength(parseVideoLengthMinutesInput(e.target.value), videoLengthMaxMinutes)
            }
            error={rangeInverted}
            slotProps={{ htmlInput: { min: 0, "aria-describedby": VIDEO_LENGTH_HINT_ID } }}
            sx={{ width: 120 }}
          />
          <TextField
            type="number"
            label="Max video length (min)"
            size="small"
            value={videoLengthMaxMinutes ?? ""}
            onChange={(e) =>
              onChangeVideoLength(videoLengthMinMinutes, parseVideoLengthMinutesInput(e.target.value))
            }
            error={rangeInverted}
            slotProps={{ htmlInput: { min: 0, "aria-describedby": VIDEO_LENGTH_HINT_ID } }}
            sx={{ width: 120 }}
          />
        </div>
        {/* FIX 3: shown INSTEAD of the ordinary hint, never alongside it -
            the inverted-range message is the more urgent, actionable thing
            to say when it applies, and this keeps only one line under the
            fields rather than stacking a warning on top of routine copy.
            Never silently corrected - see videoLengthRangeIsInverted's own
            doc comment for why the instructor sees this instead of a quiet
            swap. */}
        {rangeInverted ? (
          <p id={VIDEO_LENGTH_HINT_ID} className={styles.error} style={{ margin: "var(--space-1) 0 0", fontSize: "var(--font-size-md)" }}>
            Min video length is greater than max - swap them or clear one, or this preference will be dropped when
            searching for resources.
          </p>
        ) : (
          /* SURVEY FINDING, stated to the instructor too, not just in code
             comments: the resource search has no way to confirm a video's
             actual runtime, so this is labelled and described as a
             preference throughout - never as a guarantee. */
          <p id={VIDEO_LENGTH_HINT_ID} className={styles.fieldHint} style={{ margin: "var(--space-1) 0 0" }}>
            Preferred video length, not a guarantee - search results do not always confirm how long a video actually
            runs.
          </p>
        )}
      </div>
    </div>
  );
}
