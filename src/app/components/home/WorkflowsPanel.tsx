"use client";

import WorkflowsTab from "../WorkflowsTab";
import AutomationsTabView from "../AutomationsTabView";
import MessageDraftsTab from "../MessageDraftsTab";
import type { WorkflowsView } from "../../url-state";

export interface WorkflowsPanelProps {
  workflowsView: WorkflowsView;
  onOpenWorkflow: (id: string, panel?: "automate") => void;
}

/**
 * The Workflows half of the Tools tab: whichever view `workflowsView`
 * selects. Split out of page.tsx as presentation only - every piece of state
 * it reads is owned by useAppNavigation and passed in, so this file has no
 * behaviour of its own to get wrong.
 *
 * IT USED TO RENDER ITS OWN Workflows/Automations/Drafts SUBNAV. D26 deleted
 * that row: those three are chips in the Tools tab's single flattened rail now
 * (components/tabs/tab-rails.ts), writing the same workflowsView param they
 * always did, and the unread-drafts badge moved up with them - which is why
 * `onWorkflowsViewChange` and `draftsInbox` are no longer props.
 *
 * IT USED TO ALSO RENDER A NESTED Grades/Messages SUBNAV INSIDE Drafts. GRAD-
 * SUBTAB wave 3 (DECISION 18/19, E-full) removed that too: Drafted Grades
 * moved into Tools > Grading's own inner nav instead of staying mirrored here,
 * and a two-member selector reduced to one member is exactly the vestige this
 * repo avoids ("a registration describing a screen that no longer exists" -
 * tab-sections.ts). Drafts now renders MessageDraftsTab directly, with no
 * subnav of its own left to render.
 */
export default function WorkflowsPanel({ workflowsView, onOpenWorkflow }: WorkflowsPanelProps) {
  return (
    <>
      {workflowsView === "workflows" && <WorkflowsTab />}
      {workflowsView === "automations" && <AutomationsTabView onOpenWorkflow={onOpenWorkflow} />}
      {workflowsView === "drafts" && <MessageDraftsTab onOpenWorkflow={onOpenWorkflow} />}
    </>
  );
}
