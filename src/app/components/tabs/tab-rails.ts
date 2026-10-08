// D26: the flattened rails for the merged top-level tabs.
//
// WHAT CHANGED. The merge (D25) left the Tools tab three levels deep - the tab
// strip, then a Manual/Workflows section switch, then Manual's own seven-item
// rail - and the Courses tab equally deep, because the Tasks half carried its
// own Term/Daily-Weekly switch below the section switch. This module deletes
// the middle level: each merged tab now shows ONE rail whose items are the
// individual views of BOTH families it absorbed. Tools is twelve items (nine
// Manual views plus three Workflows views); Courses is three (Courses plus the
// two Tasks views). Library was already flat - its switch was its only nav
// level and neither half has a sub-rail - so it is untouched and does not
// appear here at all.
//
// THE RULE THAT DECIDES THE SHAPE. No existing view param may be renamed or
// retired. "manualView", "workflowsView" and "tasksView" keep their names and
// their values, so a rail item is not a new addressing scheme - it is a
// PRESENTATION over the params that already own those views. Picking
// "Recording" writes manualView=recording exactly as the old Manual rail did;
// picking "Automations" writes workflowsView=automations exactly as the old
// Workflows subnav did. The only thing that stops being user-picked is the
// SECTION, which is now derived from the family the chosen item belongs to.
// The section value itself survives (it is still what disambiguates "which
// family is showing" when both families have a remembered view), it is just
// never set on its own any more - which is why every mapping below returns the
// section ALONGSIDE the view rather than leaving a caller free to set one
// without the other.
//
// WHY THE IDS ARE PREFIXED. A rail item id is internal to the rail - it never
// reaches the URL or localStorage - so it is free to be shaped for safety. The
// two Tools families happen to be disjoint today ("recording"/"drafts"/etc.
// share no value, and no two labels collide either - tab-rails.test.ts pins
// both facts), but "happen to be" is not something a lookup should rest on: a
// future ManualViewType named "drafts" would silently steer a Manual chip into
// the Workflows branch. The "<section>:<view>" prefix makes the family part of
// the id, so the mapping is total by construction rather than by coincidence.
//
// NO GROUPING INSIDE THE RAIL. Twelve chips is a lot, and the obvious relief -
// grouping them under "Manual" and "Workflows" headings - would rebuild the
// exact level this change removes, wearing a different hat. The order instead
// carries the grouping implicitly: the nine Manual views in their existing
// order, then the three Workflows views in theirs.

import { MANUAL_VIEW_LABELS, MANUAL_VIEW_ORDER, type ManualViewType } from "../manual/manual-rail";
import {
  COURSES_SECTION_LABELS,
  TASKS_VIEW_LABELS,
  TASKS_VIEW_ORDER,
  type CoursesSection,
  type TasksView,
  type ToolsSection,
} from "./tab-sections";

// --- Courses -------------------------------------------------------------

export type CoursesRailItemId = "courses" | "oneoff" | `tasks:${TasksView}`;

/** The id of the Courses rail item for one Tasks sub-view. Exported so no
 *  caller has to hand-write the prefixed string. */
export function tasksRailItemId(view: TasksView): `tasks:${TasksView}` {
  return `tasks:${view}`;
}

/** One Courses rail item, carrying the whole state it selects. Discriminated
 *  on `section` so the reverse mapping is a lookup rather than a parse - an id
 *  cannot be routed to the wrong family because the family travels with it. */
export type CoursesRailItem =
  | { id: "courses"; label: string; section: "courses" }
  | { id: "oneoff"; label: string; section: "oneoff" }
  | { id: `tasks:${TasksView}`; label: string; section: "tasks"; tasksView: TasksView };

// Derived from TASKS_VIEW_ORDER rather than restated, so a Tasks sub-view
// added there is in the rail automatically. A hand-written list here is
// exactly how a registered view ends up with no chip to reach it.
export const COURSES_RAIL_ITEMS: readonly CoursesRailItem[] = [
  { id: "courses", label: COURSES_SECTION_LABELS.courses, section: "courses" },
  ...TASKS_VIEW_ORDER.map(
    (view): CoursesRailItem => ({
      id: tasksRailItemId(view),
      label: TASKS_VIEW_LABELS[view],
      section: "tasks",
      tasksView: view,
    })
  ),
  { id: "oneoff", label: COURSES_SECTION_LABELS.oneoff, section: "oneoff" },
];

const COURSES_RAIL_BY_ID: ReadonlyMap<string, CoursesRailItem> = new Map(
  COURSES_RAIL_ITEMS.map((item) => [item.id, item])
);

/** Which Courses rail chip is highlighted, given the state the URL and
 *  localStorage already resolved. This is the "section is derived" direction:
 *  nothing stores a rail item, it is read back out of the params every time. */
export function coursesRailItemFor(section: CoursesSection, tasksView: TasksView): CoursesRailItemId {
  if (section === "oneoff") return "oneoff";
  return section === "tasks" ? tasksRailItemId(tasksView) : "courses";
}

/** The full state one Courses rail chip selects. Fields the chip does not name
 *  keep their current value, matching manual-rail.ts's own
 *  resolveStateFromDestinationId contract - and an unrecognised id changes
 *  nothing rather than bouncing the user to a default. */
export function coursesStateFromRailItem(
  id: string,
  currentSection: CoursesSection,
  currentTasksView: TasksView
): { coursesSection: CoursesSection; tasksView: TasksView } {
  const item = COURSES_RAIL_BY_ID.get(id);
  if (!item) return { coursesSection: currentSection, tasksView: currentTasksView };
  if (item.section === "courses") return { coursesSection: "courses", tasksView: currentTasksView };
  if (item.section === "oneoff") return { coursesSection: "oneoff", tasksView: currentTasksView };
  return { coursesSection: "tasks", tasksView: item.tasksView };
}

// --- Tools ---------------------------------------------------------------

// WORKFLOWS-COLLAPSE W2: the rail is the Manual views only. The Workflows
// family dissolved into the Automate container (manualView="artifact-design"),
// so there is no "workflows:<view>" id any more.
export type ToolsRailItemId = `manual:${ManualViewType}`;

export function manualRailItemId(view: ManualViewType): `manual:${ManualViewType}` {
  return `manual:${view}`;
}

export type ToolsRailItem = {
  id: `manual:${ManualViewType}`;
  label: string;
  section: "manual";
  manualView: ManualViewType;
};

// Derived from MANUAL_VIEW_ORDER, so a view added there joins the rail with no
// edit here.
export const TOOLS_RAIL_ITEMS: readonly ToolsRailItem[] = MANUAL_VIEW_ORDER.map(
  (view): ToolsRailItem => ({
    id: manualRailItemId(view),
    label: MANUAL_VIEW_LABELS[view],
    section: "manual",
    manualView: view,
  })
);

const TOOLS_RAIL_BY_ID: ReadonlyMap<string, ToolsRailItem> = new Map(
  TOOLS_RAIL_ITEMS.map((item) => [item.id, item])
);

/** The Tools rail chip for the currently resolved Manual view. */
export function toolsRailItemFor(manualView: ManualViewType): ToolsRailItemId {
  return manualRailItemId(manualView);
}

/** The full state one Tools rail chip selects: the section it implies plus the
 *  view param that already owned it. An unrecognised id changes nothing. */
export function toolsStateFromRailItem(
  id: string,
  currentSection: ToolsSection,
  currentManualView: ManualViewType
): { toolsSection: ToolsSection; manualView: ManualViewType } {
  const item = TOOLS_RAIL_BY_ID.get(id);
  if (!item) return { toolsSection: currentSection, manualView: currentManualView };
  return { toolsSection: "manual", manualView: item.manualView };
}
