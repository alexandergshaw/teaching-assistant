"use client";

import { destinations, getActiveDestinationId, getDestinationById } from "./manual-rail";
import styles from "../../page.module.css";
import type { ContentView } from "../content-tab/constants";
import type { ReactNode } from "react";

export function ManualRail({
  manualView,
  buildView,
  contentView,
  onDestinationClick,
}: {
  manualView: "course-planning" | "content" | "version-control" | "recording" | "ppt-design";
  buildView: "new" | "prebuilt";
  contentView: ContentView;
  onDestinationClick: (destId: string) => void;
}) {
  const activeId = getActiveDestinationId(manualView, buildView, contentView);
  const activeDest = getDestinationById(activeId);

  return (
    <div className={styles.manualRailContainer}>
      <div className={styles.manualRail} role="tablist" aria-label="Manual destinations">
        {destinations.map((group, groupIdx) => (
          <div key={groupIdx} className={styles.railGroup}>
            {group.name && <div className={styles.railGroupLabel}>{group.name}</div>}
            <div className={styles.railDestinations}>
              {group.destinations.map((dest) => (
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
        ))}
      </div>

      {activeDest && (
        <div className={styles.destinationHeader}>
          <h2>{activeDest.label}</h2>
          <p>{activeDest.description}</p>
        </div>
      )}
    </div>
  );
}

export function ManualContent({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={styles.card}>{children}</div>;
}
