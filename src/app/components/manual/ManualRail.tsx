"use client";

import {
  getActiveDestinationId,
  getInnerDestinations,
  type BuildViewType,
  type ManualViewType,
} from "./manual-rail";
import styles from "../../page.module.css";
import type { ContentView } from "../content-tab/constants";

/**
 * The INNER destinations of whichever Manual view is showing: Build Courses'
 * two modes, LMS's eight views, and nothing at all for the five Manual views
 * that are a single destination.
 *
 * IT USED TO RENDER A ROW ABOVE THIS ONE - the seven-item rail that chose the
 * Manual view itself. D26 deleted that row: those seven are chips in the Tools
 * tab's single flattened rail now (components/tabs/tab-rails.ts), alongside
 * the three Workflows views, so choosing a Manual view is no longer a level of
 * its own. What is left here is the level BELOW that choice, which the
 * flattening deliberately kept - it is where a rail item leads, not a second
 * way to reach one. The `manualView` prop stays because this row's CONTENT
 * still depends on it; only `onManualViewClick` is gone, since nothing here
 * changes it any more.
 */
export function ManualRail({
  manualView,
  buildView,
  contentView,
  onDestinationClick,
}: {
  manualView: ManualViewType;
  buildView: BuildViewType;
  contentView: ContentView;
  onDestinationClick: (destId: string) => void;
}) {
  const activeId = getActiveDestinationId(manualView, buildView, contentView);
  const innerDestinations = getInnerDestinations(manualView);

  if (!innerDestinations) return null;

  return (
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
  );
}
