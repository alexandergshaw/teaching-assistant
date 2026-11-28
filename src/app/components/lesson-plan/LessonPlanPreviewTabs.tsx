"use client";

import { Tab, Tabs } from "@mui/material";
import { subtabSx } from "../tabs/subtab-style";
import type { PreviewTab } from "./types";

export const lessonPlanPreviewTabs: readonly { id: PreviewTab; label: string }[] = [
  { id: "intro", label: "Introduction" },
  { id: "slides", label: "Slides" },
  { id: "examples", label: "Examples" },
  { id: "assignment", label: "Assignment" },
  { id: "rubric", label: "Rubric" },
];

export default function LessonPlanPreviewTabs({
  tabsId,
  previewTab,
  onTabChange,
}: {
  tabsId: string;
  previewTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
}) {
  return (
    <Tabs value={previewTab} onChange={(_, tab: PreviewTab) => onTabChange(tab)} aria-label="Lesson plan sections"
      variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={subtabSx}>
      {lessonPlanPreviewTabs.map(({ id, label }) => (
        <Tab key={id} value={id} label={label} disableRipple id={`${tabsId}-tab-${id}`} aria-controls={`${tabsId}-panel-${id}`} />
      ))}
    </Tabs>
  );
}
