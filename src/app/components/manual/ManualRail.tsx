"use client";

import {
  getActiveDestinationId,
  getInnerDestinations,
  getInnerNavAriaLabel,
  type BuildViewType,
  type GradingView,
  type ManualViewType,
} from "./manual-rail";
import styles from "../../page.module.css";
import type { ContentView } from "../content-tab/constants";

/**
 * The INNER destinations of whichever Manual view is showing: Build Courses'
 * two modes, LMS's seven views, Grading's two surfaces, and nothing at all
 * for the Manual views that are a single destination.
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
 *
 * The accessible name comes from `getInnerNavAriaLabel`, the same table
 * `getInnerDestinations` reads - see that function's comment
 * (manual-rail.ts). A hand-written ternary here is exactly what let a third
 * inner nav (Grading) go out announced as "LMS views"
 * (docs/tools-grading-subtab-architecture.md section 6.1).
 */
export function ManualRail({
  manualView,
  buildView,
  contentView,
  gradingView,
  onDestinationClick,
}: {
  manualView: ManualViewType;
  buildView: BuildViewType;
  contentView: ContentView;
  gradingView: GradingView;
  onDestinationClick: (destId: string) => void;
}) {
  const activeId = getActiveDestinationId(manualView, buildView, contentView, gradingView);
  const innerDestinations = getInnerDestinations(manualView);
  const ariaLabel = getInnerNavAriaLabel(manualView);

  if (!innerDestinations || !ariaLabel) return null;

  return (
    <div className={styles.manualSubnav}>
      <div className={styles.lessonInnerTabs} role="tablist" aria-label={getInnerNavAriaLabel(manualView) ?? undefined}>
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
