"use client";

import {
  getActiveDestinationId,
  getInnerDestinations,
  MANUAL_VIEW_LABELS,
  MANUAL_VIEW_ORDER,
  type BuildViewType,
  type ManualViewType,
} from "./manual-rail";
import styles from "../../page.module.css";
import type { ContentView } from "../content-tab/constants";

export function ManualRail({
  manualView,
  buildView,
  contentView,
  onManualViewClick,
  onDestinationClick,
}: {
  manualView: ManualViewType;
  buildView: BuildViewType;
  contentView: ContentView;
  onManualViewClick: (view: ManualViewType) => void;
  onDestinationClick: (destId: string) => void;
}) {
  const activeId = getActiveDestinationId(manualView, buildView, contentView);
  const innerDestinations = getInnerDestinations(manualView);

  return (
    <>
      <div className={styles.manualSubnav}>
        <div className={styles.lessonInnerTabs} role="tablist" aria-label="Manual tools">
          {MANUAL_VIEW_ORDER.map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={view === manualView}
              className={`${styles.lessonInnerTab}${view === manualView ? ` ${styles.lessonInnerTabActive}` : ""}`}
              onClick={() => onManualViewClick(view)}
            >
              {MANUAL_VIEW_LABELS[view]}
            </button>
          ))}
        </div>
      </div>

      {innerDestinations && (
        <div className={styles.manualSubnav}>
          <div
            className={styles.lessonInnerTabs}
            role="tablist"
            aria-label={manualView === "course-planning" ? "Course build modes" : "LMS views"}
          >
            {innerDestinations.map((dest) => (
              <button
                key={dest.id}
                type="button"
                role="tab"
                aria-selected={dest.id === activeId}
                className={`${styles.lessonInnerTab}${dest.id === activeId ? ` ${styles.lessonInnerTabActive}` : ""}`}
                onClick={() => onDestinationClick(dest.id)}
              >
                {dest.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
