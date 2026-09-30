"use client";

// PRES-2 S6.7: the editable intermediate for stages 3/4 (ONE mental model +
// ONE running example, "the Pinned Frame" - src/lib/deck-standard/frame.ts,
// S2). Holds its own DRAFT locally (typing does not itself invalidate
// downstream stages) and calls `onCommit` only when "Save frame edit" is
// clicked - PipelineTab.tsx applies that commit via applyStageEdit, which is
// the point the invalidation graph actually marks deck/reviews/polish stale.
//
// The draft is seeded once, from `frame`, in the useState initializer -
// re-seeding it whenever the COMMITTED value changes underneath this
// component (e.g. the "Suggest via AI" route call landing) is the caller's
// job: PipelineTab.tsx gives this component a `key` derived from the
// committed frame, so React remounts (and re-seeds) it instead of this
// component syncing state FROM a prop in an effect - the react-hooks/
// set-state-in-effect rule this repo runs refuses that shape outright (see
// docs/set-state-in-effect-idiom.md's remount idiom for the precedent).

import { useState } from "react";
import { Button, TextField, Typography } from "@mui/material";
import type { PinnedFrame } from "@/lib/deck-standard/frame";

const EMPTY_FRAME: PinnedFrame = {
  mentalModel: { name: "", steps: [] },
  runningExample: { name: "", description: "" },
};

export default function FrameEditor({
  frame,
  onCommit,
}: {
  frame: PinnedFrame | null;
  onCommit: (next: PinnedFrame) => void;
}) {
  const [draft, setDraft] = useState<PinnedFrame>(() => frame ?? EMPTY_FRAME);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <Typography variant="subtitle2">Mental model (stage 3): one model reused throughout</Typography>
        <TextField
          label="Model name"
          size="small"
          fullWidth
          value={draft.mentalModel.name}
          onChange={(e) => setDraft({ ...draft, mentalModel: { ...draft.mentalModel, name: e.target.value } })}
        />
        <TextField
          label="Steps (one per line)"
          size="small"
          fullWidth
          multiline
          rows={3}
          value={draft.mentalModel.steps.join("\n")}
          onChange={(e) =>
            setDraft({
              ...draft,
              mentalModel: {
                ...draft.mentalModel,
                steps: e.target.value.split("\n").map((s) => s.trim()).filter((s) => s.length > 0),
              },
            })
          }
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <Typography variant="subtitle2">Running example (stage 4): one example threaded throughout</Typography>
        <TextField
          label="Example name"
          size="small"
          fullWidth
          value={draft.runningExample.name}
          onChange={(e) =>
            setDraft({ ...draft, runningExample: { ...draft.runningExample, name: e.target.value } })
          }
        />
        <TextField
          label="Example description"
          size="small"
          fullWidth
          multiline
          rows={2}
          value={draft.runningExample.description}
          onChange={(e) =>
            setDraft({ ...draft, runningExample: { ...draft.runningExample, description: e.target.value } })
          }
        />
      </div>

      <Button
        variant="outlined"
        size="small"
        sx={{ textTransform: "none", alignSelf: "start" }}
        onClick={() => onCommit(draft)}
      >
        Save frame edit
      </Button>
    </div>
  );
}
