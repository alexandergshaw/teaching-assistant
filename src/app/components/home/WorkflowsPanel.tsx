"use client";

import WorkflowsTab from "../WorkflowsTab";
import AutomationsTabView from "../AutomationsTabView";
import DraftedGradesTab from "../DraftedGradesTab";
import MessageDraftsTab from "../MessageDraftsTab";
import type { WorkflowsView, DraftsView } from "../../url-state";
import styles from "../../page.module.css";

export interface WorkflowsPanelProps {
  workflowsView: WorkflowsView;
  onWorkflowsViewChange: (v: WorkflowsView) => void;
  draftsView: DraftsView;
  onDraftsViewChange: (v: DraftsView) => void;
  /** Total unread drafts, badged on the Drafts subtab. */
  draftsInbox: number;
  draftsGradesCount: number;
  draftsMessagesCount: number;
  onOpenWorkflow: (id: string, panel?: "automate") => void;
}

/**
 * The Workflows top-level tab: its Workflows/Automations/Drafts subnav, the
 * nested Grades/Messages subnav under Drafts, and whichever view those two
 * select. Split out of page.tsx as presentation only - every piece of state it
 * reads is owned by useAppNavigation and passed in, so this file has no
 * behaviour of its own to get wrong.
 */
export default function WorkflowsPanel({
  workflowsView,
  onWorkflowsViewChange,
  draftsView,
  onDraftsViewChange,
  draftsInbox,
  draftsGradesCount,
  draftsMessagesCount,
  onOpenWorkflow,
}: WorkflowsPanelProps) {
  return (
    <>
      <div className={styles.manualSubnav}>
        <div className={styles.lessonInnerTabs} role="tablist" aria-label="Workflows">
          <button
            type="button"
            role="tab"
            aria-selected={workflowsView === "workflows"}
            className={`${styles.lessonInnerTab}${workflowsView === "workflows" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => onWorkflowsViewChange("workflows")}
          >
            Workflows
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workflowsView === "automations"}
            className={`${styles.lessonInnerTab}${workflowsView === "automations" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => onWorkflowsViewChange("automations")}
          >
            Automations
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workflowsView === "drafts"}
            className={`${styles.lessonInnerTab}${workflowsView === "drafts" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => onWorkflowsViewChange("drafts")}
          >
            <span className={styles.tabLabelWrap}>
              Drafts
              {draftsInbox > 0 && <span className={styles.navBadge}>{draftsInbox}</span>}
            </span>
          </button>
        </div>
      </div>

      {workflowsView === "workflows" && <WorkflowsTab />}
      {workflowsView === "automations" && <AutomationsTabView onOpenWorkflow={onOpenWorkflow} />}
      {workflowsView === "drafts" && (
        <>
          <div className={styles.manualSubnav}>
            <div className={styles.lessonInnerTabs} role="tablist" aria-label="Drafts">
              <button
                type="button"
                role="tab"
                aria-selected={draftsView === "grades"}
                className={`${styles.lessonInnerTab}${draftsView === "grades" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                onClick={() => onDraftsViewChange("grades")}
              >
                <span className={styles.tabLabelWrap}>
                  Grades
                  {draftsGradesCount > 0 && <span className={styles.navBadge}>{draftsGradesCount}</span>}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={draftsView === "messages"}
                className={`${styles.lessonInnerTab}${draftsView === "messages" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                onClick={() => onDraftsViewChange("messages")}
              >
                <span className={styles.tabLabelWrap}>
                  Messages
                  {draftsMessagesCount > 0 && <span className={styles.navBadge}>{draftsMessagesCount}</span>}
                </span>
              </button>
            </div>
          </div>

          {draftsView === "grades" && <DraftedGradesTab onOpenWorkflow={onOpenWorkflow} />}
          {draftsView === "messages" && <MessageDraftsTab onOpenWorkflow={onOpenWorkflow} />}
        </>
      )}
    </>
  );
}
