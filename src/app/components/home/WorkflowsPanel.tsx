"use client";

import WorkflowsTab from "../WorkflowsTab";
import AutomationsTabView from "../AutomationsTabView";
import DraftedGradesTab from "../DraftedGradesTab";
import MessageDraftsTab from "../MessageDraftsTab";
import type { WorkflowsView, DraftsView } from "../../url-state";
import styles from "../../page.module.css";

export interface WorkflowsPanelProps {
  workflowsView: WorkflowsView;
  draftsView: DraftsView;
  onDraftsViewChange: (v: DraftsView) => void;
  draftsGradesCount: number;
  draftsMessagesCount: number;
  onOpenWorkflow: (id: string, panel?: "automate") => void;
}

/**
 * The Workflows half of the Tools tab: the nested Grades/Messages subnav under
 * Drafts, and whichever view `workflowsView` selects. Split out of page.tsx as
 * presentation only - every piece of state it reads is owned by
 * useAppNavigation and passed in, so this file has no behaviour of its own to
 * get wrong.
 *
 * IT USED TO RENDER ITS OWN Workflows/Automations/Drafts SUBNAV. D26 deleted
 * that row: those three are chips in the Tools tab's single flattened rail now
 * (components/tabs/tab-rails.ts), writing the same workflowsView param they
 * always did, and the unread-drafts badge moved up with them - which is why
 * `onWorkflowsViewChange` and `draftsInbox` are no longer props. The
 * Grades/Messages subnav below stays: it is the innermost level, inside the
 * Drafts view rather than beside it.
 */
export default function WorkflowsPanel({
  workflowsView,
  draftsView,
  onDraftsViewChange,
  draftsGradesCount,
  draftsMessagesCount,
  onOpenWorkflow,
}: WorkflowsPanelProps) {
  return (
    <>
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
