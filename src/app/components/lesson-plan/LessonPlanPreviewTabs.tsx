"use client";

import { Button } from "@mui/material";
import styles from "../../page.module.css";
import type { PreviewTab } from "./types";

type LessonPlanPreviewTabsProps = {
  previewTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
};

export default function LessonPlanPreviewTabs({
  previewTab,
  onTabChange,
}: LessonPlanPreviewTabsProps) {
  return (
    <div className={styles.lessonInnerTabs}>
      <Button
        variant={previewTab === "intro" ? "contained" : "outlined"}
        size="small"
        className={styles.lessonInnerTab}
        onClick={() => onTabChange("intro")}
      >
        Introduction
      </Button>
      <Button
        variant={previewTab === "slides" ? "contained" : "outlined"}
        size="small"
        className={styles.lessonInnerTab}
        onClick={() => onTabChange("slides")}
      >
        Slides
      </Button>
      <Button
        variant={previewTab === "examples" ? "contained" : "outlined"}
        size="small"
        className={styles.lessonInnerTab}
        onClick={() => onTabChange("examples")}
      >
        Examples
      </Button>
      <Button
        variant={previewTab === "assignment" ? "contained" : "outlined"}
        size="small"
        className={styles.lessonInnerTab}
        onClick={() => onTabChange("assignment")}
      >
        Assignment
      </Button>
      <Button
        variant={previewTab === "rubric" ? "contained" : "outlined"}
        size="small"
        className={styles.lessonInnerTab}
        onClick={() => onTabChange("rubric")}
      >
        Rubric
      </Button>
    </div>
  );
}
