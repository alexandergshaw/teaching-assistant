"use client";

// PRES-2 S6.7: the pipeline stage stepper. Purely presentational - it reads
// the stage-gated status model (S6.3's PipelineState/StageStatus) and reports
// clicks back up; PipelineTab.tsx owns the actual stage-run logic. Every
// stage the owner's 13-step narrative maps onto is one entry here (see
// docs/pres-2-s6-plan.md section 1's stage map), in ALL_STAGE_IDS order so
// the strip always reflects the real dependency order the invalidation graph
// (pipeline.ts) walks.

import { Chip } from "@mui/material";
import { ALL_STAGE_IDS, canRunStage, type PipelineState, type StageId } from "@/lib/presentations/pipeline";

export const STAGE_LABELS: Record<StageId, string> = {
  sources: "1. Sources",
  outline: "2. Outline",
  activities: "8. Activities",
  frame: "3-4. Frame",
  plan: "5/9. Slide Plan",
  deck: "10. Deck",
  standard: "7. Standard Check",
  reviewInfoFlow: "11. Review: Info Flow",
  reviewVisual: "12. Review: Visuals",
  polish: "13. Polish",
};

const STATUS_COLOR: Record<
  PipelineState[StageId]["status"],
  "default" | "primary" | "success" | "warning" | "error"
> = {
  idle: "default",
  running: "primary",
  done: "success",
  stale: "warning",
  error: "error",
};

export default function PipelineStepper({
  state,
  activeStage,
  onSelectStage,
}: {
  state: PipelineState;
  activeStage: StageId;
  onSelectStage: (stage: StageId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Pipeline stages"
      style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}
    >
      {ALL_STAGE_IDS.map((stage) => {
        const stageState = state[stage];
        const runnable = stageState.status !== "done" && canRunStage(state, stage);
        return (
          <Chip
            key={stage}
            role="tab"
            aria-selected={stage === activeStage}
            clickable
            variant={stage === activeStage ? "filled" : "outlined"}
            color={STATUS_COLOR[stageState.status]}
            label={`${STAGE_LABELS[stage]}${stageState.status !== "idle" ? ` (${stageState.status})` : runnable ? "" : " - locked"}`}
            onClick={() => onSelectStage(stage)}
          />
        );
      })}
    </div>
  );
}
