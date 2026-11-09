"use client";

// PRES-2 S6.7: the pipeline stage stepper. Purely presentational - it reads
// the stage-gated status model (S6.3's PipelineState/StageStatus) and reports
// clicks back up; PipelineTab.tsx owns the actual stage-run logic. Every
// stage the owner's 13-step narrative maps onto is one entry here (see
// docs/pres-2-s6-plan.md section 1's stage map), in ALL_STAGE_IDS order so
// the strip always reflects the real dependency order the invalidation graph
// (pipeline.ts) walks.

import { Tab, Tabs } from "@mui/material";
import { ALL_STAGE_IDS, canRunStage, type PipelineState, type StageId } from "@/lib/presentations/pipeline";

export const STAGE_LABELS: Record<StageId, string> = {
  sources: "Sources",
  outline: "Outline",
  activities: "Activities",
  frame: "Frame",
  plan: "Slide Plan",
  deck: "Deck",
  standard: "Standard Check",
  reviewInfoFlow: "Review: Info Flow",
  reviewVisual: "Review: Visuals",
  polish: "Polish",
};

export function stageNavigationLabel(state: PipelineState, stage: StageId): string {
  const status = state[stage].status;
  const suffix = status !== "idle" ? ` (${status})` : canRunStage(state, stage) ? "" : " (needs prerequisites)";
  return `${STAGE_LABELS[stage]}${suffix}`;
}

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
    <Tabs
      value={activeStage}
      onChange={(_, stage: StageId) => onSelectStage(stage)}
      aria-label="Pipeline stages"
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      selectionFollowsFocus
    >
      {ALL_STAGE_IDS.map((stage) => (
          <Tab
            key={stage}
            value={stage}
            id={`pipeline-stage-tab-${stage}`}
            aria-controls="pipeline-stage-panel"
            label={stageNavigationLabel(state, stage)}
            sx={{ textTransform: "none" }}
          />
      ))}
    </Tabs>
  );
}
